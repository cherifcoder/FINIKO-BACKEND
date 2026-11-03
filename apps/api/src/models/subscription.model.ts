import mongoose, { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';
import type { PackRollover, SubscriptionStatus, Treatment } from '@finiko/contracts';

export interface PackSnapshot {
  code: string;
  name: string;
  priceXOF: number;
  quotaUnits: number;
  includedTreatments: Treatment[];
  billingPeriodDays: number;
  deliveryIncluded: boolean;
  deliveryDiscountPercent: number;
  rollover: PackRollover;
}

export interface Subscription {
  client: Types.ObjectId;
  pack: Types.ObjectId;
  packSnapshot: PackSnapshot;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  quotaTotal: number;
  quotaUsed: number;
  quotaReserved: number;
  autoRenew: boolean;
  paymentMethod: 'orange_money' | 'cash';
  payment: Types.ObjectId | null;
  renewalOf: Types.ObjectId | null;
  activatedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  expiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const packSnapshotSchema = new Schema<PackSnapshot>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    priceXOF: { type: Number, required: true, min: 0 },
    quotaUnits: { type: Number, required: true, min: 1 },
    includedTreatments: {
      type: [{ type: String, enum: ['lavage', 'repassage', 'lavage_repassage'] }],
      default: ['lavage', 'repassage', 'lavage_repassage'],
    },
    billingPeriodDays: { type: Number, required: true, min: 1 },
    deliveryIncluded: { type: Boolean, default: false },
    deliveryDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    rollover: {
      enabled: { type: Boolean, default: false },
      maxPercent: { type: Number, default: 0, min: 0, max: 100 },
    },
  },
  { _id: false },
);

export const subscriptionSchema = new Schema<Subscription>(
  {
    client: { type: Types.ObjectId, ref: 'User', required: true },
    pack: { type: Types.ObjectId, ref: 'Pack', required: true },
    packSnapshot: { type: packSnapshotSchema, required: true },
    status: {
      type: String,
      enum: ['en_attente_paiement', 'programmee', 'active', 'expiree', 'annulee', 'suspendue'],
      default: 'en_attente_paiement',
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true, index: true },
    quotaTotal: { type: Number, required: true, min: 0 },
    quotaUsed: { type: Number, default: 0, min: 0 },
    quotaReserved: { type: Number, default: 0, min: 0 },
    autoRenew: { type: Boolean, default: false },
    paymentMethod: { type: String, enum: ['orange_money', 'cash'], default: 'orange_money' },
    payment: { type: Types.ObjectId, ref: 'Payment', default: null },
    renewalOf: { type: Types.ObjectId, ref: 'Subscription', default: null },
    activatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 300, default: null },
    expiredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Un seul abonnement actif par client.
subscriptionSchema.index(
  { client: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
subscriptionSchema.index({ client: 1, status: 1 });
subscriptionSchema.index({ status: 1, endDate: 1 });
subscriptionSchema.index({ pack: 1, status: 1 });

export type SubscriptionDocument = HydratedDocument<Subscription>;
export type SubscriptionModel = Model<Subscription>;

export const SubscriptionModel: SubscriptionModel =
  (mongoose.models.Subscription as SubscriptionModel | undefined) ??
  model<Subscription>('Subscription', subscriptionSchema);
