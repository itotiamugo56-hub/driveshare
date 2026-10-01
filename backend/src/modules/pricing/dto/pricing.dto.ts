import { IsInt, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class PriceSuggestionDto {
  @IsUUID() listingId: string;
  @IsOptional() @IsString() region?: string;
}

export class ComparablesQueryDto {
  @IsString() region: string;
  @IsOptional() @IsString() vehicleClass?: string;
}

export class EarningsBreakdownDto {
  @IsUUID() tripId: string;
  @IsInt() @IsPositive() grossTripPriceCents: number;
}

export class SurgeCapDto {
  @IsString() marketRegion: string;
  @IsInt() maxMultiplierBasisPoints: number; // e.g. 200 = 2.0x, kept as int to avoid float DTO validation noise
}
