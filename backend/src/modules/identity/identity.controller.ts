import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { IdentityService } from './identity.service';
import {
  InitiateVerificationDto,
  UploadDocumentDto,
  SubmitLivenessDto,
  SubmitLicenseDto,
  RequestDrivingHistoryDto,
  ScheduleReverificationDto,
} from './dto/identity.dto';

@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('verifications')
  initiateVerification(@CurrentUser() user: AuthenticatedUser, @Body() dto: InitiateVerificationDto) {
    return this.identity.initiateVerification(user.userId, dto.documentType);
  }

  @Post('verifications/:verificationId/documents')
  uploadDocument(@Param('verificationId') id: string, @Body() dto: UploadDocumentDto) {
    return this.identity.uploadDocument(id, dto.documentBase64);
  }

  @Post('verifications/:verificationId/liveness')
  submitLiveness(@Param('verificationId') id: string, @Body() dto: SubmitLivenessDto) {
    return this.identity.submitLiveness(id, dto.livenessMediaBase64);
  }

  @Get('verifications/:verificationId')
  getVerification(@Param('verificationId') id: string) {
    return this.identity.getVerification(id);
  }

  @Post('licenses')
  submitLicense(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitLicenseDto) {
    return this.identity.submitLicense(user.userId, dto);
  }

  @Get('licenses/:licenseId/status')
  getLicenseStatus(@Param('licenseId') id: string) {
    return this.identity.getLicenseStatus(id);
  }

  @Post('driving-history')
  requestDrivingHistory(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestDrivingHistoryDto) {
    return this.identity.requestDrivingHistory(user.userId, dto.consentGiven);
  }

  @Get('driving-history/:requestId')
  getDrivingHistory(@Param('requestId') id: string) {
    return this.identity.getDrivingHistory(id);
  }

  @Post('reverifications/schedule')
  @Roles(AppRole.SERVICE, AppRole.ADMIN)
  scheduleReverification(@Body() dto: ScheduleReverificationDto) {
    return this.identity.scheduleReverification(dto.userId);
  }

  @Get('users/:userId/status')
  getConsolidatedStatus(@Param('userId') userId: string) {
    return this.identity.getConsolidatedStatus(userId);
  }

  @Post('webhooks/vendor-callback')
  @Roles(AppRole.SERVICE)
  handleVendorCallback(@Body() payload: { verificationId: string; status: 'approved' | 'rejected'; reason?: string }) {
    return this.identity.handleVendorCallback(payload);
  }
}
