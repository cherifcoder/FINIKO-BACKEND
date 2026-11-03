import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import type {
  AdminCreateUserInput,
  AdminUpdateUserStatusInput,
  PublicUser,
  UserRole,
  UserStatus,
} from '@finiko/contracts';
import { logger } from '../../config/logger';
import { ApiError } from '../../middleware/error';
import { nextSequence } from '../../models/counter.model';
import {
  ClientProfileModel,
  DriverProfileModel,
  PressingProfileModel,
} from '../../models/profile.model';
import { SessionModel } from '../../models/session.model';
import { UserModel, type UserDocument } from '../../models/user.model';
import { hashPassword } from '../../security/password';
import { isEmailIdentifier, normalizeIdentifier } from '../../utils/phone';

interface UserLike {
  _id: Types.ObjectId;
  role: UserRole;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone: string;
  phoneVerifiedAt: Date | null;
  status: UserStatus;
  mustChangePassword: boolean;
  avatarUrl: string | null;
  locale: 'fr' | 'bm';
  createdAt: Date;
}

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: user._id.toString(),
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email ?? null,
    phone: user.phone,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function findUserByIdentifier(
  identifier: string,
  options: { withPassword?: boolean } = {},
): Promise<UserDocument | null> {
  const normalized = normalizeIdentifier(identifier);
  const filter = isEmailIdentifier(normalized) ? { email: normalized } : { phone: normalized };

  const query = UserModel.findOne({ ...filter, deletedAt: null });

  if (options.withPassword) {
    query.select('+passwordHash');
  }

  return query;
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await SessionModel.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function createManagedUser(
  input: AdminCreateUserInput,
  actorId: string | null,
): Promise<{ user: UserDocument; profile: Record<string, unknown> | null }> {
  await assertContactAvailable(input.phone, input.email);

  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    role: input.role,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    ...(input.email ? { email: input.email } : {}),
    passwordHash,
    status: 'actif',
    mustChangePassword: input.mustChangePassword,
    createdBy: actorId,
  });

  let profile: Record<string, unknown> | null = null;

  try {
    if (input.role === 'livreur') {
      const code = await nextEntityCode('driver');
      profile = {
        code,
        vehicleType: input.driver?.vehicleType ?? 'moto',
      };
      await DriverProfileModel.create({
        user: user._id,
        code,
        vehicle: {
          type: input.driver?.vehicleType ?? 'moto',
          plate: input.driver?.plate ?? null,
        },
        zoneCodes: input.driver?.zoneCodes ?? [],
      });
    } else if (input.role === 'pressing') {
      const pressing = input.pressing;

      if (!pressing) {
        throw ApiError.badRequest('Informations du pressing requises.');
      }

      const code = await nextEntityCode('pressing');
      profile = { code, businessName: pressing.businessName };
      await PressingProfileModel.create({
        user: user._id,
        code,
        businessName: pressing.businessName,
        addressText: pressing.addressText,
        location: {
          type: 'Point',
          coordinates: [pressing.location.lng, pressing.location.lat],
        },
        ...(pressing.capacity ? { capacityPerDay: pressing.capacity } : {}),
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Échec de création du profil, suppression du compte');
    await UserModel.deleteOne({ _id: user._id });
    throw error;
  }

  return { user, profile };
}

export async function createClientProfile(
  userId: Types.ObjectId,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = `FK${randomBytes(3).toString('hex').toUpperCase()}`;

    try {
      await ClientProfileModel.create({ user: userId, referralCode });
      return { referralCode };
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === 4) throw error;
    }
  }

  throw new Error('Impossible de générer un code de parrainage');
}

export async function assertContactAvailable(phone: string, email?: string): Promise<void> {
  const filters: Array<Record<string, string>> = [{ phone }];

  if (email) {
    filters.push({ email });
  }

  const existing = await UserModel.findOne({ $or: filters, deletedAt: null })
    .select('phone email')
    .lean();

  if (!existing) return;

  if (existing.phone === phone) {
    throw ApiError.conflict('PHONE_TAKEN', 'Un compte existe déjà avec ce numéro.');
  }

  throw ApiError.conflict('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse email.');
}

async function nextEntityCode(kind: 'driver' | 'pressing'): Promise<string> {
  const sequence = await nextSequence(kind);
  const prefix = kind === 'driver' ? 'FK-L' : 'FK-P';
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

export interface UserListFilters {
  role?: UserRole;
  status?: UserStatus;
  q?: string;
  page: number;
  limit: number;
}

export async function listUsers(filters: UserListFilters): Promise<{
  users: UserDocument[];
  total: number;
}> {
  const query: Record<string, unknown> = { deletedAt: null };

  if (filters.role) query.role = filters.role;
  if (filters.status) query.status = filters.status;

  if (filters.q) {
    const escaped = filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    query.$or = [{ firstName: regex }, { lastName: regex }, { phone: regex }, { email: regex }];
  }

  const [users, total] = await Promise.all([
    UserModel.find(query)
      .select('-pushTokens')
      .sort({ createdAt: -1 })
      .skip((filters.page - 1) * filters.limit)
      .limit(filters.limit),
    UserModel.countDocuments(query),
  ]);

  return { users, total };
}

export async function updateUserStatus(
  targetId: string,
  input: AdminUpdateUserStatusInput,
  actorId: string,
): Promise<{ user: UserDocument; previousStatus: UserStatus }> {
  if (targetId === actorId && input.status === 'suspendu') {
    throw ApiError.conflict('SELF_SUSPEND', 'Vous ne pouvez pas suspendre votre propre compte.');
  }

  const user = await UserModel.findOne({ _id: targetId, deletedAt: null }).select('+passwordHash');

  if (!user) {
    throw ApiError.notFound('Utilisateur introuvable.');
  }

  const previousStatus = user.status;

  if (
    previousStatus === 'actif' &&
    input.status === 'suspendu' &&
    user.role === 'admin' &&
    (await UserModel.countDocuments({ role: 'admin', status: 'actif', deletedAt: null })) <= 1
  ) {
    throw ApiError.conflict(
      'LAST_ADMIN',
      'Impossible de suspendre le dernier administrateur actif.',
    );
  }

  user.status = input.status;
  await user.save();

  if (input.status === 'suspendu') {
    await revokeAllUserSessions(user._id.toString());
  }

  return { user, previousStatus };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
