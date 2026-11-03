import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { USER_ROLES, type UserRole } from '@finiko/contracts';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'finiko-api';
const AUDIENCE = 'finiko-app';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  /** Identifiant de la session (permet de révoquer un access token avant expiration). */
  sid: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role, sid: payload.sid, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_SECONDS}s`)
    .setJti(randomUUID())
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      clockTolerance: 5,
    });

    const role = payload.role as UserRole | undefined;

    if (
      payload.typ !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !role ||
      !USER_ROLES.includes(role)
    ) {
      return null;
    }

    return { sub: payload.sub, role, sid: payload.sid };
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return `rt_${randomBytes(32).toString('base64url')}`;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenHashEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newSessionFamilyId(): string {
  return randomUUID();
}

export function refreshTokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}
