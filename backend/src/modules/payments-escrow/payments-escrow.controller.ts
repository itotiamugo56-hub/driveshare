import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { PaymentsEscrowService } from './payments-escrow.service';
import {
  AddPaymentMethodDto,
  AuthorizeDto,
  PreauthorizeDepositDto,
  PartialCaptureDto,
  InitiatePayoutDto,
  ProcessorWebhookDto,
} from './dto/payments-escrow.dto';

@ApiTags('payments-escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsEscrowController {
  constructor(private readonly svc: PaymentsEscrowService) {}

  @Post('methods')
  addMethod(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddPaymentMethodDto) {
    return this.svc.addPaymentMethod(user.userId, dto.type, dto.rawDetails);
  }

  @Get('methods/:userId')
  listMethods(@Param('userId') userId: string) {
    return this.svc.listPaymentMethods(userId);
  }

  @Delete('methods/:methodId')
  removeMethod(@Param('methodId') id: string) {
    return this.svc.removePaymentMethod(id);
  }

  // Fund-movement endpoints: service-role only per spec Section 6.4 — never directly
  // callable by end users, to prevent self-service fund manipulation.
  @Post('authorizations')
  @Roles(AppRole.SERVICE)
  authorize(@Body() dto: AuthorizeDto) {
    return this.svc.authorize(dto.tripId, dto.payerUserId, dto.paymentMethodId, dto.amountCents, dto.currency);
  }

  @Post('authorizations/:authId/capture')
  @Roles(AppRole.SERVICE)
  capture(@Param('authId') id: string) {
    return this.svc.capture(id);
  }

  @Post('authorizations/:authId/void')
  @Roles(AppRole.SERVICE)
  void_(@Param('authId') id: string) {
    return this.svc.void(id);
  }

  @Post('deposits/preauthorize')
  @Roles(AppRole.SERVICE)
  preauthDeposit(@Body() dto: PreauthorizeDepositDto) {
    return this.svc.preauthorizeDeposit(dto.tripId, dto.paymentMethodId, dto.amountCents);
  }

  @Post('deposits/:depositId/release')
  @Roles(AppRole.SERVICE)
  releaseDeposit(@Param('depositId') id: string) {
    return this.svc.releaseDeposit(id);
  }

  @Post('deposits/:depositId/partial-capture')
  @Roles(AppRole.SERVICE, AppRole.SUPPORT_AGENT)
  partialCapture(@Param('depositId') id: string, @Body() dto: PartialCaptureDto) {
    return this.svc.partialCaptureDeposit(id, dto.amountCents, dto.reason);
  }

  @Post('payouts')
  @Roles(AppRole.SERVICE)
  initiatePayout(@Body() dto: InitiatePayoutDto) {
    return this.svc.initiatePayout(dto.ownerId, dto.tripId, dto.amountCents, dto.platformFeeCents);
  }

  @Get('payouts/:payoutId')
  getPayout(@Param('payoutId') id: string) {
    return this.svc.getPayout(id);
  }

  @Get('transactions/:tripId')
  getLedger(@Param('tripId') tripId: string) {
    return this.svc.getTripLedger(tripId);
  }

  @Post('webhooks/processor-callback')
  @Roles(AppRole.SERVICE)
  webhook(@Body() dto: ProcessorWebhookDto) {
    return this.svc.handleProcessorWebhook(dto.eventType, dto.payload);
  }
}
