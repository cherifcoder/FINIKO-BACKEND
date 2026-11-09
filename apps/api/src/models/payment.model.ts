import mongoose, { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';
import {
  PAYMENT_PROVIDERS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  type PaymentProvider,
  type PaymentPurpose,
  type PaymentStatus,
} from '@finiko/contracts';

export interface Payment {
  reference: string;
  idempotencyKey: string;
  purpose: PaymentPurpose;
  client: Types.ObjectId;
  order: Types.ObjectId | null;
  subscription: Types.ObjectId | null;
  provider: PaymentProvider;
  amountXOF: number;
  currency: 'XOF';
  status: PaymentStatus;
  providerTxId: string | null;
  providerStatus: string | null;
  checkoutUrl: string | null;
  returnUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Date | null;
  expiresAt: Date;
  reconciledAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const paymentSchema = new Schema<Payment>(
  {
    reference: { type: String, required: true, unique: true, trim: true },
    idempotencyKey: { type: String, required: true, unique: true, trim: true },
    purpose: { type: String, enum: PAYMENT_PURPOSES, required: true },
    client: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: Types.ObjectId, ref: 'Order', default: null, index: true },
    subscription: { type: Types.ObjectId, ref: 'Subscription', default: null, index: true },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    amountXOF: { type: Number, required: true, min: 1, validate: Number.isInteger },
    currency: { type: String, default: 'XOF', enum: ['XOF'] },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'initie', index: true },
    providerTxId: { type: String, default: null },
    providerStatus: { type: String, default: null },
    checkoutUrl: { type: String, default: null },
    returnUrl: { type: String, default: null },
    failureCode: { type: String, default: null },
    failureMessage: { type: String, default: null },
    paidAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true },
    reconciledAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

paymentSchema.index({ provider: 1, providerTxId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ status: 1, expiresAt: 1 });
paymentSchema.index({ createdAt: -1 });

export type PaymentDocument = HydratedDocument<Payment>;
export type PaymentModel = Model<Payment>;

export const PaymentModel: PaymentModel =
  (mongoose.models.Payment as PaymentModel | undefined) ?? model<Payment>('Payment', paymentSchema);
