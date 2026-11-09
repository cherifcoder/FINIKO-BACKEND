import mongoose, { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';
import type { PackRollover, Treatment } from '@finiko/contracts';

export interface Pack {
  code: string;
  name: string;
  description: string;
  priceXOF: number;
  billingPeriodDays: number;
  quotaUnits: number;
  includedTreatments: Treatment[];
  overagePolicy: 'prix_catalogue';
  deliveryIncluded: boolean;
  deliveryDiscountPercent: number;
  maxItemsPerOrder: number;
  rollover: PackRollover;
  features: string[];
  badge: string | null;
  color: string;
  displayOrder: number;
  isActive: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const rolloverSchema = new Schema<PackRollover>(
  {
    enabled: { type: Boolean, default: false },
    maxPercent: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
);

export const packSchema = new Schema<Pack>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 40,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    priceXOF: { type: Number, required: true, min: 1, validate: Number.isInteger },
    billingPeriodDays: { type: Number, default: 30, min: 1, max: 365 },
    quotaUnits: { type: Number, required: true, min: 1, validate: Number.isInteger },
    includedTreatments: {
      type: [{ type: String, enum: ['lavage', 'repassage', 'lavage_repassage'] }],
      default: ['lavage', 'repassage', 'lavage_repassage'],
    },
    overagePolicy: { type: String, enum: ['prix_catalogue'], default: 'prix_catalogue' },
    deliveryIncluded: { type: Boolean, default: false },
    deliveryDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    maxItemsPerOrder: { type: Number, default: 50, min: 1, max: 200 },
    rollover: { type: rolloverSchema, default: () => ({ enabled: false, maxPercent: 0 }) },
    features: [{ type: String, trim: true, maxlength: 160 }],
    badge: { type: String, trim: true, maxlength: 30, default: null },
    color: { type: String, trim: true, default: '#2563EB' },
    displayOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
    validFrom: { type: Date, default: null },
    validTo: { type: Date, default: null },
    version: { type: Number, default: 1 },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

packSchema.index({ isActive: 1, displayOrder: 1 });
packSchema.index({ name: 'text', description: 'text' });

export type PackDocument = HydratedDocument<Pack>;
export type PackModel = Model<Pack>;

export const PackModel: PackModel =
  (mongoose.models.Pack as PackModel | undefined) ?? model<Pack>('Pack', packSchema);
