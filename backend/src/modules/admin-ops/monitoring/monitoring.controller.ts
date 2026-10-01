import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AppRole } from '../../../common/enums';
import { MonitoringService } from './monitoring.service';

@ApiTags('admin-monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
@Controller('admin/monitoring')
export class MonitoringController {
  constructor(private readonly svc: MonitoringService) {}

  @Get('fraud')
  fraud() {
    return this.svc.fraudFeed();
  }

  @Get('disputes')
  disputes() {
    return this.svc.disputeFeed();
  }

  @Get('fleet-access')
  fleetAccess() {
    return this.svc.fleetAccessFeed();
  }

  @Get('payments')
  payments() {
    return this.svc.paymentsFeed();
  }

  @Get('insurance-claims')
  insuranceClaims() {
    return this.svc.insuranceClaimsFeed();
  }

  @Get('system-health')
  systemHealth() {
    return this.svc.systemHealth();
  }

  @Get('trust-trends')
  trustTrends() {
    return this.svc.trustTrends();
  }
}
