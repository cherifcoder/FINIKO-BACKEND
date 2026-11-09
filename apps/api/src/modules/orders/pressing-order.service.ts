import type { QueryFilter, Types } from 'mongoose';
import {
  ORDER_STATUS_LABELS,
  canTransitionOrder,
  type ItemTreatmentStatus,
  type OrderStatus,
  type PressingOrderDetail,
  type PressingOrderListQuery,
  type PressingOrderSummary,
  type PressingTransitionInput,
  type PressingUpdateItemsInput,
} from '@finiko/contracts';
import { ApiError } from '../../middleware/error';
import { OrderModel, type Order } from '../../models/order.model';
import { PressingProfileModel } from '../../models/profile.model';
import { UserModel } from '../../models/user.model';
import { buildOrderDetail } from './client-order.service';

const ITEM_TRANSITIONS: Record<ItemTreatmentStatus, readonly ItemTreatmentStatus[]> = {
  a_traiter: ['en_cours', 'termine'],
  en_cours: ['a_traiter', 'termine'],
  termine: ['a_traiter', 'en_cours'],
};

interface ItemCounts {
  pendingItems: number;
  inProgressItems: number;
  completedItems: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countItems(order: Order): ItemCounts {
  const counts: ItemCounts = {
    pendingItems: 0,
    inProgressItems: 0,
    completedItems: 0,
  };

  for (const item of order.items) {
    if (item.treatmentStatus === 'termine') {
      counts.completedItems += item.quantity;
    } else if (item.treatmentStatus === 'en_cours') {
      counts.inProgressItems += item.quantity;
    } else {
      counts.pendingItems += item.quantity;
    }
  }

  return counts;
}

async function getPressingProfileId(userId: string): Promise<string> {
  const profile = await PressingProfileModel.findOne({ user: userId }).select('_id').lean();

  if (!profile) {
    throw ApiError.notFound('Profil pressing introuvable.');
  }

  return profile._id.toString();
}

async function buildFilter(
  pressingId: string,
  query: PressingOrderListQuery,
): Promise<QueryFilter<Order>> {
  const filter: QueryFilter<Order> = { pressing: pressingId };

  if (query.status) filter.status = query.status;

  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    const clients = await UserModel.find({
      $or: [{ firstName: regex }, { lastName: regex }, { phone: regex }, { email: regex }],
    })
      .select('_id')
      .lean();

    filter.$or = [
      { orderNumber: regex },
      { 'pickup.text': regex },
      { 'delivery.text': regex },
      { 'pickup.contactName': regex },
      { 'delivery.contactName': regex },
      { client: { $in: clients.map((client) => client._id) } },
    ];
  }

  return filter;
}

function buildSummary(
  order: Order & { _id: Types.ObjectId },
  client: { firstName: string; lastName: string; phone: string } | undefined,
): PressingOrderSummary {
  const counts = countItems(order);

  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    clientName: client ? `${client.firstName} ${client.lastName}`.trim() : 'Client FINIKO',
    clientPhone: client?.phone ?? '—',
    itemsCount: order.totals.itemsCount,
    pendingItems: counts.pendingItems,
    inProgressItems: counts.inProgressItems,
    completedItems: counts.completedItems,
    totalDue: order.totals.totalDue,
    paymentMethod: order.payment.method,
    paymentStatus: order.payment.status,
    pickupText: order.pickup.text,
    deliveryText: order.delivery.text,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    lastStatusAt: order.lastStatusAt.toISOString(),
  };
}

export async function listPressingOrders(
  userId: string,
  query: PressingOrderListQuery,
): Promise<{ orders: PressingOrderSummary[]; total: number }> {
  const pressingId = await getPressingProfileId(userId);
  const filter = await buildFilter(pressingId, query);

  const [total, rows] = await Promise.all([
    OrderModel.countDocuments(filter),
    OrderModel.find(filter)
      .sort({ lastStatusAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
  ]);

  const clientIds = [...new Set(rows.map((order) => order.client.toString()))];
  const clients = await UserModel.find({ _id: { $in: clientIds } })
    .select('firstName lastName phone')
    .lean();
  const clientById = new Map(clients.map((client) => [client._id.toString(), client]));

  return {
    total,
    orders: rows.map((order) => buildSummary(order, clientById.get(order.client.toString()))),
  };
}

export async function getPressingOrderDetail(
  userId: string,
  orderId: string,
): Promise<PressingOrderDetail> {
  const pressingId = await getPressingProfileId(userId);
  const order = await OrderModel.findOne({ _id: orderId, pressing: pressingId });

  if (!order) {
    throw ApiError.notFound('Commande introuvable dans votre file pressing.');
  }

  return {
    ...(await buildOrderDetail(order)),
    ...countItems(order),
  };
}

function assertItemsUpdatable(status: OrderStatus): void {
  if (status !== 'au_pressing' && status !== 'en_traitement') {
    throw ApiError.conflict(
      'ITEMS_NOT_UPDATABLE',
      'Réceptionnez la commande et démarrez le traitement avant de modifier les articles.',
    );
  }
}

export async function updatePressingItems(
  userId: string,
  orderId: string,
  input: PressingUpdateItemsInput,
): Promise<PressingOrderDetail> {
  const pressingId = await getPressingProfileId(userId);
  const order = await OrderModel.findOne({ _id: orderId, pressing: pressingId });

  if (!order) {
    throw ApiError.notFound('Commande introuvable dans votre file pressing.');
  }

  assertItemsUpdatable(order.status);

  const now = new Date();

  for (const update of input.items) {
    const item = order.items[update.index];

    if (!item) {
      throw ApiError.badRequest(`L’article à l’index ${update.index} n’existe pas.`);
    }

    if (item.treatmentStatus === update.status) continue;

    if (!ITEM_TRANSITIONS[item.treatmentStatus].includes(update.status)) {
      throw ApiError.conflict(
        'INVALID_ITEM_TRANSITION',
        `Transition de traitement impossible : ${item.treatmentStatus} → ${update.status}.`,
      );
    }

    item.treatmentStatus = update.status;

    if (update.status === 'a_traiter') {
      item.treatmentStartedAt = null;
      item.treatmentCompletedAt = null;
    } else if (update.status === 'en_cours') {
      item.treatmentStartedAt = item.treatmentStartedAt ?? now;
      item.treatmentCompletedAt = null;
    } else {
      item.treatmentStartedAt = item.treatmentStartedAt ?? now;
      item.treatmentCompletedAt = now;
    }
  }

  await order.save();

  return {
    ...(await buildOrderDetail(order)),
    ...countItems(order),
  };
}

export async function transitionPressingOrder(
  userId: string,
  orderId: string,
  input: PressingTransitionInput,
): Promise<PressingOrderDetail> {
  const pressingId = await getPressingProfileId(userId);
  const order = await OrderModel.findOne({ _id: orderId, pressing: pressingId });

  if (!order) {
    throw ApiError.notFound('Commande introuvable dans votre file pressing.');
  }

  if (!canTransitionOrder(order.status, input.status)) {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      `Transition impossible : ${ORDER_STATUS_LABELS[order.status]} → ${ORDER_STATUS_LABELS[input.status]}.`,
    );
  }

  if (input.status === 'au_pressing' && order.status !== 'deposee_au_pressing') {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      'La commande doit d’abord être déposée au pressing.',
    );
  }

  if (input.status === 'en_traitement' && order.status !== 'au_pressing') {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      'Réceptionnez la commande avant de démarrer le traitement.',
    );
  }

  if (input.status === 'prete' && order.items.some((item) => item.treatmentStatus !== 'termine')) {
    throw ApiError.conflict(
      'ITEMS_NOT_READY',
      'Tous les articles doivent être terminés avant de marquer la commande prête.',
    );
  }

  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, pressing: pressingId, status: order.status },
    { $set: { status: input.status, lastStatusAt: new Date() } },
    { returnDocument: 'after' },
  );

  if (!updated) {
    throw ApiError.conflict(
      'ORDER_STATE_CHANGED',
      'La commande a changé entre-temps. Rechargez-la avant de réessayer.',
    );
  }

  return {
    ...(await buildOrderDetail(updated)),
    ...countItems(updated),
  };
}
