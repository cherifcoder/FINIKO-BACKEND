import { Router } from 'express';
import {
  cancelOrderSchema,
  clientOrderListQuerySchema,
  createOrderSchema,
  disputeOrderSchema,
  idParamSchema,
  quoteRequestSchema,
  type CancelOrderInput,
  type ClientOrderListQuery,
  type CreateOrderInput,
  type DisputeOrderInput,
  type IdParam,
  type QuoteRequestInput,
} from '@finiko/contracts';
import { authenticate, requireRole } from '../../middleware/authenticate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { writeAudit } from '../../utils/audit';
import { success } from '../../utils/http';
import {
  cancelClientOrder,
  confirmClientDelivery,
  createClientOrder,
  disputeClientOrder,
  getClientOrderDetail,
  listClientOrders,
  quoteClientOrder,
} from './client-order.service';

export const clientOrdersRouter = Router();

clientOrdersRouter.use(authenticate, requireRole('client'));

clientOrdersRouter.post('/quote', validateBody(quoteRequestSchema), async (req, res) => {
  const input = req.body as QuoteRequestInput;
  const quote = await quoteClientOrder(req.auth!.userId, input);

  res.status(200).json(success(quote));
});

clientOrdersRouter.post('/', validateBody(createOrderSchema), async (req, res) => {
  const input = req.body as CreateOrderInput;
  const result = await createClientOrder(req.auth!.userId, input);

  await writeAudit(req, {
    action: 'order.create',
    entityType: 'Order',
    entityId: result.order.id,
    after: {
      orderNumber: result.order.orderNumber,
      status: result.order.status,
      totalDue: result.order.totalDue,
      paymentMethod: result.order.paymentMethod,
    },
  });

  res.status(201).json(
    success(result, {
      message:
        result.order.paymentStatus === 'non_requis'
          ? 'Commande confirmée et quota consommé.'
          : result.order.status === 'confirmee'
            ? 'Commande confirmée. Le paiement sera collecté à la livraison.'
            : 'Commande créée, en attente de paiement.',
    }),
  );
});

clientOrdersRouter.get('/', validateQuery(clientOrderListQuerySchema), async (req, res) => {
  const query = req.validatedQuery as ClientOrderListQuery;
  const { result, total } = await listClientOrders(req.auth!.userId, query);

  res.status(200).json(
    success(result, {
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }),
  );
});

clientOrdersRouter.get('/:id', validateParams(idParamSchema), async (req, res) => {
  const { id } = req.validatedParams as IdParam;
  const order = await getClientOrderDetail(req.auth!.userId, id);

  res.status(200).json(success({ order }));
});

clientOrdersRouter.post(
  '/:id/cancel',
  validateParams(idParamSchema),
  validateBody(cancelOrderSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as CancelOrderInput;
    const result = await cancelClientOrder(req.auth!.userId, id, input);

    await writeAudit(req, {
      action: 'order.cancel',
      entityType: 'Order',
      entityId: result.order.id,
      after: {
        status: result.order.status,
        reason: result.order.cancellation.reason,
        quotaReleased: result.quotaReleased,
      },
    });

    res.status(200).json(
      success(result, {
        message: result.quotaReleased ? 'Commande annulée et quota libéré.' : 'Commande annulée.',
      }),
    );
  },
);

clientOrdersRouter.post('/:id/confirm', validateParams(idParamSchema), async (req, res) => {
  const { id } = req.validatedParams as IdParam;
  const order = await confirmClientDelivery(req.auth!.userId, id);

  await writeAudit(req, {
    action: 'order.confirm_delivery',
    entityType: 'Order',
    entityId: order.id,
    after: { status: order.status },
  });

  res
    .status(200)
    .json(success({ order }, { message: 'Réception confirmée. Merci d’avoir utilisé FINIKO.' }));
});

clientOrdersRouter.post(
  '/:id/dispute',
  validateParams(idParamSchema),
  validateBody(disputeOrderSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as DisputeOrderInput;
    const order = await disputeClientOrder(req.auth!.userId, id, input);

    await writeAudit(req, {
      action: 'order.dispute',
      entityType: 'Order',
      entityId: order.id,
      after: { status: order.status, reason: input.reason },
    });

    res
      .status(200)
      .json(
        success(
          { order },
          { message: 'Litige enregistré. Notre équipe vous contactera rapidement.' },
        ),
      );
  },
);
