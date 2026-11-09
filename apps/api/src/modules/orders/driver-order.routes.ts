import { Router } from 'express';
import {
  driverOrderListQuerySchema,
  driverTransitionSchema,
  idParamSchema,
  type DriverOrderListQuery,
  type DriverTransitionInput,
  type IdParam,
} from '@finiko/contracts';
import { authenticate, requireRole } from '../../middleware/authenticate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { writeAudit } from '../../utils/audit';
import { success } from '../../utils/http';
import {
  getDriverOrderDetail,
  listDriverOrders,
  transitionDriverOrder,
} from './driver-order.service';

export const driverOrdersRouter = Router();

driverOrdersRouter.use(authenticate, requireRole('livreur'));

driverOrdersRouter.get('/', validateQuery(driverOrderListQuerySchema), async (req, res) => {
  const query = req.validatedQuery as DriverOrderListQuery;
  const { orders, total } = await listDriverOrders(req.auth!.userId, query);

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

driverOrdersRouter.get('/:id', validateParams(idParamSchema), async (req, res) => {
  const { id } = req.validatedParams as IdParam;
  const order = await getDriverOrderDetail(req.auth!.userId, id);

  res.status(200).json(success({ order }));
});

driverOrdersRouter.post(
  '/:id/transition',
  validateParams(idParamSchema),
  validateBody(driverTransitionSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as DriverTransitionInput;
    const order = await transitionDriverOrder(req.auth!.userId, id, input);

    await writeAudit(req, {
      action: 'driver.order.transition',
      entityType: 'Order',
      entityId: order.id,
      after: { status: order.status },
    });

    res.status(200).json(success({ order }, { message: 'Statut de la mission mis à jour.' }));
  },
);
