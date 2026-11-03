import { Router } from 'express';
import {
  idParamSchema,
  packInputSchema,
  packListQuerySchema,
  packStatusSchema,
  packUpdateSchema,
  type IdParam,
  type PackInput,
  type PackListQuery,
  type PackStatusInput,
  type PackUpdateInput,
} from '@finiko/contracts';
import { authenticate, optionalAuthenticate, requireRole } from '../../middleware/authenticate';
import { ApiError } from '../../middleware/error';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { writeAudit } from '../../utils/audit';
import { success } from '../../utils/http';
import {
  createPack,
  deletePack,
  getPack,
  listPacks,
  setPackStatus,
  toPack,
  updatePack,
} from './pack.service';

export const packsRouter = Router();

function wantsInactive(includeInactive: boolean, role: string | undefined): boolean {
  if (!includeInactive) return false;

  if (role !== 'admin') {
    throw ApiError.forbidden('Seul un administrateur peut lister les packs inactifs.');
  }

  return true;
}

packsRouter.get('/', optionalAuthenticate, validateQuery(packListQuerySchema), async (req, res) => {
  const query = req.validatedQuery as PackListQuery;
  const includeInactive = wantsInactive(query.includeInactive, req.auth?.role);
  const { packs, total } = await listPacks(query, { includeInactive });

  res.status(200).json(
    success(
      { packs: packs.map(toPack) },
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
});

packsRouter.get('/:id', optionalAuthenticate, validateParams(idParamSchema), async (req, res) => {
  const { id } = req.validatedParams as IdParam;
  const pack = await getPack(id, { includeInactive: req.auth?.role === 'admin' });

  res.status(200).json(success({ pack: toPack(pack) }));
});

packsRouter.post(
  '/',
  authenticate,
  requireRole('admin'),
  validateBody(packInputSchema),
  async (req, res) => {
    const input = req.body as PackInput;
    const pack = await createPack(input, req.auth!.userId);

    await writeAudit(req, {
      action: 'pack.create',
      entityType: 'Pack',
      entityId: pack._id.toString(),
      after: { code: pack.code, priceXOF: pack.priceXOF, quotaUnits: pack.quotaUnits },
    });

    res.status(201).json(success({ pack: toPack(pack) }, { message: 'Pack créé.' }));
  },
);

packsRouter.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  validateParams(idParamSchema),
  validateBody(packUpdateSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as PackUpdateInput;
    const pack = await updatePack(id, input, req.auth!.userId);

    await writeAudit(req, {
      action: 'pack.update',
      entityType: 'Pack',
      entityId: pack._id.toString(),
      after: input,
    });

    res.status(200).json(success({ pack: toPack(pack) }, { message: 'Pack mis à jour.' }));
  },
);

packsRouter.patch(
  '/:id/status',
  authenticate,
  requireRole('admin'),
  validateParams(idParamSchema),
  validateBody(packStatusSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const input = req.body as PackStatusInput;
    const pack = await setPackStatus(id, input.isActive, req.auth!.userId);

    await writeAudit(req, {
      action: 'pack.status',
      entityType: 'Pack',
      entityId: pack._id.toString(),
      after: { isActive: pack.isActive },
    });

    res
      .status(200)
      .json(
        success(
          { pack: toPack(pack) },
          { message: pack.isActive ? 'Pack activé.' : 'Pack désactivé.' },
        ),
      );
  },
);

packsRouter.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  validateParams(idParamSchema),
  async (req, res) => {
    const { id } = req.validatedParams as IdParam;
    const pack = await deletePack(id, req.auth!.userId);

    await writeAudit(req, {
      action: 'pack.delete',
      entityType: 'Pack',
      entityId: pack._id.toString(),
      after: { deletedAt: pack.deletedAt },
    });

    res.status(200).json(success({ pack: toPack(pack) }, { message: 'Pack supprimé.' }));
  },
);
