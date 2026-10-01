import { Module } from '@nestjs/common';
import { SecurityComplianceController } from './security-compliance.controller';
import { SecurityComplianceService } from './security-compliance.service';

@Module({
  controllers: [SecurityComplianceController],
  providers: [SecurityComplianceService],
  exports: [SecurityComplianceService],
})
export class SecurityComplianceModule {}
