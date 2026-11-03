import { hash, verify } from '@node-rs/argon2';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Argon2id est l'algorithme par défaut de @node-rs/argon2. On ne référence pas
// l'enum `Algorithm` (const enum ambiante) pour rester compatible avec verbatimModuleSyntax.
const options = {
  memoryCost: env.ARGON2_MEMORY_KIB,
  timeCost: env.ARGON2_TIME_COST,
  parallelism: env.ARGON2_PARALLELISM,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch (error) {
    logger.warn({ err: error }, 'Échec de vérification Argon2');
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('finiko-dummy-password-for-timing');
  return dummyHashPromise;
}

/**
 * Vérifie un mot de passe même lorsque l'utilisateur n'existe pas, afin de ne pas
 * révéler l'existence d'un compte par le temps de réponse.
 */
export async function verifyUnknownUserPassword(password: string): Promise<void> {
  await verifyPassword(await getDummyHash(), password);
}
