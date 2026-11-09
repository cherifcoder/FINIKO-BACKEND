import { z } from 'zod';
import { objectIdSchema, paginationSchema, positiveMoneySchema } from './common';
import { treatmentSchema } from './catalog';
import { SUBSCRIPTION_STATUSES, TREATMENTS } from './enums';

export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

export const packRolloverSchema = z.object({
  enabled: z.boolean().default(false),
  maxPercent: z.number().int().min(0).max(100).default(0),
});
export type PackRollover = z.infer<typeof packRolloverSchema>;

const treatmentsBaseSchema = z
  .array(treatmentSchema)
  .min(1, 'Au moins une prestation doit être incluse')
  .max(TREATMENTS.length)
  .refine((values) => new Set(values).size === values.length, {
    message: 'Les prestations doivent être uniques',
  });

/** Base sans défaut pour que les PATCH ne réappliquent pas les valeurs par défaut. */
const packBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,40}$/, 'Code invalide (a-z, 0-9, underscore)'),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500),
  priceXOF: positiveMoneySchema,
  billingPeriodDays: z.number().int().min(1).max(365),
  quotaUnits: z.number().int().min(1).max(1000),
  includedTreatments: treatmentsBaseSchema,
  overagePolicy: z.enum(['prix_catalogue']),
  deliveryIncluded: z.boolean(),
  deliveryDiscountPercent: z.number().int().min(0).max(100),
  maxItemsPerOrder: z.number().int().min(1).max(200),
  rollover: packRolloverSchema,
  features: z.array(z.string().trim().min(1).max(160)).max(20),
  badge: z.union([z.string().trim().max(30), z.null()]).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue'),
  displayOrder: z.number().int().min(0),
  isActive: z.boolean(),
  validFrom: z.union([z.iso.datetime(), z.null()]).optional(),
  validTo: z.union([z.iso.datetime(), z.null()]).optional(),
});

export const packInputSchema = packBaseSchema
  .extend({
    description: packBaseSchema.shape.description.default(''),
    billingPeriodDays: packBaseSchema.shape.billingPeriodDays.default(30),
    includedTreatments: packBaseSchema.shape.includedTreatments.default([...TREATMENTS]),
    overagePolicy: packBaseSchema.shape.overagePolicy.default('prix_catalogue'),
    deliveryIncluded: packBaseSchema.shape.deliveryIncluded.default(false),
    deliveryDiscountPercent: packBaseSchema.shape.deliveryDiscountPercent.default(0),
    maxItemsPerOrder: packBaseSchema.shape.maxItemsPerOrder.default(50),
    rollover: packBaseSchema.shape.rollover.default({ enabled: false, maxPercent: 0 }),
    features: packBaseSchema.shape.features.default([]),
    color: packBaseSchema.shape.color.default('#2563EB'),
    displayOrder: packBaseSchema.shape.displayOrder.default(0),
    isActive: packBaseSchema.shape.isActive.default(true),
  })
  .superRefine((value, ctx) => {
    if (
      value.validFrom &&
      value.validTo &&
      new Date(value.validFrom).getTime() >= new Date(value.validTo).getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['validTo'],
        message: 'La fin de validité doit être postérieure au début',
      });
    }
  });
export type PackInput = z.infer<typeof packInputSchema>;

export const packUpdateSchema = packBaseSchema
  .omit({ code: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Aucun champ à mettre à jour',
  })
  .superRefine((value, ctx) => {
    if (
      value.validFrom &&
      value.validTo &&
      new Date(value.validFrom).getTime() >= new Date(value.validTo).getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['validTo'],
        message: 'La fin de validité doit être postérieure au début',
      });
    }
  });
export type PackUpdateInput = z.infer<typeof packUpdateSchema>;

export const packStatusSchema = z.object({
  isActive: z.boolean(),
});
export type PackStatusInput = z.infer<typeof packStatusSchema>;

export const packListQuerySchema = paginationSchema.extend({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});
export type PackListQuery = z.infer<typeof packListQuerySchema>;

export const packSchema = z.object({
  id: objectIdSchema,
  code: z.string(),
  name: z.string(),
  description: z.string(),
  priceXOF: z.number().int().min(0),
  billingPeriodDays: z.number().int().min(1),
  quotaUnits: z.number().int().min(1),
  includedTreatments: z.array(treatmentSchema).min(1),
  overagePolicy: z.literal('prix_catalogue'),
  deliveryIncluded: z.boolean(),
  deliveryDiscountPercent: z.number().int().min(0),
  maxItemsPerOrder: z.number().int().min(1),
  rollover: packRolloverSchema,
  features: z.array(z.string()),
  badge: z.string().nullable(),
  color: z.string(),
  displayOrder: z.number().int().min(0),
  isActive: z.boolean(),
  validFrom: z.iso.datetime().nullable(),
  validTo: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Pack = z.infer<typeof packSchema>;

export const packsResponseSchema = z.object({
  packs: z.array(packSchema),
});
export type PacksResponse = z.infer<typeof packsResponseSchema>;

export const subscriptionCreateSchema = z.object({
  packId: objectIdSchema,
  paymentMethod: z.enum(['orange_money', 'cash']).default('orange_money'),
});
export type SubscriptionCreateInput = z.infer<typeof subscriptionCreateSchema>;

export const subscriptionCancelSchema = z.object({
  reason: z.string().trim().min(3).max(300).optional(),
});
export type SubscriptionCancelInput = z.infer<typeof subscriptionCancelSchema>;

/**
 * Ajustement administratif du quota.
 * `units` positif crédite le quota total, négatif le réduit.
 */
export const subscriptionAdjustQuotaSchema = z.object({
  units: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((value) => value !== 0, { message: "L'ajustement ne peut pas être nul" }),
  reason: z.string().trim().min(3, 'Motif requis').max(300),
});
export type SubscriptionAdjustQuotaInput = z.infer<typeof subscriptionAdjustQuotaSchema>;

export const subscriptionListQuerySchema = paginationSchema.extend({
  status: subscriptionStatusSchema.optional(),
  clientId: objectIdSchema.optional(),
  packId: objectIdSchema.optional(),
});
export type SubscriptionListQuery = z.infer<typeof subscriptionListQuerySchema>;

export const SUBSCRIPTION_USAGE_TYPES = [
  'reservation',
  'consommation',
  'liberation',
  'remboursement',
  'ajustement',
  'expiration',
] as const;
export const subscriptionUsageTypeSchema = z.enum(SUBSCRIPTION_USAGE_TYPES);
export type SubscriptionUsageType = (typeof SUBSCRIPTION_USAGE_TYPES)[number];

export const subscriptionUsageQuerySchema = paginationSchema.extend({
  subscriptionId: objectIdSchema.optional(),
  type: subscriptionUsageTypeSchema.optional(),
});
export type SubscriptionUsageQuery = z.infer<typeof subscriptionUsageQuerySchema>;

export const subscriptionPackSchema = z.object({
  id: objectIdSchema,
  code: z.string(),
  name: z.string(),
  quotaUnits: z.number().int().min(1),
  priceXOF: z.number().int().min(0),
  billingPeriodDays: z.number().int().min(1),
  includedTreatments: z.array(treatmentSchema).min(1),
  deliveryIncluded: z.boolean(),
  deliveryDiscountPercent: z.number().int().min(0),
});
export type SubscriptionPack = z.infer<typeof subscriptionPackSchema>;

export const subscriptionSchema = z.object({
  id: objectIdSchema,
  status: subscriptionStatusSchema,
  pack: subscriptionPackSchema,
  startDate: z.iso.datetime(),
  endDate: z.iso.datetime(),
  quotaTotal: z.number().int().min(0),
  quotaUsed: z.number().int().min(0),
  quotaReserved: z.number().int().min(0),
  quotaAvailable: z.number().int().min(0),
  autoRenew: z.boolean(),
  createdAt: z.iso.datetime(),
  activatedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const subscriptionOverviewSchema = z.object({
  active: subscriptionSchema.nullable(),
  scheduled: subscriptionSchema.nullable(),
  pending: subscriptionSchema.nullable(),
});
export type SubscriptionOverview = z.infer<typeof subscriptionOverviewSchema>;

export const subscriptionUsageSchema = z.object({
  id: objectIdSchema,
  subscriptionId: objectIdSchema,
  type: subscriptionUsageTypeSchema,
  units: z.number().int().min(1),
  usedDelta: z.number().int(),
  reservedDelta: z.number().int(),
  quotaTotalDelta: z.number().int(),
  quotaUsedAfter: z.number().int().min(0),
  quotaReservedAfter: z.number().int().min(0),
  quotaTotalAfter: z.number().int().min(0),
  reason: z.string(),
  orderId: objectIdSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type SubscriptionUsage = z.infer<typeof subscriptionUsageSchema>;

export const subscriptionUsagesResponseSchema = z.object({
  usages: z.array(subscriptionUsageSchema),
});
export type SubscriptionUsagesResponse = z.infer<typeof subscriptionUsagesResponseSchema>;

export const subscriptionsResponseSchema = z.object({
  subscriptions: z.array(subscriptionSchema),
});
export type SubscriptionsResponse = z.infer<typeof subscriptionsResponseSchema>;
