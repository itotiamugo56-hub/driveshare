import { Module } from '@nestjs/common';
import { VehicleListingController } from './vehicle-listing.controller';
import { VehicleListingService } from './vehicle-listing.service';

@Module({
  controllers: [VehicleListingController],
  providers: [VehicleListingService],
  exports: [VehicleListingService],
})
export class VehicleListingModule {}
