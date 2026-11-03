import mongoose, { Schema, model, type Model } from 'mongoose';

export const OTP_PURPOSES_DB = [
  'phone_verify',
  'password_reset',
  'login',
  'order_confirm',
] as const;
export type OtpPurposeDb = (typeof OTP_PURPOSES_DB)[number];

export interface OtpCode {
  identifier: string;
  channel: 'sms' | 'email';
  purpose: OtpPurposeDb;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const otpCodeSchema = new Schema<OtpCode>(
  {
    identifier: { type: String, required: true, index: true },
    channel: { type: String, enum: ['sms', 'email'], required: true },
    purpose: { type: String, enum: OTP_PURPOSES_DB, required: true },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpCodeSchema.index({ identifier: 1, purpose: 1, createdAt: -1 });

export type OtpCodeModel = Model<OtpCode>;

export const OtpCodeModel: OtpCodeModel =
  (mongoose.models.OtpCode as OtpCodeModel | undefined) ?? model<OtpCode>('OtpCode', otpCodeSchema);
