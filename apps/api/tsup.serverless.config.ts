import { defineConfig } from 'tsup';

/**
 * Bundle serverless pour Vercel.
 *
 * Produit UN SEUL fichier CommonJS `api/index.js` à la racine du monorepo
 * (répertoire `api/` imposé par la découverte des fonctions Vercel) :
 * - toute l'app Express + les dépendances JS sont inlinées (esbuild) —
 *   indispensable : `jose` v6 est ESM-only et le runtime Vercel n'accepte
 *   pas `require()` d'un module ES ; un noExternal "attrape-tout" bundle
 *   donc toutes les dépendances dans le fichier final ;
 * - le binding natif `@node-rs/argon2-*` reste fonctionnel : le loader
 *   NAPI-RS utilise des require() calculés qu'esbuild laisse en runtime,
 *   résolus depuis /var/task/node_modules (présent dans la lambda) et via
 *   la copie de secours scripts/copy-argon2-vercel.mjs ;
 * - `@finiko/contracts` (package workspace en TS) est inliné via noExternal.
 *
 * Le CommonJS est requis : le runtime Vercel exécute les fichiers `api/*.js`
 * selon le `package.json` racine (sans "type"), donc en mode CommonJS, et le
 * bundle doit fournir `require` pour le loader NAPI-RS d'argon2.
 */
export default defineConfig({
  entry: { index: 'api/index.ts' },
  format: ['cjs'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: false,
  dts: false,
  splitting: false,
  // Bundle TOUT sauf les packages natifs @node-rs/* : leur loader utilise des
  // require() littéraux de binaires .node que l'on veut résoudre au runtime
  // (node_modules présent dans la lambda + copie de secours build-time).
  noExternal: [/^(?!@node-rs).+$/],
  outDir: '../../api',
  // Force .js (et non .cjs, que tsup choisit car apps/api est "type": "module") :
  // à la racine du monorepo (package.json sans "type"), api/index.js est bien
  // traité comme CommonJS par le runtime Vercel, et la découverte automatique
  // des fonctions couvre les fichiers api/*.js.
  outExtension: () => ({ js: '.js' }),
  // mongoose détecte ses types de schéma par nom de classe (ex. `ObjectId`).
  // esbuild renomme les symboles lors du bundle -> keepNames restaure les
  // noms originaux, sinon `Invalid schema configuration: _ObjectId ...`.
  esbuildOptions(options) {
    options.keepNames = true;
  },
});
