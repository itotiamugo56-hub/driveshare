import { SetMetadata } from '@nestjs/common';
import { StaffCapability } from '../enums';

export const CAPABILITY_KEY = 'capability';
/**
 * Fine-grained managerial permission check, layered on top of the coarse
 * @Roles(AppRole.ADMIN/SUPPORT_AGENT) role gate. A user must hold the ADMIN or
 * SUPPORT_AGENT role AND have an active (non-revoked) StaffPermission row for
 * every capability listed here — this is what makes "admin" not a single
 * master switch but a set of independently grantable/revocable privileges.
 */
export const RequireCapability = (...capabilities: StaffCapability[]) => SetMetadata(CAPABILITY_KEY, capabilities);
