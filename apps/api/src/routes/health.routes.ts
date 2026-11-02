import { Router } from 'express';
import { isDatabaseReady } from '../config/database';
import { env } from '../config/env';
import { success } from '../utils/http';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json(
    success({
      status: 'ok',
      service: 'finiko-api',
      version: env.SERVICE_VERSION,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );
});

healthRouter.get('/ready', (req, res) => {
  const databaseReady = isDatabaseReady();

  if (!databaseReady) {
    res.status(503).json({
      success: false,
      error: {
        code: 'NOT_READY',
        message: "La base de données n'est pas disponible.",
        details: { database: 'down' },
        requestId: req.id,
      },
    });
    return;
  }

  res.status(200).json(
    success({
      status: 'ready',
      checks: { database: 'up' },
      timestamp: new Date().toISOString(),
    }),
  );
});
