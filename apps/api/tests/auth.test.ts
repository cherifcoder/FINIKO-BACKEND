import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { env } from '../src/config/env';
import { AuditLogModel } from '../src/models/audit-log.model';
import { CounterModel } from '../src/models/counter.model';
import { OtpCodeModel } from '../src/models/otp-code.model';
import { ClientProfileModel, DriverProfileModel } from '../src/models/profile.model';
import { SessionModel } from '../src/models/session.model';
import { UserModel } from '../src/models/user.model';
import { hashPassword } from '../src/security/password';

const app = createApp();

const CLIENT = {
  firstName: 'Awa',
  lastName: 'Traoré',
  phone: '+22370000002',
  email: 'awa@example.com',
  password: 'Client@2026',
  acceptTerms: true as const,
};

beforeAll(async () => {
  await connectDatabase(env.MONGODB_URI);

  await Promise.all([
    UserModel.init(),
    SessionModel.init(),
    OtpCodeModel.init(),
    ClientProfileModel.init(),
    DriverProfileModel.init(),
    AuditLogModel.init(),
    CounterModel.init(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    SessionModel.deleteMany({}),
    OtpCodeModel.deleteMany({}),
    ClientProfileModel.deleteMany({}),
    DriverProfileModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    CounterModel.deleteMany({}),
  ]);
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await disconnectDatabase();
});

async function registerClient(overrides: Partial<typeof CLIENT> = {}) {
  return request(app)
    .post('/api/v1/auth/register')
    .send({ ...CLIENT, ...overrides });
}

async function createAdmin() {
  return UserModel.create({
    role: 'admin',
    firstName: 'Admin',
    lastName: 'Finiko',
    phone: '+22370000001',
    email: 'admin@finiko.ml',
    passwordHash: await hashPassword('Admin@2026'),
    status: 'actif',
    phoneVerifiedAt: new Date(),
  });
}

async function loginAs(identifier: string, password: string) {
  const response = await request(app).post('/api/v1/auth/login').send({ identifier, password });
  return response;
}

describe('inscription et vérification OTP', () => {
  it('crée un client et ouvre directement une session', async () => {
    const response = await registerClient();

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe('client');
    expect(response.body.data.user.email).toBe('awa@example.com');
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.refreshToken).toMatch(/^rt_/);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user.phone).toBe(CLIENT.phone);

    const profile = await ClientProfileModel.findOne({ user: response.body.data.user.id }).lean();
    expect(profile?.referralCode).toBeTruthy();
  });

  it('refuse un doublon de téléphone', async () => {
    await registerClient();
    const response = await registerClient({ email: 'autre@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PHONE_TAKEN');
  });

  it('vérifie le téléphone et ouvre une session', async () => {
    await registerClient();

    // L'inscription a déjà émis un code (cooldown actif) : on repart d'un
    // code neuf pour couvrir la vérification de bout en bout.
    await OtpCodeModel.deleteMany({});

    const challenge = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ identifier: CLIENT.phone, purpose: 'phone_verify' });

    expect(challenge.status).toBe(200);
    expect(challenge.body.data.devCode).toMatch(/^\d{6}$/);

    const verified = await request(app).post('/api/v1/auth/otp/verify').send({
      identifier: CLIENT.phone,
      purpose: 'phone_verify',
      code: challenge.body.data.devCode,
    });

    expect(verified.status).toBe(200);
    expect(verified.body.data.accessToken).toBeTruthy();
    expect(verified.body.data.refreshToken).toMatch(/^rt_/);
    expect(verified.body.data.user.phoneVerified).toBe(true);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${verified.body.data.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user.phone).toBe(CLIENT.phone);
  });

  it('invalide un code OTP après le nombre maximal de tentatives', async () => {
    await registerClient();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ identifier: CLIENT.phone, purpose: 'phone_verify', code: '000000' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(
        attempt === 5 ? 'OTP_TOO_MANY_ATTEMPTS' : 'OTP_INVALID',
      );
    }
  });

  it('applique un délai de renvoi du code', async () => {
    await registerClient();

    const response = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ identifier: CLIENT.phone, purpose: 'phone_verify' });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('OTP_COOLDOWN');
  });
});

describe('connexion et rafraîchissement', () => {
  async function verifiedClient() {
    const registered = await registerClient();

    return registered.body.data as {
      accessToken: string;
      refreshToken: string;
      user: { id: string };
    };
  }

  it('accepte email et téléphone comme identifiant', async () => {
    await verifiedClient();

    const byEmail = await loginAs(CLIENT.email, CLIENT.password);
    const byPhone = await loginAs(CLIENT.phone, CLIENT.password);

    expect(byEmail.status).toBe(200);
    expect(byPhone.status).toBe(200);
  });

  it('refuse un mot de passe incorrect sans révéler le compte', async () => {
    await verifiedClient();

    const response = await loginAs(CLIENT.email, 'Mauvais@2026');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');

    const unknown = await loginAs('inconnu@example.com', 'Mauvais@2026');
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('fait tourner le refresh token et révoque la famille en cas de réutilisation', async () => {
    const session = await verifiedClient();

    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(session.refreshToken);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');

    const rotatedToken = rotated.body.data.refreshToken as string;
    const afterReuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedToken });

    expect(afterReuse.status).toBe(401);
    expect(afterReuse.body.error.code).toBe('REFRESH_REUSED');
  });

  it('révoque la session au logout', async () => {
    const session = await verifiedClient();

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ refreshToken: session.refreshToken });

    expect(logout.status).toBe(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('TOKEN_REVOKED');
  });
});

describe('profil et mot de passe', () => {
  it('met à jour le profil et supprime l email', async () => {
    const registered = await registerClient();
    const session = registered.body.data;

    const update = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ firstName: 'Aminata', email: null });

    expect(update.status).toBe(200);
    expect(update.body.data.user.fullName).toBe('Aminata Traoré');
    expect(update.body.data.user.email).toBeNull();
  });

  it('réinitialise le mot de passe par OTP', async () => {
    await registerClient();

    const forgot = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ identifier: CLIENT.phone });

    expect(forgot.status).toBe(200);
    expect(forgot.body.data.devCode).toMatch(/^\d{6}$/);

    const reset = await request(app).post('/api/v1/auth/password/reset').send({
      identifier: CLIENT.phone,
      code: forgot.body.data.devCode,
      password: 'Nouveau@2026',
    });

    expect(reset.status).toBe(200);

    const login = await loginAs(CLIENT.phone, 'Nouveau@2026');
    expect(login.status).toBe(200);
  });
});

describe('administration des comptes', () => {
  it('crée un livreur, le liste et le suspend', async () => {
    await createAdmin();
    const adminLogin = await loginAs('admin@finiko.ml', 'Admin@2026');
    expect(adminLogin.status).toBe(200);

    const adminToken = adminLogin.body.data.accessToken as string;

    const created = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        role: 'livreur',
        firstName: 'Moussa',
        lastName: 'Keita',
        phone: '+22370000003',
        password: 'Livreur@2026',
        driver: { vehicleType: 'moto', zoneCodes: ['ACI2000'] },
      });

    expect(created.status).toBe(201);
    expect(created.body.data.user.role).toBe('livreur');
    expect(created.body.data.user.mustChangePassword).toBe(true);
    expect(created.body.data.profile.code).toBe('FK-L-001');

    const list = await request(app)
      .get('/api/v1/admin/users?role=livreur')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(list.status).toBe(200);
    expect(list.body.data.users).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);

    const driverLogin = await loginAs('+22370000003', 'Livreur@2026');
    expect(driverLogin.status).toBe(200);

    const driverToken = driverLogin.body.data.accessToken as string;
    const driverId = driverLogin.body.data.user.id as string;

    const suspended = await request(app)
      .patch(`/api/v1/admin/users/${driverId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspendu', reason: 'Test' });

    expect(suspended.status).toBe(200);
    expect(suspended.body.data.user.status).toBe('suspendu');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${driverToken}`);

    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('TOKEN_REVOKED');

    const blockedLogin = await loginAs('+22370000003', 'Livreur@2026');
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const audits = await AuditLogModel.find({ action: { $in: ['user.create', 'user.status'] } });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it('refuse l accès admin à un client', async () => {
    const registered = await registerClient();
    const session = registered.body.data;

    const response = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});
