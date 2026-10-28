import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { TutorApprovedGuard } from '../../common/guards/tutor-approved.guard';
import { BOOKING_MODES, BookingOptionsService } from './booking-options.service';
import { RoomsService } from './rooms.service';
import { RoomReviewsService } from './room-reviews.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminRoomReviewsQueryDto, CreateRoomReviewDto, HideRoomReviewDto, ReplyRoomReviewDto } from './room-reviews.dto';

class NearDto {
  @ValidateIf((o: NearDto) => o.lat !== undefined || o.lng !== undefined)
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ValidateIf((o: NearDto) => o.lat !== undefined || o.lng !== undefined)
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
}

class RoomsQueryDto extends NearDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(100_000) radiusM = 10_000;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

class OptionsQueryDto extends NearDto {
  /** Rayon maximal (m) autour de la position du demandeur ; ignoré sans lat/lng. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(100_000) maxDistanceM?: number;
}

class SlotsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date doit être au format AAAA-MM-JJ' }) date!: string;
  @IsIn(BOOKING_MODES) mode!: (typeof BOOKING_MODES)[number];
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsUUID() placeId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(15) @Max(480) durationMinutes?: number;
}

/** Salles partenaires : consultation PUBLIQUE sans compte, jamais d'adresse exacte (spec 9). */
@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly service: RoomsService, private readonly reviews: RoomReviewsService) {}

  /** Avis visibles de la salle et moyenne de chaque critère (publics, prénom de l'auteur seulement). */
  @Public()
  @Get(':id/reviews')
  reviewsOf(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.listPublic(id);
  }

  @Public()
  @Get()
  list(@Query() q: RoomsQueryDto) {
    return this.service.list({ lat: q.lat, lng: q.lng, radiusM: q.radiusM, limit: q.limit });
  }

  @Public()
  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @Query() q: NearDto) {
    return this.service.detail(id, q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined);
  }
}

/** Salles où le Tuteur accepte d'intervenir. Aucune réservation de salle : un simple accord. */
@ApiTags('tutors')
@ApiBearerAuth()
@UseGuards(TutorApprovedGuard)
@Controller('tutors/me/rooms')
export class TutorRoomsController {
  constructor(private readonly service: RoomsService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.service.listAccepted(u.userId); }
  @Put(':roomId') accept(@CurrentUser() u: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) { return this.service.accept(u.userId, roomId); }
  @Delete(':roomId') withdraw(@CurrentUser() u: AuthUser, @Param('roomId', ParseUUIDPipe) roomId: string) { return this.service.withdraw(u.userId, roomId); }
}

/** Parcours de réservation : modes / salles / durées compatibles, puis créneaux d'une date. Public (spec 2.1). */
@ApiTags('booking-options')
@Controller('booking-options')
export class BookingOptionsController {
  constructor(private readonly service: BookingOptionsService) {}

  @Public()
  @Get(':offerId')
  options(@Param('offerId', ParseUUIDPipe) offerId: string, @Query() q: OptionsQueryDto) {
    return this.service.options(offerId, q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined, q.maxDistanceM);
  }

  @Public()
  @Get(':offerId/slots')
  slots(@Param('offerId', ParseUUIDPipe) offerId: string, @Query() q: SlotsQueryDto) {
    return this.service.slots(offerId, q);
  }
}

/** Avis sur les salles : écriture réservée à qui a assisté à une séance terminée dans la salle. */
@ApiTags('rooms')
@ApiBearerAuth()
@Controller('room-reviews')
export class RoomReviewsController {
  constructor(private readonly service: RoomReviewsService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateRoomReviewDto) { return this.service.create(u.userId, dto); }
}

/** Avis des salles du Gestionnaire connecté et réponse unique. Limité à sa structure. */
@ApiTags('partner')
@ApiBearerAuth()
@Controller('partner/room-reviews')
export class PartnerRoomReviewsController {
  constructor(private readonly service: RoomReviewsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query('roomId') roomId?: string) {
    return this.service.listForManager(u.userId, roomId && /^[0-9a-f-]{36}$/i.test(roomId) ? roomId : undefined);
  }

  @Post(':id/reply')
  reply(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplyRoomReviewDto) {
    return this.service.reply(u.userId, id, dto.text);
  }
}

/** Modération : masquer un avis frauduleux, offensant ou contenant des informations privées (motif obligatoire). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/partners/room-reviews')
export class AdminRoomReviewsController {
  constructor(private readonly service: RoomReviewsService) {}

  @Get() list(@Query() q: AdminRoomReviewsQueryDto) { return this.service.listForAdmin({ hidden: q.hidden, roomId: q.roomId, limit: q.limit }); }
  @Post(':id/hide') hide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: HideRoomReviewDto) { return this.service.hide(u.userId, id, dto.reason); }
  @Post(':id/unhide') unhide(@Param('id', ParseUUIDPipe) id: string) { return this.service.unhide(id); }
}
