import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Veuillez vous connecter.'): ApiError {
    return new ApiError(401, 'AUTH_REQUIRED', message);
  }

  static forbidden(message = 'Action non autorisée.'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Ressource introuvable.'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(409, code, message, details);
  }

  static unprocessable(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(422, code, message, details);
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} introuvable.`));
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.id;

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Certains champs sont invalides.',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
        requestId,
      },
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        requestId,
      },
    });
    return;
  }

  if (isDuplicateKeyError(error)) {
    res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_KEY',
        message: 'Cette ressource existe déjà.',
        requestId,
      },
    });
    return;
  }

  logger.error({ err: error, requestId }, 'Erreur non gérée');

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur est survenue.',
      ...(env.NODE_ENV === 'development' && error instanceof Error
        ? { details: { message: error.message } }
        : {}),
      requestId,
    },
  });
}
