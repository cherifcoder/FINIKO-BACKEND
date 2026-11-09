import { z } from 'zod';
import { addressSchema, objectIdSchema, paginationSchema } from './common';
import { treatmentSchema } from './catalog';
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  type Category,
  type ItemTreatmentStatus,
  type OrderPaymentMethod,
  type OrderPaymentStatus,
  type OrderStatus,
  type Treatment,
} from './enums';

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
  /** Paiement mobile propose par l'application. Le pack prend le dessus si totalDue = 0. */
  paymentMethod: z.enum(['orange_money', 'cash']).default('cash'),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const disputeOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Précisez le motif du litige').max(300),
});
export type DisputeOrderInput = z.infer<typeof disputeOrderSchema>;

export const clientOrderListQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});
export type ClientOrderListQuery = z.infer<typeof clientOrderListQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Devis et suivi client                                                      */
/* -------------------------------------------------------------------------- */

export interface OrderQuoteItem {
  catalogItemId: string;
  name: string;
  treatment: Treatment;
  quantity: number;
  quotaWeight: number;
  unitPrice: number;
  lineTotal: number;
  coveredQuantity: number;
  billableQuantity: number;
  coveredAmount: number;
  billableAmount: number;
}

export interface OrderQuotePack {
  subscriptionId: string;
  packName: string;
  quotaTotal: number;
  quotaUsedBefore: number;
  quotaAvailableBefore: number;
  coveredUnits: number;
  overageUnits: number;
  quotaAvailableAfter: number;
}

export interface OrderQuoteDelivery {
  zone: string;
  distanceKm: number;
  feeXOF: number;
  serviceable: boolean;
}

export interface OrderQuote {
  items: OrderQuoteItem[];
  totals: OrderTotals;
  pack: OrderQuotePack | null;
  delivery: OrderQuoteDelivery;
  quoteToken: string;
  expiresAt: string;
}

export interface ClientOrderItem extends OrderQuoteItem {
  category: Category;
  treatmentStatus: ItemTreatmentStatus;
  treatmentStartedAt: string | null;
  treatmentCompletedAt: string | null;
}

export interface ClientOrderTotals extends OrderTotals {
  totalPaid: number;
  refundedAmount: number;
}

export interface ClientOrderAddress {
  label: string;
  text: string;
  coordinates: { lat: number; lng: number };
  contactName: string;
  contactPhone: string;
  instructions: string;
}

export interface ClientOrderPack {
  subscriptionId: string;
  packName: string | null;
  coveredUnits: number;
  overageUnits: number;
}

export interface ClientOrderContact {
  id: string;
  name: string;
  phone: string;
  vehicle: string | null;
  addressText: string | null;
}

export interface ClientOrderTimelineEntry {
  key: string;
  label: string;
  at: string | null;
  reached: boolean;
  current: boolean;
}

export interface ClientOrderActions {
  canCancel: boolean;
  canConfirmDelivery: boolean;
  canDispute: boolean;
}

export interface ClientOrderDispute {
  reason: string | null;
  at: string | null;
  status: 'ouvert' | 'en_examen' | 'resolu' | 'ferme';
}

export interface ClientOrderPayment {
  method: OrderPaymentMethod;
  status: OrderPaymentStatus;
  paidAt: string | null;
}

export interface ClientOrderCancellation {
  reason: string | null;
  at: string | null;
  refundStatus: 'non_applicable' | 'en_attente' | 'effectue' | 'refuse';
  refundAmount: number;
}

export interface ClientOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  itemsCount: number;
  totalDue: number;
  totalPaid: number;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  pickupText: string;
  deliveryText: string;
  pressingName: string | null;
  driverName: string | null;
  createdAt: string;
  updatedAt: string;
  lastStatusAt: string;
  canCancel: boolean;
}

export interface ClientOrderDetail extends ClientOrderSummary {
  items: ClientOrderItem[];
  totals: ClientOrderTotals;
  pack: ClientOrderPack | null;
  pickup: ClientOrderAddress;
  delivery: ClientOrderAddress;
  client: ClientOrderContact;
  payment: ClientOrderPayment;
  cancellation: ClientOrderCancellation;
  pressing: ClientOrderContact | null;
  driver: ClientOrderContact | null;
  dispute: ClientOrderDispute;
  timeline: ClientOrderTimelineEntry[];
  actions: ClientOrderActions;
}

export interface ClientOrdersResponse {
  orders: ClientOrderSummary[];
}

export interface ClientOrderResponse {
  order: ClientOrderDetail;
}

export interface ClientOrderPaymentInfo {
  id: string;
  reference: string;
  amountXOF: number;
  status: string;
  checkoutUrl: string | null;
}

export interface CreateClientOrderResponse {
  order: ClientOrderDetail;
  payment: ClientOrderPaymentInfo | null;
}

export interface ClientOrderCancelResponse {
  order: ClientOrderDetail;
  quotaReleased: boolean;
}

/* -------------------------------------------------------------------------- */
/* Espace pressing                                                            */
/* -------------------------------------------------------------------------- */

export const PRESSING_QUEUE_STATUSES = [
  'deposee_au_pressing',
  'au_pressing',
  'en_traitement',
  'prete',
] as const;
export type PressingQueueStatus = (typeof PRESSING_QUEUE_STATUSES)[number];

export const pressingOrderListQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});
export type PressingOrderListQuery = z.infer<typeof pressingOrderListQuerySchema>;

export const pressingItemUpdateSchema = z.object({
  index: z.number().int().min(0),
  status: z.enum(['a_traiter', 'en_cours', 'termine']),
});
export type PressingItemUpdate = z.infer<typeof pressingItemUpdateSchema>;

export const pressingUpdateItemsSchema = z.object({
  items: z
    .array(pressingItemUpdateSchema)
    .min(1, 'Au moins un article doit être mis à jour')
    .max(100),
});
export type PressingUpdateItemsInput = z.infer<typeof pressingUpdateItemsSchema>;

export const PRESSING_TRANSITION_STATUSES = ['au_pressing', 'en_traitement', 'prete'] as const;
export type PressingTransitionStatus = (typeof PRESSING_TRANSITION_STATUSES)[number];

export const pressingTransitionSchema = z.object({
  status: z.enum(PRESSING_TRANSITION_STATUSES),
});
export type PressingTransitionInput = z.infer<typeof pressingTransitionSchema>;

export interface PressingOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  clientName: string;
  clientPhone: string;
  itemsCount: number;
  pendingItems: number;
  inProgressItems: number;
  completedItems: number;
  totalDue: number;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  pickupText: string;
  deliveryText: string;
  createdAt: string;
  updatedAt: string;
  lastStatusAt: string;
}

export interface PressingOrderDetail extends ClientOrderDetail {
  pendingItems: number;
  inProgressItems: number;
  completedItems: number;
}

export interface PressingOrdersResponse {
  orders: PressingOrderSummary[];
}

export interface PressingOrderResponse {
  order: PressingOrderDetail;
}

/* -------------------------------------------------------------------------- */
/* Missions livreur                                                           */
/* -------------------------------------------------------------------------- */

export const DRIVER_MISSION_PHASES = ['ramassage', 'livraison', 'terminee', 'autre'] as const;
export type DriverMissionPhase = (typeof DRIVER_MISSION_PHASES)[number];

export const driverOrderListQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});
export type DriverOrderListQuery = z.infer<typeof driverOrderListQuerySchema>;

export const DRIVER_TRANSITION_STATUSES = [
  'ramassage_en_cours',
  'ramassee',
  'deposee_au_pressing',
  'livraison_assignee',
  'livraison_en_cours',
  'livree',
] as const;
export type DriverTransitionStatus = (typeof DRIVER_TRANSITION_STATUSES)[number];

export const driverTransitionSchema = z.object({
  status: z.enum(DRIVER_TRANSITION_STATUSES),
});
export type DriverTransitionInput = z.infer<typeof driverTransitionSchema>;

export interface DriverOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  missionPhase: DriverMissionPhase;
  itemsCount: number;
  totalDue: number;
  totalPaid: number;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  pickupText: string;
  deliveryText: string;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  updatedAt: string;
  lastStatusAt: string;
}

export interface DriverOrderDetail extends ClientOrderDetail {
  missionPhase: DriverMissionPhase;
}

export interface DriverOrdersResponse {
  orders: DriverOrderSummary[];
}

export interface DriverOrderResponse {
  order: DriverOrderDetail;
}

/* -------------------------------------------------------------------------- */
/* Administration des commandes                                               */
/* -------------------------------------------------------------------------- */

export const adminOrderListQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(ORDER_PAYMENT_STATUSES).optional(),
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;

export interface AdminOrderClient {
  id: string;
  fullName: string;
  phone: string;
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  client: AdminOrderClient;
  itemsCount: number;
  totalDue: number;
  totalPaid: number;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  pressingName: string | null;
  driverCode: string | null;
  pickupText: string;
  deliveryText: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrdersResponse {
  orders: AdminOrderSummary[];
}
