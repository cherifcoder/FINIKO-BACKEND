import type { UserRole } from '@finiko/contracts';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: {
        userId: string;
        role: UserRole;
        sessionId: string;
      };
      validatedQuery?: unknown;
    }
  }
}

export {};
