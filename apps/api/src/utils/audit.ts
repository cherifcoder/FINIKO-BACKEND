import type { Request } from 'express';
import type { UserRole } from '@finiko/contracts';
import { logger } from '../config/logger';
import { AuditLogModel } from '../models/audit-log.model';

interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  actorRole?: UserRole | 'system';
}

/**
 * Écrit une trace d'audit sans faire échouer l'action métier si l'écriture échoue.
 */
export async function writeAudit(req: Request, entry: AuditEntry): Promise<void> {
  try {
    await AuditLogModel.create({
      actor: req.auth?.userId ?? null,
      actorRole: entry.actorRole ?? req.auth?.role ?? 'system',
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: req.ip ?? null,
      requestId: typeof req.id === 'string' ? req.id : String(req.id),
    });
  } catch (error) {
    logger.error({ err: error, action: entry.action }, "Échec de l'écriture d'audit");
  }
}
