import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserRole } from '@finiko/contracts';
import { SessionModel } from '../models/session.model';
import { UserModel } from '../models/user.model';
import { verifyAccessToken } from '../security/tokens';
import { ApiError } from './error';

export const authenticate: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized();
    }

    const payload = await verifyAccessToken(header.slice(7));

    if (!payload) {
      throw new ApiError(401, 'TOKEN_INVALID', 'Token invalide ou expiré.');
    }

    const session = await SessionModel.findOne({
      _id: payload.sid,
      user: payload.sub,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select('_id')
      .lean();

    if (!session) {
      throw new ApiError(401, 'TOKEN_REVOKED', 'Session expirée ou révoquée.');
    }

    const user = await UserModel.findOne({ _id: payload.sub, deletedAt: null })
      .select('role status')
      .lean();

    if (!user) {
      throw ApiError.unauthorized();
    }

    if (user.status !== 'actif') {
      throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu.');
    }

    req.auth = {
      userId: payload.sub,
      role: user.role,
      sessionId: payload.sid,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }

    if (!roles.includes(req.auth.role)) {
      next(ApiError.forbidden("Votre rôle ne permet pas d'accéder à cette ressource."));
      return;
    }

    next();
  };
}

/** Autorise le propriétaire de la ressource, ou un administrateur. */
export function requireSelf(paramName = 'id'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }

    if (req.auth.role === 'admin' || req.params[paramName] === req.auth.userId) {
      next();
      return;
    }

    next(ApiError.forbidden("Vous ne pouvez accéder qu'à vos propres données."));
  };
}
