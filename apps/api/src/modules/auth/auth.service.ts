import type {
  AuthSession,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  OtpPurpose,
  RegisterInput,
  RegisterResponse,
  ResetPasswordInput,
  UpdateProfileInput,
} from '@finiko/contracts';
import { emailSchema } from '@finiko/contracts';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../middleware/error';
import { ClientProfileModel } from '../../models/profile.model';
import { SessionModel } from '../../models/session.model';
import { UserModel, type UserDocument } from '../../models/user.model';
import { hashPassword, verifyPassword, verifyUnknownUserPassword } from '../../security/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  newSessionFamilyId,
  refreshTokenExpiry,
  signAccessToken,
} from '../../security/tokens';
import { normalizePhone } from '../../utils/phone';
import { consumeOtp, issueOtp } from './otp.service';
import {
  assertContactAvailable,
  createClientProfile,
  findUserByIdentifier,
  revokeAllUserSessions,
  toPublicUser,
} from '../users/user.service';

export interface SessionContext {
  ip?: string;
  deviceId?: string;
  deviceInfo?: string;
}

interface SessionBundle {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  sessionId: string;
}

async function createSession(
  user: UserDocument,
  context: SessionContext,
  familyId = newSessionFamilyId(),
): Promise<SessionBundle> {
  const refreshToken = generateRefreshToken();

  const session = await SessionModel.create({
    user: user._id,
    tokenHash: hashRefreshToken(refreshToken),
    familyId,
    deviceId: context.deviceId ?? null,
    deviceInfo: context.deviceInfo ?? null,
    ip: context.ip ?? null,
    expiresAt: refreshTokenExpiry(),
  });

  const accessToken = await signAccessToken({
    sub: user._id.toString(),
    role: user.role,
    sid: session._id.toString(),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    userId: user._id.toString(),
    sessionId: session._id.toString(),
  };
}

async function toAuthSession(user: UserDocument, bundle: SessionBundle): Promise<AuthSession> {
  return {
    accessToken: bundle.accessToken,
    refreshToken: bundle.refreshToken,
    expiresIn: bundle.expiresIn,
    user: toPublicUser(user),
  };
}

export async function register(
  input: RegisterInput,
  context: SessionContext,
): Promise<RegisterResponse> {
  await assertContactAvailable(input.phone, input.email);

  const passwordHash = await hashPassword(input.password);

  const user = await UserModel.create({
    role: 'client',
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    ...(input.email ? { email: input.email } : {}),
    passwordHash,
    status: 'actif',
    phoneVerifiedAt: null,
    mustChangePassword: false,
  });

  try {
    await createClientProfile(user._id);

    const otp = await issueOtp(input.phone, 'phone_verify');

    logger.info({ userId: user._id.toString(), ip: context.ip }, 'Nouveau compte client');

    return {
      user: toPublicUser(user),
      otpRequired: true,
      otpExpiresIn: otp.expiresIn,
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    };
  } catch (error) {
    logger.error({ err: error }, "Échec de finalisation de l'inscription, nettoyage");
    await Promise.all([
      ClientProfileModel.deleteOne({ user: user._id }),
      UserModel.deleteOne({ _id: user._id }),
    ]);
    throw error;
  }
}

export async function login(input: LoginInput, context: SessionContext): Promise<AuthSession> {
  const user = await findUserByIdentifier(input.identifier, { withPassword: true });

  if (!user) {
    await verifyUnknownUserPassword(input.password);
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);

  if (!passwordOk) {
    logger.warn({ userId: user._id.toString(), ip: context.ip }, 'Échec de connexion');
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');
  }

  if (user.status !== 'actif') {
    throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const bundle = await createSession(user, context);

  return toAuthSession(user, bundle);
}

export async function refreshSession(
  refreshToken: string,
  context: SessionContext,
): Promise<AuthSession> {
  const session = await SessionModel.findOne({ tokenHash: hashRefreshToken(refreshToken) });

  if (!session) {
    throw new ApiError(401, 'INVALID_REFRESH', 'Session introuvable. Reconnectez-vous.');
  }

  if (session.revokedAt) {
    await revokeFamily(session.familyId);
    logger.warn({ familyId: session.familyId }, 'Réutilisation d un refresh token révoqué');
    throw new ApiError(401, 'REFRESH_REUSED', 'Session révoquée. Reconnectez-vous.');
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(401, 'INVALID_REFRESH', 'Session expirée. Reconnectez-vous.');
  }

  const user = await UserModel.findOne({ _id: session.user, deletedAt: null });

  if (!user) {
    throw new ApiError(401, 'INVALID_REFRESH', 'Session invalide. Reconnectez-vous.');
  }

  if (user.status !== 'actif') {
    throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu.');
  }

  const now = new Date();
  const revoked = await SessionModel.findOneAndUpdate(
    { _id: session._id, revokedAt: null },
    { $set: { revokedAt: now } },
  );

  if (!revoked) {
    await revokeFamily(session.familyId);
    throw new ApiError(401, 'REFRESH_REUSED', 'Session révoquée. Reconnectez-vous.');
  }

  const bundle = await createSession(user, context, session.familyId);

  await SessionModel.updateOne({ _id: session._id }, { $set: { replacedBy: bundle.sessionId } });

  return toAuthSession(user, bundle);
}

async function revokeFamily(familyId: string): Promise<void> {
  await SessionModel.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function logout(userId: string, refreshToken: string): Promise<void> {
  const session = await SessionModel.findOne({ tokenHash: hashRefreshToken(refreshToken) });

  if (!session || session.user.toString() !== userId) {
    return;
  }

  await revokeFamily(session.familyId);
}

export async function getMe(userId: string): Promise<UserDocument> {
  const user = await UserModel.findOne({ _id: userId, deletedAt: null });

  if (!user) {
    throw ApiError.unauthorized();
  }

  return user;
}

export async function updateMe(userId: string, input: UpdateProfileInput): Promise<UserDocument> {
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};

  if (input.firstName !== undefined) set.firstName = input.firstName;
  if (input.lastName !== undefined) set.lastName = input.lastName;
  if (input.avatarUrl !== undefined) set.avatarUrl = input.avatarUrl;
  if (input.locale !== undefined) set.locale = input.locale;

  if (input.email === null) {
    unset.email = 1;
  } else if (input.email !== undefined) {
    const parsed = emailSchema.parse(input.email);
    const existing = await UserModel.findOne({
      email: parsed,
      _id: { $ne: userId },
    })
      .select('_id')
      .lean();

    if (existing) {
      throw ApiError.conflict('EMAIL_TAKEN', 'Cette adresse email est déjà utilisée.');
    }

    set.email = parsed;
  }

  const user = await UserModel.findOneAndUpdate(
    { _id: userId, deletedAt: null },
    {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
    { returnDocument: 'after', runValidators: true },
  );

  if (!user) {
    throw ApiError.unauthorized();
  }

  return user;
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<{ message: string; sessionsRevoked: boolean }> {
  const user = await UserModel.findOne({ _id: userId, deletedAt: null }).select('+passwordHash');

  if (!user) {
    throw ApiError.unauthorized();
  }

  const currentOk = await verifyPassword(user.passwordHash, input.currentPassword);

  if (!currentOk) {
    throw new ApiError(400, 'INVALID_CURRENT_PASSWORD', 'Mot de passe actuel incorrect.');
  }

  user.passwordHash = await hashPassword(input.newPassword);
  user.mustChangePassword = false;
  await user.save();
  await revokeAllUserSessions(user._id.toString());

  return {
    message: 'Mot de passe modifié. Toutes les sessions ont été révoquées.',
    sessionsRevoked: true,
  };
}

export async function requestOtp(
  identifier: string,
  purpose: OtpPurpose,
): Promise<{ expiresIn: number; message: string; devCode?: string }> {
  const genericMessage =
    'Si un compte correspond à cet identifiant, un code de vérification a été envoyé.';

  if (purpose === 'phone_verify') {
    const phone = normalizePhone(identifier.trim());

    if (!phone) {
      throw ApiError.badRequest('Numéro de téléphone invalide.');
    }

    const user = await UserModel.findOne({ phone, deletedAt: null })
      .select('phoneVerifiedAt')
      .lean();

    if (!user) {
      return { expiresIn: env.OTP_TTL_SECONDS, message: genericMessage };
    }

    if (user.phoneVerifiedAt) {
      return { expiresIn: env.OTP_TTL_SECONDS, message: 'Ce numéro est déjà vérifié.' };
    }

    const otp = await issueOtp(phone, purpose);
    return {
      expiresIn: otp.expiresIn,
      message: 'Code de vérification envoyé.',
      ...(otp.devCode ? { devCode: otp.devCode } : {}),
    };
  }

  const user = await findUserByIdentifier(identifier);

  if (!user) {
    return { expiresIn: env.OTP_TTL_SECONDS, message: genericMessage };
  }

  const otp = await issueOtp(identifier, purpose);

  return {
    expiresIn: otp.expiresIn,
    message: genericMessage,
    ...(otp.devCode ? { devCode: otp.devCode } : {}),
  };
}

export async function verifyPhoneOtp(
  identifier: string,
  code: string,
  context: SessionContext,
): Promise<AuthSession> {
  const phone = normalizePhone(identifier.trim());

  if (!phone) {
    throw ApiError.badRequest('Numéro de téléphone invalide.');
  }

  await consumeOtp(phone, 'phone_verify', code);

  const user = await UserModel.findOne({ phone, deletedAt: null });

  if (!user) {
    throw new ApiError(400, 'OTP_INVALID', 'Code invalide ou expiré.');
  }

  if (!user.phoneVerifiedAt) {
    user.phoneVerifiedAt = new Date();
    await user.save();
  }

  const bundle = await createSession(user, context);

  return toAuthSession(user, bundle);
}

export async function forgotPassword(
  input: ForgotPasswordInput,
): Promise<{ expiresIn: number; message: string; devCode?: string }> {
  const genericMessage =
    'Si un compte correspond à cet identifiant, un code de réinitialisation a été envoyé.';

  const user = await findUserByIdentifier(input.identifier);

  if (!user || user.status !== 'actif') {
    return { expiresIn: env.OTP_TTL_SECONDS, message: genericMessage };
  }

  const otp = await issueOtp(input.identifier, 'password_reset');

  return {
    expiresIn: otp.expiresIn,
    message: genericMessage,
    ...(otp.devCode ? { devCode: otp.devCode } : {}),
  };
}

export async function resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
  const user = await findUserByIdentifier(input.identifier);

  if (!user || user.status !== 'actif') {
    throw new ApiError(400, 'OTP_INVALID', 'Code invalide ou expiré.');
  }

  await consumeOtp(input.identifier, 'password_reset', input.code);

  user.passwordHash = await hashPassword(input.password);
  user.mustChangePassword = false;
  await user.save();
  await revokeAllUserSessions(user._id.toString());

  return { message: 'Mot de passe réinitialisé. Reconnectez-vous.' };
}

export async function addPushToken(
  userId: string,
  token: string,
  platform: 'android' | 'ios',
): Promise<void> {
  const now = new Date();

  await UserModel.updateOne({ _id: userId }, { $pull: { pushTokens: { token } } });
  await UserModel.updateOne(
    { _id: userId },
    {
      $push: {
        pushTokens: {
          $each: [{ token, platform, updatedAt: now }],
          $slice: -10,
        },
      },
    },
  );
}

export async function removePushToken(userId: string, token: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $pull: { pushTokens: { token } } });
}
