import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { TripsService } from './trips.service';
import { BookTripDto, PreviewTripDto, RespondTripDto } from './dto/trips.dto';

/** Renter-callable booking. Any signed-in user may call these; ownership is enforced in the service. */
@ApiTags('trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly svc: TripsService) {}

  @Post('preview') preview(@CurrentUser() u: AuthenticatedUser, @Body() dto: PreviewTripDto) { return this.svc.preview(u.userId, dto); }
  @Post() book(@CurrentUser() u: AuthenticatedUser, @Body() dto: BookTripDto) { return this.svc.book(u.userId, dto); }
  @Get('mine') mine(@CurrentUser() u: AuthenticatedUser) { return this.svc.mine(u.userId); }
  @Get(':id') get(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post(':id/cancel') cancel(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) { return this.svc.cancel(u, id); }
  @Post(':id/respond') respond(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string, @Body() dto: RespondTripDto) { return this.svc.respond(u.userId, id, dto.accept); }
}
