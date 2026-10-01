import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const DAY = /^\d{4}-\d{2}-\d{2}/;

export class PreviewTripDto {
  @IsUUID() listingId!: string;
  @IsString() @Matches(DAY, { message: 'startDate must look like 2026-10-03' }) startDate!: string;
  @IsString() @Matches(DAY, { message: 'endDate must look like 2026-10-06' }) endDate!: string;
  @IsUUID() coverageTierId!: string;
  @IsOptional() @IsBoolean() includeDelivery?: boolean;
}

export class ComprehensionAnswerDto {
  @IsString() questionId!: string;
  @IsString() answer!: string;
}

export class BookTripDto extends PreviewTripDto {
  @IsUUID() paymentMethodId!: string;
  @IsArray() @ArrayMinSize(3) @ValidateNested({ each: true }) @Type(() => ComprehensionAnswerDto)
  comprehensionAnswers!: ComprehensionAnswerDto[];
}

export class RespondTripDto {
  @IsBoolean() accept!: boolean;
}
