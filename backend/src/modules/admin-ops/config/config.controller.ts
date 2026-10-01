import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CapabilityGuard } from '../../../common/guards/capability.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireCapability } from '../../../common/decorators/require-capability.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AppRole, StaffCapability } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces/request-with-user';
import { ConfigService } from './config.service';
import { SetConfigDto, SetFeatureFlagDto } from './config.dto';

@ApiTags('admin-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles(AppRole.ADMIN)
@RequireCapability(StaffCapability.MANAGE_CONFIG)
@Controller('admin/config')
export class ConfigController {
  constructor(private readonly svc: ConfigService) {}

  @Get('settings')
  listConfig() {
    return this.svc.listConfig();
  }

  @Get('settings/:key')
  getConfig(@Param('key') key: string) {
    return this.svc.getConfig(key);
  }

  @Put('settings/:key')
  setConfig(@Param('key') key: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SetConfigDto) {
    return this.svc.setConfig(user.userId, key, dto.value);
  }

  @Get('feature-flags')
  listFlags() {
    return this.svc.listFlags();
  }

  @Get('feature-flags/:key')
  getFlag(@Param('key') key: string) {
    return this.svc.getFlag(key);
  }

  @Put('feature-flags/:key')
  setFlag(@Param('key') key: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SetFeatureFlagDto) {
    return this.svc.setFlag(user.userId, key, dto.enabled, dto.scopeRegion, dto.description);
  }

  @Put('surge-caps/:marketRegion')
  setSurgeCap(@Param('marketRegion') marketRegion: string, @CurrentUser() user: AuthenticatedUser, @Body('maxMultiplier') maxMultiplier: number) {
    return this.svc.setSurgeCap(user.userId, marketRegion, maxMultiplier);
  }
}
