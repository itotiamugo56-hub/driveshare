import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class ImportExternalHistoryDto {
  @IsString() sourcePlatform: string;
  @IsIn(['oauth_pull', 'document_upload']) verificationMethod: 'oauth_pull' | 'document_upload';
}

export class SetThresholdDto {
  @IsNumber() minimumScore: number;
  @IsOptional() @IsIn(['new', 'standard', 'trusted', 'elite']) minimumTier?: string;
}

export class EligibilityCheckDto {
  @IsUUID() userId: string;
  @IsUUID() listingId: string;
}
