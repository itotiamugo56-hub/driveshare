import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppRole } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { ReviewsService } from './reviews.service';
import { SubmitReviewDto, AttachMediaDto } from './dto/reviews.dto';

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Post('reviews')
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitReviewDto) {
    return this.svc.submitReview(dto.tripId, user.userId, dto.subjectUserId, dto.rating, dto.comment);
  }

  @Get('reviews/:tripId')
  getForTrip(@Param('tripId') tripId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.getReviewsForTrip(tripId, user.userId);
  }

  @Get('reviews/users/:userId')
  getUserHistory(@Param('userId') userId: string) {
    return this.svc.getUserReviewHistory(userId);
  }

  @Post('reviews/:reviewId/media')
  attachMedia(@Param('reviewId') id: string, @Body() dto: AttachMediaDto) {
    return this.svc.attachMedia(id, dto.mediaRefs);
  }

  @Get('badges/users/:userId')
  getBadges(@Param('userId') userId: string) {
    return this.svc.getBadges(userId);
  }

  @Post('badges/evaluate')
  @Roles(AppRole.SERVICE)
  evaluate(@Body('userId') userId: string) {
    return this.svc.evaluateBadges(userId);
  }
}
