import mongoose, { Schema, Types, model, type Model } from 'mongoose';
import { USER_ROLES, type UserRole } from '@finiko/contracts';

export interface AuditLog {
  actor: Types.ObjectId | null;
  actorRole: UserRole | 'system';
  action: string;
  entityType: string;
  entityId: Types.ObjectId | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
  createdAt: Date;
}

export const auditLogSchema = new Schema<AuditLog>(
  {
    actor: { type: Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, enum: [...USER_ROLES, 'system'], required: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: Types.ObjectId, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    requestId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

export type AuditLogModel = Model<AuditLog>;

export const AuditLogModel: AuditLogModel =
  (mongoose.models.AuditLog as AuditLogModel | undefined) ??
  model<AuditLog>('AuditLog', auditLogSchema);
