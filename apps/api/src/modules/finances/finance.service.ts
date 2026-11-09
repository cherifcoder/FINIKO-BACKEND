import type {
  AdminFinanceQuery,
  AdminFinanceSummary,
  AdminPaymentTransaction,
  PaymentProvider,
} from '@finiko/contracts';
import { ApiError } from '../../middleware/error';
import { OrderModel } from '../../models/order.model';
import { PaymentModel } from '../../models/payment.model';
import { UserModel } from '../../models/user.model';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_DAYS = 30;

interface OrderStatsRow {
  _id: null;
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  revenue: number;
  nonCancelled: number;
}

interface PaymentStatsRow {
  _id: null;
  collected: number;
  pending: number;
  refunded: number;
  orderRevenue: number;
  subscriptionRevenue: number;
  successful: number;
  pendingCount: number;
  failed: number;
}

interface ProviderRow {
  _id: PaymentProvider;
  amountXOF: number;
  count: number;
}

function resolvePeriod(query: AdminFinanceQuery): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw ApiError.badRequest('Période financière invalide.');
  }

  if (from.getTime() > to.getTime()) {
    throw ApiError.badRequest('La date de début doit précéder la date de fin.');
  }

  return { from, to };
}

export async function getAdminFinanceSummary(
  query: AdminFinanceQuery,
): Promise<AdminFinanceSummary> {
  const { from, to } = resolvePeriod(query);
  const dateFilter = { $gte: from, $lte: to };

  const [orderRows, paymentRows, providerRows, recent] = await Promise.all([
    OrderModel.aggregate<OrderStatsRow>([
      { $match: { createdAt: dateFilter } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $in: ['$status', ['terminee', 'annulee']] }, 0, 1] },
          },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'terminee'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'annulee'] }, 1, 0] } },
          revenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'annulee'] }, 0, '$totals.totalDue'],
            },
          },
          nonCancelled: { $sum: { $cond: [{ $eq: ['$status', 'annulee'] }, 0, 1] } },
        },
      },
    ]),
    PaymentModel.aggregate<PaymentStatsRow>([
      { $match: { createdAt: dateFilter } },
      {
        $group: {
          _id: null,
          collected: {
            $sum: { $cond: [{ $eq: ['$status', 'reussi'] }, '$amountXOF', 0] },
          },
          pending: {
            $sum: {
              $cond: [{ $in: ['$status', ['initie', 'en_attente']] }, '$amountXOF', 0],
            },
          },
          refunded: {
            $sum: { $cond: [{ $eq: ['$status', 'rembourse'] }, '$amountXOF', 0] },
          },
          orderRevenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'reussi'] }, { $eq: ['$purpose', 'order'] }] },
                '$amountXOF',
                0,
              ],
            },
          },
          subscriptionRevenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'reussi'] }, { $eq: ['$purpose', 'subscription'] }] },
                '$amountXOF',
                0,
              ],
            },
          },
          successful: { $sum: { $cond: [{ $eq: ['$status', 'reussi'] }, 1, 0] } },
          pendingCount: {
            $sum: { $cond: [{ $in: ['$status', ['initie', 'en_attente']] }, 1, 0] },
          },
          failed: {
            $sum: {
              $cond: [{ $in: ['$status', ['echoue', 'annule', 'expire']] }, 1, 0],
            },
          },
        },
      },
    ]),
    PaymentModel.aggregate<ProviderRow>([
      { $match: { createdAt: dateFilter, status: 'reussi' } },
      {
        $group: {
          _id: '$provider',
          amountXOF: { $sum: '$amountXOF' },
          count: { $sum: 1 },
        },
      },
      { $sort: { amountXOF: -1 } },
    ]),
    PaymentModel.find({ createdAt: dateFilter }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const orderStats = orderRows[0];
  const paymentStats = paymentRows[0];
  const orderTotal = orderStats?.total ?? 0;
  const nonCancelled = orderStats?.nonCancelled ?? 0;
  const orderRevenue = orderStats?.revenue ?? 0;
  const collected = paymentStats?.collected ?? 0;
  const refunded = paymentStats?.refunded ?? 0;

  const clientIds = [...new Set(recent.map((payment) => payment.client.toString()))];
  const orderIds = [
    ...new Set(
      recent
        .map((payment) => payment.order?.toString())
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];

  const [clients, orders] = await Promise.all([
    UserModel.find({ _id: { $in: clientIds } })
      .select('firstName lastName')
      .lean(),
    orderIds.length
      ? OrderModel.find({ _id: { $in: orderIds } })
          .select('orderNumber')
          .lean()
      : Promise.resolve([]),
  ]);

  const clientById = new Map(clients.map((client) => [client._id.toString(), client]));
  const orderById = new Map(orders.map((order) => [order._id.toString(), order.orderNumber]));

  const recentTransactions: AdminPaymentTransaction[] = recent.map((payment) => {
    const client = clientById.get(payment.client.toString());

    return {
      id: payment._id.toString(),
      reference: payment.reference,
      purpose: payment.purpose,
      provider: payment.provider,
      amountXOF: payment.amountXOF,
      status: payment.status,
      clientName: client ? `${client.firstName} ${client.lastName}`.trim() : 'Client supprimé',
      orderNumber: payment.order ? (orderById.get(payment.order.toString()) ?? null) : null,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
    };
  });

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      collected,
      pending: paymentStats?.pending ?? 0,
      refunded,
      net: collected - refunded,
      orderRevenue: paymentStats?.orderRevenue ?? 0,
      subscriptionRevenue: paymentStats?.subscriptionRevenue ?? 0,
    },
    orders: {
      total: orderTotal,
      active: orderStats?.active ?? 0,
      completed: orderStats?.completed ?? 0,
      cancelled: orderStats?.cancelled ?? 0,
      averageBasket: nonCancelled > 0 ? Math.round(orderRevenue / nonCancelled) : 0,
    },
    payments: {
      successful: paymentStats?.successful ?? 0,
      pending: paymentStats?.pendingCount ?? 0,
      failed: paymentStats?.failed ?? 0,
    },
    providers: providerRows.map((row) => ({
      provider: row._id,
      amountXOF: row.amountXOF,
      count: row.count,
    })),
    recentTransactions,
  };
}
