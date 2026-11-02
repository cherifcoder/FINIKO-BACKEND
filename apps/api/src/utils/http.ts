import type { ApiSuccess, PaginationMeta } from '@finiko/contracts';

export function success<T>(
  data: T,
  options: { meta?: PaginationMeta; message?: string } = {},
): ApiSuccess<T> {
  return {
    success: true,
    data,
    ...(options.meta ? { meta: options.meta } : {}),
    ...(options.message ? { message: options.message } : {}),
  };
}
