import { Module } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';

import { StaffController } from './staff/staff.controller';
import { StaffService } from './staff/staff.service';

import { UsersAdminController } from './users-admin/users-admin.controller';
import { UsersAdminService } from './users-admin/users-admin.service';

import { AssessmentsController } from './assessments/assessments.controller';
import { AssessmentsService } from './assessments/assessments.service';

import { MonitoringController } from './monitoring/monitoring.controller';
import { MonitoringService } from './monitoring/monitoring.service';

import { ModerationController } from './moderation/moderation.controller';
import { ModerationService } from './moderation/moderation.service';

import { ReportingController } from './reporting/reporting.controller';
import { ReportingService } from './reporting/reporting.service';

import { ConfigController } from './config/config.controller';
import { ConfigService } from './config/config.service';

import { IncidentsController } from './incidents/incidents.controller';
import { IncidentsService } from './incidents/incidents.service';

/**
 * 13th domain ([INFERRED], added on top of the original 12-domain spec):
 * Admin & Operations. Aggregates read access across all 12 domains and owns
 * its own write-models (StaffPermission, AdminAuditLog, ModerationQueueItem,
 * UserSuspension/VehicleSuspension, TrustScoreOverride, Incident, AlertRule,
 * FeatureFlag, ConfigSetting). No other module depends on this one — it only
 * depends on PrismaService/EventBusService, both global — so it can be
 * omitted entirely in a deployment that doesn't need a back-office layer.
 */
@Module({
  controllers: [
    StaffController,
    UsersAdminController,
    AssessmentsController,
    MonitoringController,
    ModerationController,
    ReportingController,
    ConfigController,
    IncidentsController,
  ],
  providers: [
    AdminAuditService,
    StaffService,
    UsersAdminService,
    AssessmentsService,
    MonitoringService,
    ModerationService,
    ReportingService,
    ConfigService,
    IncidentsService,
  ],
  exports: [AdminAuditService, MonitoringService, IncidentsService],
})
export class AdminOpsModule {}
