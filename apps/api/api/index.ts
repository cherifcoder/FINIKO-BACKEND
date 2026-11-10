/**
 * Entrée Serverless Vercel.
 *
 * Vercel exécute ce fichier comme une fonction HTTP : il n'y a donc AUCUN
 * `app.listen()` ici (le `listen` reste dans `src/server.ts` pour le dev
 * local et les déploiements sur process Node persistant).
 *
 * L'app Express est créée une seule fois puis réutilisée entre les
 * invocations chaudes d'une même instance de fonction, et la connexion
 * MongoDB est partagée via le cache global de `config/database`.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { createApp } from '../src/app';
import { connectDatabase } from '../src/config/database';

let cachedApp: ReturnType<typeof createApp> | null = null;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!cachedApp) {
    // Cold start : ouvre (et cache) la connexion MongoDB avant de servir.
    await connectDatabase();
    cachedApp = createApp();
  }

  // Délègue la requête HTTP brute à l'app Express (req/res Node standard).
  cachedApp(req, res);
}
