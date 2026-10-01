import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CapabilityGuard } from '../../../common/guards/capability.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireCapability } from '../../../common/decorators/require-capability.decorator';
import { AppRole, StaffCapability } from '../../../common/enums';
import { AssessmentsService } from './assessments.service';

@ApiTags('admin-assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
@Controller('admin/assessments')
export class AssessmentsController {
  constructor(private readonly svc: AssessmentsService) {}

  @Get('user-risk')
  userRisk() {
    return this.svc.userRiskAssessment();
  }

  @Get('vehicle-quality/:vehicleId')
  vehicleQuality(@Param('vehicleId') vehicleId: string) {
    return this.svc.vehicleQualityAssessment(vehicleId);
  }

  @Get('performance-scorecard/:userId')
  performance(@Param('userId') userId: string) {
    return this.svc.performanceScorecard(userId);
  }

  @Get('financial-health')
  @RequireCapability(StaffCapability.VIEW_FINANCIALS)
  financialHealth() {
    return this.svc.financialHealthAssessment();
  }

  @Get('regional-market')
  regionalMarket() {
    return this.svc.regionalMarketAssessment();
  }

  @Get('compliance')
  compliance() {
    return this.svc.complianceAssessment();
  }

  @Get('vendor-integrations')
  vendorIntegrations() {
    return this.svc.vendorIntegrationAssessment();
  }
}
