import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB déconnecté'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnecté'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });

  logger.info({ database: mongoose.connection.name }, 'MongoDB connecté');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}
