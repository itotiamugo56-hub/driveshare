import { Module } from '@nestjs/common';
import { AccessIotController } from './access-iot.controller';
import { AccessIotService } from './access-iot.service';

@Module({
  controllers: [AccessIotController],
  providers: [AccessIotService],
  exports: [AccessIotService],
})
export class AccessIotModule {}
