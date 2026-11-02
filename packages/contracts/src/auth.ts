import { z } from 'zod';
import { emailSchema, phoneSchema } from './common';

export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128)
  .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule')
  .regex(/\d/, 'Le mot de passe doit contenir un chiffre');

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    acceptTerms: z.literal(true, {
      error: "Les conditions d'utilisation doivent être acceptées",
    }),
  })
  .refine((value) => Boolean(value.email ?? value.phone), {
    message: 'Un email ou un téléphone est requis',
    path: ['email'],
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

export const requestOtpSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine((value) => Boolean(value.email ?? value.phone), {
    message: 'Un email ou un téléphone est requis',
    path: ['email'],
  });
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  code: z.string().regex(/^\d{6}$/, 'Code à 6 chiffres attendu'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(20),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;
