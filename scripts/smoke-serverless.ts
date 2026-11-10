/**
 * Test local de l'entrée serverless Vercel (apps/api/api/index.ts).
 * Simule le runtime Vercel : un serveur HTTP minimal qui délègue chaque
 * requête au handler exporté. À exécuter depuis la racine du monorepo :
 *   pnpm --filter @finiko/api exec tsx ../../scripts/smoke-serverless.ts
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { setTimeout as wait } from 'node:timers/promises';
import handler from '../apps/api/api/index';

const PORT = 4123;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void handler(req as never, res as never);
});

server.listen(PORT, async () => {
  const base = `http://127.0.0.1:${PORT}`;

  const results: Array<{ name: string; status: number; body: string }> = [];

  for (const path of ['/health', '/ready', '/api/v1', '/api/v1/catalog/items', '/api/v1/packs']) {
    const response = await fetch(`${base}${path}`);
    const text = await response.text();
    results.push({ name: path, status: response.status, body: text.slice(0, 200) });
  }

  for (const result of results) {
    console.log(`[${result.status}] GET ${result.name} -> ${result.body}`);
  }

  const ok = results.every((result) => result.status === 200);
  console.log(ok ? 'SMOKE_OK' : 'SMOKE_FAIL');

  server.close();
  process.exit(ok ? 0 : 1);
});

server.on('error', (error) => {
  console.error('SMOKE_ERROR', error);
  process.exit(1);
});

void wait(0);
