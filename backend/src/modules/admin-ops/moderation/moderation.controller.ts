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
import { ModerationService } from './moderation.service';
import { FlagItemDto, ResolveItemDto } from './moderation.dto';

@ApiTags('admin-moderation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
@RequireCapability(StaffCapability.MODERATE_CONTENT)
@Controller('admin/moderation')
export class ModerationController {
  constructor(private readonly svc: ModerationService) {}

  @Post('flag')
  flag(@Body() dto: FlagItemDto) {
    return this.svc.flagItem(dto.itemType, dto.itemId, dto.flaggedReason);
  }

  @Get('queue')
  queue(@Query('status') status?: string) {
    return this.svc.getQueue(status);
  }

  @Post('queue/:queueItemId/resolve')
  resolve(@Param('queueItemId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ResolveItemDto) {
    return this.svc.resolveItem(user.userId, id, dto.status as any, dto.reason);
  }

  @Get('fraud-triage-queue')
  fraudTriage() {
    return this.svc.fraudTriageQueue();
  }

  @Get('dispute-mediator-workbench')
  disputeWorkbench() {
    return this.svc.disputeMediatorWorkbench();
  }
}
