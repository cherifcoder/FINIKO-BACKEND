import { Router } from 'express';
import {
  idParamSchema,
  pressingOrderListQuerySchema,
  pressingTransitionSchema,
  pressingUpdateItemsSchema,
  type IdParam,
  type PressingOrderListQuery,
  type PressingTransitionInput,
  type PressingUpdateItemsInput,
} from '@finiko/contracts';
import { authenticate, requireRole } from '../../middleware/authenticate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { writeAudit } from '../../utils/audit';
import { success } from '../../utils/http';
import {
  getPressingOrderDetail,
  listPressingOrders,
  transitionPressingOrder,
  updatePressingItems,
} from './pressing-order.service';

export const pressingOrdersRouter = Router();

pressingOrdersRouter.use(authenticate, requireRole('pressing'));

pressingOrdersRouter.get('/', validateQuery(pressingOrderListQuerySchema), async (req, res) => {
  const query = req.validatedQuery as PressingOrderListQuery;
  const { orders, total } = await listPressingOrders(req.auth!.userId, query);

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

pressingOrdersRouter.get('/:id', validateParams(idParamSchema), async (req, res) => {
  const { id } = req.validatedParams as IdParam;
  const order = await getPressingOrderDetail(req.auth!.userId, id);

  res.status(200).json(success({ order }));
});

pressingOrdersRouter.patch(
  '/:id/items',
  validateParams(idParamSchema),
  validateBody(pressingUpdateItemsSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as PressingUpdateItemsInput;
    const order = await updatePressingItems(req.auth!.userId, id, input);

    await writeAudit(req, {
      action: 'pressing.items.update',
      entityType: 'Order',
      entityId: order.id,
      after: { items: input.items },
    });

    res.status(200).json(success({ order }, { message: 'Traitement des articles mis à jour.' }));
  },
);

pressingOrdersRouter.post(
  '/:id/transition',
  validateParams(idParamSchema),
  validateBody(pressingTransitionSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as PressingTransitionInput;
    const order = await transitionPressingOrder(req.auth!.userId, id, input);

    await writeAudit(req, {
      action: 'pressing.order.transition',
      entityType: 'Order',
      entityId: order.id,
      after: { status: order.status },
    });

    res
      .status(200)
      .json(success({ order }, { message: 'Statut de la commande pressing mis à jour.' }));
  },
);
