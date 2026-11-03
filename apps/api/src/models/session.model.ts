import mongoose, { Schema, Types, model, type Model } from 'mongoose';

export interface Session {
  user: Types.ObjectId;
  tokenHash: string;
  /** Chaîne de rotation : toutes les sessions issues d'un même login. */
  familyId: string;
  deviceId: string | null;
  deviceInfo: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Identifiant de la session qui remplace celle-ci après rotation. */
  replacedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const sessionSchema = new Schema<Session>(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    deviceId: { type: String, default: null },
    deviceInfo: { type: String, default: null },
    ip: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1, revokedAt: 1 });

export type SessionModel = Model<Session>;

export const SessionModel: SessionModel =
  (mongoose.models.Session as SessionModel | undefined) ?? model<Session>('Session', sessionSchema);
