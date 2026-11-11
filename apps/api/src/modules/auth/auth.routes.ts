import { Router, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  pushTokenSchema,
  refreshSchema,
  registerSchema,
  requestOtpSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyOtpSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type PushTokenInput,
  type RefreshInput,
  type RegisterInput,
  type RequestOtpInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
  type VerifyOtpInput,
} from '@finiko/contracts';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/authenticate';
import { ApiError } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { writeAudit } from '../../utils/audit';
import { success } from '../../utils/http';
import {
  addPushToken,
  changePassword,
  forgotPassword,
  getMe,
  login,
  logout,
  refreshSession,
  register,
  removePushToken,
  requestOtp,
  resetPassword,
  updateMe,
  verifyPhoneOtp,
  type SessionContext,
} from './auth.service';
import { toPublicUser } from '../users/user.service';

export const authRouter = Router();

const skipLimiter = (): boolean => env.NODE_ENV === 'test';

function rateLimitHandler(code: string, message: string) {
  return (req: Request, res: Response): void => {
    res.status(429).json({
      success: false,
      error: { code, message, requestId: req.id },
    });
  };
}

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimiter,
  handler: rateLimitHandler('RATE_LIMITED', 'Trop de tentatives de création de compte.'),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimiter,
  keyGenerator: (req) => {
    const identifier = String((req.body as Partial<LoginInput> | undefined)?.identifier ?? '');
    return `${ipKeyGenerator(req.ip ?? '0.0.0.0')}:${identifier.toLowerCase()}`;
  },
  handler: rateLimitHandler(
    'RATE_LIMITED',
    'Trop de tentatives de connexion. Réessayez plus tard.',
  ),
});

const otpRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimiter,
  keyGenerator: (req) => {
    const identifier = String((req.body as Partial<RequestOtpInput> | undefined)?.identifier ?? '');
    return identifier ? identifier.toLowerCase() : ipKeyGenerator(req.ip ?? '0.0.0.0');
  },
  handler: rateLimitHandler('RATE_LIMITED', 'Trop de demandes de code. Réessayez dans une heure.'),
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimiter,
  handler: rateLimitHandler('RATE_LIMITED', 'Trop de tentatives de vérification.'),
});

const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: skipLimiter,
  handler: rateLimitHandler('RATE_LIMITED', 'Trop de demandes. Réessayez plus tard.'),
});

function contextFrom(req: Request): SessionContext {
  const deviceId = req.headers['x-device-id'];
  const userAgent = req.headers['user-agent'];

  return {
    ip: req.ip,
    ...(typeof deviceId === 'string' && deviceId.length <= 128 ? { deviceId } : {}),
    ...(typeof userAgent === 'string' && userAgent.length <= 512 ? { deviceInfo: userAgent } : {}),
  };
}

authRouter.post('/register', registerLimiter, validateBody(registerSchema), async (req, res) => {
  const result = await register(req.body as RegisterInput, contextFrom(req));
  res.status(201).json(success(result, { message: 'Compte créé. Bienvenue sur FINIKO !' }));
});

authRouter.post('/login', loginLimiter, validateBody(loginSchema), async (req, res) => {
  const session = await login(req.body as LoginInput, contextFrom(req));
  res.status(200).json(success(session));
});

authRouter.post('/refresh', sensitiveLimiter, validateBody(refreshSchema), async (req, res) => {
  const session = await refreshSession((req.body as RefreshInput).refreshToken, contextFrom(req));
  res.status(200).json(success(session));
});

authRouter.post('/logout', authenticate, validateBody(refreshSchema), async (req, res) => {
  await logout(req.auth!.userId, (req.body as RefreshInput).refreshToken);
  res.status(200).json(success({ message: 'Déconnexion effectuée.' }));
});

authRouter.post(
  '/otp/request',
  otpRequestLimiter,
  validateBody(requestOtpSchema),
  async (req, res) => {
    const input = req.body as RequestOtpInput;
    const result = await requestOtp(input.identifier, input.purpose);
    res.status(200).json(success(result));
  },
);

authRouter.post(
  '/otp/verify',
  otpVerifyLimiter,
  validateBody(verifyOtpSchema),
  async (req, res) => {
    const input = req.body as VerifyOtpInput;

    if (input.purpose !== 'phone_verify') {
      throw ApiError.badRequest('Utilisez /auth/password/reset pour ce type de code.');
    }

    const session = await verifyPhoneOtp(input.identifier, input.code, contextFrom(req));
    res.status(200).json(success(session, { message: 'Téléphone vérifié.' }));
  },
);

authRouter.post(
  '/password/forgot',
  sensitiveLimiter,
  validateBody(forgotPasswordSchema),
  async (req, res) => {
    const result = await forgotPassword(req.body as ForgotPasswordInput);
    res.status(200).json(success(result));
  },
);

authRouter.post(
  '/password/reset',
  sensitiveLimiter,
  validateBody(resetPasswordSchema),
  async (req, res) => {
    const result = await resetPassword(req.body as ResetPasswordInput);
    res.status(200).json(success(result));
  },
);

authRouter.get('/me', authenticate, async (req, res) => {
  const user = await getMe(req.auth!.userId);
  res.status(200).json(success({ user: toPublicUser(user) }));
});

authRouter.patch('/me', authenticate, validateBody(updateProfileSchema), async (req, res) => {
  const user = await updateMe(req.auth!.userId, req.body as UpdateProfileInput);
  res.status(200).json(success({ user: toPublicUser(user) }));
});

authRouter.post(
  '/password/change',
  authenticate,
  sensitiveLimiter,
  validateBody(changePasswordSchema),
  async (req, res) => {
    const result = await changePassword(req.auth!.userId, req.body as ChangePasswordInput);
    await writeAudit(req, {
      action: 'auth.password.change',
      entityType: 'User',
      entityId: req.auth!.userId,
    });
    res.status(200).json(success(result));
  },
);

authRouter.post('/push-token', authenticate, validateBody(pushTokenSchema), async (req, res) => {
  const input = req.body as PushTokenInput;
  await addPushToken(req.auth!.userId, input.token, input.platform);
  res.status(200).json(success({ message: 'Token push enregistré.' }));
});

authRouter.delete('/push-token', authenticate, validateBody(pushTokenSchema), async (req, res) => {
  const input = req.body as PushTokenInput;
  await removePushToken(req.auth!.userId, input.token);
  res.status(200).json(success({ message: 'Token push supprimé.' }));
});
