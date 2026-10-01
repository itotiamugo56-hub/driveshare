import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class SuspendUserDto {
  @IsString() reason: string;
}

export class SuspendVehicleDto {
  @IsString() reason: string;
}

export class OverrideTrustScoreDto {
  @IsNumber() @Min(0) @Max(1000) newScore: number;
  @IsString() reason: string;
}

export class OverrideListingThresholdDto {
  @IsNumber() minimumScore: number;
  @IsOptional() @IsString() minimumTier?: string;
  @IsString() reason: string;
}
