import mongoose, { type Types } from 'mongoose';
import { ApiError } from '../../middleware/error';
import { SubscriptionModel, type SubscriptionDocument } from '../../models/subscription.model';
import {
  SubscriptionUsageModel,
  type SubscriptionUsageDocument,
} from '../../models/subscription-usage.model';

export interface QuotaResult {
  subscriptionId: string;
  quotaTotal: number;
  quotaUsed: number;
  quotaReserved: number;
  quotaAvailable: number;
  usageId: string;
  idempotent: boolean;
}

export interface QuotaOperationOptions {
  clientId: string;
  orderId: string;
  units: number;
  requestId?: string;
  actorId?: string | null;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function assertUnits(units: number): void {
  if (!Number.isInteger(units) || units < 1) {
    throw ApiError.badRequest('Le nombre d’unités doit être un entier supérieur à zéro.');
  }
}

function snapshot(sub: SubscriptionDocument, usageId: string, idempotent = false): QuotaResult {
  return {
    subscriptionId: sub._id.toString(),
    quotaTotal: sub.quotaTotal,
    quotaUsed: sub.quotaUsed,
    quotaReserved: sub.quotaReserved,
    quotaAvailable: Math.max(0, sub.quotaTotal - sub.quotaUsed - sub.quotaReserved),
    usageId,
    idempotent,
  };
}

function snapshotFromUsage(
  sub: SubscriptionDocument,
  usage: SubscriptionUsageDocument,
  idempotent = false,
): QuotaResult {
  return snapshot(sub, usage._id.toString(), idempotent);
}

async function getSubscriptionById(
  id: Types.ObjectId,
  session?: mongoose.ClientSession,
): Promise<SubscriptionDocument> {
  const query = SubscriptionModel.findById(id);
  if (session) query.session(session);
  const sub = await query;

  if (!sub) {
    throw ApiError.notFound('Abonnement introuvable.');
  }

  return sub;
}

async function existingUsage(
  orderId: string,
  type: 'reservation' | 'consommation' | 'liberation' | 'remboursement',
): Promise<SubscriptionUsageDocument | null> {
  return SubscriptionUsageModel.findOne({ order: orderId, type });
}

/*
 * Une réservation est idempotente par `orderId` : la réutilisation de la même
 * commande renvoie la réservation existante au lieu de réserver à nouveau.
 */
export async function reserveQuota(options: QuotaOperationOptions): Promise<QuotaResult> {
  const { clientId, orderId, units } = options;
  assertUnits(units);

  const session = await mongoose.startSession();
  let result: QuotaResult | null = null;

  try {
    await session.withTransaction(async () => {
      const existing = await SubscriptionUsageModel.findOne({
        order: orderId,
        type: 'reservation',
      }).session(session);

      if (existing) {
        if (existing.units !== units) {
          throw ApiError.conflict(
            'IDEMPOTENCY_CONFLICT',
            'Cette commande a déjà une réservation avec un nombre d’unités différent.',
          );
        }

        const sub = await getSubscriptionById(existing.subscription, session);
        result = snapshotFromUsage(sub, existing, true);
        return;
      }

      const now = new Date();
      const sub = await SubscriptionModel.findOneAndUpdate(
        {
          client: clientId,
          status: 'active',
          endDate: { $gt: now },
          $expr: {
            $lte: [{ $add: ['$quotaUsed', '$quotaReserved', units] }, '$quotaTotal'],
          },
        },
        { $inc: { quotaReserved: units } },
        { session, returnDocument: 'after' },
      );

      if (!sub) {
        const active = await SubscriptionModel.findOne({
          client: clientId,
          status: 'active',
        })
          .session(session)
          .lean();

        if (!active) {
          throw new ApiError(
            422,
            'SUBSCRIPTION_INACTIVE',
            'Aucun abonnement actif : le quota ne peut pas être utilisé.',
          );
        }

        throw ApiError.conflict('QUOTA_EXHAUSTED', 'Le quota disponible est insuffisant.', {
          quotaTotal: active.quotaTotal,
          quotaUsed: active.quotaUsed,
          quotaReserved: active.quotaReserved,
          quotaAvailable: Math.max(0, active.quotaTotal - active.quotaUsed - active.quotaReserved),
          requested: units,
        });
      }

      const [usage] = await SubscriptionUsageModel.create(
        [
          {
            subscription: sub._id,
            client: clientId,
            order: orderId,
            type: 'reservation',
            units,
            usedDelta: 0,
            reservedDelta: units,
            quotaTotalDelta: 0,
            quotaUsedAfter: sub.quotaUsed,
            quotaReservedAfter: sub.quotaReserved,
            quotaTotalAfter: sub.quotaTotal,
            reason: 'Réservation pour commande',
            actor: options.actorId ?? null,
            requestId: options.requestId ?? null,
          },
        ],
        { session },
      );

      if (!usage) {
        throw new Error('Réservation de quota non enregistrée.');
      }

      result = snapshotFromUsage(sub, usage);
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const existing = await existingUsage(orderId, 'reservation');
      if (existing) {
        if (existing.units !== units) {
          throw ApiError.conflict(
            'IDEMPOTENCY_CONFLICT',
            'Cette commande a déjà une réservation avec un nombre d’unités différent.',
          );
        }
        const sub = await getSubscriptionById(existing.subscription);
        return snapshotFromUsage(sub, existing, true);
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new Error('Transaction de réservation terminée sans résultat.');
  }

  return result;
}

export async function consumeQuota(options: QuotaOperationOptions): Promise<QuotaResult> {
  const { clientId, orderId, units } = options;
  assertUnits(units);

  const session = await mongoose.startSession();
  let result: QuotaResult | null = null;

  try {
    await session.withTransaction(async () => {
      const consumed = await SubscriptionUsageModel.findOne({
        order: orderId,
        type: 'consommation',
      }).session(session);

      if (consumed) {
        if (consumed.units !== units) {
          throw ApiError.conflict(
            'IDEMPOTENCY_CONFLICT',
            'Cette commande a déjà été consommée avec un nombre d’unités différent.',
          );
        }
        const sub = await getSubscriptionById(consumed.subscription, session);
        result = snapshotFromUsage(sub, consumed, true);
        return;
      }

      const reservation = await SubscriptionUsageModel.findOne({
        order: orderId,
        type: 'reservation',
      }).session(session);

      if (!reservation) {
        throw ApiError.conflict(
          'QUOTA_RESERVATION_NOT_FOUND',
          'Aucune réservation de quota pour cette commande.',
        );
      }

      const released = await SubscriptionUsageModel.exists({
        order: orderId,
        type: 'liberation',
      }).session(session);

      if (released) {
        throw ApiError.conflict(
          'QUOTA_RESERVATION_RELEASED',
          'La réservation de cette commande a déjà été libérée.',
        );
      }

      if (reservation.units !== units) {
        throw ApiError.conflict(
          'IDEMPOTENCY_CONFLICT',
          'Le nombre d’unités ne correspond pas à la réservation.',
        );
      }

      const sub = await SubscriptionModel.findOneAndUpdate(
        {
          _id: reservation.subscription,
          client: clientId,
          status: 'active',
          $expr: { $gte: ['$quotaReserved', units] },
        },
        { $inc: { quotaReserved: -units, quotaUsed: units } },
        { session, returnDocument: 'after' },
      );

      if (!sub) {
        throw new ApiError(
          422,
          'SUBSCRIPTION_INACTIVE',
          'L’abonnement ne permet plus de consommer ce quota.',
        );
      }

      const [usage] = await SubscriptionUsageModel.create(
        [
          {
            subscription: sub._id,
            client: clientId,
            order: orderId,
            type: 'consommation',
            units,
            usedDelta: units,
            reservedDelta: -units,
            quotaTotalDelta: 0,
            quotaUsedAfter: sub.quotaUsed,
            quotaReservedAfter: sub.quotaReserved,
            quotaTotalAfter: sub.quotaTotal,
            reason: 'Consommation après confirmation',
            actor: options.actorId ?? null,
            requestId: options.requestId ?? null,
          },
        ],
        { session },
      );

      if (!usage) {
        throw new Error('Consommation de quota non enregistrée.');
      }

      result = snapshotFromUsage(sub, usage);
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const existing = await existingUsage(orderId, 'consommation');
      if (existing) {
        const sub = await getSubscriptionById(existing.subscription);
        return snapshotFromUsage(sub, existing, true);
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new Error('Transaction de consommation terminée sans résultat.');
  }

  return result;
}

async function releaseOrRefund(
  options: QuotaOperationOptions & {
    type: 'liberation' | 'remboursement';
    sourceType: 'reservation' | 'consommation';
    reason: string;
  },
): Promise<QuotaResult> {
  const { clientId, orderId, units, type, sourceType } = options;
  assertUnits(units);

  const session = await mongoose.startSession();
  let result: QuotaResult | null = null;

  try {
    await session.withTransaction(async () => {
      const existing = await SubscriptionUsageModel.findOne({
        order: orderId,
        type,
      }).session(session);

      if (existing) {
        if (existing.units !== units) {
          throw ApiError.conflict(
            'IDEMPOTENCY_CONFLICT',
            'Cette opération a déjà été appliquée avec un nombre d’unités différent.',
          );
        }
        const sub = await getSubscriptionById(existing.subscription, session);
        result = snapshotFromUsage(sub, existing, true);
        return;
      }

      const source = await SubscriptionUsageModel.findOne({
        order: orderId,
        type: sourceType,
      }).session(session);

      if (!source) {
        throw ApiError.conflict(
          sourceType === 'reservation'
            ? 'QUOTA_RESERVATION_NOT_FOUND'
            : 'QUOTA_CONSUMPTION_NOT_FOUND',
          sourceType === 'reservation'
            ? 'Aucune réservation de quota pour cette commande.'
            : 'Aucune consommation de quota pour cette commande.',
        );
      }

      if (source.units !== units) {
        throw ApiError.conflict(
          'IDEMPOTENCY_CONFLICT',
          'Le nombre d’unités ne correspond pas à l’opération source.',
        );
      }

      if (type === 'liberation') {
        const consumed = await SubscriptionUsageModel.exists({
          order: orderId,
          type: 'consommation',
        }).session(session);

        if (consumed) {
          throw ApiError.conflict(
            'QUOTA_ALREADY_CONSUMED',
            'La réservation a déjà été consommée et ne peut plus être libérée.',
          );
        }
      }

      const guard =
        type === 'liberation'
          ? { $expr: { $gte: ['$quotaReserved', units] } }
          : { $expr: { $gte: ['$quotaUsed', units] } };

      const increments = type === 'liberation' ? { quotaReserved: -units } : { quotaUsed: -units };

      const sub = await SubscriptionModel.findOneAndUpdate(
        { _id: source.subscription, client: clientId, ...guard },
        { $inc: increments },
        { session, returnDocument: 'after' },
      );

      if (!sub) {
        throw ApiError.conflict('QUOTA_STATE_INVALID', 'Le quota ne permet pas cette opération.');
      }

      const [usage] = await SubscriptionUsageModel.create(
        [
          {
            subscription: sub._id,
            client: clientId,
            order: orderId,
            type,
            units,
            usedDelta: type === 'remboursement' ? -units : 0,
            reservedDelta: type === 'liberation' ? -units : 0,
            quotaTotalDelta: 0,
            quotaUsedAfter: sub.quotaUsed,
            quotaReservedAfter: sub.quotaReserved,
            quotaTotalAfter: sub.quotaTotal,
            reason: options.reason,
            actor: options.actorId ?? null,
            requestId: options.requestId ?? null,
          },
        ],
        { session },
      );

      if (!usage) {
        throw new Error('Mouvement de quota non enregistré.');
      }

      result = snapshotFromUsage(sub, usage);
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const existing = await existingUsage(orderId, type);
      if (existing) {
        const sub = await getSubscriptionById(existing.subscription);
        return snapshotFromUsage(sub, existing, true);
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new Error('Transaction de libération terminée sans résultat.');
  }

  return result;
}

export async function releaseQuota(options: QuotaOperationOptions): Promise<QuotaResult> {
  return releaseOrRefund({
    ...options,
    type: 'liberation',
    sourceType: 'reservation',
    reason: 'Libération de la réservation',
  });
}

export async function refundQuota(options: QuotaOperationOptions): Promise<QuotaResult> {
  return releaseOrRefund({
    ...options,
    type: 'remboursement',
    sourceType: 'consommation',
    reason: 'Remboursement du quota consommé',
  });
}

export interface AdjustQuotaOptions {
  subscriptionId: string;
  units: number;
  reason: string;
  actorId: string;
  requestId?: string;
}

export async function adjustQuota(options: AdjustQuotaOptions): Promise<QuotaResult> {
  const { subscriptionId, units, reason, actorId } = options;

  if (!Number.isInteger(units) || units === 0) {
    throw ApiError.badRequest('L’ajustement doit être un entier non nul.');
  }

  const delta = units;
  const absolute = Math.abs(delta);
  const session = await mongoose.startSession();
  let result: QuotaResult | null = null;

  try {
    await session.withTransaction(async () => {
      const current = await SubscriptionModel.findOne({
        _id: subscriptionId,
        status: { $in: ['active', 'programmee'] },
      }).session(session);

      if (!current) {
        throw new ApiError(
          422,
          'SUBSCRIPTION_INACTIVE',
          'Seul un abonnement actif ou programmé peut être ajusté.',
        );
      }

      if (delta < 0 && current.quotaTotal - absolute < current.quotaUsed + current.quotaReserved) {
        throw ApiError.conflict(
          'QUOTA_ADJUSTMENT_INVALID',
          'La réduction rendrait le quota inférieur aux unités utilisées ou réservées.',
        );
      }

      const sub = await SubscriptionModel.findOneAndUpdate(
        { _id: subscriptionId, status: { $in: ['active', 'programmee'] } },
        { $inc: { quotaTotal: delta } },
        { session, returnDocument: 'after' },
      );

      if (!sub) {
        throw new ApiError(422, 'SUBSCRIPTION_INACTIVE', 'Abonnement inactif.');
      }

      const [usage] = await SubscriptionUsageModel.create(
        [
          {
            subscription: sub._id,
            client: sub.client,
            order: null,
            type: 'ajustement',
            units: absolute,
            usedDelta: 0,
            reservedDelta: 0,
            quotaTotalDelta: delta,
            quotaUsedAfter: sub.quotaUsed,
            quotaReservedAfter: sub.quotaReserved,
            quotaTotalAfter: sub.quotaTotal,
            reason,
            actor: actorId,
            requestId: options.requestId ?? null,
          },
        ],
        { session },
      );

      if (!usage) {
        throw new Error('Ajustement de quota non enregistré.');
      }

      result = snapshotFromUsage(sub, usage);
    });
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new Error('Transaction d’ajustement terminée sans résultat.');
  }

  return result;
}

export async function expireSubscription(
  subscriptionId: string,
  now = new Date(),
): Promise<SubscriptionDocument | null> {
  const session = await mongoose.startSession();
  let expired: SubscriptionDocument | null = null;

  try {
    await session.withTransaction(async () => {
      const current = await SubscriptionModel.findOne({
        _id: subscriptionId,
        status: 'active',
        endDate: { $lte: now },
      }).session(session);

      if (!current) {
        expired = null;
        return;
      }

      const reserved = current.quotaReserved;
      const sub = await SubscriptionModel.findOneAndUpdate(
        { _id: current._id, status: 'active' },
        {
          $set: {
            status: 'expiree',
            expiredAt: now,
            quotaReserved: 0,
          },
        },
        { session, returnDocument: 'after' },
      );

      if (!sub) {
        throw new Error('Expiration concurrente détectée.');
      }

      if (reserved > 0) {
        await SubscriptionUsageModel.create(
          [
            {
              subscription: sub._id,
              client: sub.client,
              order: null,
              type: 'expiration',
              units: reserved,
              usedDelta: 0,
              reservedDelta: -reserved,
              quotaTotalDelta: 0,
              quotaUsedAfter: sub.quotaUsed,
              quotaReservedAfter: 0,
              quotaTotalAfter: sub.quotaTotal,
              reason: 'Expiration de l’abonnement',
              actor: null,
              requestId: null,
            },
          ],
          { session },
        );
      }

      expired = sub;
    });
  } finally {
    await session.endSession();
  }

  return expired;
}

export async function expireDueSubscriptions(now = new Date()): Promise<number> {
  const due = await SubscriptionModel.find({
    status: 'active',
    endDate: { $lte: now },
  })
    .select('_id')
    .limit(200)
    .lean();

  let count = 0;

  for (const item of due) {
    const expired = await expireSubscription(item._id.toString(), now);
    if (expired) count += 1;
  }

  return count;
}

export interface ReleaseExpiredReservationsOptions {
  ttlMinutes: number;
  now?: Date;
  limit?: number;
  requestId?: string;
}

/**
 * Libère les réservations orphelines. Le job est idempotent : une réservation
 * déjà libérée ou consommée est ignorée.
 */
export async function releaseExpiredReservations(
  options: ReleaseExpiredReservationsOptions,
): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - options.ttlMinutes * 60_000);

  const candidates = await SubscriptionUsageModel.find({
    type: 'reservation',
    createdAt: { $lte: cutoff },
    order: { $ne: null },
  })
    .sort({ createdAt: 1 })
    .limit(options.limit ?? 200);

  let released = 0;

  for (const reservation of candidates) {
    if (!reservation.order) continue;

    const resolved = await SubscriptionUsageModel.exists({
      order: reservation.order,
      type: { $in: ['consommation', 'liberation'] },
    });

    if (resolved) continue;

    try {
      await releaseQuota({
        clientId: reservation.client.toString(),
        orderId: reservation.order.toString(),
        units: reservation.units,
        requestId: options.requestId,
        actorId: null,
      });
      released += 1;
    } catch (error) {
      const code =
        error instanceof ApiError ? error.code : (error as { code?: string } | null)?.code;

      if (
        code === 'QUOTA_RESERVATION_NOT_FOUND' ||
        code === 'QUOTA_ALREADY_CONSUMED' ||
        code === 'QUOTA_STATE_INVALID'
      ) {
        continue;
      }

      throw error;
    }
  }

  return released;
}
