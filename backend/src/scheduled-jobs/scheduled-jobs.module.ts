import { Module } from '@nestjs/common';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { ReviewsModule } from '../modules/reviews/reviews.module';
import { DisputeModule } from '../modules/dispute/dispute.module';
import { AdminOpsModule } from '../modules/admin-ops/admin-ops.module';

@Module({
  imports: [ReviewsModule, DisputeModule, AdminOpsModule],
  providers: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
