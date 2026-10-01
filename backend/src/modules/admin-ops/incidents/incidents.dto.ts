import { IsArray, IsIn, IsNumber, IsString } from 'class-validator';

export class CreateIncidentDto {
  @IsString() title: string;
  @IsIn(['p1', 'p2', 'p3', 'p4']) severity: string;
  @IsString() description: string;
  @IsArray() affectedServices: string[];
}

export class UpdateIncidentStatusDto {
  @IsIn(['open', 'investigating', 'monitoring', 'resolved']) status: string;
}

export class CreateAlertRuleDto {
  @IsString() name: string;
  @IsString() metric: string;
  @IsIn(['gt', 'gte', 'lt', 'lte']) comparator: string;
  @IsNumber() threshold: number;
  @IsString() notifyChannel: string;
}
