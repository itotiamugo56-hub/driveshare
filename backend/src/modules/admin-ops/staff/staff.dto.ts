import { IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { AppRole, StaffCapability } from '../../../common/enums';

export class CreateStaffAccountDto {
  @IsEmail() email: string;
  @IsString() password: string;
  @IsEnum(AppRole) role: AppRole; // support_agent | arbitrator | admin
}

export class GrantCapabilityDto {
  @IsUUID() userId: string;
  @IsEnum(StaffCapability) capability: StaffCapability;
}

export class RevokeCapabilityDto {
  @IsString() reason: string;
}

export class StartImpersonationDto {
  @IsUUID() targetUserId: string;
  @IsString() reason: string;
}
