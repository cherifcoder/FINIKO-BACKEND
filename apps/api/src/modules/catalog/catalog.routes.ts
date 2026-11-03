import { Router } from 'express';
import {
  catalogItemInputSchema,
  catalogItemListQuerySchema,
  catalogItemStatusSchema,
  catalogItemUpdateSchema,
  idParamSchema,
  type CatalogItemInput,
  type CatalogItemListQuery,
  type CatalogItemStatusInput,
  type CatalogItemUpdateInput,
  type IdParam,
} from '@finiko/contracts';
import { authenticate, optionalAuthenticate, requireRole } from '../../middleware/authenticate';
import { ApiError } from '../../middleware/error';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { writeAudit } from '../../utils/audit';
import { success } from '../../utils/http';
import {
  createCatalogItem,
  deleteCatalogItem,
  getCatalogItem,
  listCatalogItems,
  setCatalogItemStatus,
  toCatalogItem,
  updateCatalogItem,
} from './catalog.service';

export const catalogRouter = Router();

function wantsInactive(includeInactive: boolean, role: string | undefined): boolean {
  if (!includeInactive) return false;

  if (role !== 'admin') {
    throw ApiError.forbidden('Seul un administrateur peut lister les articles inactifs.');
  }

  return true;
}

catalogRouter.get(
  '/items',
  optionalAuthenticate,
  validateQuery(catalogItemListQuerySchema),
  async (req, res) => {
    const query = req.validatedQuery as CatalogItemListQuery;
    const includeInactive = wantsInactive(query.includeInactive, req.auth?.role);
    const { items, total } = await listCatalogItems(query, { includeInactive });

    res.status(200).json(
      success(
        { items: items.map(toCatalogItem) },
        {
          meta: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
          },
        },
      ),
    );
  },
);

catalogRouter.get(
  '/items/:id',
  optionalAuthenticate,
  validateParams(idParamSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const item = await getCatalogItem(id, { includeInactive: req.auth?.role === 'admin' });

    res.status(200).json(success({ item: toCatalogItem(item) }));
  },
);

catalogRouter.post(
  '/items',
  authenticate,
  requireRole('admin'),
  validateBody(catalogItemInputSchema),
  async (req, res) => {
    const input = req.body as CatalogItemInput;
    const item = await createCatalogItem(input, req.auth!.userId);

    await writeAudit(req, {
      action: 'catalog.create',
      entityType: 'CatalogItem',
      entityId: item._id.toString(),
      after: { code: item.code, prices: item.prices, quotaWeight: item.quotaWeight },
    });

    res.status(201).json(success({ item: toCatalogItem(item) }, { message: 'Article créé.' }));
  },
);

catalogRouter.patch(
  '/items/:id',
  authenticate,
  requireRole('admin'),
  validateParams(idParamSchema),
  validateBody(catalogItemUpdateSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as CatalogItemUpdateInput;
    const item = await updateCatalogItem(id, input, req.auth!.userId);

    await writeAudit(req, {
      action: 'catalog.update',
      entityType: 'CatalogItem',
      entityId: item._id.toString(),
      after: input,
    });

    res
      .status(200)
      .json(success({ item: toCatalogItem(item) }, { message: 'Article mis à jour.' }));
  },
);

catalogRouter.patch(
  '/items/:id/status',
  authenticate,
  requireRole('admin'),
  validateParams(idParamSchema),
  validateBody(catalogItemStatusSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as CatalogItemStatusInput;
    const item = await setCatalogItemStatus(id, input.isActive, req.auth!.userId);

    await writeAudit(req, {
      action: 'catalog.status',
      entityType: 'CatalogItem',
      entityId: item._id.toString(),
      after: { isActive: item.isActive },
    });

    res
      .status(200)
      .json(
        success(
          { item: toCatalogItem(item) },
          { message: item.isActive ? 'Article activé.' : 'Article désactivé.' },
        ),
      );
  },
);

catalogRouter.delete(
  '/items/:id',
  authenticate,
  requireRole('admin'),
  validateParams(idParamSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const item = await deleteCatalogItem(id, req.auth!.userId);

    await writeAudit(req, {
      action: 'catalog.delete',
      entityType: 'CatalogItem',
      entityId: item._id.toString(),
      after: { deletedAt: item.deletedAt },
    });

    res.status(200).json(success({ item: toCatalogItem(item) }, { message: 'Article supprimé.' }));
  },
);
