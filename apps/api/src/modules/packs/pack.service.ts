import type { Pack, PackInput, PackListQuery, PackUpdateInput } from '@finiko/contracts';
import { ApiError } from '../../middleware/error';
import { PackModel, type PackDocument } from '../../models/pack.model';
import type { PackSnapshot } from '../../models/subscription.model';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toPack(pack: PackDocument): Pack {
  return {
    id: pack._id.toString(),
    code: pack.code,
    name: pack.name,
    description: pack.description,
    priceXOF: pack.priceXOF,
    billingPeriodDays: pack.billingPeriodDays,
    quotaUnits: pack.quotaUnits,
    includedTreatments: [...pack.includedTreatments],
    overagePolicy: pack.overagePolicy,
    deliveryIncluded: pack.deliveryIncluded,
    deliveryDiscountPercent: pack.deliveryDiscountPercent,
    maxItemsPerOrder: pack.maxItemsPerOrder,
    rollover: {
      enabled: pack.rollover.enabled,
      maxPercent: pack.rollover.maxPercent,
    },
    features: [...pack.features],
    badge: pack.badge,
    color: pack.color,
    displayOrder: pack.displayOrder,
    isActive: pack.isActive,
    validFrom: pack.validFrom ? pack.validFrom.toISOString() : null,
    validTo: pack.validTo ? pack.validTo.toISOString() : null,
    createdAt: pack.createdAt.toISOString(),
    updatedAt: pack.updatedAt.toISOString(),
  };
}

export function toPackSnapshot(pack: PackDocument): PackSnapshot {
  return {
    code: pack.code,
    name: pack.name,
    priceXOF: pack.priceXOF,
    quotaUnits: pack.quotaUnits,
    includedTreatments: [...pack.includedTreatments],
    billingPeriodDays: pack.billingPeriodDays,
    deliveryIncluded: pack.deliveryIncluded,
    deliveryDiscountPercent: pack.deliveryDiscountPercent,
    rollover: {
      enabled: pack.rollover.enabled,
      maxPercent: pack.rollover.maxPercent,
    },
  };
}

export function isPackCurrentlyAvailable(pack: PackDocument, now = new Date()): boolean {
  if (!pack.isActive || pack.deletedAt) return false;
  if (pack.validFrom && pack.validFrom.getTime() > now.getTime()) return false;
  if (pack.validTo && pack.validTo.getTime() < now.getTime()) return false;
  return true;
}

function availabilityFilter(now: Date): Record<string, unknown> {
  return {
    deletedAt: null,
    isActive: true,
    $and: [
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validTo: null }, { validTo: { $gte: now } }] },
    ],
  };
}

export async function listPacks(
  query: PackListQuery,
  options: { includeInactive: boolean },
): Promise<{ packs: PackDocument[]; total: number }> {
  const now = new Date();
  const filter: Record<string, unknown> = options.includeInactive
    ? { deletedAt: null }
    : availabilityFilter(now);

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { code: pattern }];
  }

  const [packs, total] = await Promise.all([
    PackModel.find(filter)
      .sort({ displayOrder: 1, priceXOF: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    PackModel.countDocuments(filter),
  ]);

  return { packs, total };
}

export async function getPack(
  id: string,
  options: { includeInactive: boolean },
): Promise<PackDocument> {
  const pack = await PackModel.findOne({ _id: id, deletedAt: null });

  if (!pack || (!options.includeInactive && !isPackCurrentlyAvailable(pack))) {
    throw ApiError.notFound("Ce pack n'existe pas ou n'est plus disponible.");
  }

  return pack;
}

async function assertCodeAvailable(code: string): Promise<void> {
  const existing = await PackModel.exists({ code });
  if (existing) {
    throw ApiError.conflict('PACK_CODE_TAKEN', 'Ce code pack est déjà utilisé.');
  }
}

export async function createPack(input: PackInput, actorId: string): Promise<PackDocument> {
  await assertCodeAvailable(input.code);

  return PackModel.create({
    ...input,
    badge: input.badge ?? null,
    validFrom: input.validFrom ? new Date(input.validFrom) : null,
    validTo: input.validTo ? new Date(input.validTo) : null,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

export async function updatePack(
  id: string,
  input: PackUpdateInput,
  actorId: string,
): Promise<PackDocument> {
  const pack = await PackModel.findOne({ _id: id, deletedAt: null });

  if (!pack) {
    throw ApiError.notFound("Ce pack n'existe pas.");
  }

  const fields = input as Record<string, unknown>;

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;

    if (key === 'validFrom' || key === 'validTo') {
      (pack as unknown as Record<string, unknown>)[key] = value ? new Date(value as string) : null;
      continue;
    }

    (pack as unknown as Record<string, unknown>)[key] = value;
  }

  if (pack.validFrom && pack.validTo && pack.validFrom.getTime() >= pack.validTo.getTime()) {
    throw ApiError.unprocessable(
      'INVALID_PACK_PERIOD',
      'La fin de validité doit être postérieure au début.',
    );
  }

  pack.version += 1;
  pack.updatedBy = actorId as unknown as PackDocument['updatedBy'];

  await pack.save();
  return pack;
}

export async function setPackStatus(
  id: string,
  isActive: boolean,
  actorId: string,
): Promise<PackDocument> {
  const pack = await PackModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { isActive, updatedBy: actorId }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  );

  if (!pack) {
    throw ApiError.notFound("Ce pack n'existe pas.");
  }

  return pack;
}

export async function deletePack(id: string, actorId: string): Promise<PackDocument> {
  const pack = await PackModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    {
      $set: {
        deletedAt: new Date(),
        isActive: false,
        updatedBy: actorId,
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );

  if (!pack) {
    throw ApiError.notFound("Ce pack n'existe pas.");
  }

  return pack;
}
