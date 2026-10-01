import { IsIn, IsOptional, IsString, IsUUID, IsDateString, IsObject } from 'class-validator';

export class RegisterDeviceDto {
  @IsUUID() vehicleId: string;
  @IsIn(['aftermarket_smart_lock', 'native_connected_car_api']) deviceType: string;
  @IsString() vendorRef: string;
}

export class IssueKeyDto {
  @IsUUID() tripId: string;
  @IsUUID() vehicleId: string;
  @IsUUID() renterId: string;
  @IsDateString() validFrom: string;
  @IsDateString() validUntil: string;
  @IsOptional() @IsObject() geofencePolygon?: any;
}

export class ImmobilizeDto {
  @IsString() justification: string;
}

export class SetGeofenceDto {
  @IsUUID() tripId: string;
  @IsObject() polygon: any;
  @IsOptional() @IsIn(['alert_only', 'alert_and_flag_dispute']) breachAction?: string;
}

export class TelematicsWebhookDto {
  @IsUUID() vehicleId: string;
  @IsIn(['tow_detected', 'tamper_detected', 'geofence_breach', 'diagnostic_code', 'unexpected_disconnect']) eventType: string;
  @IsObject() payload: any;
}
