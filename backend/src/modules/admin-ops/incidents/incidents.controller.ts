import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CapabilityGuard } from '../../../common/guards/capability.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireCapability } from '../../../common/decorators/require-capability.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AppRole, StaffCapability } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces/request-with-user';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto, UpdateIncidentStatusDto, CreateAlertRuleDto } from './incidents.dto';

@ApiTags('admin-incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
@RequireCapability(StaffCapability.MANAGE_INCIDENTS)
@Controller('admin/incidents')
export class IncidentsController {
  constructor(private readonly svc: IncidentsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateIncidentDto) {
    return this.svc.createIncident(user.userId, dto.title, dto.severity, dto.description, dto.affectedServices);
  }

  @Get()
  list(@Query('status') status?: string) {
    return this.svc.listIncidents(status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getIncident(id);
  }

  @Put(':id/status')
  updateStatus(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateIncidentStatusDto) {
    return this.svc.updateStatus(user.userId, id, dto.status);
  }

  @Post('alert-rules')
  createRule(@Body() dto: CreateAlertRuleDto) {
    return this.svc.createAlertRule(dto.name, dto.metric, dto.comparator, dto.threshold, dto.notifyChannel);
  }

  @Get('alert-rules/list')
  listRules() {
    return this.svc.listAlertRules();
  }

  @Put('alert-rules/:id/toggle')
  toggleRule(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    return this.svc.toggleAlertRule(id, enabled);
  }

  @Post('alert-rules/evaluate')
  evaluate(@Body() metricSnapshot: Record<string, number>) {
    return this.svc.evaluateMetrics(metricSnapshot);
  }

  @Get('alert-firings/list')
  listFirings(@Query('acknowledged') acknowledged?: string) {
    return this.svc.listFirings(acknowledged === undefined ? undefined : acknowledged === 'true');
  }

  @Put('alert-firings/:id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.acknowledgeFiring(user.userId, id);
  }
}
