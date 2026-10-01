import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, IsIn, IsArray, IsDateString, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class RegisterVehicleDto {
  @IsString() vin: string;
  @IsString() licensePlate: string;
}

export class UploadOwnershipDocDto {
  @IsString() documentBase64: string;
}

// Audit §3 High ("no specs surfaced: seats, fuel/charge type, transmission,
// mileage limits, features"). Reused by both `updateVehicle` (specs live on
// the Vehicle record, since they describe the physical vehicle, not the
// listing) and by ListingEditor's spec-entry step on the frontend.
export class UpdateVehicleSpecsDto {
  @IsOptional() @IsString() make?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsInt() year?: number;
  @IsOptional() @IsString() trim?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) seats?: number;
  @IsOptional() @IsIn(['automatic', 'manual']) transmission?: 'automatic' | 'manual';
  @IsOptional() @IsIn(['gasoline', 'diesel', 'hybrid', 'electric']) fuelType?: 'gasoline' | 'diesel' | 'hybrid' | 'electric';
  @IsOptional() @IsInt() mileageLimitPerDay?: number;
  @IsOptional() @IsArray() features?: string[];
}

// Audit §3 Critical / §1 Critical ("no vehicle photography anywhere").
export class AddVehiclePhotoDto {
  @IsString() photoBase64: string;
  @IsOptional() @IsString() mimeType?: string;
}

export class ReorderVehiclePhotosDto {
  @IsArray() @IsUUID('4', { each: true }) photoIds: string[];
}

export class ConditionBaselineDto {
  @IsIn(['listing_baseline', 'pre_trip', 'post_trip']) type: 'listing_baseline' | 'pre_trip' | 'post_trip';
  @IsOptional() @IsUUID() tripId?: string;
  @IsArray() mediaAssetRefs: string[];
  @IsOptional() @IsInt() odometerReading?: number;
  @IsOptional() @IsNumber() fuelOrChargeLevel?: number;
}

export class VinDecodeDto {
  @IsString() vin: string;
}

export class CreateListingDto {
  @IsUUID() vehicleId: string;
  @IsInt() basePriceCents: number;
  @IsOptional() @IsString() currency?: string;
  // Audit §3 Critical ("no description field anywhere").
  @IsOptional() @IsString() description?: string;
  // Audit §3 Critical / §1 Critical ("no location field or display anywhere").
  @IsOptional() @IsNumber() locationLat?: number;
  @IsOptional() @IsNumber() locationLng?: number;
  @IsOptional() @IsString() locationLabel?: string;
  @IsOptional() @IsBoolean() instantBookEnabled?: boolean;
  @IsOptional() deliveryOptions?: { delivery: boolean; radius_km: number; fee: number };
  @IsOptional() @IsIn(['new', 'standard', 'trusted', 'elite']) minimumTrustTier?: string;
}

export class UpdateListingDto {
  @IsOptional() @IsInt() basePriceCents?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() locationLat?: number;
  @IsOptional() @IsNumber() locationLng?: number;
  @IsOptional() @IsString() locationLabel?: string;
  @IsOptional() @IsBoolean() instantBookEnabled?: boolean;
  @IsOptional() deliveryOptions?: { delivery: boolean; radius_km: number; fee: number };
  @IsOptional() @IsIn(['new', 'standard', 'trusted', 'elite']) minimumTrustTier?: string;
  @IsOptional() @IsIn(['draft', 'active', 'paused', 'removed']) status?: string;
}

// Audit §4 Critical ("no recommendation/relevance logic", "availability not
// part of filtering") and §1 Critical ("no date-range availability search",
// "no map-based or location-aware search").
export class SearchListingsQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() deliveryOnly?: boolean;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() radiusKm?: number;
  // Audit §4 High: "newest first ordering is undisclosed" — sort is now an
  // explicit, named parameter with a matching disclosed label returned to
  // the client (see VehicleListingService.searchListings).
  @IsOptional() @IsIn(['recommended', 'price', 'distance', 'newest']) sort?: 'recommended' | 'price' | 'distance' | 'newest';
}

export class UpdateCalendarDto {
  @IsArray() entries: { date: string; status: 'available' | 'booked' | 'owner_blocked' | 'maintenance_hold' }[];
}