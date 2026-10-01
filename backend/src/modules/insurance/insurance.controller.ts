import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { InsuranceService } from './insurance.service';
import { GetQuoteDto, BindPolicyDto, ComprehensionCheckDto, FileClaimDto, ClaimEvidenceDto, ClaimDecisionDto } from './dto/insurance.dto';

@ApiTags('insurance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insurance')
export class InsuranceController {
  constructor(private readonly svc: InsuranceService) {}

  @Get('tiers')
  listTiers() {
    return this.svc.ensureTiersSeeded();
  }

  @Post('quotes')
  getQuote(@Body() dto: GetQuoteDto) {
    return this.svc.getQuote(dto.tripId, dto.tierId, dto.riskFactors);
  }

  @Post('policies')
  bindPolicy(@Body() dto: BindPolicyDto) {
    return this.svc.bindPolicy(dto.tripId, dto.tierId);
  }

  @Get('policies/:policyId')
  getPolicy(@Param('policyId') id: string) {
    return this.svc.getPolicy(id);
  }

  @Post('comprehension-check')
  submitCheck(@CurrentUser() user: AuthenticatedUser, @Body() dto: ComprehensionCheckDto) {
    return this.svc.submitComprehensionCheck(user.userId, dto.tripId, dto.answers);
  }

  @Post('claims')
  fileClaim(@Body() dto: FileClaimDto) {
    return this.svc.fileClaim(dto.policyId, dto.tripId, dto.claimType);
  }

  @Get('claims/:claimId')
  getClaim(@Param('claimId') id: string) {
    return this.svc.getClaim(id);
  }

  @Post('claims/:claimId/evidence')
  attachEvidence(@Param('claimId') id: string, @Body() dto: ClaimEvidenceDto) {
    return this.svc.attachEvidence(id, dto.evidenceRefs);
  }

  @Post('claims/:claimId/decision')
  @Roles(AppRole.SUPPORT_AGENT, AppRole.ADMIN, AppRole.SERVICE)
  decideClaim(@Param('claimId') id: string, @Body() dto: ClaimDecisionDto) {
    return this.svc.decideClaim(id, dto.status, dto.payoutAmountCents);
  }
}
