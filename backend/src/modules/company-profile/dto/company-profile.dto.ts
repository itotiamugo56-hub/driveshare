import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// Added per explicit product decision (verification-check follow-up, "company/
// business profile" gap). See CompanyProfile in prisma/schema.prisma and
// company-profile.service.ts for the scope boundary of this minimal version.

export class CreateCompanyProfileDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class UpdateCompanyProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class AssignVehicleToCompanyDto {
  @IsUUID() vehicleId: string;
}
