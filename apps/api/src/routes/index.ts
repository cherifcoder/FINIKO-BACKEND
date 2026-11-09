import { Router } from 'express';
import { env } from '../config/env';
import { success } from '../utils/http';
import { authRouter } from '../modules/auth/auth.routes';
import { catalogRouter } from '../modules/catalog/catalog.routes';
import { packsRouter } from '../modules/packs/pack.routes';
import { subscriptionsRouter } from '../modules/subscriptions/subscription.routes';
import { clientOrdersRouter } from '../modules/orders/client-order.routes';
import { driverOrdersRouter } from '../modules/orders/driver-order.routes';
import { pressingOrdersRouter } from '../modules/orders/pressing-order.routes';
import { adminOrdersRouter } from '../modules/orders/order.routes';
import { adminFinancesRouter } from '../modules/finances/finance.routes';
import { adminUsersRouter } from '../modules/users/user.routes';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.status(200).json(
    success({
      name: 'FINIKO API',
      version: env.SERVICE_VERSION,
      documentation: '/health',
      resources: {
        auth: '/api/v1/auth',
        catalog: '/api/v1/catalog/items',
        packs: '/api/v1/packs',
        subscriptions: '/api/v1/subscriptions',
        orders: '/api/v1/orders',
        driverOrders: '/api/v1/driver/orders',
        pressingOrders: '/api/v1/pressing/orders',
        adminUsers: '/api/v1/admin/users',
        adminOrders: '/api/v1/admin/orders',
        adminFinances: '/api/v1/admin/finances',
      },
    }),
  );
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/packs', packsRouter);
apiRouter.use('/subscriptions', subscriptionsRouter);
apiRouter.use('/orders', clientOrdersRouter);
apiRouter.use('/driver/orders', driverOrdersRouter);
apiRouter.use('/pressing/orders', pressingOrdersRouter);
apiRouter.use('/admin/users', adminUsersRouter);
apiRouter.use('/admin/orders', adminOrdersRouter);
apiRouter.use('/admin/finances', adminFinancesRouter);
