import { z } from 'zod';
import { positiveMoneySchema } from './common';
import { CATEGORIES, TREATMENTS } from './enums';

export const categorySchema = z.enum(CATEGORIES);
export const treatmentSchema = z.enum(TREATMENTS);

export const catalogPricesSchema = z.object({
  lavage: positiveMoneySchema,
  repassage: positiveMoneySchema,
  lavage_repassage: positiveMoneySchema,
});
export type CatalogPrices = z.infer<typeof catalogPricesSchema>;

export const catalogItemInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,40}$/, 'Code invalide (a-z, 0-9, underscore)'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  category: categorySchema,
  prices: catalogPricesSchema,
  quotaWeight: z.number().int().min(1).max(10).default(1),
  imageUrl: z.url().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});
export type CatalogItemInput = z.infer<typeof catalogItemInputSchema>;

export const catalogItemSchema = catalogItemInputSchema.extend({
  id: z.string(),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;
