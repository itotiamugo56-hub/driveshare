import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './common/prisma/prisma.module';
import { EventBusModule } from './common/event-bus/event-bus.module';
import { MockProvidersModule } from './common/mock-providers/mock-providers.module';
import { AuthModule } from './common/auth/auth.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CapabilityGuard } from './common/guards/capability.guard';

import { IdentityModule } from './modules/identity/identity.module';
import { TrustModule } from './modules/trust/trust.module';
import { VehicleListingModule } from './modules/vehicle-listing/vehicle-listing.module';
import { AccessIotModule } from './modules/access-iot/access-iot.module';
import { SecurityComplianceModule } from './modules/security-compliance/security-compliance.module';
import { PaymentsEscrowModule } from './modules/payments-escrow/payments-escrow.module';
import { FraudModule } from './modules/fraud/fraud.module';
import { InsuranceModule } from './modules/insurance/insurance.module';
import { DisputeModule } from './modules/dispute/dispute.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { TripsModule } from './modules/trips/trips.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { CompanyProfileModule } from './modules/company-profile/company-profile.module';
import { ScheduledJobsModule } from './scheduled-jobs/scheduled-jobs.module';
import { AdminOpsModule } from './modules/admin-ops/admin-ops.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    EventBusModule,
    MockProvidersModule,
    AuthModule,

    // The 12 domain services from the architecture spec:
    IdentityModule,
    TrustModule,
    VehicleListingModule,
    AccessIotModule,
    SecurityComplianceModule,
    PaymentsEscrowModule,
    FraudModule,
    InsuranceModule,
    DisputeModule,
    PricingModule,
    LogisticsModule,
    ReviewsModule,
    TripsModule,

    // Added per explicit product decision (verification-check follow-up,
    // "company/business profile" gap) — not one of the original 12 domains.
    CompanyProfileModule,

    // 13th domain ([INFERRED]): managerial/operational layer over the 12 above.
    AdminOpsModule,

    ScheduledJobsModule,
  ],
  providers: [
    // Global auth: every endpoint requires a valid JWT by default; @Roles() layers
    // fine-grained role checks per the spec's per-endpoint auth notes, and
    // @RequireCapability() layers a further per-grant check for managerial actions
    // (see src/modules/admin-ops). Individual controllers can opt out with
    // @Public() if ever needed (none currently do).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CapabilityGuard },
  ],
})
export class AppModule {}
