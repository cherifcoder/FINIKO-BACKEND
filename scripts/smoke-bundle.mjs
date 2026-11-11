/**
 * Test local du bundle serverless Vercel (api/index.js, produit par
 * `pnpm --filter @finiko/api build:serverless`).
 *
 * Reproduit le runtime Vercel : un serveur HTTP minimal délègue chaque
 * requête au handler exporté par le bundle. Charge apps/api/.env avant
 * l'import (dotenv n'écrase pas les variables déjà définies).
 *
 * Exercice volontaire d'argon2 : le POST /login vérifie un mot de passe
 * hashé, ce qui prouve que le require dynamique du binding natif
 * fonctionne depuis le bundle.
 *
 *   node scripts/smoke-bundle.mjs
 */
import { createServer } from 'node:http';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../apps/api/.env', import.meta.url)) });

// Conditions identiques au runtime Vercel (NODE_ENV=production) : désactive
// le transport pino-pretty (incompatible bundle) et respecte les règles
// de production d'env.ts (OTP_EXPOSE_CODE doit être faux).
process.env.NODE_ENV = 'production';
process.env.OTP_EXPOSE_CODE = 'false';

const mod = await import('../api/index.js');
// Résolution identique au lanceur Vercel : fonction directe ou `.default`.
const raw = mod.default ?? mod;
const handler = typeof raw === 'function' ? raw : raw.default;

const PORT = 4124;
const server = createServer((req, res) => {
  void handler(req, res);
});

server.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}`;
  let failures = 0;

  const checkGet = async (path) => {
    const response = await fetch(`${base}${path}`);
    const text = (await response.text()).slice(0, 160);
    console.log(`[${response.status}] GET ${path} -> ${text}`);
    if (!response.ok) failures += 1;
  };

  await checkGet('/health');
  await checkGet('/ready');
  await checkGet('/api/v1/packs');

  // Login (argon2 verify depuis le bundle).
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'client@finiko.ml', password: 'Client@2026!' }),
  });
  const loginBody = (await login.text()).slice(0, 200);
  console.log(`[${login.status}] POST /api/v1/auth/login -> ${loginBody}`);
  if (!login.ok) failures += 1;

  // Inscription : en production sans fournisseur SMS, le code de vérification
  // ne doit jamais bloquer la création du compte — la session doit être
  // ouverte directement (régression du bug "impossible d'envoyer le code").
  const phone = `+22376${String(Math.floor(100000 + Math.random() * 900000))}`;
  const register = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Test',
      lastName: 'Smoke',
      phone,
      password: 'Smoke@2026',
      acceptTerms: true,
    }),
  });
  const registerBody = (await register.text()).slice(0, 220);
  console.log(`[${register.status}] POST /api/v1/auth/register -> ${registerBody}`);
  if (register.status !== 201 || !registerBody.includes('accessToken')) failures += 1;

  server.close();
  console.log(failures === 0 ? 'SMOKE BUNDLE: OK' : `SMOKE BUNDLE: ${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
});
