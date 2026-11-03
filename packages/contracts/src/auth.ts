import { z } from 'zod';
import { emailSchema, objectIdSchema, phoneSchema } from './common';
import { USER_ROLES, USER_STATUSES } from './enums';

export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128)
  .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule')
  .regex(/\d/, 'Le mot de passe doit contenir un chiffre');

export const userRoleSchema = z.enum(USER_ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);
export const roleAdminCreatableSchema = z.enum(['livreur', 'pressing', 'admin']);

/**
 * Utilisateur expose par l'API. Aucun champ technique (passwordHash, __v) n'y figure.
 */
export const publicUserSchema = z.object({
  id: objectIdSchema,
  role: userRoleSchema,
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  email: emailSchema.nullable(),
  phone: phoneSchema,
  phoneVerified: z.boolean(),
  status: userStatusSchema,
  mustChangePassword: z.boolean(),
  avatarUrl: z.string().nullable(),
  locale: z.enum(['fr', 'bm']),
  createdAt: z.iso.datetime(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(80),
  lastName: z.string().trim().min(1, 'Nom requis').max(80),
  phone: phoneSchema,
  email: emailSchema.optional(),
  password: passwordSchema,
  acceptTerms: z.literal(true, {
    error: "Les conditions d'utilisation doivent être acceptées",
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Identifiant requis').max(254),
  password: z.string().min(1, 'Mot de passe requis').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token invalide').max(512),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const OTP_PURPOSES = ['phone_verify', 'password_reset'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];
export const otpPurposeSchema = z.enum(OTP_PURPOSES);

export const requestOtpSchema = z.object({
  identifier: z.string().trim().min(3, 'Email ou téléphone requis').max(254),
  purpose: otpPurposeSchema.default('phone_verify'),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  identifier: z.string().trim().min(3, 'Email ou téléphone requis').max(254),
  purpose: otpPurposeSchema.default('phone_verify'),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(20),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authSessionSchema = authTokensSchema.extend({
  user: publicUserSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const registerResponseSchema = z.object({
  user: publicUserSchema,
  otpRequired: z.literal(true),
  otpExpiresIn: z.number().int().positive(),
  devCode: z.string().optional(),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const otpChallengeSchema = z.object({
  expiresIn: z.number().int().positive(),
  message: z.string(),
  devCode: z.string().optional(),
});
export type OtpChallenge = z.infer<typeof otpChallengeSchema>;

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: z.union([emailSchema, z.null()]).optional(),
    avatarUrl: z.union([z.url().max(500), z.null()]).optional(),
    locale: z.enum(['fr', 'bm']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Aucun champ à mettre à jour',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis').max(128),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "Le nouveau mot de passe doit être différent de l'actuel",
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3, 'Email ou téléphone requis').max(254),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3, 'Email ou téléphone requis').max(254),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu'),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const pushTokenSchema = z.object({
  token: z.string().trim().min(10).max(512),
  platform: z.enum(['android', 'ios']),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;

const driverProfileInputSchema = z.object({
  vehicleType: z.enum(['moto', 'voiture', 'tricycle']).default('moto'),
  plate: z.string().trim().max(20).optional(),
  zoneCodes: z.array(z.string().trim().min(1).max(20)).max(50).default([]),
});

const pressingProfileInputSchema = z.object({
  businessName: z.string().trim().min(2, 'Nom du pressing requis').max(120),
  addressText: z.string().trim().min(5, 'Adresse requise').max(300),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  capacity: z.number().int().min(1).max(500).optional(),
});

export const adminCreateUserSchema = z
  .object({
    role: roleAdminCreatableSchema,
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: phoneSchema,
    email: emailSchema.optional(),
    password: passwordSchema,
    mustChangePassword: z.boolean().default(true),
    driver: driverProfileInputSchema.optional(),
    pressing: pressingProfileInputSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'pressing' && !value.pressing) {
      ctx.addIssue({
        code: 'custom',
        message: 'Les informations du pressing sont requises',
        path: ['pressing'],
      });
    }

    if (value.role === 'livreur' && value.pressing) {
      ctx.addIssue({
        code: 'custom',
        message: 'Un livreur ne peut pas avoir de profil pressing',
        path: ['pressing'],
      });
    }
  });
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserStatusSchema = z.object({
  status: z.enum(['actif', 'suspendu']),
  reason: z.string().trim().max(500).optional(),
});
export type AdminUpdateUserStatusInput = z.infer<typeof adminUpdateUserStatusSchema>;

export const adminUserListQuerySchema = z.object({
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export const changePasswordResponseSchema = z.object({
  message: z.string(),
  sessionsRevoked: z.boolean(),
});
