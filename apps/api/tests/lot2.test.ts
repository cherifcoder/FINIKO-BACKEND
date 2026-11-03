import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { env } from '../src/config/env';
import { AuditLogModel } from '../src/models/audit-log.model';
import { CatalogItemModel } from '../src/models/catalog-item.model';
import { CounterModel } from '../src/models/counter.model';
import { PackModel } from '../src/models/pack.model';
import { SessionModel } from '../src/models/session.model';
import { SubscriptionUsageModel } from '../src/models/subscription-usage.model';
import { SubscriptionModel } from '../src/models/subscription.model';
import { UserModel } from '../src/models/user.model';
import { toPackSnapshot } from '../src/modules/packs/pack.service';
import { activateSubscription } from '../src/modules/subscriptions/subscription.service';
import { hashPassword } from '../src/security/password';

const app = createApp();
const PASSWORD = 'Test@2026';

let adminToken = '';
let clientToken = '';

async function createUser(
  role: 'admin' | 'client',
  phone: string,
  email: string,
): Promise<mongoose.Types.ObjectId> {
  const user = await UserModel.create({
    role,
    firstName: role === 'admin' ? 'Admin' : 'Client',
    lastName: 'Test',
    phone,
    email,
    passwordHash: await hashPassword(PASSWORD),
    status: 'actif',
    phoneVerifiedAt: new Date(),
  });

  return user._id;
}

async function login(identifier: string): Promise<string> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier, password: PASSWORD });

  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${adminToken}` };
}

function clientHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${clientToken}` };
}

const CATALOG_ITEM = {
  code: 'boubou',
  name: 'Boubou brodé',
  category: 'femme',
  description: 'Lavage délicat',
  material: 'Bazin',
  prices: { lavage: 1500, repassage: 1000, lavage_repassage: 2200 },
  quotaWeight: 2,
  availableTreatments: ['lavage', 'repassage', 'lavage_repassage'],
};

const PACK = {
  code: 'normal',
  name: 'Pack Normal',
  priceXOF: 10_000,
  quotaUnits: 10,
  billingPeriodDays: 30,
  includedTreatments: ['lavage', 'repassage', 'lavage_repassage'],
  features: ['Livraison incluse'],
  displayOrder: 1,
};

beforeAll(async () => {
  await connectDatabase(env.MONGODB_URI);

  await Promise.all([
    UserModel.init(),
    SessionModel.init(),
    AuditLogModel.init(),
    CounterModel.init(),
    CatalogItemModel.init(),
    PackModel.init(),
    SubscriptionModel.init(),
    SubscriptionUsageModel.init(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    SessionModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    CounterModel.deleteMany({}),
    CatalogItemModel.deleteMany({}),
    PackModel.deleteMany({}),
    SubscriptionModel.deleteMany({}),
    SubscriptionUsageModel.deleteMany({}),
  ]);

  await createUser('admin', '+22370000001', 'admin@finiko.test');
  await createUser('client', '+22370000002', 'client@finiko.test');
  adminToken = await login('admin@finiko.test');
  clientToken = await login('client@finiko.test');
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await disconnectDatabase();
});

describe('catalogue', () => {
  it('crée un article avec trois prix et le rend public', async () => {
    const created = await request(app)
      .post('/api/v1/catalog/items')
      .set(adminHeaders())
      .send(CATALOG_ITEM);

    expect(created.status).toBe(201);
    expect(created.body.data.item.prices).toEqual(CATALOG_ITEM.prices);
    expect(created.body.data.item.quotaWeight).toBe(2);

    const publicList = await request(app).get('/api/v1/catalog/items');
    expect(publicList.status).toBe(200);
    expect(publicList.body.data.items).toHaveLength(1);
    expect(publicList.body.data.items[0].code).toBe('boubou');

    const detail = await request(app).get(
      `/api/v1/catalog/items/${created.body.data.item.id as string}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.data.item.name).toBe('Boubou brodé');
  });

  it('refuse un prix partiel et un code dupliqué', async () => {
    const partial = await request(app)
      .post('/api/v1/catalog/items')
      .set(adminHeaders())
      .send({ ...CATALOG_ITEM, prices: { lavage: 1500 } });

    expect(partial.status).toBe(400);

    await request(app).post('/api/v1/catalog/items').set(adminHeaders()).send(CATALOG_ITEM);

    const duplicate = await request(app)
      .post('/api/v1/catalog/items')
      .set(adminHeaders())
      .send({ ...CATALOG_ITEM, name: 'Autre boubou' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CATALOG_CODE_TAKEN');
  });

  it('masque un article inactif ou supprimé au public mais le montre à l’admin', async () => {
    const created = await request(app)
      .post('/api/v1/catalog/items')
      .set(adminHeaders())
      .send(CATALOG_ITEM);

    const id = created.body.data.item.id as string;

    const deactivated = await request(app)
      .patch(`/api/v1/catalog/items/${id}/status`)
      .set(adminHeaders())
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);

    const publicList = await request(app).get('/api/v1/catalog/items');
    expect(publicList.body.data.items).toHaveLength(0);

    const adminList = await request(app)
      .get('/api/v1/catalog/items?includeInactive=true')
      .set(adminHeaders());
    expect(adminList.body.data.items).toHaveLength(1);
    expect(adminList.body.data.items[0].isActive).toBe(false);

    const forbidden = await request(app).get('/api/v1/catalog/items?includeInactive=true');
    expect(forbidden.status).toBe(403);

    const deleted = await request(app).delete(`/api/v1/catalog/items/${id}`).set(adminHeaders());
    expect(deleted.status).toBe(200);

    const afterDelete = await request(app)
      .get('/api/v1/catalog/items?includeInactive=true')
      .set(adminHeaders());
    expect(afterDelete.body.data.items).toHaveLength(0);

    const detail = await request(app).get(`/api/v1/catalog/items/${id}`).set(adminHeaders());
    expect(detail.status).toBe(404);
  });

  it('refuse les écritures catalogue à un client', async () => {
    const response = await request(app)
      .post('/api/v1/catalog/items')
      .set(clientHeaders())
      .send(CATALOG_ITEM);

    expect(response.status).toBe(403);
  });
});

describe('packs et abonnements', () => {
  it('souscrit un pack et conserve le snapshot après modification du prix', async () => {
    const packResponse = await request(app).post('/api/v1/packs').set(adminHeaders()).send(PACK);

    expect(packResponse.status).toBe(201);
    const packId = packResponse.body.data.pack.id as string;

    const publicPacks = await request(app).get('/api/v1/packs');
    expect(publicPacks.status).toBe(200);
    expect(publicPacks.body.data.packs).toHaveLength(1);

    const subscribed = await request(app)
      .post('/api/v1/subscriptions')
      .set(clientHeaders())
      .send({ packId, paymentMethod: 'orange_money' });

    expect(subscribed.status).toBe(202);
    expect(subscribed.body.data.subscription.status).toBe('en_attente_paiement');
    expect(subscribed.body.data.subscription.pack.priceXOF).toBe(10_000);

    const pending = await request(app).get('/api/v1/subscriptions/me').set(clientHeaders());
    expect(pending.status).toBe(200);
    expect(pending.body.data.pending.status).toBe('en_attente_paiement');
    expect(pending.body.data.active).toBeNull();

    const updated = await request(app)
      .patch(`/api/v1/packs/${packId}`)
      .set(adminHeaders())
      .send({ priceXOF: 12_000 });
    expect(updated.status).toBe(200);

    const afterUpdate = await request(app).get('/api/v1/subscriptions/me').set(clientHeaders());
    expect(afterUpdate.body.data.pending.pack.priceXOF).toBe(10_000);

    const subscription = await SubscriptionModel.findById(
      subscribed.body.data.subscription.id as string,
    );
    expect(subscription).toBeTruthy();

    const activated = await activateSubscription(subscription!._id.toString());
    expect(activated.status).toBe('active');
    expect(activated.quotaTotal).toBe(10);

    const active = await request(app).get('/api/v1/subscriptions/me').set(clientHeaders());
    expect(active.body.data.active.status).toBe('active');
    expect(active.body.data.active.quotaAvailable).toBe(10);
    expect(active.body.data.pending).toBeNull();

    const adminList = await request(app)
      .get(`/api/v1/subscriptions?clientId=${subscription!.client.toString()}`)
      .set(adminHeaders());
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.subscriptions).toHaveLength(1);
  });

  it('refuse un pack inactif et un second abonnement en attente', async () => {
    const packResponse = await request(app).post('/api/v1/packs').set(adminHeaders()).send(PACK);

    const packId = packResponse.body.data.pack.id as string;

    const first = await request(app)
      .post('/api/v1/subscriptions')
      .set(clientHeaders())
      .send({ packId });
    expect(first.status).toBe(202);

    const second = await request(app)
      .post('/api/v1/subscriptions')
      .set(clientHeaders())
      .send({ packId });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SUBSCRIPTION_PENDING');

    await SubscriptionModel.deleteMany({});
    await request(app)
      .patch(`/api/v1/packs/${packId}/status`)
      .set(adminHeaders())
      .send({ isActive: false });

    const inactive = await request(app)
      .post('/api/v1/subscriptions')
      .set(clientHeaders())
      .send({ packId });
    expect(inactive.status).toBe(422);
    expect(inactive.body.error.code).toBe('PACK_INACTIVE');
  });

  it('annule une souscription en attente et conserve le quota d’un abonnement actif', async () => {
    const packResponse = await request(app).post('/api/v1/packs').set(adminHeaders()).send(PACK);
    const packId = packResponse.body.data.pack.id as string;

    const pending = await request(app)
      .post('/api/v1/subscriptions')
      .set(clientHeaders())
      .send({ packId });

    const cancelledPending = await request(app)
      .post(`/api/v1/subscriptions/${pending.body.data.subscription.id as string}/cancel`)
      .set(clientHeaders())
      .send({ reason: 'Changement d’avis' });

    expect(cancelledPending.status).toBe(200);
    expect(cancelledPending.body.data.subscription.status).toBe('annulee');
    expect(cancelledPending.body.data.renewalCancelled).toBe(false);

    const pack = await PackModel.findOne({ code: 'normal' });
    const client = await UserModel.findOne({ email: 'client@finiko.test' });
    const active = await SubscriptionModel.create({
      client: client!._id,
      pack: pack!._id,
      packSnapshot: toPackSnapshot(pack!),
      status: 'active',
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 29 * 86_400_000),
      quotaTotal: 10,
      quotaUsed: 2,
      quotaReserved: 1,
    });

    const cancelledActive = await request(app)
      .post(`/api/v1/subscriptions/${active._id.toString()}/cancel`)
      .set(clientHeaders())
      .send({ reason: 'Fin de renouvellement' });

    expect(cancelledActive.status).toBe(200);
    expect(cancelledActive.body.data.renewalCancelled).toBe(true);
    expect(cancelledActive.body.data.subscription.status).toBe('active');
    expect(cancelledActive.body.data.subscription.autoRenew).toBe(false);
    expect(cancelledActive.body.data.subscription.quotaAvailable).toBe(7);
  });

  it('ajuste le quota d’un abonnement et journalise le mouvement', async () => {
    await request(app).post('/api/v1/packs').set(adminHeaders()).send(PACK);
    const pack = await PackModel.findOne({ code: 'normal' });
    const client = await UserModel.findOne({ email: 'client@finiko.test' });
    const subscription = await SubscriptionModel.create({
      client: client!._id,
      pack: pack!._id,
      packSnapshot: toPackSnapshot(pack!),
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86_400_000),
      quotaTotal: 10,
    });

    const adjusted = await request(app)
      .post(`/api/v1/subscriptions/${subscription._id.toString()}/adjust-quota`)
      .set(adminHeaders())
      .send({ units: 2, reason: 'Geste commercial' });

    expect(adjusted.status).toBe(200);
    expect(adjusted.body.data.subscription.quotaTotal).toBe(12);
    expect(adjusted.body.data.subscription.quotaAvailable).toBe(12);

    const usage = await SubscriptionUsageModel.findOne({
      subscription: subscription._id,
      type: 'ajustement',
    });
    expect(usage?.quotaTotalDelta).toBe(2);
    expect(usage?.quotaTotalAfter).toBe(12);

    const invalid = await request(app)
      .post(`/api/v1/subscriptions/${subscription._id.toString()}/adjust-quota`)
      .set(adminHeaders())
      .send({ units: -20, reason: 'Trop de réduction' });

    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe('QUOTA_ADJUSTMENT_INVALID');
  });

  it('isole les abonnements et journaux entre clients', async () => {
    await request(app).post('/api/v1/packs').set(adminHeaders()).send(PACK);
    const pack = await PackModel.findOne({ code: 'normal' });
    const client = await UserModel.findOne({ email: 'client@finiko.test' });
    const subscription = await SubscriptionModel.create({
      client: client!._id,
      pack: pack!._id,
      packSnapshot: toPackSnapshot(pack!),
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86_400_000),
      quotaTotal: 10,
    });

    const other = await createUser('client', '+22370000003', 'autre@finiko.test');
    expect(other).toBeTruthy();
    const otherToken = await login('autre@finiko.test');

    const overview = await request(app)
      .get('/api/v1/subscriptions/me')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(overview.status).toBe(200);
    expect(overview.body.data.active).toBeNull();

    const usage = await request(app)
      .get(`/api/v1/subscriptions/me/usage?subscriptionId=${subscription._id.toString()}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(usage.status).toBe(404);

    const forbidden = await request(app)
      .get('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(403);
  });
});
