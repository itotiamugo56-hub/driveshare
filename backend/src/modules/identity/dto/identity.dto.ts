import { IsEnum, IsOptional, IsString, IsBoolean, IsUUID } from 'class-validator';

export enum DocumentTypeDto { passport = 'passport', drivers_license = 'drivers_license', national_id = 'national_id' }

export class InitiateVerificationDto {
  @IsEnum(DocumentTypeDto) documentType: DocumentTypeDto;
}

export class UploadDocumentDto {
  // In production this would be a multipart file upload; base64 payload kept here for a runnable JSON API.
  @IsString() documentBase64: string;
}

export class SubmitLivenessDto {
  @IsString() livenessMediaBase64: string;
}

export class SubmitLicenseDto {
  @IsString() licenseNumber: string;
  @IsString() issuingRegion: string;
  @IsString() licenseClass: string;
  @IsString() expirationDate: string; // ISO date
}

export class RequestDrivingHistoryDto {
  @IsBoolean() consentGiven: boolean;
}

export class ScheduleReverificationDto {
  @IsUUID() userId: string;
}
