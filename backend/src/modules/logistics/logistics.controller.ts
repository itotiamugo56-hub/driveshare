import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { LogisticsService } from './logistics.service';
import { DeliveryRequestDto, AssignDeliveryDto, BulkListingsDto, MaintenanceHoldDto } from './dto/logistics.dto';

@ApiTags('logistics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly svc: LogisticsService) {}

  @Post('delivery-requests')
  requestDelivery(@Body() dto: DeliveryRequestDto) {
    return this.svc.requestDelivery(dto.tripId, dto.dropoffLocation, dto.feeCents);
  }

  @Get('delivery-requests/:requestId')
  getDelivery(@Param('requestId') id: string) {
    return this.svc.getDeliveryRequest(id);
  }

  @Put('delivery-requests/:requestId/assign')
  assignDelivery(@Param('requestId') id: string, @Body() dto: AssignDeliveryDto) {
    return this.svc.assignDelivery(id, dto.assignedTo);
  }

  @Post('fleet/:ownerId/redistribution-suggestions')
  redistribution(@Param('ownerId') ownerId: string) {
    return this.svc.getRedistributionSuggestions(ownerId);
  }

  @Post('fleet/:ownerId/bulk-listings')
  bulkListings(@Param('ownerId') ownerId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: BulkListingsDto) {
    return this.svc.bulkCreateListings(user.userId, dto.listings);
  }

  @Put('fleet/:ownerId/calendar-sync')
  syncCalendar(@Param('ownerId') ownerId: string) {
    return this.svc.syncCalendar(ownerId);
  }

  @Post('fleet/:ownerId/maintenance-schedule')
  maintenanceSchedule(@Body() dto: MaintenanceHoldDto) {
    return this.svc.createMaintenanceHold(dto);
  }
}
