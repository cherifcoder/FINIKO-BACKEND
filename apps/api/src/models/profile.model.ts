import mongoose, { Schema, Types, model, type Model } from 'mongoose';

/* -------------------------------------------------------------------------- */
/* Profil client                                                              */
/* -------------------------------------------------------------------------- */

export interface ClientProfile {
  user: Types.ObjectId;
  defaultPickupAddress: Types.ObjectId | null;
  defaultDeliveryAddress: Types.ObjectId | null;
  totalOrders: number;
  lifetimeSpendXOF: number;
  referralCode?: string;
  preferences: {
    perfume: 'lavande' | 'frais' | 'neutre';
  };
  createdAt: Date;
  updatedAt: Date;
}

export const clientProfileSchema = new Schema<ClientProfile>(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    defaultPickupAddress: { type: Types.ObjectId, ref: 'Address', default: null },
    defaultDeliveryAddress: { type: Types.ObjectId, ref: 'Address', default: null },
    totalOrders: { type: Number, default: 0, min: 0 },
    lifetimeSpendXOF: { type: Number, default: 0, min: 0 },
    referralCode: { type: String, unique: true, sparse: true, uppercase: true },
    preferences: {
      perfume: { type: String, enum: ['lavande', 'frais', 'neutre'], default: 'neutre' },
    },
  },
  { timestamps: true },
);

export type ClientProfileModel = Model<ClientProfile>;

export const ClientProfileModel: ClientProfileModel =
  (mongoose.models.ClientProfile as ClientProfileModel | undefined) ??
  model<ClientProfile>('ClientProfile', clientProfileSchema);

/* -------------------------------------------------------------------------- */
/* Profil livreur                                                             */
/* -------------------------------------------------------------------------- */

export interface DriverProfile {
  user: Types.ObjectId;
  code: string;
  vehicle: {
    type: 'moto' | 'voiture' | 'tricycle';
    plate: string | null;
  };
  zoneCodes: string[];
  status: 'disponible' | 'en_mission' | 'hors_ligne';
  currentLocation: {
    type: 'Point';
    coordinates: [number, number];
  };
  lastLocationAt: Date | null;
  activeOrderIds: Types.ObjectId[];
  assignedPressingIds: Types.ObjectId[];
  capacity: number;
  ratingAvg: number;
  ratingCount: number;
  documents: {
    idCardUrl: string | null;
    licenseUrl: string | null;
    photoUrl: string | null;
    verifiedAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const driverProfileSchema = new Schema<DriverProfile>(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    code: { type: String, required: true, unique: true },
    vehicle: {
      type: { type: String, enum: ['moto', 'voiture', 'tricycle'], default: 'moto' },
      plate: { type: String, trim: true, default: null },
    },
    zoneCodes: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['disponible', 'en_mission', 'hors_ligne'],
      default: 'hors_ligne',
      index: true,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], default: [0, 0] },
    },
    lastLocationAt: { type: Date, default: null },
    activeOrderIds: [{ type: Types.ObjectId, ref: 'Order' }],
    assignedPressingIds: [{ type: Types.ObjectId, ref: 'PressingProfile' }],
    capacity: { type: Number, default: 5, min: 1 },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    documents: {
      idCardUrl: { type: String, default: null },
      licenseUrl: { type: String, default: null },
      photoUrl: { type: String, default: null },
      verifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

driverProfileSchema.index({ currentLocation: '2dsphere' });
driverProfileSchema.index({ status: 1, zoneCodes: 1 });

export type DriverProfileModel = Model<DriverProfile>;

export const DriverProfileModel: DriverProfileModel =
  (mongoose.models.DriverProfile as DriverProfileModel | undefined) ??
  model<DriverProfile>('DriverProfile', driverProfileSchema);

/* -------------------------------------------------------------------------- */
/* Profil pressing                                                            */
/* -------------------------------------------------------------------------- */

export interface PressingProfile {
  user: Types.ObjectId;
  code: string;
  businessName: string;
  addressText: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  openingHours: Array<{
    day: number;
    open?: string;
    close?: string;
    closed: boolean;
  }>;
  services: string[];
  capacityPerDay: number;
  currentLoad: number;
  status: 'actif' | 'suspendu' | 'ferme';
  commissionRate: number;
  ratingAvg: number;
  ratingCount: number;
  documents: {
    rccmUrl: string | null;
    ifuUrl: string | null;
    verifiedAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const pressingProfileSchema = new Schema<PressingProfile>(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, unique: true },
    code: { type: String, required: true, unique: true },
    businessName: { type: String, required: true, trim: true, maxlength: 120 },
    addressText: { type: String, required: true, trim: true, maxlength: 300 },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], required: true },
    },
    openingHours: [
      {
        _id: false,
        day: { type: Number, min: 0, max: 6 },
        open: String,
        close: String,
        closed: { type: Boolean, default: false },
      },
    ],
    services: {
      type: [String],
      default: ['lavage', 'repassage', 'lavage_repassage'],
    },
    capacityPerDay: { type: Number, default: 100, min: 1 },
    currentLoad: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['actif', 'suspendu', 'ferme'],
      default: 'actif',
    },
    commissionRate: { type: Number, default: 0.2, min: 0, max: 1 },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    documents: {
      rccmUrl: { type: String, default: null },
      ifuUrl: { type: String, default: null },
      verifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

pressingProfileSchema.index({ location: '2dsphere' });
pressingProfileSchema.index({ status: 1 });

export type PressingProfileModel = Model<PressingProfile>;

export const PressingProfileModel: PressingProfileModel =
  (mongoose.models.PressingProfile as PressingProfileModel | undefined) ??
  model<PressingProfile>('PressingProfile', pressingProfileSchema);
