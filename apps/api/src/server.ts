import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';

async function main(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'FINIKO API démarrée');
  });

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Arrêt en cours');

    const forceExit = setTimeout(() => {
      logger.error('Arrêt forcé après 10 s');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close((error) => {
      if (error) {
        logger.error({ err: error }, 'Erreur pendant la fermeture du serveur');
      }

      void disconnectDatabase()
        .catch((disconnectError: unknown) => {
          logger.error({ err: disconnectError }, 'Erreur pendant la déconnexion MongoDB');
        })
        .finally(() => {
          process.exit(error ? 1 : 0);
        });
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "Impossible de démarrer l'API");
  process.exit(1);
});
