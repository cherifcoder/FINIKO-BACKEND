import { Router } from 'express';
import { env } from '../config/env';
import { success } from '../utils/http';
import { authRouter } from '../modules/auth/auth.routes';
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
        adminUsers: '/api/v1/admin/users',
      },
    }),
  );
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin/users', adminUsersRouter);
