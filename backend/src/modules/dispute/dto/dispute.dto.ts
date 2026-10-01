import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class FileDisputeDto {
  @IsUUID() tripId: string;
  @IsIn(['damage', 'mileage', 'late_return', 'cleanliness', 'billing', 'other']) disputeType: string;
}

export class AddEvidenceDto {
  @IsIn(['condition_baseline_comparison', 'telematics_log', 'chat_transcript', 'user_submission']) sourceType: string;
  @IsString() refPointer: string;
}

export class MediatorDecisionDto {
  @IsString() decisionSummary: string;
  @IsOptional() resolutionOutcome?: any;
}
