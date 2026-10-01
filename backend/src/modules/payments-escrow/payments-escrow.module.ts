import { Module } from '@nestjs/common';
import { PaymentsEscrowController } from './payments-escrow.controller';
import { PaymentsEscrowService } from './payments-escrow.service';

@Module({
  controllers: [PaymentsEscrowController],
  providers: [PaymentsEscrowService],
  exports: [PaymentsEscrowService],
})
export class PaymentsEscrowModule {}
