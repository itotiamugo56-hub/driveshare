import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CapabilityGuard } from '../../../common/guards/capability.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequireCapability } from '../../../common/decorators/require-capability.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AppRole, StaffCapability } from '../../../common/enums';
import { AuthenticatedUser } from '../../../common/interfaces/request-with-user';
import { StaffService } from './staff.service';
import { CreateStaffAccountDto, GrantCapabilityDto, RevokeCapabilityDto, StartImpersonationDto } from './staff.dto';

@ApiTags('admin-staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles(AppRole.ADMIN)
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly svc: StaffService) {}

  @Post('accounts')
  @RequireCapability(StaffCapability.MANAGE_STAFF)
  createAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffAccountDto) {
    return this.svc.createStaffAccount(user.userId, dto.email, dto.password, dto.role);
  }

  @Get('accounts')
  @RequireCapability(StaffCapability.MANAGE_STAFF)
  listStaff() {
    return this.svc.listStaff();
  }

  @Get('accounts/:userId/permissions')
  @RequireCapability(StaffCapability.MANAGE_STAFF)
  getPermissions(@Param('userId') userId: string) {
    return this.svc.getPermissions(userId);
  }

  @Post('accounts/:userId/permissions/:capability')
  @RequireCapability(StaffCapability.MANAGE_STAFF)
  grant(@Param('userId') userId: string, @Param('capability') capability: StaffCapability, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.grantCapability(user.userId, userId, capability);
  }

  @Post('accounts/:userId/permissions/:capability/revoke')
  @RequireCapability(StaffCapability.MANAGE_STAFF)
  revoke(
    @Param('userId') userId: string,
    @Param('capability') capability: StaffCapability,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RevokeCapabilityDto,
  ) {
    return this.svc.revokeCapability(user.userId, userId, capability, dto.reason);
  }

  @Post('impersonation/start')
  @Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
  @RequireCapability(StaffCapability.IMPERSONATE_USERS)
  startImpersonation(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartImpersonationDto) {
    return this.svc.startImpersonation(user.userId, dto.targetUserId, dto.reason);
  }

  @Post('impersonation/:sessionId/end')
  @Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
  endImpersonation(@Param('sessionId') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.endImpersonation(id, user.userId);
  }

  @Get('impersonation')
  @RequireCapability(StaffCapability.IMPERSONATE_USERS)
  listImpersonation(@Query('staffId') staffId?: string, @Query('targetUserId') targetUserId?: string) {
    return this.svc.listImpersonationSessions({ staffId, targetUserId });
  }
}
