import mongoose, { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';
import type { CatalogPrices, Category, Treatment } from '@finiko/contracts';

export interface CatalogItem {
  code: string;
  name: string;
  description: string;
  category: Category;
  material: string;
  prices: CatalogPrices;
  quotaWeight: number;
  availableTreatments: Treatment[];
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  version: number;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const pricesSchema = new Schema<CatalogPrices>(
  {
    lavage: { type: Number, required: true, min: 1, validate: Number.isInteger },
    repassage: { type: Number, required: true, min: 1, validate: Number.isInteger },
    lavage_repassage: { type: Number, required: true, min: 1, validate: Number.isInteger },
  },
  { _id: false },
);

export const catalogItemSchema = new Schema<CatalogItem>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 40,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    category: {
      type: String,
      enum: ['homme', 'femme', 'enfant', 'maison', 'blanchiment'],
      required: true,
      index: true,
    },
    material: { type: String, trim: true, maxlength: 80, default: '' },
    prices: { type: pricesSchema, required: true },
    quotaWeight: { type: Number, default: 1, min: 1, max: 10, validate: Number.isInteger },
    availableTreatments: {
      type: [{ type: String, enum: ['lavage', 'repassage', 'lavage_repassage'] }],
      default: ['lavage', 'repassage', 'lavage_repassage'],
    },
    imageUrl: { type: String, default: null },
    isActive: { type: Boolean, default: true, index: true },
    displayOrder: { type: Number, default: 0, min: 0 },
    version: { type: Number, default: 1 },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

catalogItemSchema.index({ category: 1, isActive: 1, displayOrder: 1 });
catalogItemSchema.index({ name: 'text', description: 'text' });

export type CatalogItemDocument = HydratedDocument<CatalogItem>;
export type CatalogItemModel = Model<CatalogItem>;

export const CatalogItemModel: CatalogItemModel =
  (mongoose.models.CatalogItem as CatalogItemModel | undefined) ??
  model<CatalogItem>('CatalogItem', catalogItemSchema);
