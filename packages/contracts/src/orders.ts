import { z } from 'zod';
import { addressSchema, objectIdSchema } from './common';
import { treatmentSchema } from './catalog';

export const orderItemInputSchema = z.object({
  catalogItemId: objectIdSchema,
  treatment: treatmentSchema,
  quantity: z.number().int().min(1).max(100),
});
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

export const quoteRequestSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, 'Le panier est vide').max(50),
  pickup: addressSchema,
  delivery: addressSchema,
  useSubscription: z.boolean().default(true),
  promoCode: z.string().trim().min(3).max(30).nullable().default(null),
});
export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

export const orderTotalsSchema = z.object({
  itemsCount: z.number().int().min(0),
  catalogSubtotal: z.number().int().min(0),
  packCoveredAmount: z.number().int().min(0),
  supplementAmount: z.number().int().min(0),
  deliveryFee: z.number().int().min(0),
  discountAmount: z.number().int().min(0),
  totalDue: z.number().int().min(0),
});
export type OrderTotals = z.infer<typeof orderTotalsSchema>;

export const createOrderSchema = quoteRequestSchema.extend({
  quoteToken: z.string().min(20),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
