import type {
  AuthSession,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  OtpChallenge,
  PublicUser,
  RegisterInput,
  RegisterResponse,
  RequestOtpInput,
  ResetPasswordInput,
  UpdateProfileInput,
  VerifyOtpInput,
} from '@finiko/contracts';
import { apiFetch } from './client';

export function loginRequest(input: LoginInput): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
    auth: false,
    skipRefresh: true,
  });
}

export function registerRequest(input: RegisterInput): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
    auth: false,
    skipRefresh: true,
  });
}

export function verifyOtpRequest(input: VerifyOtpInput): Promise<AuthSession> {
  return apiFetch<AuthSession>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify(input),
    auth: false,
    skipRefresh: true,
  });
}

export function requestOtpRequest(input: RequestOtpInput): Promise<OtpChallenge> {
  return apiFetch<OtpChallenge>('/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify(input),
    auth: false,
    skipRefresh: true,
  });
}

export function forgotPasswordRequest(input: ForgotPasswordInput): Promise<OtpChallenge> {
  return apiFetch<OtpChallenge>('/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify(input),
    auth: false,
    skipRefresh: true,
  });
}

export function resetPasswordRequest(input: ResetPasswordInput): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(input),
    auth: false,
    skipRefresh: true,
  });
}

export function logoutRequest(refreshToken: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export function getMeRequest(): Promise<{ user: PublicUser }> {
  return apiFetch<{ user: PublicUser }>('/auth/me');
}

export function updateMeRequest(input: UpdateProfileInput): Promise<{ user: PublicUser }> {
  return apiFetch<{ user: PublicUser }>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function changePasswordRequest(
  input: ChangePasswordInput,
): Promise<{ message: string; sessionsRevoked: boolean }> {
  return apiFetch<{ message: string; sessionsRevoked: boolean }>('/auth/password/change', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
