import { SetMetadata } from '@nestjs/common';
import { AppRole } from '../enums';

export const ROLES_KEY = 'roles';
/**
 * Declarative role guard, e.g. @Roles(AppRole.ADMIN, AppRole.SERVICE)
 * Matches the spec's per-endpoint auth notes (e.g. "service-role only",
 * "admin/support_agent with audit-logged access").
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
