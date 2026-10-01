import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums';
import { PricingService } from './pricing.service';
import { PriceSuggestionDto, EarningsBreakdownDto, SurgeCapDto } from './dto/pricing.dto';

@ApiTags('pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing')
export class PricingController {
  constructor(private readonly svc: PricingService) {}

  @Post('suggestions')
  getSuggestion(@Body() dto: PriceSuggestionDto) {
    return this.svc.getSuggestion(dto.listingId, dto.region);
  }

  @Get('comparables')
  getComparables(@Query('region') region: string, @Query('vehicleClass') vehicleClass?: string) {
    return this.svc.getComparables(region, vehicleClass);
  }

  @Post('earnings-breakdown')
  getEarningsBreakdown(@Body() dto: EarningsBreakdownDto) {
    return this.svc.getEarningsBreakdown(dto.tripId, dto.grossTripPriceCents);
  }

  @Get('idle-recommendations/:ownerId')
  getIdleRecs(@Param('ownerId') ownerId: string) {
    return this.svc.getIdleRecommendations(ownerId);
  }

  @Get('cancellation-risk/:tripId')
  getCancellationRisk(@Param('tripId') tripId: string) {
    return this.svc.getCancellationRisk(tripId);
  }

  @Post('surge-caps')
  @Roles(AppRole.ADMIN)
  setSurgeCap(@Body() dto: SurgeCapDto) {
    return this.svc.setSurgeCap(dto.marketRegion, dto.maxMultiplierBasisPoints / 100);
  }
}
