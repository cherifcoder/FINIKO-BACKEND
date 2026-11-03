import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { env } from '../src/config/env';
import { ApiError } from '../src/middleware/error';
import { PackModel } from '../src/models/pack.model';
import { SubscriptionUsageModel } from '../src/models/subscription-usage.model';
import { SubscriptionModel, type SubscriptionDocument } from '../src/models/subscription.model';
import { UserModel } from '../src/models/user.model';
import { toPackSnapshot } from '../src/modules/packs/pack.service';
import {
  adjustQuota,
  consumeQuota,
  expireSubscription,
  refundQuota,
  releaseExpiredReservations,
  releaseQuota,
  reserveQuota,
} from '../src/modules/subscriptions/quota.service';

const RUN_QUOTA_TESTS = process.env.RUN_QUOTA_TESTS === 'true';

const DAY = 86_400_000;

function errorCode(error: unknown): string | undefined {
  return error instanceof ApiError
    ? error.code
    : (error as { code?: string } | null | undefined)?.code;
}

async function expectOperationError(operation: Promise<unknown>, code: string): Promise<void> {
  try {
    await operation;
    throw new Error(`L’opération aurait dû échouer avec ${code}.`);
  } catch (error) {
    expect(errorCode(error)).toBe(code);
  }
}

describe.skipIf(!RUN_QUOTA_TESTS)('moteur de quota transactionnel', () => {
  let clientId: string;
  let subscription: SubscriptionDocument;

  async function createActiveSubscription(
    quotaTotal = 10,
    overrides: Record<string, unknown> = {},
  ): Promise<SubscriptionDocument> {
    const pack = await PackModel.findOne({ code: 'quota-test' });
    const client = await UserModel.findOne({ phone: '+22370000010' });

    return SubscriptionModel.create({
      client: client!._id,
      pack: pack!._id,
      packSnapshot: toPackSnapshot(pack!),
      status: 'active',
      startDate: new Date(Date.now() - DAY),
      endDate: new Date(Date.now() + 30 * DAY),
      quotaTotal,
      quotaUsed: 0,
      quotaReserved: 0,
      ...overrides,
    });
  }

  beforeAll(async () => {
    await connectDatabase(env.MONGODB_URI);

    await Promise.all([
      UserModel.init(),
      PackModel.init(),
      SubscriptionModel.init(),
      SubscriptionUsageModel.init(),
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      UserModel.deleteMany({}),
      PackModel.deleteMany({}),
      SubscriptionModel.deleteMany({}),
      SubscriptionUsageModel.deleteMany({}),
    ]);

    const user = await UserModel.create({
      role: 'client',
      firstName: 'Quota',
      lastName: 'Test',
      phone: '+22370000010',
      email: 'quota@finiko.test',
      passwordHash: 'unused-in-quota-tests',
      status: 'actif',
      phoneVerifiedAt: new Date(),
    });
    clientId = user._id.toString();

    await PackModel.create({
      code: 'quota-test',
      name: 'Pack Quota',
      priceXOF: 10_000,
      quotaUnits: 10,
      billingPeriodDays: 30,
      includedTreatments: ['lavage', 'repassage', 'lavage_repassage'],
    });

    subscription = await createActiveSubscription();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
    }
    await disconnectDatabase();
  });

  it('réserve de façon atomique sous concurrence sans dépasser le quota', async () => {
    const orders = Array.from({ length: 4 }, () => new Types.ObjectId().toString());

    const results = await Promise.allSettled(
      orders.map((orderId) =>
        reserveQuota({
          clientId,
          orderId,
          units: 4,
        }),
      ),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(2);

    for (const result of rejected) {
      expect(errorCode((result as PromiseRejectedResult).reason)).toBe('QUOTA_EXHAUSTED');
    }

    const fresh = await SubscriptionModel.findById(subscription._id);
    expect(fresh?.quotaReserved).toBe(8);
    expect(fresh?.quotaUsed).toBe(0);
    expect((fresh?.quotaReserved ?? 0) + (fresh?.quotaUsed ?? 0)).toBeLessThanOrEqual(
      fresh?.quotaTotal ?? 0,
    );
  });

  it('rend la réservation idempotente par commande', async () => {
    const orderId = new Types.ObjectId().toString();

    const first = await reserveQuota({ clientId, orderId, units: 3 });
    const second = await reserveQuota({ clientId, orderId, units: 3 });

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.usageId).toBe(first.usageId);

    const fresh = await SubscriptionModel.findById(subscription._id);
    expect(fresh?.quotaReserved).toBe(3);
    expect(await SubscriptionUsageModel.countDocuments({ order: orderId })).toBe(1);

    await expectOperationError(
      reserveQuota({ clientId, orderId, units: 4 }),
      'IDEMPOTENCY_CONFLICT',
    );
  });

  it('consomme, libère et rembourse avec idempotence et gardes d’état', async () => {
    const orderId = new Types.ObjectId().toString();

    await reserveQuota({ clientId, orderId, units: 4 });
    const consumed = await consumeQuota({ clientId, orderId, units: 4 });
    expect(consumed.quotaUsed).toBe(4);
    expect(consumed.quotaReserved).toBe(0);

    const consumedAgain = await consumeQuota({ clientId, orderId, units: 4 });
    expect(consumedAgain.idempotent).toBe(true);
    expect(consumedAgain.quotaUsed).toBe(4);

    const refunded = await refundQuota({ clientId, orderId, units: 4 });
    expect(refunded.quotaUsed).toBe(0);

    const refundedAgain = await refundQuota({ clientId, orderId, units: 4 });
    expect(refundedAgain.idempotent).toBe(true);
    expect(refundedAgain.quotaUsed).toBe(0);
    expect(
      await SubscriptionUsageModel.countDocuments({ order: orderId, type: 'remboursement' }),
    ).toBe(1);

    const releasedOrder = new Types.ObjectId().toString();
    await reserveQuota({ clientId, orderId: releasedOrder, units: 3 });
    const released = await releaseQuota({ clientId, orderId: releasedOrder, units: 3 });
    expect(released.quotaReserved).toBe(0);

    const releasedAgain = await releaseQuota({ clientId, orderId: releasedOrder, units: 3 });
    expect(releasedAgain.idempotent).toBe(true);
    expect(releasedAgain.quotaReserved).toBe(0);

    const consumedOrder = new Types.ObjectId().toString();
    await reserveQuota({ clientId, orderId: consumedOrder, units: 2 });
    await consumeQuota({ clientId, orderId: consumedOrder, units: 2 });
    await expectOperationError(
      releaseQuota({ clientId, orderId: consumedOrder, units: 2 }),
      'QUOTA_ALREADY_CONSUMED',
    );
  });

  it('refuse une consommation sans réservation', async () => {
    await expectOperationError(
      consumeQuota({
        clientId,
        orderId: new Types.ObjectId().toString(),
        units: 1,
      }),
      'QUOTA_RESERVATION_NOT_FOUND',
    );
  });

  it('expire un abonnement et libère les réservations restantes', async () => {
    const reservedOrder = new Types.ObjectId().toString();
    await reserveQuota({ clientId, orderId: reservedOrder, units: 2 });

    await SubscriptionModel.updateOne(
      { _id: subscription._id },
      { $set: { endDate: new Date(Date.now() - 1000) } },
    );

    const expired = await expireSubscription(subscription._id.toString());
    expect(expired?.status).toBe('expiree');
    expect(expired?.quotaReserved).toBe(0);

    const expiration = await SubscriptionUsageModel.findOne({
      subscription: subscription._id,
      type: 'expiration',
    });
    expect(expiration?.reservedDelta).toBe(-2);

    await expectOperationError(
      reserveQuota({
        clientId,
        orderId: new Types.ObjectId().toString(),
        units: 1,
      }),
      'SUBSCRIPTION_INACTIVE',
    );
  });

  it('libère les réservations orphelines avec un job idempotent', async () => {
    const orderId = new Types.ObjectId().toString();
    await reserveQuota({ clientId, orderId, units: 2 });

    const future = new Date(Date.now() + 2 * 60_000);
    const firstRun = await releaseExpiredReservations({
      ttlMinutes: 1,
      now: future,
    });
    expect(firstRun).toBe(1);

    const fresh = await SubscriptionModel.findById(subscription._id);
    expect(fresh?.quotaReserved).toBe(0);

    const secondRun = await releaseExpiredReservations({
      ttlMinutes: 1,
      now: future,
    });
    expect(secondRun).toBe(0);
  });

  it('ajuste le quota total avec garde sur les unités utilisées et réservées', async () => {
    const increased = await adjustQuota({
      subscriptionId: subscription._id.toString(),
      units: 5,
      reason: 'Geste commercial',
      actorId: clientId,
    });
    expect(increased.quotaTotal).toBe(15);

    const adjustment = await SubscriptionUsageModel.findOne({
      subscription: subscription._id,
      type: 'ajustement',
    });
    expect(adjustment?.quotaTotalDelta).toBe(5);
    expect(adjustment?.quotaTotalAfter).toBe(15);

    await expectOperationError(
      adjustQuota({
        subscriptionId: subscription._id.toString(),
        units: -20,
        reason: 'Réduction excessive',
        actorId: clientId,
      }),
      'QUOTA_ADJUSTMENT_INVALID',
    );

    const decreased = await adjustQuota({
      subscriptionId: subscription._id.toString(),
      units: -3,
      reason: 'Correction',
      actorId: clientId,
    });
    expect(decreased.quotaTotal).toBe(12);
  });

  it('maintient l’invariant du ledger sur 1 000 opérations', { timeout: 180_000 }, async () => {
    const total = 1000;
    await SubscriptionModel.updateOne({ _id: subscription._id }, { $set: { quotaTotal: total } });
    const large = (await SubscriptionModel.findById(subscription._id))!;
    const reservations: { orderId: string; units: number }[] = [];
    const consumptions: { orderId: string; units: number }[] = [];

    for (let index = 0; index < 1000; index += 1) {
      const choice = index % 5;

      if (choice === 0 || choice === 4 || reservations.length === 0) {
        const orderId = new Types.ObjectId().toString();
        const units = 1 + Math.floor(Math.random() * 3);

        try {
          await reserveQuota({ clientId, orderId, units });
          reservations.push({ orderId, units });
        } catch (error) {
          expect(errorCode(error)).toBe('QUOTA_EXHAUSTED');
        }
        continue;
      }

      if (choice === 1) {
        const reservation = reservations.splice(
          Math.floor(Math.random() * reservations.length),
          1,
        )[0]!;
        await consumeQuota({ clientId, ...reservation });
        consumptions.push(reservation);
        continue;
      }

      if (choice === 2) {
        const reservation = reservations.splice(
          Math.floor(Math.random() * reservations.length),
          1,
        )[0]!;
        await releaseQuota({ clientId, ...reservation });
        continue;
      }

      if (consumptions.length > 0) {
        const consumption = consumptions.splice(
          Math.floor(Math.random() * consumptions.length),
          1,
        )[0]!;
        await refundQuota({ clientId, ...consumption });
      }
    }

    const fresh = await SubscriptionModel.findById(large._id);
    expect(fresh).toBeTruthy();
    expect(fresh!.quotaUsed).toBeGreaterThanOrEqual(0);
    expect(fresh!.quotaReserved).toBeGreaterThanOrEqual(0);
    expect(fresh!.quotaUsed + fresh!.quotaReserved).toBeLessThanOrEqual(fresh!.quotaTotal);

    const sums = (
      await SubscriptionUsageModel.aggregate<{
        used: number;
        reserved: number;
        totalDelta: number;
        count: number;
      }>([
        { $match: { subscription: large._id } },
        {
          $group: {
            _id: null,
            used: { $sum: '$usedDelta' },
            reserved: { $sum: '$reservedDelta' },
            totalDelta: { $sum: '$quotaTotalDelta' },
            count: { $sum: 1 },
          },
        },
      ])
    )[0];

    expect(sums).toBeTruthy();
    expect(sums!.count).toBeGreaterThan(0);
    expect(sums!.used).toBe(fresh!.quotaUsed);
    expect(sums!.reserved).toBe(fresh!.quotaReserved);
    expect(fresh!.quotaTotal).toBe(total + sums!.totalDelta);

    const nonNegative = await SubscriptionUsageModel.countDocuments({
      subscription: large._id,
      $or: [{ quotaUsedAfter: { $lt: 0 } }, { quotaReservedAfter: { $lt: 0 } }],
    });
    expect(nonNegative).toBe(0);
  });
});
