import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';

const app = createApp();

describe('health endpoints', () => {
  it('GET /health renvoie l etat du service', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.service).toBe('finiko-api');
  });

  it('GET /ready signale la base indisponible', async () => {
    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_READY');
  });

  it('propage l identifiant de requete', async () => {
    const response = await request(app).get('/health').set('x-request-id', 'test-request-id');

    expect(response.headers['x-request-id']).toBe('test-request-id');
  });
});

describe('api root', () => {
  it('GET /api/v1 decrit l API', async () => {
    const response = await request(app).get('/api/v1');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('FINIKO API');
  });
});

describe('erreurs', () => {
  it('renvoie une enveloppe 404 coherente', async () => {
    const response = await request(app).get('/route-inconnue');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(response.body.error.requestId).toBeTruthy();
  });
});
