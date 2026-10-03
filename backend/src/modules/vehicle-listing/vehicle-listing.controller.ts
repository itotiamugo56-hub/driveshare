import { Body, Controller, Get, Param, Post, Put, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AppRole } from '../../common/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { VehicleListingService } from './vehicle-listing.service';
import {
  RegisterVehicleDto,
  UploadOwnershipDocDto,
  ConditionBaselineDto,
  VinDecodeDto,
  CreateListingDto,
  UpdateListingDto,
  UpdateCalendarDto,
  UpdateVehicleSpecsDto,
  AddVehiclePhotoDto,
  ReorderVehiclePhotosDto,
  SearchListingsQueryDto,
  OwnershipReviewDto,
} from './dto/vehicle-listing.dto';

@ApiTags('vehicle-listing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class VehicleListingController {
  constructor(private readonly svc: VehicleListingService) {}

  @Post('vehicles')
  registerVehicle(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterVehicleDto) {
    return this.svc.registerVehicle(user.userId, dto.vin, dto.licensePlate);
  }

  // Must stay above vehicles/:vehicleId or 'mine' would be read as an id.
  @Get('vehicles/mine')
  myVehicles(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.myVehicles(user.userId);
  }

  /** Host standing in one call: owns cars?, vetting steps done, next step. */
  @Get('hosting/status')
  hostingStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.hostingStatus(user.userId);
  }

  /** Staff decision on an ownership document. */
  @Roles(AppRole.ADMIN, AppRole.SUPPORT_AGENT)
  @Put('admin/vehicles/:vehicleId/ownership-review')
  reviewOwnership(@Param('vehicleId') id: string, @Body() dto: OwnershipReviewDto) {
    return this.svc.reviewOwnership(id, dto.decision);
  }

  @Get('listings/mine')
  myListings(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.myListings(user.userId);
  }

  @Get('vehicles/:vehicleId')
  getVehicle(@Param('vehicleId') id: string) {
    return this.svc.getVehicle(id);
  }

  // Added per explicit product decision (frontend architecture follow-up,
  // "vehicle hub" public-browsing gap): anonymous visitors to a listing
  // detail page need to see photos/specs without signing in, but
  // `getVehicle` above returns the full Vehicle record, including
  // ownerId, vin, licensePlateEnc, ownershipDocTokenRef,
  // ownershipVerificationStatus, and telematicsDeviceId — none of which
  // should be exposed to an unauthenticated caller. Rather than making
  // `getVehicle` itself @Public() (which would leak those fields), this is
  // a new, narrower, read-only projection. `getVehicle` above is
  // unchanged and still requires auth for every field on it.
  @Public()
  @Get('vehicles/:vehicleId/public-summary')
  getVehiclePublicSummary(@Param('vehicleId') id: string) {
    return this.svc.getVehiclePublicSummary(id);
  }

  @Put('vehicles/:vehicleId')
  updateVehicle(@Param('vehicleId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateVehicleSpecsDto) {
    return this.svc.updateVehicle(id, user.userId, dto);
  }

  // Audit §3 Critical / §1 Critical: real photo upload, replacing the
  // generic-icon-for-every-listing state. Mock-mode storage (see
  // PhotoStorageProvider) needs no external credentials to work end-to-end.
  @Post('vehicles/:vehicleId/photos')
  addPhoto(@Param('vehicleId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: AddVehiclePhotoDto) {
    return this.svc.addVehiclePhoto(id, user.userId, dto.photoBase64, dto.mimeType);
  }

  @Delete('vehicles/:vehicleId/photos/:photoId')
  removePhoto(@Param('vehicleId') id: string, @Param('photoId') photoId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.removeVehiclePhoto(id, photoId, user.userId);
  }

  @Put('vehicles/:vehicleId/photos/order')
  reorderPhotos(@Param('vehicleId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderVehiclePhotosDto) {
    return this.svc.reorderVehiclePhotos(id, dto.photoIds, user.userId);
  }

  @Post('vehicles/:vehicleId/ownership-documents')
  uploadOwnershipDoc(@Param('vehicleId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UploadOwnershipDocDto) {
    return this.svc.uploadOwnershipDocument(id, user.userId, dto.documentBase64);
  }

  @Post('vehicles/:vehicleId/condition-baseline')
  submitBaseline(@Param('vehicleId') id: string, @Body() dto: ConditionBaselineDto) {
    return this.svc.submitConditionBaseline(id, dto);
  }

  @Get('vehicles/:vehicleId/condition-baseline/latest')
  getLatestBaseline(@Param('vehicleId') id: string) {
    return this.svc.getLatestConditionBaseline(id);
  }

  @Post('vehicles/vin-decode')
  decodeVin(@Body() dto: VinDecodeDto) {
    return this.svc.decodeVin(dto.vin);
  }

  @Post('listings')
  createListing(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateListingDto) {
    return this.svc.createListing(user.userId, dto);
  }

  // Audit §4 Critical/High, §1 Critical/High: date-range availability
  // filtering, location/proximity, and a disclosed sort now replace the old
  // price-only-filter-then-createdAt-desc implementation.
  @Public()
  @Get('listings/search')
  search(@Query() query: SearchListingsQueryDto) {
    return this.svc.searchListings({
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      deliveryOnly: query.deliveryOnly,
      startDate: query.startDate,
      endDate: query.endDate,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
      sort: query.sort,
    });
  }

  @Public()
  @Get('listings/:listingId')
  getListing(@Param('listingId') id: string) {
    return this.svc.getListing(id);
  }

  @Put('listings/:listingId')
  updateListing(@Param('listingId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateListingDto) {
    return this.svc.updateListing(id, user.userId, dto);
  }

  @Delete('listings/:listingId')
  deactivateListing(@Param('listingId') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.deactivateListing(id, user.userId);
  }

  // Added per explicit product decision (frontend architecture follow-up,
  // "vehicle hub" public-browsing gap): a listing's availability calendar
  // contains only { date, status } — no PII, no owner-identifying data —
  // so unlike getVehicle, opening this endpoint directly (rather than via
  // a new projection) does not risk exposing anything sensitive. This
  // lets an anonymous visitor see which dates are open before signing up,
  // matching the requested "window shopping" browsing experience.
  @Public()
  @Get('listings/:listingId/calendar')
  getCalendar(@Param('listingId') id: string) {
    return this.svc.getCalendar(id);
  }

  @Put('listings/:listingId/calendar')
  updateCalendar(@Param('listingId') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCalendarDto) {
    return this.svc.updateCalendar(id, user.userId, dto.entries);
  }

  @Post('listings/:listingId/pricing-suggestion')
  pricingSuggestionProxy(@Param('listingId') id: string) {
    // [INFERRED] Proxies to the Pricing Engine Service in a full deployment (separate module here for domain separation).
    return { note: 'Proxies to Pricing Engine Service — see /pricing/suggestions', listingId: id };
  }
}