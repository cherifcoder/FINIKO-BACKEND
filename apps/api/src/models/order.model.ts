import mongoose, { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';
import {
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  type Category,
  type OrderPaymentMethod,
  type OrderPaymentStatus,
  type OrderStatus,
  type Treatment,
} from '@finiko/contracts';

export type OrderItemTreatmentStatus = 'a_traiter' | 'en_cours' | 'termine';

export interface OrderItem {
  catalogItem: Types.ObjectId;
  code: string;
  name: string;
  category: Category;
  treatment: Treatment;
  quantity: number;
  quotaWeight: number;
  unitPrice: number;
  lineTotal: number;
  coveredQuantity: number;
  billableQuantity: number;
  coveredAmount: number;
  billableAmount: number;
  treatmentStatus: OrderItemTreatmentStatus;
  treatmentStartedAt: Date | null;
  treatmentCompletedAt: Date | null;
}

export interface OrderLocation {
  type: 'Point';
  coordinates: [number, number];
}

export interface OrderAddress {
  label: string;
  text: string;
  location: OrderLocation;
  contactName: string;
  contactPhone: string;
  instructions: string;
}

export interface OrderTotals {
  itemsCount: number;
  catalogSubtotal: number;
  packCoveredAmount: number;
  supplementAmount: number;
  deliveryFee: number;
  discountAmount: number;
  totalDue: number;
  totalPaid: number;
  refundedAmount: number;
}

export interface OrderPack {
  subscription: Types.ObjectId | null;
  coveredUnits: number;
  overageUnits: number;
}

export interface OrderPayment {
  method: OrderPaymentMethod;
  status: OrderPaymentStatus;
  payment: Types.ObjectId | null;
  paidAt: Date | null;
}

export interface OrderCancellation {
  by: Types.ObjectId | null;
  reason: string | null;
  at: Date | null;
  refundStatus: 'non_applicable' | 'en_attente' | 'effectue' | 'refuse';
  refundAmount: number;
}

export interface OrderDispute {
  reason: string | null;
  at: Date | null;
  status: 'ouvert' | 'en_examen' | 'resolu' | 'ferme';
}

export interface Order {
  orderNumber: string;
  client: Types.ObjectId;
  pressing: Types.ObjectId | null;
  driver: Types.ObjectId | null;
  items: OrderItem[];
  totals: OrderTotals;
  pack: OrderPack;
  pickup: OrderAddress;
  delivery: OrderAddress;
  status: OrderStatus;
  lastStatusAt: Date;
  payment: OrderPayment;
  cancellation: OrderCancellation;
  dispute: OrderDispute;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<OrderItem>(
  {
    catalogItem: { type: Types.ObjectId, ref: 'CatalogItem', required: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['homme', 'femme', 'enfant', 'maison', 'blanchiment'],
      required: true,
    },
    treatment: {
      type: String,
      enum: ['lavage', 'repassage', 'lavage_repassage'],
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, max: 100, validate: Number.isInteger },
    quotaWeight: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    coveredQuantity: { type: Number, default: 0, min: 0 },
    billableQuantity: { type: Number, default: 0, min: 0 },
    coveredAmount: { type: Number, default: 0, min: 0 },
    billableAmount: { type: Number, default: 0, min: 0 },
    treatmentStatus: {
      type: String,
      enum: ['a_traiter', 'en_cours', 'termine'],
      default: 'a_traiter',
    },
    treatmentStartedAt: { type: Date, default: null },
    treatmentCompletedAt: { type: Date, default: null },
  },
  { _id: false },
);

const locationSchema = new Schema<OrderLocation>(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const addressSchema = new Schema<OrderAddress>(
  {
    label: { type: String, default: 'Adresse', trim: true, maxlength: 60 },
    text: { type: String, required: true, trim: true, maxlength: 300 },
    location: { type: locationSchema, required: true },
    contactName: { type: String, required: true, trim: true, maxlength: 80 },
    contactPhone: { type: String, required: true, trim: true, maxlength: 20 },
    instructions: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const totalsSchema = new Schema<OrderTotals>(
  {
    itemsCount: { type: Number, required: true, min: 1 },
    catalogSubtotal: { type: Number, required: true, min: 0 },
    packCoveredAmount: { type: Number, default: 0, min: 0 },
    supplementAmount: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalDue: { type: Number, required: true, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    refundedAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const packSchema = new Schema<OrderPack>(
  {
    subscription: { type: Types.ObjectId, ref: 'Subscription', default: null },
    coveredUnits: { type: Number, default: 0, min: 0 },
    overageUnits: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const paymentSchema = new Schema<OrderPayment>(
  {
    method: { type: String, enum: ORDER_PAYMENT_METHODS, required: true },
    status: { type: String, enum: ORDER_PAYMENT_STATUSES, default: 'en_attente' },
    payment: { type: Types.ObjectId, ref: 'Payment', default: null },
    paidAt: { type: Date, default: null },
  },
  { _id: false },
);

const cancellationSchema = new Schema<OrderCancellation>(
  {
    by: { type: Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, maxlength: 500, default: null },
    at: { type: Date, default: null },
    refundStatus: {
      type: String,
      enum: ['non_applicable', 'en_attente', 'effectue', 'refuse'],
      default: 'non_applicable',
    },
    refundAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const disputeSchema = new Schema<OrderDispute>(
  {
    reason: { type: String, trim: true, maxlength: 500, default: null },
    at: { type: Date, default: null },
    status: {
      type: String,
      enum: ['ouvert', 'en_examen', 'resolu', 'ferme'],
      default: 'ferme',
    },
  },
  { _id: false },
);

export const orderSchema = new Schema<Order>(
  {
    orderNumber: { type: String, required: true, unique: true, match: /^#FK-\d+$/ },
    client: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    pressing: { type: Types.ObjectId, ref: 'PressingProfile', default: null, index: true },
    driver: { type: Types.ObjectId, ref: 'DriverProfile', default: null, index: true },
    items: {
      type: [orderItemSchema],
      validate: [(items: OrderItem[]) => items.length > 0, 'Au moins un article est requis.'],
    },
    totals: { type: totalsSchema, required: true },
    pack: { type: packSchema, default: () => ({}) },
    pickup: { type: addressSchema, required: true },
    delivery: { type: addressSchema, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'en_attente_paiement', index: true },
    lastStatusAt: { type: Date, default: Date.now },
    payment: { type: paymentSchema, required: true },
    cancellation: { type: cancellationSchema, default: () => ({}) },
    dispute: { type: disputeSchema, default: () => ({}) },
  },
  { timestamps: true },
);

orderSchema.index({ client: 1, createdAt: -1 });
orderSchema.index({ driver: 1, status: 1 });
orderSchema.index({ pressing: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'pickup.location': '2dsphere' });
orderSchema.index({ 'delivery.location': '2dsphere' });

export type OrderDocument = HydratedDocument<Order>;
export type OrderModel = Model<Order>;

export const OrderModel: OrderModel =
  (mongoose.models.Order as OrderModel | undefined) ?? model<Order>('Order', orderSchema);
