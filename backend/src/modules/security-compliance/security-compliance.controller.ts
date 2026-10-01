import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { SecurityComplianceService } from './security-compliance.service';
import { TokenizeDocumentDto, RecordConsentDto } from './dto/security-compliance.dto';

@ApiTags('security-compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('security')
export class SecurityComplianceController {
  constructor(private readonly svc: SecurityComplianceService) {}

  @Post('documents/tokenize')
  tokenize(@CurrentUser() user: AuthenticatedUser, @Body() dto: TokenizeDocumentDto) {
    return this.svc.tokenizeDocument(user.userId, dto.documentClass, dto.plaintextBase64);
  }

  @Get('documents/:token')
  read(@Param('token') token: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.readDocument(token, user.userId, user.role);
  }

  @Delete('documents/:token')
  delete(@Param('token') token: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.deleteDocument(token, user.userId, user.role);
  }

  @Post('consent')
  recordConsent(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordConsentDto) {
    return this.svc.recordConsent(user.userId, dto.consentType, dto.ipAddress, dto.userAgent);
  }

  @Get('consent/:userId')
  listConsents(@Param('userId') userId: string) {
    return this.svc.listConsents(userId);
  }

  @Post('data-requests/export')
  requestExport(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.requestExport(user.userId);
  }

  @Post('data-requests/delete')
  requestDeletion(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.requestDeletion(user.userId);
  }

  @Get('data-requests/:requestId/status')
  getRequestStatus(@Param('requestId') id: string) {
    return this.svc.getRequestStatus(id);
  }

  @Get('audit-log')
  @Roles(AppRole.ADMIN)
  queryAuditLog(@Query('actorId') actorId?: string, @Query('resourceToken') resourceToken?: string) {
    return this.svc.queryAuditLog({ actorId, resourceToken });
  }
}
