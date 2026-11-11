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
  // Mot de passe volontairement simple (6 caractères, sans majuscule ni
  // chiffre) : l'utilisateur est libre de choisir son mot de passe.
  const phone = `+22376${String(Math.floor(100000 + Math.random() * 900000))}`;
  const simplePassword = 'soleil';
  const register = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Test',
      lastName: 'Smoke',
      phone,
      password: simplePassword,
      acceptTerms: true,
    }),
  });
  const registerText = await register.text();
  const registerBody = registerText.slice(0, 220);
  const registerJson = (() => {
    try {
      return JSON.parse(registerText);
    } catch {
      return null;
    }
  })();
  console.log(`[${register.status}] POST /api/v1/auth/register -> ${registerBody}`);
  if (register.status !== 201 || !registerBody.includes('accessToken')) failures += 1;

  // Connexion avec le mot de passe simple : valide le hash argon2 du bundle.
  const loginSimple = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: phone, password: simplePassword }),
  });
  const loginSimpleBody = (await loginSimple.text()).slice(0, 200);
  console.log(`[${loginSimple.status}] POST /api/v1/auth/login (simple) -> ${loginSimpleBody}`);
  if (loginSimple.status !== 200 || !loginSimpleBody.includes('accessToken')) failures += 1;

  // Commande client -> visible dans la file du livreur (régression de
  // l'attribution automatique : la mission doit être assignée dès la
  // création, peu importe le mode de paiement et le statut du livreur).
  const catalog = await fetch(`${base}/api/v1/catalog/items?limit=5`);
  const catalogBody = await catalog.json();
  const firstItem = catalogBody?.data?.items?.[0];

  if (firstItem?.id && firstItem?.availableTreatments?.length > 0) {
    const token = registerJson?.data?.accessToken;

    const orderInput = {
      items: [
        { catalogItemId: firstItem.id, treatment: firstItem.availableTreatments[0], quantity: 1 },
      ],
      pickup: {
        text: 'Hamdallaye ACI 2000, Bamako',
        coordinates: { lat: 12.6392, lng: -8.0029 },
        contactName: 'Test Smoke',
        contactPhone: phone,
      },
      delivery: {
        text: 'Badalabougou, Bamako',
        coordinates: { lat: 12.6265, lng: -8.0167 },
        contactName: 'Test Smoke',
        contactPhone: phone,
      },
      useSubscription: false,
      promoCode: null,
    };

    const quote = await fetch(`${base}/api/v1/orders/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(orderInput),
    });
    const quoteBody = await quote.json();
    console.log(
      `[${quote.status}] POST /api/v1/orders/quote -> totalDue ${quoteBody?.data?.totals?.totalDue}`,
    );

    const order = await fetch(`${base}/api/v1/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...orderInput,
        quoteToken: quoteBody?.data?.quoteToken,
        paymentMethod: 'cash',
      }),
    });
    const orderBody = await order.json();
    const orderNumber = orderBody?.data?.order?.orderNumber;
    const orderStatus = orderBody?.data?.order?.status;
    console.log(`[${order.status}] POST /api/v1/orders -> ${orderNumber} (${orderStatus})`);

    const driverLogin = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'livreur@finiko.ml', password: 'Livreur@2026!' }),
    });
    const driverSession = await driverLogin.json();
    const driverToken = driverSession?.data?.accessToken;

    const driverOrders = await fetch(`${base}/api/v1/driver/orders?limit=50`, {
      headers: { authorization: `Bearer ${driverToken}` },
    });
    const driverBody = await driverOrders.json();
    const driverSeesOrder = (driverBody?.data?.orders ?? []).some(
      (mission) => mission.orderNumber === orderNumber,
    );
    console.log(
      `[${driverOrders.status}] GET /api/v1/driver/orders -> ${orderNumber} visible: ${driverSeesOrder}`,
    );
    if (order.status !== 201 || !driverSeesOrder) failures += 1;
  } else {
    console.log('[skip] Commande E2E ignorée : catalogue local vide.');
  }

  server.close();
  console.log(failures === 0 ? 'SMOKE BUNDLE: OK' : `SMOKE BUNDLE: ${failures} échec(s)`);
  process.exit(failures === 0 ? 0 : 1);
});
