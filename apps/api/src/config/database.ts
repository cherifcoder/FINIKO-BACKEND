import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

interface DatabaseCache {
  connection: Promise<void> | null;
  listenersRegistered: boolean;
}

/**
 * En serverless (Vercel), le module peut être réinstancié entre les
 * invocations. On stocke la promesse de connexion sur `globalThis` pour
 * partager le pool MongoDB entre les invocations chaudes d'une même
 * instance de fonction (pattern recommandé par MongoDB Atlas).
 */
const globalForDatabase = globalThis as typeof globalThis & {
  __finikoDatabase?: DatabaseCache;
};

const databaseCache: DatabaseCache = (globalForDatabase.__finikoDatabase ??= {
  connection: null,
  listenersRegistered: false,
});

async function connectOnce(uri: string): Promise<void> {
  if (!databaseCache.listenersRegistered) {
    databaseCache.listenersRegistered = true;
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB déconnecté'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnecté'));
    mongoose.connection.on('error', (error) => logger.error({ err: error }, 'Erreur MongoDB'));
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });

  logger.info({ database: mongoose.connection.name }, 'MongoDB connecté');
}

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  // Invocation chaude : la connexion est déjà établie.
  if (mongoose.connection.readyState === 1) return;

  databaseCache.connection ??= connectOnce(uri).catch((error: unknown) => {
    // Permet une nouvelle tentative lors de l'invocation suivante.
    databaseCache.connection = null;
    throw error;
  });

  await databaseCache.connection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  databaseCache.connection = null;
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}
