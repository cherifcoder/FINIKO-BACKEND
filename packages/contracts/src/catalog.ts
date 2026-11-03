import { z } from 'zod';
import { objectIdSchema, paginationSchema, positiveMoneySchema } from './common';
import { CATEGORIES, TREATMENTS } from './enums';

export const categorySchema = z.enum(CATEGORIES);
export const treatmentSchema = z.enum(TREATMENTS);

/** Les trois prix sont obligatoires : aucune combinaison partielle n'est acceptée. */
export const catalogPricesSchema = z.object({
  lavage: positiveMoneySchema,
  repassage: positiveMoneySchema,
  lavage_repassage: positiveMoneySchema,
});
export type CatalogPrices = z.infer<typeof catalogPricesSchema>;

const treatmentsBaseSchema = z
  .array(treatmentSchema)
  .min(1, 'Au moins une prestation doit être proposée')
  .max(TREATMENTS.length)
  .refine((values) => new Set(values).size === values.length, {
    message: 'Les prestations doivent être uniques',
  });

/**
 * Schéma sans valeur par défaut, réutilisé pour les PATCH : les défauts ne
 * doivent jamais écraser des champs non transmis lors d'une mise à jour.
 */
const catalogItemBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,40}$/, 'Code invalide (a-z, 0-9, underscore)'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500),
  category: categorySchema,
  material: z.string().trim().max(80),
  prices: catalogPricesSchema,
  quotaWeight: z.number().int().min(1).max(10),
  availableTreatments: treatmentsBaseSchema,
  imageUrl: z.union([z.url().max(500), z.null()]).optional(),
  isActive: z.boolean(),
  displayOrder: z.number().int().min(0),
});

export const catalogItemInputSchema = catalogItemBaseSchema.extend({
  description: catalogItemBaseSchema.shape.description.default(''),
  material: catalogItemBaseSchema.shape.material.default(''),
  quotaWeight: catalogItemBaseSchema.shape.quotaWeight.default(1),
  availableTreatments: catalogItemBaseSchema.shape.availableTreatments.default([...TREATMENTS]),
  isActive: catalogItemBaseSchema.shape.isActive.default(true),
  displayOrder: catalogItemBaseSchema.shape.displayOrder.default(0),
});
export type CatalogItemInput = z.infer<typeof catalogItemInputSchema>;

/** Le code est immuable : il n'est pas modifiable via PATCH. */
export const catalogItemUpdateSchema = catalogItemBaseSchema
  .omit({ code: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Aucun champ à mettre à jour',
  });
export type CatalogItemUpdateInput = z.infer<typeof catalogItemUpdateSchema>;

export const catalogItemStatusSchema = z.object({
  isActive: z.boolean(),
});
export type CatalogItemStatusInput = z.infer<typeof catalogItemStatusSchema>;

export const catalogItemListQuerySchema = paginationSchema.extend({
  category: categorySchema.optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type CatalogItemListQuery = z.infer<typeof catalogItemListQuerySchema>;

export const catalogItemSchema = z.object({
  id: objectIdSchema,
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category: categorySchema,
  material: z.string(),
  prices: catalogPricesSchema,
  quotaWeight: z.number().int().min(1),
  availableTreatments: z.array(treatmentSchema).min(1),
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
  displayOrder: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const catalogItemsResponseSchema = z.object({
  items: z.array(catalogItemSchema),
});
export type CatalogItemsResponse = z.infer<typeof catalogItemsResponseSchema>;
