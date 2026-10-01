import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/request-with-user';
import { CompanyProfileService } from './company-profile.service';
import { CreateCompanyProfileDto, UpdateCompanyProfileDto, AssignVehicleToCompanyDto } from './dto/company-profile.dto';

@ApiTags('company-profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CompanyProfileController {
  constructor(private readonly svc: CompanyProfileService) {}

  @Post('company-profiles')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCompanyProfileDto) {
    return this.svc.createCompanyProfile(user.userId, dto);
  }

  // Must be registered before the `:companyProfileId` route below, or Nest/Express
  // would try to match "me" as a companyProfileId value instead.
  @Get('company-profiles/me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getMyCompanyProfile(user.userId);
  }

  // Public for the same reason listings/search and listings/:id are public:
  // this is the hub page a signed-out visitor lands on to browse a company's
  // vehicles. Does not expose anything beyond name/description/vehicles/active
  // listings — no ownerUserId-linked PII (the User record itself is never
  // fetched or returned here).
  @Public()
  @Get('company-profiles/:companyProfileId')
  get(@Param('companyProfileId') id: string) {
    return this.svc.getCompanyProfile(id);
  }

  @Put('company-profiles/:companyProfileId')
  update(
    @Param('companyProfileId') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    return this.svc.updateCompanyProfile(id, user.userId, dto);
  }

  @Post('company-profiles/:companyProfileId/vehicles')
  assignVehicle(
    @Param('companyProfileId') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignVehicleToCompanyDto,
  ) {
    return this.svc.assignVehicle(id, user.userId, dto.vehicleId);
  }

  @Delete('company-profiles/:companyProfileId/vehicles/:vehicleId')
  unassignVehicle(
    @Param('companyProfileId') id: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.unassignVehicle(id, user.userId, vehicleId);
  }
}
