import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class SetConfigDto {
  @IsObject() value: any;
}

export class SetFeatureFlagDto {
  @IsBoolean() enabled: boolean;
  @IsOptional() @IsString() scopeRegion?: string;
  @IsOptional() @IsString() description?: string;
}
