import { IsIn, IsInt, IsObject, IsOptional, IsPositive, IsString, IsUUID, IsArray, IsDateString } from 'class-validator';

export class DeliveryRequestDto {
  @IsUUID() tripId: string;
  @IsObject() dropoffLocation: { lat: number; lng: number; address?: string };
  @IsInt() @IsPositive() feeCents: number;
}

export class AssignDeliveryDto {
  @IsIn(['owner', 'third_party_partner']) assignedTo: string;
}

export class BulkListingsDto {
  @IsArray() listings: { vehicleId: string; basePriceCents: number }[];
}

export class MaintenanceHoldDto {
  @IsUUID() vehicleId: string;
  @IsIn(['scheduled_service', 'diagnostic_flag', 'recall']) reason: string;
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
  @IsOptional() @IsString() triggeringDiagnosticCode?: string;
}
