import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums';
import { FraudService } from './fraud.service';
import { EvaluateBookingDto, EvaluateListingDto, DeviceSignalDto, CaseDecisionDto, ChargebackEvidenceDto, LinkAnalysisDto } from './dto/fraud.dto';

@ApiTags('fraud')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fraud')
export class FraudController {
  constructor(private readonly svc: FraudService) {}

  @Post('evaluate/booking')
  @Roles(AppRole.SERVICE)
  evaluateBooking(@Body() dto: EvaluateBookingDto) {
    return this.svc.evaluateBooking(dto.userId, dto.listingId, dto.tripId, dto.context);
  }

  @Post('evaluate/listing')
  @Roles(AppRole.SERVICE)
  evaluateListing(@Body() dto: EvaluateListingDto) {
    return this.svc.evaluateListing(dto.listingId, dto.ownerId);
  }

  @Post('signals/device')
  submitSignal(@Body() dto: DeviceSignalDto) {
    return this.svc.submitDeviceSignal(dto.userId, dto.deviceFingerprint, dto.behavioralBiometricScore, dto.ipGeoMismatchFlag);
  }

  @Get('cases/:caseId')
  @Roles(AppRole.SUPPORT_AGENT, AppRole.ADMIN)
  getCase(@Param('caseId') id: string) {
    return this.svc.getCase(id);
  }

  @Post('cases/:caseId/decision')
  @Roles(AppRole.SUPPORT_AGENT, AppRole.ADMIN)
  decideCase(@Param('caseId') id: string, @Body() dto: CaseDecisionDto) {
    return this.svc.decideCase(id, dto.status);
  }

  @Post('chargeback-evidence')
  @Roles(AppRole.SERVICE, AppRole.SUPPORT_AGENT)
  assembleEvidence(@Body() dto: ChargebackEvidenceDto) {
    return this.svc.assembleChargebackEvidence(dto.tripId, dto.includedArtifacts);
  }

  @Get('chargeback-evidence/:bundleId')
  getEvidence(@Param('bundleId') id: string) {
    return this.svc.getChargebackBundle(id);
  }

  @Post('link-analysis')
  @Roles(AppRole.SERVICE, AppRole.ADMIN)
  linkAnalysis(@Body() dto: LinkAnalysisDto) {
    return this.svc.linkAnalysis(dto.userIds);
  }
}
