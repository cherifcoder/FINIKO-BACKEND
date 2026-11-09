import type { QueryFilter } from 'mongoose';
import type { AdminOrderListQuery, AdminOrderSummary } from '@finiko/contracts';
import { DriverProfileModel, PressingProfileModel } from '../../models/profile.model';
import { OrderModel, type Order } from '../../models/order.model';
import { UserModel } from '../../models/user.model';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function buildFilter(query: AdminOrderListQuery): Promise<QueryFilter<Order>> {
  const filter: QueryFilter<Order> = {};

  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter['payment.status'] = query.paymentStatus;

  if (query.q) {
    const regex = new RegExp(escapeRegex(query.q), 'i');
    const users = await UserModel.find({
      $or: [{ firstName: regex }, { lastName: regex }, { phone: regex }, { email: regex }],
    })
      .select('_id')
      .lean();

    filter.$or = [
      { orderNumber: regex },
      { 'pickup.text': regex },
      { 'delivery.text': regex },
      { client: { $in: users.map((user) => user._id) } },
    ];
  }

  return filter;
}

export async function listAdminOrders(query: AdminOrderListQuery): Promise<{
  orders: AdminOrderSummary[];
  total: number;
}> {
  const filter = await buildFilter(query);

  const [total, rows] = await Promise.all([
    OrderModel.countDocuments(filter),
    OrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
  ]);

  const clientIds = [...new Set(rows.map((order) => order.client.toString()))];
  const pressingIds = [
    ...new Set(
      rows
        .map((order) => order.pressing?.toString())
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const driverIds = [
    ...new Set(
      rows
        .map((order) => order.driver?.toString())
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];

  const [clients, pressings, drivers] = await Promise.all([
    UserModel.find({ _id: { $in: clientIds } })
      .select('firstName lastName phone')
      .lean(),
    pressingIds.length
      ? PressingProfileModel.find({ _id: { $in: pressingIds } })
          .select('businessName code')
          .lean()
      : Promise.resolve([]),
    driverIds.length
      ? DriverProfileModel.find({ _id: { $in: driverIds } })
          .select('code')
          .lean()
      : Promise.resolve([]),
  ]);

  const clientById = new Map(clients.map((client) => [client._id.toString(), client]));
  const pressingById = new Map(pressings.map((pressing) => [pressing._id.toString(), pressing]));
  const driverById = new Map(drivers.map((driver) => [driver._id.toString(), driver]));

  return {
    total,
    orders: rows.map((order) => {
      const client = clientById.get(order.client.toString());
      const pressing = order.pressing ? pressingById.get(order.pressing.toString()) : undefined;
      const driver = order.driver ? driverById.get(order.driver.toString()) : undefined;

      return {
        id: order._id.toString(),
        orderNumber: order.orderNumber,
        status: order.status,
        client: {
          id: order.client.toString(),
          fullName: client ? `${client.firstName} ${client.lastName}`.trim() : 'Client supprimé',
          phone: client?.phone ?? '—',
        },
        itemsCount: order.totals.itemsCount,
        totalDue: order.totals.totalDue,
        totalPaid: order.totals.totalPaid,
        paymentMethod: order.payment.method,
        paymentStatus: order.payment.status,
        pressingName: pressing?.businessName ?? null,
        driverCode: driver?.code ?? null,
        pickupText: order.pickup.text,
        deliveryText: order.delivery.text,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      } satisfies AdminOrderSummary;
    }),
  };
}
