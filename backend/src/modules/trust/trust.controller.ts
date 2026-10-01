import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { TrustService } from './trust.service';
import { ImportExternalHistoryDto, SetThresholdDto, EligibilityCheckDto } from './dto/trust.dto';

@ApiTags('trust')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trust')
export class TrustController {
  constructor(private readonly trust: TrustService) {}

  @Get('users/:userId/score')
  getScore(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    this.trust.assertMayReadScore(user, userId);
    return this.trust.getScore(userId);
  }

  @Post('users/:userId/recalculate')
  @Roles(AppRole.SERVICE, AppRole.ADMIN)
  recalculate(@Param('userId') userId: string) {
    return this.trust.recalculate(userId);
  }

  @Post('imports/external-history')
  importHistory(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportExternalHistoryDto) {
    return this.trust.importExternalHistory(user.userId, dto.sourcePlatform, dto.verificationMethod);
  }

  @Get('imports/:importId/status')
  getImportStatus(@Param('importId') id: string) {
    return this.trust.getImportStatus(id);
  }

  @Get('thresholds/:listingId')
  getThreshold(@Param('listingId') listingId: string) {
    return this.trust.getThreshold(listingId);
  }

  @Put('thresholds/:listingId')
  async setThreshold(@Param('listingId') listingId: string, @Body() dto: SetThresholdDto, @CurrentUser() user: AuthenticatedUser) {
    // Previously any signed-in user could change who may book anyone's car. Now: the owner or staff only.
    await this.trust.assertMaySetThreshold(user, listingId);
    return this.trust.setThreshold(listingId, dto.minimumScore, dto.minimumTier);
  }

  @Post('eligibility-check')
  async checkEligibility(@Body() dto: EligibilityCheckDto, @CurrentUser() user: AuthenticatedUser) {
    await this.trust.assertMayCheckEligibility(user, dto.userId, dto.listingId);
    return this.trust.checkEligibility(dto.userId, dto.listingId);
  }
}
