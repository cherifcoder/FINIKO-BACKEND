import { Router } from 'express';
import {
  adminCreateUserSchema,
  adminUpdateUserStatusSchema,
  adminUserListQuerySchema,
  type AdminCreateUserInput,
  type AdminUpdateUserStatusInput,
  type AdminUserListQuery,
} from '@finiko/contracts';
import { authenticate, requireRole } from '../../middleware/authenticate';
import { validateBody, validateQuery } from '../../middleware/validate';
import { writeAudit } from '../../utils/audit';
import { success } from '../../utils/http';
import { createManagedUser, listUsers, toPublicUser, updateUserStatus } from './user.service';

export const adminUsersRouter = Router();

adminUsersRouter.use(authenticate, requireRole('admin'));

adminUsersRouter.get('/', validateQuery(adminUserListQuerySchema), async (req, res) => {
  const query = req.validatedQuery as AdminUserListQuery;
  const { users, total } = await listUsers(query);

  res.status(200).json(
    success(
      { users: users.map(toPublicUser) },
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

adminUsersRouter.post('/', validateBody(adminCreateUserSchema), async (req, res) => {
  const input = req.body as AdminCreateUserInput;
  const { user, profile } = await createManagedUser(input, req.auth!.userId);

  await writeAudit(req, {
    action: 'user.create',
    entityType: 'User',
    entityId: user._id.toString(),
    after: { role: user.role, phone: user.phone, profile },
  });

  res
    .status(201)
    .json(
      success(
        { user: toPublicUser(user), profile },
        { message: 'Compte créé. Le titulaire devra changer son mot de passe.' },
      ),
    );
});

adminUsersRouter.patch(
  '/:id/status',
  validateBody(adminUpdateUserStatusSchema),
  async (req, res) => {
    const input = req.body as AdminUpdateUserStatusInput;
    const targetId = req.params.id;

    if (!targetId || typeof targetId !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Identifiant utilisateur requis.',
          requestId: req.id,
        },
      });
      return;
    }

    const { user, previousStatus } = await updateUserStatus(targetId, input, req.auth!.userId);

    await writeAudit(req, {
      action: 'user.status',
      entityType: 'User',
      entityId: user._id.toString(),
      before: { status: previousStatus },
      after: { status: user.status, reason: input.reason ?? null },
    });

    res
      .status(200)
      .json(
        success(
          { user: toPublicUser(user) },
          { message: input.status === 'suspendu' ? 'Compte suspendu.' : 'Compte réactivé.' },
        ),
      );
  },
);
