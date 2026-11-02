import { Router } from 'express';
import { env } from '../config/env';
import { success } from '../utils/http';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.status(200).json(
    success({
      name: 'FINIKO API',
      version: env.SERVICE_VERSION,
      documentation: '/health',
    }),
  );
});
