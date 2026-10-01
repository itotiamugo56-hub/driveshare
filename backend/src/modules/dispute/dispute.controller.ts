import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { DisputeService } from './dispute.service';
import { FileDisputeDto, AddEvidenceDto, MediatorDecisionDto } from './dto/dispute.dto';

@ApiTags('dispute')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('disputes')
export class DisputeController {
  constructor(private readonly svc: DisputeService) {}

  @Post()
  file(@CurrentUser() user: AuthenticatedUser, @Body() dto: FileDisputeDto) {
    return this.svc.fileDispute(dto.tripId, user.userId, dto.disputeType);
  }

  @Get(':disputeId')
  get(@Param('disputeId') id: string) {
    return this.svc.getDispute(id);
  }

  @Post(':disputeId/evidence')
  addEvidence(@Param('disputeId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: AddEvidenceDto) {
    return this.svc.addEvidence(id, dto.sourceType, dto.refPointer, user.userId);
  }

  @Post(':disputeId/auto-resolve-attempt')
  @Roles(AppRole.SERVICE)
  autoResolve(@Param('disputeId') id: string) {
    return this.svc.autoResolveAttempt(id);
  }

  @Post(':disputeId/escalate')
  @Roles(AppRole.SERVICE, AppRole.SUPPORT_AGENT)
  escalate(@Param('disputeId') id: string) {
    return this.svc.escalate(id);
  }

  @Post(':disputeId/mediator-decision')
  @Roles(AppRole.SUPPORT_AGENT, AppRole.ADMIN)
  mediatorDecision(@Param('disputeId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: MediatorDecisionDto) {
    return this.svc.recordMediatorDecision(id, user.userId, dto.decisionSummary, dto.resolutionOutcome);
  }

  @Post(':disputeId/arbitration-handoff')
  @Roles(AppRole.SUPPORT_AGENT, AppRole.ADMIN, AppRole.ARBITRATOR)
  arbitrationHandoff(@Param('disputeId') id: string) {
    return this.svc.handoffToArbitration(id);
  }

  @Get(':disputeId/timeline')
  timeline(@Param('disputeId') id: string) {
    return this.svc.getTimeline(id);
  }
}
