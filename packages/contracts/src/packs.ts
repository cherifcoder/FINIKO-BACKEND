import { z } from 'zod';
import { positiveMoneySchema } from './common';
import { treatmentSchema } from './catalog';
import { TREATMENTS } from './enums';

export const packInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,40}$/, 'Code invalide (a-z, 0-9, underscore)'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  priceXOF: positiveMoneySchema,
  quotaUnits: z.number().int().min(1).max(1000),
  validityDays: z.number().int().min(1).max(365).default(30),
  includedTreatments: z
    .array(treatmentSchema)
    .min(1)
    .default([...TREATMENTS]),
  deliveryIncluded: z.boolean().default(false),
  deliveryDiscountPercent: z.number().int().min(0).max(100).default(0),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});
export type PackInput = z.infer<typeof packInputSchema>;

export const packSchema = packInputSchema.extend({
  id: z.string(),
});
export type Pack = z.infer<typeof packSchema>;

export const subscriptionInputSchema = z.object({
  packId: z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant de pack invalide'),
});
export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;
