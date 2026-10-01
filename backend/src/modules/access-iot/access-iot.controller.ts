import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { AccessIotService } from './access-iot.service';
import { RegisterDeviceDto, IssueKeyDto, ImmobilizeDto, SetGeofenceDto, TelematicsWebhookDto } from './dto/access-iot.dto';

@ApiTags('access-iot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('access')
export class AccessIotController {
  constructor(private readonly svc: AccessIotService) {}

  @Post('devices')
  @Roles(AppRole.SERVICE, AppRole.ADMIN)
  registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.svc.registerDevice(dto.vehicleId, dto.deviceType, dto.vendorRef);
  }

  @Get('devices/:deviceId/health')
  getDeviceHealth(@Param('deviceId') id: string) {
    return this.svc.getDeviceHealth(id);
  }

  @Post('keys')
  @Roles(AppRole.SERVICE)
  issueKey(@Body() dto: IssueKeyDto) {
    return this.svc.issueKey(dto);
  }

  @Post('keys/:keyId/revoke')
  @Roles(AppRole.SERVICE, AppRole.ADMIN, AppRole.SUPPORT_AGENT)
  revokeKey(@Param('keyId') id: string) {
    return this.svc.revokeKey(id);
  }

  @Get('keys/:keyId')
  getKey(@Param('keyId') id: string) {
    return this.svc.getKey(id);
  }

  @Post('keys/:keyId/unlock')
  unlock(@Param('keyId') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.sendCommand(id, user.userId, 'unlock');
  }

  @Post('keys/:keyId/lock')
  lock(@Param('keyId') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.sendCommand(id, user.userId, 'lock');
  }

  @Post('keys/:keyId/start-ignition')
  startIgnition(@Param('keyId') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.sendCommand(id, user.userId, 'start-ignition');
  }

  @Post('vehicles/:vehicleId/immobilize')
  @Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
  immobilize(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ImmobilizeDto) {
    return this.svc.immobilize(vehicleId, user.userId, user.role, dto.justification);
  }

  @Post('vehicles/:vehicleId/geofence')
  setGeofence(@Param('vehicleId') vehicleId: string, @Body() dto: SetGeofenceDto) {
    return this.svc.setGeofence(vehicleId, dto.tripId, dto.polygon, dto.breachAction);
  }

  @Get('vehicles/:vehicleId/location')
  getLocation(@Param('vehicleId') vehicleId: string) {
    return this.svc.getLocation(vehicleId);
  }

  @Post('webhooks/telematics-event')
  @Roles(AppRole.SERVICE)
  handleWebhook(@Body() dto: TelematicsWebhookDto) {
    return this.svc.handleTelematicsWebhook(dto.vehicleId, dto.eventType, dto.payload);
  }
}
