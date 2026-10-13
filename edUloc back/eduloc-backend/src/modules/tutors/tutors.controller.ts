import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import {
  AvailabilityDto, BlockPeriodDto, OfferDto, PlaceDto, ProfileDto, SetActiveDto, SubjectDto,
  UpdateAvailabilityDto, UpdateOfferDto, UpdatePlaceDto,
} from './tutors.dto';
import {
  AvailabilitiesService, OffersService, PlacesService, TutorsService,
} from './tutors.service';

@ApiTags('tutors')
@ApiBearerAuth()
@Controller('tutors')
export class TutorsController {
  constructor(private readonly service: TutorsService) {}

  @Get('me/profile')
  me(@CurrentUser() u: AuthUser) {
    return this.service.myProfile(u.userId);
  }

  @Post('me/profile')
  create(@CurrentUser() u: AuthUser, @Body() dto: ProfileDto) {
    return this.service.createProfile(u.userId, {
      ...dto,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
    });
  }

  @Patch('me/profile')
  update(@CurrentUser() u: AuthUser, @Body() dto: ProfileDto) {
    return this.service.updateProfile(u.userId, dto);
  }

  @Post('me/subjects')
  addSubject(@CurrentUser() u: AuthUser, @Body() dto: SubjectDto) {
    return this.service.addSubject(u.userId, dto);
  }

  @Delete('me/subjects/:id')
  removeSubject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeSubject(u.userId, id);
  }
}

@ApiTags('offers')
@ApiBearerAuth()
@Controller('tutors/me/offers')
export class OffersController {
  constructor(private readonly service: OffersService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) { return this.service.listMine(u.userId); }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: OfferDto) { return this.service.create(u.userId, dto); }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOfferDto) {
    return this.service.update(u.userId, id, dto);
  }

  @Post(':id/active')
  setActive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: SetActiveDto) {
    return this.service.setActive(u.userId, id, body.isActive);
  }
}

@ApiTags('places')
@ApiBearerAuth()
@Controller('tutors/me/places')
export class PlacesController {
  constructor(private readonly service: PlacesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) { return this.service.listMine(u.userId); }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: PlaceDto) { return this.service.create(u.userId, dto); }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlaceDto) {
    return this.service.update(u.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(u.userId, id);
  }
}

@ApiTags('availabilities')
@ApiBearerAuth()
@Controller('tutors/me/availabilities')
export class AvailabilitiesController {
  constructor(private readonly service: AvailabilitiesService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) { return this.service.listMine(u.userId); }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() dto: AvailabilityDto) {
    return this.service.create(u.userId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAvailabilityDto) {
    return this.service.update(u.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(u.userId, id);
  }

  @Post('blocks')
  block(@CurrentUser() u: AuthUser, @Body() dto: BlockPeriodDto) {
    return this.service.blockPeriod(u.userId, {
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      reason: dto.reason,
    });
  }

  @Get('blocks')
  blocks(@CurrentUser() u: AuthUser) { return this.service.listBlocked(u.userId); }

  @Delete('blocks/:id')
  unblock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.unblock(u.userId, id);
  }
}
