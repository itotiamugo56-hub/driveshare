import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CapabilityGuard } from '../../../common/guards/capability.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireCapability } from '../../../common/decorators/require-capability.decorator';
import { AppRole, StaffCapability } from '../../../common/enums';
import { ReportingService } from './reporting.service';

@ApiTags('admin-reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles(AppRole.ADMIN)
@Controller('admin/reporting')
export class ReportingController {
  constructor(private readonly svc: ReportingService) {}

  @Get('revenue')
  @RequireCapability(StaffCapability.VIEW_FINANCIALS)
  revenue(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.svc.revenueReport(startDate, endDate);
  }

  @Get('payout-reconciliation')
  @RequireCapability(StaffCapability.VIEW_FINANCIALS)
  payoutReconciliation(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.svc.payoutReconciliation(startDate, endDate);
  }

  @Get('owner-earnings/:ownerId')
  @RequireCapability(StaffCapability.VIEW_FINANCIALS)
  ownerEarnings(@Param('ownerId') ownerId: string, @Query('year') year: string) {
    return this.svc.ownerEarningsExport(ownerId, parseInt(year, 10));
  }

  @Get('insurance-pricing-audit/:tripId')
  @RequireCapability(StaffCapability.VIEW_FINANCIALS)
  insuranceAudit(@Param('tripId') tripId: string) {
    return this.svc.insurancePricingAuditTrail(tripId);
  }

  @Get('gdpr-compliance')
  gdprCompliance(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.svc.gdprComplianceReport(startDate, endDate);
  }

  @Get('audit-log')
  @RequireCapability(StaffCapability.VIEW_AUDIT_LOG)
  auditLog(
    @Query('actorId') actorId?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
  ) {
    return this.svc.queryAuditLog({ actorId, targetType, targetId, action });
  }
}
