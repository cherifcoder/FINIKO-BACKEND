import { z } from 'zod';

/** Montant en FCFA entiers, jamais de flottants. */
export const moneySchema = z.number().int().min(0).max(100_000_000);
export const positiveMoneySchema = z.number().int().min(1).max(100_000_000);

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');

/** Téléphone au format E.164, ex. +22370000000. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Numéro au format international attendu (+223...)');

export const emailSchema = z
  .email('Adresse email invalide')
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  text: z.string().trim().min(5).max(300),
  coordinates: coordinatesSchema,
  contactName: z.string().trim().min(2).max(80),
  contactPhone: phoneSchema,
  instructions: z.string().trim().max(300).optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().max(60).optional(),
  q: z.string().trim().max(120).optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
  message?: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
