import type {
  CatalogItem,
  CatalogItemInput,
  CatalogItemListQuery,
  CatalogItemUpdateInput,
} from '@finiko/contracts';
import { ApiError } from '../../middleware/error';
import { CatalogItemModel, type CatalogItemDocument } from '../../models/catalog-item.model';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toCatalogItem(item: CatalogItemDocument): CatalogItem {
  return {
    id: item._id.toString(),
    code: item.code,
    name: item.name,
    description: item.description,
    category: item.category,
    material: item.material,
    prices: {
      lavage: item.prices.lavage,
      repassage: item.prices.repassage,
      lavage_repassage: item.prices.lavage_repassage,
    },
    quotaWeight: item.quotaWeight,
    availableTreatments: [...item.availableTreatments],
    imageUrl: item.imageUrl,
    isActive: item.isActive,
    displayOrder: item.displayOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function listCatalogItems(
  query: CatalogItemListQuery,
  options: { includeInactive: boolean },
): Promise<{ items: CatalogItemDocument[]; total: number }> {
  const filter: Record<string, unknown> = { deletedAt: null };

  if (!options.includeInactive) {
    filter.isActive = true;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { code: pattern }, { material: pattern }];
  }

  const [items, total] = await Promise.all([
    CatalogItemModel.find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    CatalogItemModel.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getCatalogItem(
  id: string,
  options: { includeInactive: boolean },
): Promise<CatalogItemDocument> {
  const item = await CatalogItemModel.findOne({ _id: id, deletedAt: null });

  if (!item || (!options.includeInactive && !item.isActive)) {
    throw ApiError.notFound("Cet article n'existe pas ou n'est plus disponible.");
  }

  return item;
}

async function assertCodeAvailable(code: string): Promise<void> {
  const existing = await CatalogItemModel.exists({ code });
  if (existing) {
    throw ApiError.conflict('CATALOG_CODE_TAKEN', 'Ce code article est déjà utilisé.');
  }
}

export async function createCatalogItem(
  input: CatalogItemInput,
  actorId: string,
): Promise<CatalogItemDocument> {
  await assertCodeAvailable(input.code);

  return CatalogItemModel.create({
    ...input,
    imageUrl: input.imageUrl ?? null,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

export async function updateCatalogItem(
  id: string,
  input: CatalogItemUpdateInput,
  actorId: string,
): Promise<CatalogItemDocument> {
  const item = await CatalogItemModel.findOne({ _id: id, deletedAt: null });

  if (!item) {
    throw ApiError.notFound("Cet article n'existe pas.");
  }

  const fields = input as Record<string, unknown>;

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      (item as unknown as Record<string, unknown>)[key] = value;
    }
  }

  item.version += 1;
  item.updatedBy = actorId as unknown as CatalogItemDocument['updatedBy'];

  await item.save();
  return item;
}

export async function setCatalogItemStatus(
  id: string,
  isActive: boolean,
  actorId: string,
): Promise<CatalogItemDocument> {
  const item = await CatalogItemModel.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { isActive, updatedBy: actorId }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  );

  if (!item) {
    throw ApiError.notFound("Cet article n'existe pas.");
  }

  return item;
}

export async function deleteCatalogItem(id: string, actorId: string): Promise<CatalogItemDocument> {
  const item = await CatalogItemModel.findOneAndUpdate(
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

  if (!item) {
    throw ApiError.notFound("Cet article n'existe pas.");
  }

  return item;
}
