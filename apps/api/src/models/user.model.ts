import mongoose, { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';
import { USER_ROLES, USER_STATUSES, type UserRole, type UserStatus } from '@finiko/contracts';

export interface PushToken {
  token: string;
  platform: 'android' | 'ios';
  updatedAt: Date;
}

export interface User {
  role: UserRole;
  firstName: string;
  lastName: string;
  /** Absent (et non null) pour rester compatible avec l'index unique sparse. */
  email?: string;
  phone: string;
  phoneVerifiedAt: Date | null;
  passwordHash: string;
  status: UserStatus;
  mustChangePassword: boolean;
  avatarUrl: string | null;
  locale: 'fr' | 'bm';
  pushTokens: PushToken[];
  lastLoginAt: Date | null;
  createdBy: Types.ObjectId | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const userSchema = new Schema<User>(
  {
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: /^\+[1-9]\d{7,14}$/,
    },
    phoneVerifiedAt: { type: Date, default: null },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: USER_STATUSES, default: 'actif', index: true },
    mustChangePassword: { type: Boolean, default: false },
    avatarUrl: { type: String, default: null },
    locale: { type: String, enum: ['fr', 'bm'], default: 'fr' },
    pushTokens: [
      {
        _id: false,
        token: { type: String, required: true },
        platform: { type: String, enum: ['android', 'ios'], required: true },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'pushTokens.token': 1 });

userSchema.virtual('fullName').get(function (this: User) {
  return `${this.firstName} ${this.lastName}`.trim();
});

export type UserDocument = HydratedDocument<User>;
export type UserModel = Model<User>;

export const UserModel: UserModel =
  (mongoose.models.User as UserModel | undefined) ?? model<User>('User', userSchema);
