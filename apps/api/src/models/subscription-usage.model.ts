import mongoose, { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';
import type { SubscriptionUsageType } from '@finiko/contracts';

export interface SubscriptionUsage {
  subscription: Types.ObjectId;
  client: Types.ObjectId;
  order: Types.ObjectId | null;
  type: SubscriptionUsageType;
  units: number;
  usedDelta: number;
  reservedDelta: number;
  quotaTotalDelta: number;
  quotaUsedAfter: number;
  quotaReservedAfter: number;
  quotaTotalAfter: number;
  reason: string;
  actor: Types.ObjectId | null;
  requestId: string | null;
  createdAt: Date;
}

export const subscriptionUsageSchema = new Schema<SubscriptionUsage>(
  {
    subscription: { type: Types.ObjectId, ref: 'Subscription', required: true, index: true },
    client: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: Types.ObjectId, ref: 'Order', default: null, index: true },
    type: {
      type: String,
      enum: [
        'reservation',
        'consommation',
        'liberation',
        'remboursement',
        'ajustement',
        'expiration',
      ],
      required: true,
    },
    units: { type: Number, required: true, min: 1, validate: Number.isInteger },
    usedDelta: { type: Number, required: true, validate: Number.isInteger },
    reservedDelta: { type: Number, required: true, validate: Number.isInteger },
    quotaTotalDelta: { type: Number, default: 0, validate: Number.isInteger },
    quotaUsedAfter: { type: Number, required: true, min: 0 },
    quotaReservedAfter: { type: Number, required: true, min: 0 },
    quotaTotalAfter: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    actor: { type: Types.ObjectId, ref: 'User', default: null },
    requestId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

subscriptionUsageSchema.index({ subscription: 1, createdAt: -1 });
subscriptionUsageSchema.index({ client: 1, createdAt: -1 });
// Une seule opération de chaque type par commande : garantit l'idempotence.
subscriptionUsageSchema.index(
  { order: 1, type: 1 },
  { unique: true, partialFilterExpression: { order: { $type: 'objectId' } } },
);

export type SubscriptionUsageDocument = HydratedDocument<SubscriptionUsage>;
export type SubscriptionUsageModel = Model<SubscriptionUsage>;

export const SubscriptionUsageModel: SubscriptionUsageModel =
  (mongoose.models.SubscriptionUsage as SubscriptionUsageModel | undefined) ??
  model<SubscriptionUsage>('SubscriptionUsage', subscriptionUsageSchema);
