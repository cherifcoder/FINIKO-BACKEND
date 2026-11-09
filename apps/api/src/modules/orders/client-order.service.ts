import { createHash } from 'node:crypto';
import type { QueryFilter, Types } from 'mongoose';
import { SignJWT, jwtVerify } from 'jose';
import {
  ORDER_STATUS_LABELS,
  type CancelOrderInput,
  type ClientOrderAddress,
  type ClientOrderCancelResponse,
  type ClientOrderContact,
  type ClientOrderDetail,
  type ClientOrderItem,
  type ClientOrderListQuery,
  type ClientOrderSummary,
  type ClientOrderTimelineEntry,
  type ClientOrdersResponse,
  type CreateClientOrderResponse,
  type CreateOrderInput,
  type DisputeOrderInput,
  type OrderQuote,
  type OrderQuoteItem,
  type OrderQuotePack,
  type OrderStatus,
  type QuoteRequestInput,
} from '@finiko/contracts';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../middleware/error';
import { CatalogItemModel } from '../../models/catalog-item.model';
import { nextSequence } from '../../models/counter.model';
import {
  OrderModel,
  type Order,
  type OrderDocument,
  type OrderItem,
} from '../../models/order.model';
import { PaymentModel } from '../../models/payment.model';
import { DriverProfileModel, PressingProfileModel } from '../../models/profile.model';
import { SubscriptionModel, type SubscriptionDocument } from '../../models/subscription.model';
import { SubscriptionUsageModel } from '../../models/subscription-usage.model';
import { UserModel } from '../../models/user.model';
import {
  consumeQuota as consumeQuotaTx,
  refundQuota as refundQuotaTx,
  releaseQuota as releaseQuotaTx,
  reserveQuota as reserveQuotaTx,
} from '../subscriptions/quota.service';

const DELIVERY_BASE_FEE = 1_000;
const QUOTE_TTL_MS = 15 * 60 * 1_000;
const QUOTE_ISSUER = 'finiko-api';
const QUOTE_AUDIENCE = 'finiko-quote';
const quoteSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

const CLIENT_CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  'en_attente_paiement',
  'confirmee',
  'ramassage_assigne',
];

const TRACKING_STEPS = [
  { key: 'confirmee', label: 'Commande confirmée', statuses: ['confirmee'] },
  {
    key: 'ramassage',
    label: 'Ramassage',
    statuses: ['ramassage_assigne', 'ramassage_en_cours'],
  },
  { key: 'ramassee', label: 'Linge ramassé', statuses: ['ramassee'] },
  {
    key: 'au_pressing',
    label: 'Au pressing',
    statuses: ['deposee_au_pressing', 'au_pressing'],
  },
  { key: 'en_traitement', label: 'Traitement en cours', statuses: ['en_traitement'] },
  { key: 'prete', label: 'Linge prêt', statuses: ['prete'] },
  {
    key: 'livraison',
    label: 'En livraison',
    statuses: ['livraison_assignee', 'livraison_en_cours'],
  },
  { key: 'livree', label: 'Livré', statuses: ['livree', 'terminee'] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  statuses: readonly OrderStatus[];
}>;

const TRACKING_INDEX: Partial<Record<OrderStatus, number>> = Object.fromEntries(
  TRACKING_STEPS.flatMap((step, index) => step.statuses.map((status) => [status, index])),
) as Partial<Record<OrderStatus, number>>;

interface ComputedQuote {
  quote: Omit<OrderQuote, 'quoteToken' | 'expiresAt'>;
  orderItems: OrderItem[];
  subscription: SubscriptionDocument | null;
}

interface PartyMaps {
  pressingById: Map<string, ClientOrderContact>;
  driverById: Map<string, ClientOrderContact>;
}

interface QuotaOptions {
  clientId: string;
  orderId: string;
  units: number;
  actorId?: string | null;
}

function isTransactionUnsupported(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Transaction numbers are only allowed on a replica set member or mongos/i.test(error.message)
  );
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Le serveur de développement peut tourner sur un MongoDB standalone, qui ne
 * supporte pas les transactions. Ces variantes atomiques gardent le même
 * contrat fonctionnel que quota.service.ts sans exiger de replica set.
 */
async function reserveQuotaStandalone(options: QuotaOptions): Promise<void> {
  const existing = await SubscriptionUsageModel.findOne({
    order: options.orderId,
    type: 'reservation',
  });

  if (existing) {
    if (existing.units !== options.units) {
      throw ApiError.conflict(
        'IDEMPOTENCY_CONFLICT',
        'Cette commande a déjà une réservation avec un nombre d’unités différent.',
      );
    }
    return;
  }

  const subscription = await SubscriptionModel.findOneAndUpdate(
    {
      client: options.clientId,
      status: 'active',
      endDate: { $gt: new Date() },
      $expr: {
        $lte: [{ $add: ['$quotaUsed', '$quotaReserved', options.units] }, '$quotaTotal'],
      },
    },
    { $inc: { quotaReserved: options.units } },
    { returnDocument: 'after' },
  );

  if (!subscription) {
    const active = await SubscriptionModel.findOne({
      client: options.clientId,
      status: 'active',
      endDate: { $gt: new Date() },
    }).lean();

    if (!active) {
      throw new ApiError(
        422,
        'SUBSCRIPTION_INACTIVE',
        'Aucun abonnement actif : le quota ne peut pas être utilisé.',
      );
    }

    throw ApiError.conflict('QUOTA_EXHAUSTED', 'Le quota disponible est insuffisant.', {
      quotaTotal: active.quotaTotal,
      quotaUsed: active.quotaUsed,
      quotaReserved: active.quotaReserved,
      quotaAvailable: Math.max(0, active.quotaTotal - active.quotaUsed - active.quotaReserved),
      requested: options.units,
    });
  }

  try {
    await SubscriptionUsageModel.create({
      subscription: subscription._id,
      client: options.clientId,
      order: options.orderId,
      type: 'reservation',
      units: options.units,
      usedDelta: 0,
      reservedDelta: options.units,
      quotaTotalDelta: 0,
      quotaUsedAfter: subscription.quotaUsed,
      quotaReservedAfter: subscription.quotaReserved,
      quotaTotalAfter: subscription.quotaTotal,
      reason: 'Réservation pour commande',
      actor: options.actorId ?? null,
      requestId: null,
    });
  } catch (error) {
    await SubscriptionModel.updateOne(
      { _id: subscription._id },
      { $inc: { quotaReserved: -options.units } },
    ).catch(() => undefined);

    if (isDuplicateKey(error)) return;
    throw error;
  }
}

async function consumeQuotaStandalone(options: QuotaOptions): Promise<void> {
  const existing = await SubscriptionUsageModel.findOne({
    order: options.orderId,
    type: 'consommation',
  });

  if (existing) {
    if (existing.units !== options.units) {
      throw ApiError.conflict(
        'IDEMPOTENCY_CONFLICT',
        'Cette commande a déjà été consommée avec un nombre d’unités différent.',
      );
    }
    return;
  }

  const reservation = await SubscriptionUsageModel.findOne({
    order: options.orderId,
    type: 'reservation',
  });

  if (!reservation) {
    throw ApiError.conflict(
      'QUOTA_RESERVATION_NOT_FOUND',
      'Aucune réservation de quota pour cette commande.',
    );
  }

  if (reservation.units !== options.units) {
    throw ApiError.conflict(
      'IDEMPOTENCY_CONFLICT',
      'La réservation de cette commande ne correspond pas aux unités demandées.',
    );
  }

  const released = await SubscriptionUsageModel.exists({
    order: options.orderId,
    type: 'liberation',
  });

  if (released) {
    throw ApiError.conflict(
      'QUOTA_RESERVATION_RELEASED',
      'La réservation de cette commande a déjà été libérée.',
    );
  }

  const subscription = await SubscriptionModel.findOneAndUpdate(
    {
      _id: reservation.subscription,
      $expr: { $gte: ['$quotaReserved', options.units] },
    },
    { $inc: { quotaReserved: -options.units, quotaUsed: options.units } },
    { returnDocument: 'after' },
  );

  if (!subscription) {
    throw ApiError.conflict(
      'QUOTA_STATE_INVALID',
      'Le quota réservé ne permet pas de consommer cette commande.',
    );
  }

  try {
    await SubscriptionUsageModel.create({
      subscription: subscription._id,
      client: options.clientId,
      order: options.orderId,
      type: 'consommation',
      units: options.units,
      usedDelta: options.units,
      reservedDelta: -options.units,
      quotaTotalDelta: 0,
      quotaUsedAfter: subscription.quotaUsed,
      quotaReservedAfter: subscription.quotaReserved,
      quotaTotalAfter: subscription.quotaTotal,
      reason: 'Consommation pour commande',
      actor: options.actorId ?? null,
      requestId: null,
    });
  } catch (error) {
    await SubscriptionModel.updateOne(
      { _id: subscription._id },
      { $inc: { quotaReserved: options.units, quotaUsed: -options.units } },
    ).catch(() => undefined);

    if (isDuplicateKey(error)) return;
    throw error;
  }
}

async function releaseQuotaStandalone(options: QuotaOptions): Promise<void> {
  const reservation = await SubscriptionUsageModel.findOne({
    order: options.orderId,
    type: 'reservation',
  });

  if (!reservation) {
    throw ApiError.conflict(
      'QUOTA_RESERVATION_NOT_FOUND',
      'Aucune réservation de quota pour cette commande.',
    );
  }

  if (reservation.units !== options.units) {
    throw ApiError.conflict(
      'IDEMPOTENCY_CONFLICT',
      'La réservation de cette commande ne correspond pas aux unités demandées.',
    );
  }

  const existing = await SubscriptionUsageModel.exists({
    order: options.orderId,
    type: 'liberation',
  });

  if (existing) return;

  const subscription = await SubscriptionModel.findOneAndUpdate(
    {
      _id: reservation.subscription,
      $expr: { $gte: ['$quotaReserved', options.units] },
    },
    { $inc: { quotaReserved: -options.units } },
    { returnDocument: 'after' },
  );

  if (!subscription) {
    throw ApiError.conflict(
      'QUOTA_STATE_INVALID',
      'Le quota réservé ne permet pas de libérer cette commande.',
    );
  }

  try {
    await SubscriptionUsageModel.create({
      subscription: subscription._id,
      client: options.clientId,
      order: options.orderId,
      type: 'liberation',
      units: options.units,
      usedDelta: 0,
      reservedDelta: -options.units,
      quotaTotalDelta: 0,
      quotaUsedAfter: subscription.quotaUsed,
      quotaReservedAfter: subscription.quotaReserved,
      quotaTotalAfter: subscription.quotaTotal,
      reason: 'Libération après annulation',
      actor: options.actorId ?? null,
      requestId: null,
    });
  } catch (error) {
    await SubscriptionModel.updateOne(
      { _id: subscription._id },
      { $inc: { quotaReserved: options.units } },
    ).catch(() => undefined);

    if (isDuplicateKey(error)) return;
    throw error;
  }
}

async function refundQuotaStandalone(options: QuotaOptions): Promise<void> {
  const consumption = await SubscriptionUsageModel.findOne({
    order: options.orderId,
    type: 'consommation',
  });

  if (!consumption) {
    throw ApiError.conflict(
      'QUOTA_CONSUMPTION_NOT_FOUND',
      'Aucune consommation de quota pour cette commande.',
    );
  }

  if (consumption.units !== options.units) {
    throw ApiError.conflict(
      'IDEMPOTENCY_CONFLICT',
      'La consommation de cette commande ne correspond pas aux unités demandées.',
    );
  }

  const existing = await SubscriptionUsageModel.exists({
    order: options.orderId,
    type: 'remboursement',
  });

  if (existing) return;

  const subscription = await SubscriptionModel.findOneAndUpdate(
    {
      _id: consumption.subscription,
      $expr: { $gte: ['$quotaUsed', options.units] },
    },
    { $inc: { quotaUsed: -options.units } },
    { returnDocument: 'after' },
  );

  if (!subscription) {
    throw ApiError.conflict(
      'QUOTA_STATE_INVALID',
      'Le quota consommé ne permet pas de rembourser cette commande.',
    );
  }

  try {
    await SubscriptionUsageModel.create({
      subscription: subscription._id,
      client: options.clientId,
      order: options.orderId,
      type: 'remboursement',
      units: options.units,
      usedDelta: -options.units,
      reservedDelta: 0,
      quotaTotalDelta: 0,
      quotaUsedAfter: subscription.quotaUsed,
      quotaReservedAfter: subscription.quotaReserved,
      quotaTotalAfter: subscription.quotaTotal,
      reason: 'Remboursement après annulation',
      actor: options.actorId ?? null,
      requestId: null,
    });
  } catch (error) {
    await SubscriptionModel.updateOne(
      { _id: subscription._id },
      { $inc: { quotaUsed: options.units } },
    ).catch(() => undefined);

    if (isDuplicateKey(error)) return;
    throw error;
  }
}

async function reserveQuota(options: QuotaOptions): Promise<void> {
  try {
    await reserveQuotaTx(options);
  } catch (error) {
    if (!isTransactionUnsupported(error)) throw error;
    await reserveQuotaStandalone(options);
  }
}

async function consumeQuota(options: QuotaOptions): Promise<void> {
  try {
    await consumeQuotaTx(options);
  } catch (error) {
    if (!isTransactionUnsupported(error)) throw error;
    await consumeQuotaStandalone(options);
  }
}

async function releaseQuota(options: QuotaOptions): Promise<void> {
  try {
    await releaseQuotaTx(options);
  } catch (error) {
    if (!isTransactionUnsupported(error)) throw error;
    await releaseQuotaStandalone(options);
  }
}

async function refundQuota(options: QuotaOptions): Promise<void> {
  try {
    await refundQuotaTx(options);
  } catch (error) {
    if (!isTransactionUnsupported(error)) throw error;
    await refundQuotaStandalone(options);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toClientAddress(address: OrderDocument['pickup']): ClientOrderAddress {
  const [lng = 0, lat = 0] = address.location.coordinates;

  return {
    label: address.label,
    text: address.text,
    coordinates: { lat, lng },
    contactName: address.contactName,
    contactPhone: address.contactPhone,
    instructions: address.instructions,
  };
}

function toClientItem(item: OrderItem): ClientOrderItem {
  return {
    catalogItemId: item.catalogItem.toString(),
    name: item.name,
    category: item.category,
    treatment: item.treatment,
    quantity: item.quantity,
    quotaWeight: item.quotaWeight,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    coveredQuantity: item.coveredQuantity,
    billableQuantity: item.billableQuantity,
    coveredAmount: item.coveredAmount,
    billableAmount: item.billableAmount,
    treatmentStatus: item.treatmentStatus,
    treatmentStartedAt: toIso(item.treatmentStartedAt),
    treatmentCompletedAt: toIso(item.treatmentCompletedAt),
  };
}

function buildTimeline(order: OrderDocument): ClientOrderTimelineEntry[] {
  const currentIndex = TRACKING_INDEX[order.status] ?? -1;

  return TRACKING_STEPS.map((step, index) => ({
    key: step.key,
    label: step.label,
    at: index === currentIndex ? order.lastStatusAt.toISOString() : null,
    reached: currentIndex >= index,
    current: currentIndex === index,
  }));
}

function canClientCancel(status: OrderStatus): boolean {
  return CLIENT_CANCELLABLE_STATUSES.includes(status);
}

async function loadPartyMaps(rows: OrderDocument[]): Promise<PartyMaps> {
  const pressingIds = new Set<string>();
  const driverIds = new Set<string>();

  for (const row of rows) {
    if (row.pressing) pressingIds.add(row.pressing.toString());
    if (row.driver) driverIds.add(row.driver.toString());
  }

  const [pressingProfiles, driverProfiles] = await Promise.all([
    pressingIds.size > 0
      ? PressingProfileModel.find({ _id: { $in: [...pressingIds] } }).lean()
      : Promise.resolve([]),
    driverIds.size > 0
      ? DriverProfileModel.find({ _id: { $in: [...driverIds] } }).lean()
      : Promise.resolve([]),
  ]);

  const userIds = new Set<string>();
  for (const profile of pressingProfiles) userIds.add(profile.user.toString());
  for (const profile of driverProfiles) userIds.add(profile.user.toString());

  const users =
    userIds.size > 0
      ? await UserModel.find({ _id: { $in: [...userIds] } })
          .select('firstName lastName phone')
          .lean()
      : [];

  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  const pressingById = new Map<string, ClientOrderContact>();
  const driverById = new Map<string, ClientOrderContact>();

  for (const profile of pressingProfiles) {
    const user = userById.get(profile.user.toString());

    pressingById.set(profile._id.toString(), {
      id: profile._id.toString(),
      name: profile.businessName,
      phone: user?.phone ?? '—',
      vehicle: null,
      addressText: profile.addressText,
    });
  }

  for (const profile of driverProfiles) {
    const user = userById.get(profile.user.toString());
    const vehicle = profile.vehicle.plate
      ? `${profile.vehicle.type} · ${profile.vehicle.plate}`
      : profile.vehicle.type;

    driverById.set(profile._id.toString(), {
      id: profile._id.toString(),
      name: user ? `${user.firstName} ${user.lastName}` : profile.code,
      phone: user?.phone ?? '—',
      vehicle,
      addressText: null,
    });
  }

  return { pressingById, driverById };
}

function buildSummary(order: OrderDocument, parties: PartyMaps): ClientOrderSummary {
  const pressing = order.pressing ? parties.pressingById.get(order.pressing.toString()) : null;
  const driver = order.driver ? parties.driverById.get(order.driver.toString()) : null;

  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    itemsCount: order.totals.itemsCount,
    totalDue: order.totals.totalDue,
    totalPaid: order.totals.totalPaid,
    paymentMethod: order.payment.method,
    paymentStatus: order.payment.status,
    pickupText: order.pickup.text,
    deliveryText: order.delivery.text,
    pressingName: pressing?.name ?? null,
    driverName: driver?.name ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    lastStatusAt: order.lastStatusAt.toISOString(),
    canCancel: canClientCancel(order.status),
  };
}

async function loadPackName(order: OrderDocument): Promise<string | null> {
  if (!order.pack.subscription) return null;

  const subscription = await SubscriptionModel.findById(order.pack.subscription)
    .select('packSnapshot.name')
    .lean();

  return subscription?.packSnapshot.name ?? null;
}

export async function buildOrderDetail(order: OrderDocument): Promise<ClientOrderDetail> {
  const [parties, packName, clientUser] = await Promise.all([
    loadPartyMaps([order]),
    loadPackName(order),
    UserModel.findById(order.client).select('firstName lastName phone').lean(),
  ]);
  const summary = buildSummary(order, parties);
  const pressing = order.pressing ? parties.pressingById.get(order.pressing.toString()) : null;
  const driver = order.driver ? parties.driverById.get(order.driver.toString()) : null;

  return {
    ...summary,
    items: order.items.map(toClientItem),
    totals: {
      itemsCount: order.totals.itemsCount,
      catalogSubtotal: order.totals.catalogSubtotal,
      packCoveredAmount: order.totals.packCoveredAmount,
      supplementAmount: order.totals.supplementAmount,
      deliveryFee: order.totals.deliveryFee,
      discountAmount: order.totals.discountAmount,
      totalDue: order.totals.totalDue,
      totalPaid: order.totals.totalPaid,
      refundedAmount: order.totals.refundedAmount,
    },
    pack: order.pack.subscription
      ? {
          subscriptionId: order.pack.subscription.toString(),
          packName,
          coveredUnits: order.pack.coveredUnits,
          overageUnits: order.pack.overageUnits,
        }
      : null,
    pickup: toClientAddress(order.pickup),
    delivery: toClientAddress(order.delivery),
    client: {
      id: order.client.toString(),
      name: clientUser ? `${clientUser.firstName} ${clientUser.lastName}`.trim() : 'Client FINIKO',
      phone: clientUser?.phone ?? '—',
      vehicle: null,
      addressText: order.pickup.text,
    },
    payment: {
      method: order.payment.method,
      status: order.payment.status,
      paidAt: toIso(order.payment.paidAt),
    },
    cancellation: {
      reason: order.cancellation.reason,
      at: toIso(order.cancellation.at),
      refundStatus: order.cancellation.refundStatus,
      refundAmount: order.cancellation.refundAmount,
    },
    pressing: pressing ?? null,
    driver: driver ?? null,
    dispute: {
      reason: order.dispute?.reason ?? null,
      at: toIso(order.dispute?.at ?? null),
      status: order.dispute?.status ?? 'ferme',
    },
    timeline: buildTimeline(order),
    actions: {
      canCancel: summary.canCancel,
      canConfirmDelivery: order.status === 'livree',
      canDispute:
        (order.status === 'livree' || order.status === 'terminee') &&
        order.dispute?.status !== 'ouvert',
    },
  };
}

function hashQuoteRequest(input: QuoteRequestInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        items: input.items,
        pickup: input.pickup,
        delivery: input.delivery,
        useSubscription: input.useSubscription,
        promoCode: input.promoCode,
      }),
    )
    .digest('hex');
}

async function signQuoteToken(
  clientId: string,
  requestHash: string,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ typ: 'quote', h: requestHash })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(clientId)
    .setIssuer(QUOTE_ISSUER)
    .setAudience(QUOTE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
    .sign(quoteSecret);
}

async function verifyQuoteToken(
  token: string,
  clientId: string,
  requestHash: string,
): Promise<void> {
  try {
    const { payload } = await jwtVerify(token, quoteSecret, {
      issuer: QUOTE_ISSUER,
      audience: QUOTE_AUDIENCE,
      algorithms: ['HS256'],
      clockTolerance: 5,
    });

    if (payload.typ !== 'quote' || payload.sub !== clientId || payload.h !== requestHash) {
      throw new Error('Quote token mismatch');
    }
  } catch {
    throw ApiError.conflict(
      'QUOTE_EXPIRED',
      'Le devis a expiré ou ne correspond plus au panier. Recalculez-le avant de commander.',
    );
  }
}

async function getActiveSubscription(clientId: string): Promise<SubscriptionDocument | null> {
  return SubscriptionModel.findOne({
    client: clientId,
    status: 'active',
    endDate: { $gt: new Date() },
  }).sort({ endDate: -1 });
}

async function computeQuote(clientId: string, input: QuoteRequestInput): Promise<ComputedQuote> {
  const catalogIds = [...new Set(input.items.map((item) => item.catalogItemId))];
  const catalogItems = await CatalogItemModel.find({
    _id: { $in: catalogIds },
    isActive: true,
    deletedAt: null,
  }).lean();
  const catalogById = new Map(catalogItems.map((item) => [item._id.toString(), item]));

  for (const line of input.items) {
    const catalogItem = catalogById.get(line.catalogItemId);

    if (!catalogItem) {
      throw ApiError.unprocessable(
        'ITEM_UNAVAILABLE',
        'Un article du panier n’est plus disponible dans le catalogue.',
      );
    }

    if (!catalogItem.availableTreatments.includes(line.treatment)) {
      throw ApiError.unprocessable(
        'TREATMENT_NOT_AVAILABLE',
        `La prestation choisie n’est pas proposée pour « ${catalogItem.name} ».`,
      );
    }
  }

  const subscription = input.useSubscription ? await getActiveSubscription(clientId) : null;
  const packSnapshot = subscription?.packSnapshot ?? null;
  const quotaTotal = subscription?.quotaTotal ?? 0;
  const quotaUsedBefore = subscription?.quotaUsed ?? 0;
  const quotaReservedBefore = subscription?.quotaReserved ?? 0;
  const quotaAvailableBefore = Math.max(0, quotaTotal - quotaUsedBefore - quotaReservedBefore);
  let remainingQuota = quotaAvailableBefore;

  const orderItems: OrderItem[] = [];
  const quoteItems: OrderQuoteItem[] = [];
  let catalogSubtotal = 0;
  let packCoveredAmount = 0;
  let supplementAmount = 0;
  let itemsCount = 0;
  let coveredUnits = 0;
  let overageUnits = 0;

  for (const line of input.items) {
    const catalogItem = catalogById.get(line.catalogItemId);

    if (!catalogItem) continue;

    const unitPrice = catalogItem.prices[line.treatment];
    const lineTotal = unitPrice * line.quantity;
    const treatmentIncluded = Boolean(packSnapshot?.includedTreatments.includes(line.treatment));
    const coveredQuantity = treatmentIncluded
      ? Math.min(line.quantity, Math.floor(remainingQuota / catalogItem.quotaWeight))
      : 0;
    const billableQuantity = line.quantity - coveredQuantity;
    const coveredAmount = coveredQuantity * unitPrice;
    const billableAmount = billableQuantity * unitPrice;

    remainingQuota -= coveredQuantity * catalogItem.quotaWeight;
    catalogSubtotal += lineTotal;
    packCoveredAmount += coveredAmount;
    supplementAmount += billableAmount;
    itemsCount += line.quantity;
    coveredUnits += coveredQuantity * catalogItem.quotaWeight;
    overageUnits += billableQuantity * catalogItem.quotaWeight;

    orderItems.push({
      catalogItem: catalogItem._id,
      code: catalogItem.code,
      name: catalogItem.name,
      category: catalogItem.category,
      treatment: line.treatment,
      quantity: line.quantity,
      quotaWeight: catalogItem.quotaWeight,
      unitPrice,
      lineTotal,
      coveredQuantity,
      billableQuantity,
      coveredAmount,
      billableAmount,
      treatmentStatus: 'a_traiter',
      treatmentStartedAt: null,
      treatmentCompletedAt: null,
    });

    quoteItems.push({
      catalogItemId: catalogItem._id.toString(),
      name: catalogItem.name,
      treatment: line.treatment,
      quantity: line.quantity,
      quotaWeight: catalogItem.quotaWeight,
      unitPrice,
      lineTotal,
      coveredQuantity,
      billableQuantity,
      coveredAmount,
      billableAmount,
    });
  }

  let deliveryFee = DELIVERY_BASE_FEE;

  if (packSnapshot?.deliveryIncluded) {
    deliveryFee = 0;
  } else if (packSnapshot?.deliveryDiscountPercent) {
    deliveryFee = Math.round(
      (DELIVERY_BASE_FEE * (100 - packSnapshot.deliveryDiscountPercent)) / 100,
    );
  }

  const quotePack: OrderQuotePack | null = subscription
    ? {
        subscriptionId: subscription._id.toString(),
        packName: subscription.packSnapshot.name,
        quotaTotal,
        quotaUsedBefore,
        quotaAvailableBefore,
        coveredUnits,
        overageUnits,
        quotaAvailableAfter: Math.max(0, quotaAvailableBefore - coveredUnits),
      }
    : null;

  return {
    quote: {
      items: quoteItems,
      totals: {
        itemsCount,
        catalogSubtotal,
        packCoveredAmount,
        supplementAmount,
        deliveryFee,
        discountAmount: 0,
        totalDue: Math.max(0, supplementAmount + deliveryFee),
      },
      pack: quotePack,
      delivery: {
        zone: 'Bamako',
        distanceKm: 0,
        feeXOF: deliveryFee,
        serviceable: true,
      },
    },
    orderItems,
    subscription,
  };
}

async function generateOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sequence = await nextSequence('order');
    const candidate = `#FK-${1_000 + sequence}`;
    const exists = await OrderModel.exists({ orderNumber: candidate });

    if (!exists) return candidate;
  }

  throw new Error('Impossible de générer un numéro de commande unique.');
}

export async function quoteClientOrder(
  clientId: string,
  input: QuoteRequestInput,
): Promise<OrderQuote> {
  const computed = await computeQuote(clientId, input);
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MS);
  const quoteToken = await signQuoteToken(clientId, hashQuoteRequest(input), expiresAt);

  return {
    ...computed.quote,
    quoteToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function createClientOrder(
  clientId: string,
  input: CreateOrderInput,
): Promise<CreateClientOrderResponse> {
  const request: QuoteRequestInput = {
    items: input.items,
    pickup: input.pickup,
    delivery: input.delivery,
    useSubscription: input.useSubscription,
    promoCode: input.promoCode,
  };

  await verifyQuoteToken(input.quoteToken, clientId, hashQuoteRequest(request));

  const computed = await computeQuote(clientId, request);
  const { quote } = computed;
  const now = new Date();
  const orderNumber = await generateOrderNumber();
  const totalDue = quote.totals.totalDue;
  const paymentMethod = totalDue === 0 ? 'pack' : input.paymentMethod;
  const status: OrderStatus =
    totalDue === 0 || paymentMethod === 'cash' ? 'confirmee' : 'en_attente_paiement';
  const paymentStatus =
    totalDue === 0 ? 'non_requis' : paymentMethod === 'cash' ? 'a_collecter' : 'en_attente';

  const [pressingProfile, driverProfile] = await Promise.all([
    PressingProfileModel.findOne({ status: 'actif' }).sort({ currentLoad: 1 }).select('_id').lean(),
    status === 'confirmee'
      ? DriverProfileModel.findOne({ status: { $in: ['disponible', 'hors_ligne'] } })
          .sort({ status: 1, updatedAt: 1 })
          .select('_id')
          .lean()
      : Promise.resolve(null),
  ]);
  const initialStatus: OrderStatus = driverProfile ? 'ramassage_assigne' : status;

  const order = new OrderModel({
    orderNumber,
    client: clientId,
    pressing: pressingProfile?._id ?? null,
    driver: driverProfile?._id ?? null,
    items: computed.orderItems,
    totals: {
      ...quote.totals,
      totalPaid: 0,
      refundedAmount: 0,
    },
    pack: {
      subscription: computed.subscription?._id ?? null,
      coveredUnits: quote.pack?.coveredUnits ?? 0,
      overageUnits: quote.pack?.overageUnits ?? 0,
    },
    pickup: {
      label: request.pickup.label ?? 'Ramassage',
      text: request.pickup.text,
      location: {
        type: 'Point',
        coordinates: [request.pickup.coordinates.lng, request.pickup.coordinates.lat],
      },
      contactName: request.pickup.contactName,
      contactPhone: request.pickup.contactPhone,
      instructions: request.pickup.instructions ?? '',
    },
    delivery: {
      label: request.delivery.label ?? 'Livraison',
      text: request.delivery.text,
      location: {
        type: 'Point',
        coordinates: [request.delivery.coordinates.lng, request.delivery.coordinates.lat],
      },
      contactName: request.delivery.contactName,
      contactPhone: request.delivery.contactPhone,
      instructions: request.delivery.instructions ?? '',
    },
    status: initialStatus,
    lastStatusAt: now,
    payment: {
      method: paymentMethod,
      status: paymentStatus,
      payment: null,
      paidAt: totalDue === 0 ? now : null,
    },
  });

  await order.save();

  if (driverProfile) {
    await DriverProfileModel.updateOne(
      { _id: driverProfile._id },
      { $set: { status: 'en_mission' }, $addToSet: { activeOrderIds: order._id } },
    );
  }

  let paymentId: Types.ObjectId | null = null;
  let reservedUnits = 0;

  try {
    if (computed.subscription && (quote.pack?.coveredUnits ?? 0) > 0) {
      reservedUnits = quote.pack?.coveredUnits ?? 0;

      try {
        await reserveQuota({
          clientId,
          orderId: order._id.toString(),
          units: reservedUnits,
          actorId: clientId,
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'QUOTA_EXHAUSTED') {
          throw ApiError.conflict(
            'QUOTA_RACE',
            'Votre quota a changé entre le devis et la commande. Recalculez votre panier.',
          );
        }

        throw error;
      }

      if (totalDue === 0) {
        await consumeQuota({
          clientId,
          orderId: order._id.toString(),
          units: reservedUnits,
          actorId: clientId,
        });
      }
    }

    if (totalDue > 0) {
      const payment = await PaymentModel.create({
        reference: `PAY-${orderNumber.slice(4)}`,
        idempotencyKey: `order-${order._id.toString()}`,
        purpose: 'order',
        client: clientId,
        order: order._id,
        subscription: null,
        provider: paymentMethod === 'cash' ? 'cash' : 'orange_money',
        amountXOF: totalDue,
        currency: 'XOF',
        status: paymentMethod === 'cash' ? 'en_attente' : 'initie',
        providerTxId: `${paymentMethod === 'cash' ? 'cash' : 'om'}-${order._id.toString()}`,
        providerStatus: paymentMethod === 'cash' ? 'PENDING' : 'INITIATED',
        checkoutUrl: null,
        returnUrl: null,
        failureCode: null,
        failureMessage: null,
        paidAt: null,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
        reconciledAt: null,
        metadata: { orderNumber },
      });

      paymentId = payment._id;
      order.payment.payment = payment._id;
      await order.save();

      return {
        order: await buildOrderDetail(order),
        payment: {
          id: payment._id.toString(),
          reference: payment.reference,
          amountXOF: payment.amountXOF,
          status: payment.status,
          checkoutUrl: payment.checkoutUrl,
        },
      };
    }
  } catch (error) {
    if (paymentId) {
      await PaymentModel.deleteOne({ _id: paymentId }).catch(() => undefined);
    }

    if (reservedUnits > 0) {
      await releaseQuota({
        clientId,
        orderId: order._id.toString(),
        units: reservedUnits,
        actorId: clientId,
      }).catch(() => undefined);
    }

    await OrderModel.deleteOne({ _id: order._id }).catch(() => undefined);

    if (driverProfile) {
      await DriverProfileModel.updateOne(
        { _id: driverProfile._id },
        { $set: { status: 'disponible' }, $pull: { activeOrderIds: order._id } },
      ).catch(() => undefined);
    }

    throw error;
  }

  return {
    order: await buildOrderDetail(order),
    payment: null,
  };
}

export async function listClientOrders(
  clientId: string,
  query: ClientOrderListQuery,
): Promise<{ result: ClientOrdersResponse; total: number }> {
  const filter: QueryFilter<Order> = { client: clientId };

  if (query.status) filter.status = query.status;
  if (query.q) filter.orderNumber = new RegExp(escapeRegex(query.q), 'i');

  const [total, rows] = await Promise.all([
    OrderModel.countDocuments(filter),
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
  ]);
  const parties = await loadPartyMaps(rows);

  return {
    result: { orders: rows.map((order) => buildSummary(order, parties)) },
    total,
  };
}

export async function getClientOrderDetail(
  clientId: string,
  orderId: string,
): Promise<ClientOrderDetail> {
  const order = await OrderModel.findOne({ _id: orderId, client: clientId });

  if (!order) {
    throw ApiError.notFound('Commande introuvable.');
  }

  return buildOrderDetail(order);
}

export async function cancelClientOrder(
  clientId: string,
  orderId: string,
  input: CancelOrderInput,
): Promise<ClientOrderCancelResponse> {
  const order = await OrderModel.findOne({ _id: orderId, client: clientId });

  if (!order) {
    throw ApiError.notFound('Commande introuvable.');
  }

  if (!canClientCancel(order.status)) {
    throw ApiError.conflict(
      'ORDER_NOT_CANCELLABLE',
      'Cette commande ne peut plus être annulée à cette étape.',
    );
  }

  const now = new Date();
  const refundable = order.totals.totalPaid > 0;
  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, client: clientId, status: order.status },
    {
      $set: {
        status: 'annulee',
        lastStatusAt: now,
        'cancellation.by': clientId,
        'cancellation.reason': input.reason,
        'cancellation.at': now,
        'cancellation.refundStatus': refundable ? 'en_attente' : 'non_applicable',
        'cancellation.refundAmount': refundable ? order.totals.totalPaid : 0,
        'payment.status': refundable ? order.payment.status : 'non_requis',
      },
    },
    { returnDocument: 'after' },
  );

  if (!updated) {
    throw ApiError.conflict(
      'ORDER_STATE_CHANGED',
      'La commande a changé entre-temps. Rechargez-la avant de réessayer.',
    );
  }

  let quotaReleased = false;

  if (order.pack.coveredUnits > 0) {
    try {
      const [reservation, consumption] = await Promise.all([
        SubscriptionUsageModel.exists({ order: order._id, type: 'reservation' }),
        SubscriptionUsageModel.exists({ order: order._id, type: 'consommation' }),
      ]);

      if (consumption) {
        await refundQuota({
          clientId,
          orderId: order._id.toString(),
          units: order.pack.coveredUnits,
          actorId: clientId,
        });
        quotaReleased = true;
      } else if (reservation) {
        await releaseQuota({
          clientId,
          orderId: order._id.toString(),
          units: order.pack.coveredUnits,
          actorId: clientId,
        });
        quotaReleased = true;
      }
    } catch (error) {
      logger.warn(
        { err: error, orderId: order._id.toString() },
        'Impossible de libérer le quota lors de l’annulation client',
      );
    }
  }

  if (order.payment.payment) {
    await PaymentModel.updateOne(
      { _id: order.payment.payment, status: { $in: ['initie', 'en_attente'] } },
      { $set: { status: 'annule', failureCode: 'ORDER_CANCELLED' } },
    ).catch(() => undefined);
  }

  return {
    order: await buildOrderDetail(updated),
    quotaReleased,
  };
}

export async function confirmClientDelivery(
  clientId: string,
  orderId: string,
): Promise<ClientOrderDetail> {
  const order = await OrderModel.findOne({ _id: orderId, client: clientId });

  if (!order) {
    throw ApiError.notFound('Commande introuvable.');
  }

  if (order.status !== 'livree') {
    throw ApiError.conflict(
      'ORDER_NOT_DELIVERED',
      'La commande doit être marquée livrée avant de pouvoir confirmer la réception.',
    );
  }

  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, client: clientId, status: 'livree' },
    { $set: { status: 'terminee', lastStatusAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!updated) {
    throw ApiError.conflict(
      'ORDER_STATE_CHANGED',
      'La commande a changé entre-temps. Rechargez-la avant de réessayer.',
    );
  }

  return buildOrderDetail(updated);
}

export async function disputeClientOrder(
  clientId: string,
  orderId: string,
  input: DisputeOrderInput,
): Promise<ClientOrderDetail> {
  const order = await OrderModel.findOne({ _id: orderId, client: clientId });

  if (!order) {
    throw ApiError.notFound('Commande introuvable.');
  }

  if (order.status !== 'livree' && order.status !== 'terminee') {
    throw ApiError.conflict(
      'DISPUTE_NOT_ALLOWED',
      'Un litige peut être signalé uniquement après la livraison de la commande.',
    );
  }

  if (order.dispute?.status === 'ouvert') {
    throw ApiError.conflict(
      'DISPUTE_ALREADY_OPEN',
      'Un litige est déjà ouvert sur cette commande.',
    );
  }

  const now = new Date();
  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, client: clientId, status: order.status },
    {
      $set: {
        status: 'litige',
        lastStatusAt: now,
        'dispute.reason': input.reason,
        'dispute.at': now,
        'dispute.status': 'ouvert',
      },
    },
    { returnDocument: 'after' },
  );

  if (!updated) {
    throw ApiError.conflict(
      'ORDER_STATE_CHANGED',
      'La commande a changé entre-temps. Rechargez-la avant de réessayer.',
    );
  }

  return buildOrderDetail(updated);
}
