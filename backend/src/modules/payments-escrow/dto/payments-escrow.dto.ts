import { IsIn, IsInt, IsObject, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class AddPaymentMethodDto {
  @IsIn(['card', 'bank_account', 'wallet']) type: string;
  @IsObject() rawDetails: any; // never persisted; passed straight to the processor's vaulting call
}

export class AuthorizeDto {
  @IsUUID() tripId: string;
  @IsUUID() payerUserId: string;
  @IsUUID() paymentMethodId: string;
  @IsInt() @IsPositive() amountCents: number;
  @IsOptional() @IsString() currency?: string;
}

export class PreauthorizeDepositDto {
  @IsUUID() tripId: string;
  @IsUUID() paymentMethodId: string;
  @IsInt() @IsPositive() amountCents: number;
}

export class PartialCaptureDto {
  @IsInt() @IsPositive() amountCents: number;
  @IsString() reason: string;
}

export class InitiatePayoutDto {
  @IsUUID() ownerId: string;
  @IsUUID() tripId: string;
  @IsInt() @IsPositive() amountCents: number;
  @IsInt() platformFeeCents: number;
}

export class ProcessorWebhookDto {
  @IsString() eventType: string; // authorization.succeeded | capture.succeeded | chargeback.filed | payout.paid ...
  @IsObject() payload: any;
}
