import { IsIn, IsObject, IsOptional, IsString, IsUUID, IsArray } from 'class-validator';

export class EvaluateBookingDto {
  @IsUUID() userId: string;
  @IsUUID() listingId: string;
  @IsUUID() tripId: string;
  @IsOptional() @IsObject() context?: any; // device fingerprint, ip, trip distance/value, account age, etc.
}

export class EvaluateListingDto {
  @IsUUID() listingId: string;
  @IsUUID() ownerId: string;
}

export class DeviceSignalDto {
  @IsUUID() userId: string;
  @IsString() deviceFingerprint: string;
  @IsOptional() behavioralBiometricScore?: number;
  @IsOptional() ipGeoMismatchFlag?: boolean;
}

export class CaseDecisionDto {
  @IsIn(['open', 'under_review', 'confirmed', 'dismissed']) status: string;
}

export class ChargebackEvidenceDto {
  @IsUUID() tripId: string;
  @IsArray() includedArtifacts: string[];
}

export class LinkAnalysisDto {
  @IsArray() @IsUUID('all', { each: true }) userIds: string[];
}