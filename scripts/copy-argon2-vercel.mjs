/**
 * Copie le binding natif Linux de @node-rs/argon2 à côté du bundle serverless.
 *
 * Le loader NAPI-RS d'`@node-rs/argon2` utilise des `require()` dynamiques
 * (impossibles à résoudre statiquement par esbuild). Au runtime, le bundle
 * `api/index.js` doit donc trouver `node_modules/@node-rs/argon2-linux-x64-gnu`
 * sur son chemin de résolution.
 *
 * Sur la machine de build Vercel (Linux), ce package existe dans le
 * node_modules hoisté : on le copie dans `api/node_modules/` pour que le
 * require fonctionne même si l'environnement d'exécution n'expose pas le
 * node_modules global du build.
 *
 * Localement (Windows/macOS), le binding Linux est absent : no-op volontaire.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'node_modules', '@node-rs', 'argon2-linux-x64-gnu');
const destination = join(root, 'api', 'node_modules', '@node-rs', 'argon2-linux-x64-gnu');

if (existsSync(source)) {
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
  console.log(`[copy-argon2-vercel] copié ${source} -> ${destination}`);
} else {
  console.log('[copy-argon2-vercel] binding linux absent (machine locale) : ignoré');
}
