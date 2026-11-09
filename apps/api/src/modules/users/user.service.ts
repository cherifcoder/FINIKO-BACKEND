import { randomBytes } from 'node:crypto';
import type { HydratedDocument, Types } from 'mongoose';
import type {
  AdminCreateUserInput,
  AdminDriverProfile,
  AdminPressingProfile,
  AdminUpdateUserInput,
  AdminUpdateUserStatusInput,
  AdminUserDetail,
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
  type DriverProfile,
  type PressingProfile,
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

function toAdminDriverProfile(profile: DriverProfile): AdminDriverProfile {
  return {
    code: profile.code,
    vehicleType: profile.vehicle.type,
    plate: profile.vehicle.plate ?? null,
    zoneCodes: [...profile.zoneCodes],
  };
}

function toAdminPressingProfile(profile: PressingProfile): AdminPressingProfile {
  const [lng, lat] = profile.location.coordinates;

  return {
    code: profile.code,
    businessName: profile.businessName,
    addressText: profile.addressText,
    location: { lat: lat ?? 0, lng: lng ?? 0 },
    capacity: profile.capacityPerDay,
  };
}

export function toAdminUserDetail(
  user: UserLike,
  driver: DriverProfile | null,
  pressing: PressingProfile | null,
): AdminUserDetail {
  return {
    ...toPublicUser(user),
    driver: driver ? toAdminDriverProfile(driver) : null,
    pressing: pressing ? toAdminPressingProfile(pressing) : null,
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
    } else if (input.role === 'client') {
      profile = await createClientProfile(user._id);
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

export async function assertContactAvailable(
  phone: string,
  email?: string,
  excludeUserId?: string,
): Promise<void> {
  const filters: Array<Record<string, string>> = [{ phone }];

  if (email) {
    filters.push({ email });
  }

  const query: Record<string, unknown> = { $or: filters, deletedAt: null };

  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  const existing = await UserModel.findOne(query).select('phone email').lean();

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

export async function getManagedUserDetail(targetId: string): Promise<{
  user: UserDocument;
  driver: DriverProfile | null;
  pressing: PressingProfile | null;
}> {
  const user = await UserModel.findOne({ _id: targetId, deletedAt: null });

  if (!user) {
    throw ApiError.notFound('Utilisateur introuvable.');
  }

  const [driver, pressing] = await Promise.all([
    user.role === 'livreur' ? DriverProfileModel.findOne({ user: user._id }) : null,
    user.role === 'pressing' ? PressingProfileModel.findOne({ user: user._id }) : null,
  ]);

  return { user, driver, pressing };
}

export async function updateManagedUser(
  targetId: string,
  input: AdminUpdateUserInput,
): Promise<{
  user: UserDocument;
  driver: DriverProfile | null;
  pressing: PressingProfile | null;
}> {
  const user = await UserModel.findOne({ _id: targetId, deletedAt: null });

  if (!user) {
    throw ApiError.notFound('Utilisateur introuvable.');
  }

  if (input.driver && user.role !== 'livreur') {
    throw ApiError.badRequest('Un profil livreur ne peut être associé qu’à un livreur.');
  }

  if (input.pressing && user.role !== 'pressing') {
    throw ApiError.badRequest('Un profil pressing ne peut être associé qu’à un pressing.');
  }

  const nextPhone = input.phone ?? user.phone;
  const nextEmail =
    input.email === undefined ? user.email : input.email === null ? undefined : input.email;

  if (input.phone !== undefined || input.email !== undefined) {
    await assertContactAvailable(nextPhone, nextEmail, targetId);
  }

  if (input.firstName !== undefined) user.firstName = input.firstName;
  if (input.lastName !== undefined) user.lastName = input.lastName;
  if (input.phone !== undefined) {
    if (input.phone !== user.phone) {
      user.phoneVerifiedAt = null;
    }
    user.phone = input.phone;
  }
  if (input.email !== undefined) {
    user.email = input.email === null ? undefined : input.email;
  }
  if (input.locale !== undefined) user.locale = input.locale;

  let revokeSessions = false;

  if (input.password) {
    user.passwordHash = await hashPassword(input.password);
    user.mustChangePassword = input.mustChangePassword ?? true;
    revokeSessions = true;
  } else if (input.mustChangePassword !== undefined) {
    user.mustChangePassword = input.mustChangePassword;
  }

  await user.save();

  if (revokeSessions) {
    await revokeAllUserSessions(targetId);
  }

  let driver: HydratedDocument<DriverProfile> | null = null;
  let pressing: HydratedDocument<PressingProfile> | null = null;

  if (user.role === 'livreur') {
    driver = await DriverProfileModel.findOne({ user: user._id });

    if (!driver) {
      const code = await nextEntityCode('driver');
      driver = await DriverProfileModel.create({
        user: user._id,
        code,
        vehicle: {
          type: input.driver?.vehicleType ?? 'moto',
          plate: input.driver?.plate ?? null,
        },
        zoneCodes: input.driver?.zoneCodes ?? [],
      });
    } else if (input.driver) {
      if (input.driver.vehicleType !== undefined) {
        driver.vehicle.type = input.driver.vehicleType;
      }
      if (input.driver.plate !== undefined) {
        driver.vehicle.plate = input.driver.plate;
      }
      if (input.driver.zoneCodes !== undefined) {
        driver.zoneCodes = input.driver.zoneCodes;
      }
      await driver.save();
    }
  }

  if (user.role === 'pressing') {
    pressing = await PressingProfileModel.findOne({ user: user._id });

    if (!pressing) {
      if (
        !input.pressing?.businessName ||
        !input.pressing.addressText ||
        !input.pressing.location
      ) {
        throw ApiError.badRequest('Informations du pressing requises.');
      }

      const code = await nextEntityCode('pressing');
      pressing = await PressingProfileModel.create({
        user: user._id,
        code,
        businessName: input.pressing.businessName,
        addressText: input.pressing.addressText,
        location: {
          type: 'Point',
          coordinates: [input.pressing.location.lng, input.pressing.location.lat],
        },
        ...(input.pressing.capacity ? { capacityPerDay: input.pressing.capacity } : {}),
      });
    } else if (input.pressing) {
      if (input.pressing.businessName !== undefined) {
        pressing.businessName = input.pressing.businessName;
      }
      if (input.pressing.addressText !== undefined) {
        pressing.addressText = input.pressing.addressText;
      }
      if (input.pressing.location) {
        pressing.location = {
          type: 'Point',
          coordinates: [input.pressing.location.lng, input.pressing.location.lat],
        };
      }
      if (input.pressing.capacity !== undefined) {
        pressing.capacityPerDay = input.pressing.capacity;
      }
      await pressing.save();
    }
  }

  return { user, driver, pressing };
}

export async function deleteManagedUser(targetId: string, actorId: string): Promise<UserDocument> {
  if (targetId === actorId) {
    throw ApiError.conflict('SELF_DELETE', 'Vous ne pouvez pas supprimer votre propre compte.');
  }

  const user = await UserModel.findOne({ _id: targetId, deletedAt: null });

  if (!user) {
    throw ApiError.notFound('Utilisateur introuvable.');
  }

  if (user.role === 'admin' && user.status === 'actif') {
    const otherActiveAdmins = await UserModel.countDocuments({
      _id: { $ne: user._id },
      role: 'admin',
      status: 'actif',
      deletedAt: null,
    });

    if (otherActiveAdmins === 0) {
      throw ApiError.conflict(
        'LAST_ADMIN',
        'Impossible de supprimer le dernier administrateur actif.',
      );
    }
  }

  user.deletedAt = new Date();
  user.status = 'supprime';
  user.pushTokens = [];
  await user.save();
  await revokeAllUserSessions(targetId);

  return user;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
