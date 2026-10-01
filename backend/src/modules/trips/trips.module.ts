import { Module } from '@nestjs/common';
import { PaymentsEscrowModule } from '../payments-escrow/payments-escrow.module';
import { InsuranceModule } from '../insurance/insurance.module';
import { TrustModule } from '../trust/trust.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [PaymentsEscrowModule, InsuranceModule, TrustModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
