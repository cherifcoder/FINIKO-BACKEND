import type { QueryFilter } from 'mongoose';
import {
  ORDER_STATUS_LABELS,
  canTransitionOrder,
  type DriverMissionPhase,
  type DriverOrderDetail,
  type DriverOrderListQuery,
  type DriverOrderSummary,
  type DriverTransitionInput,
  type DriverTransitionStatus,
  type OrderStatus,
} from '@finiko/contracts';
import { ApiError } from '../../middleware/error';
import { OrderModel, type Order } from '../../models/order.model';
import { PaymentModel } from '../../models/payment.model';
import { DriverProfileModel } from '../../models/profile.model';
import { UserModel } from '../../models/user.model';
import { buildOrderDetail } from './client-order.service';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function missionPhase(status: OrderStatus): DriverMissionPhase {
  if (
    status === 'confirmee' ||
    status === 'ramassage_assigne' ||
    status === 'ramassage_en_cours' ||
    status === 'ramassee'
  ) {
    return 'ramassage';
  }

  if (status === 'prete' || status === 'livraison_assignee' || status === 'livraison_en_cours') {
    return 'livraison';
  }

  if (status === 'livree' || status === 'terminee') return 'terminee';

  return 'autre';
}

async function getDriverProfileId(userId: string): Promise<string> {
  const profile = await DriverProfileModel.findOne({ user: userId }).select('_id').lean();

  if (!profile) {
    throw ApiError.notFound('Profil livreur introuvable.');
  }

  return profile._id.toString();
}

function buildFilter(driverId: string, query: DriverOrderListQuery): QueryFilter<Order> {
  const filter: QueryFilter<Order> = { driver: driverId };

  if (query.status) filter.status = query.status;

  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [
      { orderNumber: regex },
      { 'pickup.text': regex },
      { 'delivery.text': regex },
      { 'pickup.contactName': regex },
      { 'delivery.contactName': regex },
    ];
  }

  return filter;
}

export async function listDriverOrders(
  userId: string,
  query: DriverOrderListQuery,
): Promise<{ orders: DriverOrderSummary[]; total: number }> {
  const driverId = await getDriverProfileId(userId);
  const filter = buildFilter(driverId, query);

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
    orders: rows.map((order) => {
      const client = clientById.get(order.client.toString());

      return {
        id: order._id.toString(),
        orderNumber: order.orderNumber,
        status: order.status,
        statusLabel: ORDER_STATUS_LABELS[order.status],
        missionPhase: missionPhase(order.status),
        itemsCount: order.totals.itemsCount,
        totalDue: order.totals.totalDue,
        totalPaid: order.totals.totalPaid,
        paymentMethod: order.payment.method,
        paymentStatus: order.payment.status,
        pickupText: order.pickup.text,
        deliveryText: order.delivery.text,
        clientName: client ? `${client.firstName} ${client.lastName}`.trim() : 'Client FINIKO',
        clientPhone: client?.phone ?? '—',
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        lastStatusAt: order.lastStatusAt.toISOString(),
      } satisfies DriverOrderSummary;
    }),
  };
}

export async function getDriverOrderDetail(
  userId: string,
  orderId: string,
): Promise<DriverOrderDetail> {
  const driverId = await getDriverProfileId(userId);
  const order = await OrderModel.findOne({ _id: orderId, driver: driverId });

  if (!order) {
    throw ApiError.notFound('Mission introuvable ou non assignée.');
  }

  return {
    ...(await buildOrderDetail(order)),
    missionPhase: missionPhase(order.status),
  };
}

const DRIVER_TRANSITIONS = {
  ramassage_en_cours: ['ramassage_assigne'],
  ramassee: ['ramassage_en_cours'],
  deposee_au_pressing: ['ramassee'],
  livraison_assignee: ['prete'],
  livraison_en_cours: ['livraison_assignee'],
  livree: ['livraison_en_cours'],
} as const satisfies Record<DriverTransitionStatus, readonly OrderStatus[]>;

export async function transitionDriverOrder(
  userId: string,
  orderId: string,
  input: DriverTransitionInput,
): Promise<DriverOrderDetail> {
  const driverId = await getDriverProfileId(userId);
  const order = await OrderModel.findOne({ _id: orderId, driver: driverId });

  if (!order) {
    throw ApiError.notFound('Mission introuvable ou non assignée.');
  }

  const allowedStatuses: readonly OrderStatus[] = DRIVER_TRANSITIONS[input.status];

  if (!allowedStatuses.includes(order.status)) {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      `Transition impossible : ${ORDER_STATUS_LABELS[order.status]} → ${ORDER_STATUS_LABELS[input.status]}.`,
    );
  }

  if (!canTransitionOrder(order.status, input.status)) {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      `Transition impossible : ${ORDER_STATUS_LABELS[order.status]} → ${ORDER_STATUS_LABELS[input.status]}.`,
    );
  }

  if (input.status === 'deposee_au_pressing' && !order.pressing) {
    throw ApiError.conflict(
      'PRESSING_NOT_ASSIGNED',
      'Aucun pressing n’est associé à cette commande. Contactez le support FINIKO.',
    );
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    status: input.status,
    lastStatusAt: now,
  };

  if (input.status === 'livree' && order.payment.method === 'cash') {
    update['payment.status'] = 'paye';
    update['payment.paidAt'] = now;
    update['totals.totalPaid'] = order.totals.totalDue;
  }

  const updated = await OrderModel.findOneAndUpdate(
    { _id: order._id, driver: driverId, status: order.status },
    { $set: update },
    { returnDocument: 'after' },
  );

  if (!updated) {
    throw ApiError.conflict(
      'ORDER_STATE_CHANGED',
      'La mission a changé entre-temps. Rechargez-la avant de réessayer.',
    );
  }

  if (input.status === 'livree') {
    if (order.payment.method === 'cash' && order.payment.payment) {
      await PaymentModel.updateOne(
        { _id: order.payment.payment },
        { $set: { status: 'reussi', paidAt: now, providerStatus: 'cash_collecte' } },
      ).catch(() => undefined);
    }

    await DriverProfileModel.updateOne(
      { _id: driverId },
      { $set: { status: 'disponible' }, $pull: { activeOrderIds: order._id } },
    ).catch(() => undefined);
  } else {
    await DriverProfileModel.updateOne(
      { _id: driverId },
      { $set: { status: 'en_mission' }, $addToSet: { activeOrderIds: order._id } },
    ).catch(() => undefined);
  }

  return {
    ...(await buildOrderDetail(updated)),
    missionPhase: missionPhase(updated.status),
  };
}
