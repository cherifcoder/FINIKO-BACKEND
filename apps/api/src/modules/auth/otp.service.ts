import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { emailSchema, type OtpPurpose } from '@finiko/contracts';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError } from '../../middleware/error';
import { OtpCodeModel } from '../../models/otp-code.model';
import { isEmailIdentifier, normalizePhone } from '../../utils/phone';
import { otpSender } from './otp.sender';

interface OtpTarget {
  identifier: string;
  channel: 'sms' | 'email';
}

export interface IssuedOtp {
  expiresIn: number;
  devCode?: string;
}

/**
 * Normalise la cible d'un OTP :
 * - phone_verify : SMS uniquement ;
 * - password_reset : email ou téléphone.
 */
export function normalizeOtpTarget(identifier: string, purpose: OtpPurpose): OtpTarget {
  const trimmed = identifier.trim();

  if (purpose === 'phone_verify') {
    const phone = normalizePhone(trimmed);

    if (!phone) {
      throw ApiError.badRequest('Numéro de téléphone invalide.');
    }

    return { identifier: phone, channel: 'sms' };
  }

  if (isEmailIdentifier(trimmed)) {
    const parsed = emailSchema.safeParse(trimmed);

    if (!parsed.success) {
      throw ApiError.badRequest('Adresse email invalide.');
    }

    return { identifier: parsed.data, channel: 'email' };
  }

  const phone = normalizePhone(trimmed);

  if (!phone) {
    throw ApiError.badRequest('Identifiant invalide.');
  }

  return { identifier: phone, channel: 'sms' };
}

function hashOtp(identifier: string, purpose: OtpPurpose, code: string): string {
  return createHmac('sha256', env.OTP_PEPPER)
    .update(`${identifier}:${purpose}:${code}`)
    .digest('hex');
}

function otpHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function issueOtp(
  identifier: string,
  purpose: OtpPurpose,
): Promise<IssuedOtp & { target: OtpTarget }> {
  const target = normalizeOtpTarget(identifier, purpose);
  const now = new Date();

  const latest = await OtpCodeModel.findOne({ ...target, purpose })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();

  if (latest) {
    const elapsedSeconds = Math.floor((now.getTime() - latest.createdAt.getTime()) / 1000);
    const remaining = env.OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds;

    if (remaining > 0) {
      throw ApiError.tooManyRequests(
        'OTP_COOLDOWN',
        `Patientez ${remaining} seconde(s) avant de demander un nouveau code.`,
        { retryAfterSeconds: remaining },
      );
    }
  }

  // Un seul code actif à la fois par identifiant et par usage.
  await OtpCodeModel.updateMany(
    { ...target, purpose, consumedAt: null },
    { $set: { consumedAt: now } },
  );

  const code = randomInt(100_000, 1_000_000).toString();
  const expiresAt = new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000);

  const otp = await OtpCodeModel.create({
    ...target,
    purpose,
    codeHash: hashOtp(target.identifier, purpose, code),
    expiresAt,
  });

  try {
    await otpSender.send({
      identifier: target.identifier,
      channel: target.channel,
      code,
      purpose,
      expiresInSeconds: env.OTP_TTL_SECONDS,
    });
  } catch (error) {
    await OtpCodeModel.updateOne({ _id: otp._id }, { $set: { consumedAt: now } });
    logger.error({ err: error, channel: target.channel }, "Échec d'envoi d'un OTP");
    throw ApiError.badGateway('OTP_SEND_FAILED', "Impossible d'envoyer le code pour le moment.");
  }

  return {
    expiresIn: env.OTP_TTL_SECONDS,
    ...(env.OTP_EXPOSE_CODE ? { devCode: code } : {}),
    target,
  };
}

/**
 * Consomme un OTP. Lève une erreur métier si le code est invalide, expiré ou
 * si le nombre de tentatives est dépassé.
 */
export async function consumeOtp(
  identifier: string,
  purpose: OtpPurpose,
  code: string,
): Promise<void> {
  const target = normalizeOtpTarget(identifier, purpose);
  const now = new Date();

  const candidate = await OtpCodeModel.findOne({
    ...target,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .select('+codeHash')
    .lean();

  if (!candidate) {
    throw new ApiError(400, 'OTP_INVALID', 'Code invalide ou expiré.');
  }

  const updated = await OtpCodeModel.findOneAndUpdate(
    {
      _id: candidate._id,
      consumedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: env.OTP_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  )
    .select('+codeHash')
    .lean();

  if (!updated) {
    await OtpCodeModel.updateOne(
      { _id: candidate._id, consumedAt: null },
      { $set: { consumedAt: now } },
    );
    throw new ApiError(
      400,
      'OTP_TOO_MANY_ATTEMPTS',
      'Trop de tentatives. Demandez un nouveau code.',
    );
  }

  const expected = hashOtp(target.identifier, purpose, code);

  if (!otpHashEquals(expected, updated.codeHash)) {
    if (updated.attempts >= env.OTP_MAX_ATTEMPTS) {
      await OtpCodeModel.updateOne({ _id: updated._id }, { $set: { consumedAt: now } });
      throw new ApiError(
        400,
        'OTP_TOO_MANY_ATTEMPTS',
        'Trop de tentatives. Demandez un nouveau code.',
      );
    }

    throw new ApiError(400, 'OTP_INVALID', 'Code invalide ou expiré.', {
      remainingAttempts: env.OTP_MAX_ATTEMPTS - updated.attempts,
    });
  }

  const consumed = await OtpCodeModel.updateOne(
    { _id: updated._id, consumedAt: null },
    { $set: { consumedAt: now } },
  );

  if (consumed.modifiedCount === 0) {
    throw new ApiError(400, 'OTP_INVALID', 'Code invalide ou expiré.');
  }
}
