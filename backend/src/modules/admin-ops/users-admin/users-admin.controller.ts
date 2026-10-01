import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CapabilityGuard } from '../../../common/guards/capability.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireCapability } from '../../../common/decorators/require-capability.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AppRole, StaffCapability } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces/request-with-user';
import { UsersAdminService } from './users-admin.service';
import { SuspendUserDto, SuspendVehicleDto, OverrideTrustScoreDto, OverrideListingThresholdDto } from './users-admin.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly svc: UsersAdminService) {}

  @Get(':userId/profile')
  getProfile(@Param('userId') userId: string) {
    return this.svc.getConsolidatedProfile(userId);
  }

  @Post(':userId/suspend')
  @RequireCapability(StaffCapability.SUSPEND_USERS)
  suspend(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SuspendUserDto) {
    return this.svc.suspendUser(user.userId, userId, dto.reason);
  }

  @Post(':userId/unsuspend')
  @RequireCapability(StaffCapability.SUSPEND_USERS)
  unsuspend(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.unsuspendUser(user.userId, userId);
  }

  @Post(':userId/force-reverification')
  forceReverification(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.forceReverification(user.userId, userId);
  }

  @Post(':userId/trust-score/override')
  @RequireCapability(StaffCapability.OVERRIDE_TRUST_SCORE)
  overrideTrustScore(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: OverrideTrustScoreDto) {
    return this.svc.overrideTrustScore(user.userId, userId, dto.newScore, dto.reason);
  }

  @Post('vehicles/:vehicleId/suspend')
  @RequireCapability(StaffCapability.SUSPEND_USERS)
  suspendVehicle(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: SuspendVehicleDto) {
    return this.svc.suspendVehicle(user.userId, vehicleId, dto.reason);
  }

  @Post('listings/:listingId/threshold-override')
  @RequireCapability(StaffCapability.OVERRIDE_TRUST_SCORE)
  overrideThreshold(@Param('listingId') listingId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: OverrideListingThresholdDto) {
    return this.svc.overrideListingThreshold(user.userId, listingId, dto.minimumScore, dto.minimumTier, dto.reason);
  }
}
