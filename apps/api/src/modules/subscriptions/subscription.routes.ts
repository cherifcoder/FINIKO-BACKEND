import { Router } from 'express';
import {
  subscriptionAdjustQuotaSchema,
  subscriptionCancelSchema,
  subscriptionCreateSchema,
  subscriptionListQuerySchema,
  subscriptionUsageQuerySchema,
  idParamSchema,
  type IdParam,
  type SubscriptionAdjustQuotaInput,
  type SubscriptionCancelInput,
  type SubscriptionCreateInput,
  type SubscriptionListQuery,
  type SubscriptionUsageQuery,
} from '@finiko/contracts';
import { authenticate, requireRole } from '../../middleware/authenticate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { writeAudit } from '../../utils/audit';
import { success } from '../../utils/http';
import {
  adjustSubscriptionQuota,
  cancelSubscription,
  createSubscription,
  getMySubscriptions,
  listMyUsages,
  listSubscriptions,
  toSubscriptionUsageView,
  toSubscriptionView,
} from './subscription.service';

export const subscriptionsRouter = Router();

subscriptionsRouter.get('/me', authenticate, requireRole('client'), async (req, res) => {
  const overview = await getMySubscriptions(req.auth!.userId);
  res.status(200).json(success(overview));
});

subscriptionsRouter.get(
  '/me/usage',
  authenticate,
  requireRole('client'),
  validateQuery(subscriptionUsageQuerySchema),
  async (req, res) => {
    const query = req.validatedQuery as SubscriptionUsageQuery;
    const { usages, total } = await listMyUsages(req.auth!.userId, query);

    res.status(200).json(
      success(
        { usages: usages.map(toSubscriptionUsageView) },
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
  },
);

subscriptionsRouter.post(
  '/',
  authenticate,
  requireRole('client'),
  validateBody(subscriptionCreateSchema),
  async (req, res) => {
    const input = req.body as SubscriptionCreateInput;
    const subscription = await createSubscription(req.auth!.userId, input);

    await writeAudit(req, {
      action: 'subscription.create',
      entityType: 'Subscription',
      entityId: subscription._id.toString(),
      after: {
        pack: subscription.pack.toString(),
        status: subscription.status,
        quotaTotal: subscription.quotaTotal,
      },
    });

    res.status(202).json(
      success(
        { subscription: toSubscriptionView(subscription) },
        {
          message:
            subscription.status === 'programmee'
              ? 'Renouvellement programmé.'
              : 'Souscription créée, en attente de paiement.',
        },
      ),
    );
  },
);

subscriptionsRouter.post(
  '/:id/cancel',
  authenticate,
  requireRole('client'),
  validateParams(idParamSchema),
  validateBody(subscriptionCancelSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as SubscriptionCancelInput;
    const { subscription, renewalCancelled } = await cancelSubscription(
      req.auth!.userId,
      id,
      input,
    );

    await writeAudit(req, {
      action: renewalCancelled ? 'subscription.cancel-renewal' : 'subscription.cancel',
      entityType: 'Subscription',
      entityId: subscription._id.toString(),
      after: { status: subscription.status, reason: subscription.cancelReason },
    });

    res.status(200).json(
      success(
        { subscription: toSubscriptionView(subscription), renewalCancelled },
        {
          message: renewalCancelled
            ? 'Renouvellement annulé. Le quota reste utilisable jusqu’à la fin de la période.'
            : 'Abonnement annulé.',
        },
      ),
    );
  },
);

subscriptionsRouter.get(
  '/',
  authenticate,
  requireRole('admin'),
  validateQuery(subscriptionListQuerySchema),
  async (req, res) => {
    const query = req.validatedQuery as SubscriptionListQuery;
    const { subscriptions, total } = await listSubscriptions(query);

    res.status(200).json(
      success(
        { subscriptions: subscriptions.map(toSubscriptionView) },
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
  },
);

subscriptionsRouter.post(
  '/:id/adjust-quota',
  authenticate,
  requireRole('admin'),
  validateParams(idParamSchema),
  validateBody(subscriptionAdjustQuotaSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as SubscriptionAdjustQuotaInput;
    const subscription = await adjustSubscriptionQuota(
      id,
      input.units,
      input.reason,
      req.auth!.userId,
    );

    await writeAudit(req, {
      action: 'subscription.adjust-quota',
      entityType: 'Subscription',
      entityId: subscription._id.toString(),
      after: {
        units: input.units,
        quotaTotal: subscription.quotaTotal,
        reason: input.reason,
      },
    });

    res
      .status(200)
      .json(
        success({ subscription: toSubscriptionView(subscription) }, { message: 'Quota ajusté.' }),
      );
  },
);
