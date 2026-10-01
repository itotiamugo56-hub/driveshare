import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsUUID } from 'class-validator';

export class GetQuoteDto {
  @IsUUID() tripId: string;
  @IsUUID() tierId: string;
  @IsObject() riskFactors: any;
}

export class BindPolicyDto {
  @IsUUID() tripId: string;
  @IsUUID() tierId: string;
}

export class ComprehensionCheckDto {
  @IsUUID() tripId: string;
  @IsArray() answers: { questionId: string; answer: string }[];
}

export class FileClaimDto {
  @IsUUID() policyId: string;
  @IsUUID() tripId: string;
  @IsIn(['vehicle_damage', 'liability', 'theft']) claimType: string;
}

export class ClaimEvidenceDto {
  @IsArray() evidenceRefs: string[];
}

export class ClaimDecisionDto {
  @IsIn(['approved', 'denied', 'paid']) status: string;
  @IsOptional() @IsInt() payoutAmountCents?: number;
}
