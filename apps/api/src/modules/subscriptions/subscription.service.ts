import { Types } from 'mongoose';
import type {
  Subscription as SubscriptionView,
  SubscriptionCancelInput,
  SubscriptionCreateInput,
  SubscriptionListQuery,
  SubscriptionOverview,
  SubscriptionUsage as SubscriptionUsageView,
  SubscriptionUsageQuery,
} from '@finiko/contracts';
import { ApiError } from '../../middleware/error';
import { PackModel } from '../../models/pack.model';
import { SubscriptionModel, type SubscriptionDocument } from '../../models/subscription.model';
import {
  SubscriptionUsageModel,
  type SubscriptionUsageDocument,
} from '../../models/subscription-usage.model';
import { isPackCurrentlyAvailable, toPackSnapshot } from '../packs/pack.service';
import { adjustQuota, expireDueSubscriptions, expireSubscription } from './quota.service';

export function toSubscriptionView(sub: SubscriptionDocument): SubscriptionView {
  return {
    id: sub._id.toString(),
    status: sub.status,
    pack: {
      id: sub.pack.toString(),
      code: sub.packSnapshot.code,
      name: sub.packSnapshot.name,
      quotaUnits: sub.packSnapshot.quotaUnits,
      priceXOF: sub.packSnapshot.priceXOF,
      billingPeriodDays: sub.packSnapshot.billingPeriodDays,
      includedTreatments: [...sub.packSnapshot.includedTreatments],
      deliveryIncluded: sub.packSnapshot.deliveryIncluded,
      deliveryDiscountPercent: sub.packSnapshot.deliveryDiscountPercent,
    },
    startDate: sub.startDate.toISOString(),
    endDate: sub.endDate.toISOString(),
    quotaTotal: sub.quotaTotal,
    quotaUsed: sub.quotaUsed,
    quotaReserved: sub.quotaReserved,
    quotaAvailable: Math.max(0, sub.quotaTotal - sub.quotaUsed - sub.quotaReserved),
    autoRenew: sub.autoRenew,
    createdAt: sub.createdAt.toISOString(),
    activatedAt: sub.activatedAt ? sub.activatedAt.toISOString() : null,
    cancelledAt: sub.cancelledAt ? sub.cancelledAt.toISOString() : null,
  };
}

export function toSubscriptionUsageView(usage: SubscriptionUsageDocument): SubscriptionUsageView {
  return {
    id: usage._id.toString(),
    subscriptionId: usage.subscription.toString(),
    type: usage.type,
    units: usage.units,
    usedDelta: usage.usedDelta,
    reservedDelta: usage.reservedDelta,
    quotaTotalDelta: usage.quotaTotalDelta,
    quotaUsedAfter: usage.quotaUsedAfter,
    quotaReservedAfter: usage.quotaReservedAfter,
    quotaTotalAfter: usage.quotaTotalAfter,
    reason: usage.reason,
    orderId: usage.order ? usage.order.toString() : null,
    createdAt: usage.createdAt.toISOString(),
  };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function createSubscription(
  clientId: string,
  input: SubscriptionCreateInput,
): Promise<SubscriptionDocument> {
  const pack = await PackModel.findOne({ _id: input.packId, deletedAt: null });

  if (!pack) {
    throw ApiError.notFound('Ce pack n’existe pas.');
  }

  if (!isPackCurrentlyAvailable(pack)) {
    throw new ApiError(422, 'PACK_INACTIVE', 'Ce pack n’est plus disponible à la souscription.');
  }

  const [pending, active, scheduled] = await Promise.all([
    SubscriptionModel.exists({ client: clientId, status: 'en_attente_paiement' }),
    SubscriptionModel.findOne({ client: clientId, status: 'active' }),
    SubscriptionModel.exists({ client: clientId, status: 'programmee' }),
  ]);

  if (pending) {
    throw ApiError.conflict(
      'SUBSCRIPTION_PENDING',
      'Une souscription est déjà en attente de paiement.',
    );
  }

  if (scheduled) {
    throw ApiError.conflict(
      'SUBSCRIPTION_ALREADY_SCHEDULED',
      'Un renouvellement est déjà programmé.',
    );
  }

  const now = new Date();
  const startDate = active ? active.endDate : now;
  const endDate = addDays(startDate, pack.billingPeriodDays);

  return SubscriptionModel.create({
    client: clientId,
    pack: pack._id,
    packSnapshot: toPackSnapshot(pack),
    status: active ? 'programmee' : 'en_attente_paiement',
    startDate,
    endDate,
    quotaTotal: pack.quotaUnits,
    quotaUsed: 0,
    quotaReserved: 0,
    autoRenew: false,
    paymentMethod: input.paymentMethod,
    renewalOf: active ? active._id : null,
  });
}

/**
 * Activation après confirmation du paiement (webhook au lot 4).
 * Le quota est crédité uniquement ici, jamais à la redirection mobile.
 */
export async function activateSubscription(
  subscriptionId: string,
  actorId: string | null = null,
): Promise<SubscriptionDocument> {
  const subscription = await SubscriptionModel.findById(subscriptionId);

  if (!subscription) {
    throw ApiError.notFound('Abonnement introuvable.');
  }

  if (subscription.status === 'active') {
    return subscription;
  }

  if (subscription.status !== 'en_attente_paiement' && subscription.status !== 'programmee') {
    throw new ApiError(
      422,
      'SUBSCRIPTION_NOT_ACTIVATABLE',
      'Cet abonnement ne peut plus être activé.',
    );
  }

  if (subscription.status === 'programmee' && subscription.startDate.getTime() > Date.now()) {
    throw new ApiError(
      422,
      'SUBSCRIPTION_NOT_STARTED',
      'Le renouvellement programmé n’a pas encore commencé.',
    );
  }

  const existingActive = await SubscriptionModel.exists({
    client: subscription.client,
    status: 'active',
    _id: { $ne: subscription._id },
  });

  if (existingActive) {
    throw ApiError.conflict(
      'SUBSCRIPTION_ALREADY_ACTIVE',
      'Un abonnement est déjà actif pour ce client.',
    );
  }

  const now = new Date();
  const startDate = subscription.status === 'en_attente_paiement' ? now : subscription.startDate;
  const endDate =
    subscription.status === 'en_attente_paiement'
      ? addDays(startDate, subscription.packSnapshot.billingPeriodDays)
      : subscription.endDate;

  const activated = await SubscriptionModel.findOneAndUpdate(
    { _id: subscription._id, status: subscription.status },
    {
      $set: {
        status: 'active',
        startDate,
        endDate,
        activatedAt: now,
        cancelledAt: null,
        cancelReason: null,
      },
    },
    { returnDocument: 'after' },
  );

  if (!activated) {
    throw ApiError.conflict('SUBSCRIPTION_ALREADY_ACTIVE', 'Abonnement déjà activé.');
  }

  void actorId;
  return activated;
}

export async function getMySubscriptions(clientId: string): Promise<SubscriptionOverview> {
  const [active, scheduled, pending] = await Promise.all([
    SubscriptionModel.findOne({ client: clientId, status: 'active' }),
    SubscriptionModel.findOne({ client: clientId, status: 'programmee' }).sort({ startDate: 1 }),
    SubscriptionModel.findOne({ client: clientId, status: 'en_attente_paiement' }),
  ]);

  return {
    active: active ? toSubscriptionView(active) : null,
    scheduled: scheduled ? toSubscriptionView(scheduled) : null,
    pending: pending ? toSubscriptionView(pending) : null,
  };
}

export async function listMyUsages(
  clientId: string,
  query: SubscriptionUsageQuery,
): Promise<{ usages: SubscriptionUsageDocument[]; total: number }> {
  const filter: Record<string, unknown> = { client: clientId };

  if (query.subscriptionId) {
    const owned = await SubscriptionModel.exists({
      _id: query.subscriptionId,
      client: clientId,
    });

    if (!owned) {
      throw ApiError.notFound('Abonnement introuvable.');
    }

    filter.subscription = query.subscriptionId;
  }

  if (query.type) {
    filter.type = query.type;
  }

  const [usages, total] = await Promise.all([
    SubscriptionUsageModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    SubscriptionUsageModel.countDocuments(filter),
  ]);

  return { usages, total };
}

export interface CancelResult {
  subscription: SubscriptionDocument;
  renewalCancelled: boolean;
}

export async function cancelSubscription(
  clientId: string,
  subscriptionId: string,
  input: SubscriptionCancelInput,
): Promise<CancelResult> {
  const subscription = await SubscriptionModel.findOne({
    _id: subscriptionId,
    client: clientId,
  });

  if (!subscription) {
    throw ApiError.notFound('Abonnement introuvable.');
  }

  if (subscription.status === 'en_attente_paiement' || subscription.status === 'programmee') {
    subscription.status = 'annulee';
    subscription.cancelledAt = new Date();
    subscription.cancelReason = input.reason ?? null;
    await subscription.save();
    return { subscription, renewalCancelled: false };
  }

  if (subscription.status === 'active') {
    subscription.autoRenew = false;
    subscription.cancelledAt = new Date();
    subscription.cancelReason = input.reason ?? 'Annulation du renouvellement';
    await subscription.save();
    return { subscription, renewalCancelled: true };
  }

  throw new ApiError(
    422,
    'SUBSCRIPTION_NOT_CANCELLABLE',
    'Cet abonnement ne peut plus être annulé.',
  );
}

export async function listSubscriptions(
  query: SubscriptionListQuery,
): Promise<{ subscriptions: SubscriptionDocument[]; total: number }> {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;
  if (query.clientId) filter.client = query.clientId;
  if (query.packId) filter.pack = query.packId;

  const [subscriptions, total] = await Promise.all([
    SubscriptionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    SubscriptionModel.countDocuments(filter),
  ]);

  return { subscriptions, total };
}

export async function adjustSubscriptionQuota(
  subscriptionId: string,
  units: number,
  reason: string,
  actorId: string,
): Promise<SubscriptionDocument> {
  await adjustQuota({ subscriptionId, units, reason, actorId });
  const subscription = await SubscriptionModel.findById(subscriptionId);

  if (!subscription) {
    throw ApiError.notFound('Abonnement introuvable.');
  }

  return subscription;
}

export async function expireSubscriptionById(
  subscriptionId: string,
  now = new Date(),
): Promise<SubscriptionDocument | null> {
  return expireSubscription(subscriptionId, now);
}

export async function runSubscriptionExpiry(now = new Date()): Promise<number> {
  return expireDueSubscriptions(now);
}

export function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
