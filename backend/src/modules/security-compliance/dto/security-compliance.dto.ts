import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class TokenizeDocumentDto {
  @IsIn(['id_doc', 'license', 'ownership_doc', 'driving_history_report', 'other']) documentClass: string;
  @IsString() plaintextBase64: string;
}

export class RecordConsentDto {
  @IsIn(['driving_history', 'marketing', 'data_sharing_partner']) consentType: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() userAgent?: string;
}

export class DataRequestDto {
  // userId taken from JWT
}
