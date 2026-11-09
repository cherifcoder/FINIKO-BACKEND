import { Router } from 'express';
import { adminOrderListQuerySchema, type AdminOrderListQuery } from '@finiko/contracts';
import { authenticate, requireRole } from '../../middleware/authenticate';
import { validateQuery } from '../../middleware/validate';
import { success } from '../../utils/http';
import { listAdminOrders } from './order.service';

export const adminOrdersRouter = Router();

adminOrdersRouter.use(authenticate, requireRole('admin'));

adminOrdersRouter.get('/', validateQuery(adminOrderListQuerySchema), async (req, res) => {
  const query = req.validatedQuery as AdminOrderListQuery;
  const { orders, total } = await listAdminOrders(query);

  res.status(200).json(
    success(
      { orders },
      {
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
      },
    ),
  );
});
