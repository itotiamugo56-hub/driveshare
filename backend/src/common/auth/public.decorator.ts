import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or an entire controller) as exempt from the global
 * JwtAuthGuard. Use on endpoints that must be reachable without a
 * bearer token yet -- e.g. register/login, or public read endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);