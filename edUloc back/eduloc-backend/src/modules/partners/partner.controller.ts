import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import {
  AdminListQueryDto, AdminReservationsQueryDto, PlanDto, RegisterRoomPhotoDto, RegisterVenueDocumentDto,
  ReplaceRoomAvailabilitiesDto, ReservationsQueryDto, RoomBlockDto, RoomDto, RoomPublicationDecisionDto, RoomReviewDto,
  SelectPlanDto, SetRoomActiveDto, UpdatePlanDto, UpdateRoomDto, UpdateVenueDto, UploadRequestDto, VenueDto, VenueReviewDto,
} from './dto';
import { PartnerAdminService } from './partner-admin.service';
import { PartnerRoomsService } from './partner-rooms.service';
import { PartnerSubscriptionService } from './partner-subscription.service';
import { PartnerVenueService } from './partner-venue.service';

/**
 * Espace du Gestionnaire de lieu. Aucun rôle global : les routes sont limitées à la structure du compte connecté
 * (une salle d'une autre structure répond « introuvable »).
 */
@ApiTags('partner')
@ApiBearerAuth()
@Controller('partner')
export class PartnerController {
  constructor(
    private readonly venues: PartnerVenueService,
    private readonly rooms: PartnerRoomsService,
    private readonly subscriptions: PartnerSubscriptionService,
  ) {}

  // --- structure
  @Get('venue') venue(@CurrentUser() u: AuthUser) { return this.venues.get(u.userId); }
  @Post('venue') createVenue(@CurrentUser() u: AuthUser, @Body() dto: VenueDto) { return this.venues.create(u.userId, dto); }
  @Patch('venue') updateVenue(@CurrentUser() u: AuthUser, @Body() dto: UpdateVenueDto) { return this.venues.update(u.userId, dto); }
  @Post('venue/submit') submitVenue(@CurrentUser() u: AuthUser) { return this.venues.submit(u.userId); }

  @Post('venue/documents/upload-url')
  documentUpload(@CurrentUser() u: AuthUser, @Body() dto: UploadRequestDto) { return this.venues.requestDocumentUpload(u.userId, dto); }
  @Post('venue/documents')
  registerDocument(@CurrentUser() u: AuthUser, @Body() dto: RegisterVenueDocumentDto) { return this.venues.registerDocument(u.userId, dto); }
  @Delete('venue/documents/:id')
  removeDocument(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.venues.removeDocument(u.userId, id); }

  // --- offre commerciale
  @Get('plans') plans() { return this.subscriptions.listPlans(); }
  @Get('subscription') subscription(@CurrentUser() u: AuthUser) { return this.subscriptions.current(u.userId); }
  @Post('subscription') selectPlan(@CurrentUser() u: AuthUser, @Body() dto: SelectPlanDto) { return this.subscriptions.select(u.userId, dto.planId); }
  @Delete('subscription') cancelSubscription(@CurrentUser() u: AuthUser) { return this.subscriptions.cancel(u.userId); }

  // --- salles
  @Get('rooms') listRooms(@CurrentUser() u: AuthUser) { return this.rooms.list(u.userId); }
  @Post('rooms') createRoom(@CurrentUser() u: AuthUser, @Body() dto: RoomDto) { return this.rooms.create(u.userId, dto); }
  @Get('rooms/:id') room(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.get(u.userId, id); }
  @Patch('rooms/:id')
  updateRoom(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(u.userId, id, dto);
  }
  @Delete('rooms/:id') removeRoom(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.remove(u.userId, id); }
  @Post('rooms/:id/submit') submitRoom(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.submit(u.userId, id); }
  @Post('rooms/:id/publish') publishRoom(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.publish(u.userId, id); }
  @Post('rooms/:id/unpublish') unpublishRoom(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.unpublish(u.userId, id); }
  @Post('rooms/:id/active')
  setActive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRoomActiveDto) {
    return this.rooms.setActive(u.userId, id, dto.isActive);
  }

  // --- calendrier de la salle
  @Get('rooms/:id/availabilities')
  availabilities(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.listAvailabilities(u.userId, id); }
  @Put('rooms/:id/availabilities')
  replaceAvailabilities(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceRoomAvailabilitiesDto) {
    return this.rooms.replaceAvailabilities(u.userId, id, dto);
  }
  @Get('rooms/:id/blocks') blocks(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.listBlocks(u.userId, id); }
  @Post('rooms/:id/blocks')
  addBlock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomBlockDto) { return this.rooms.addBlock(u.userId, id, dto); }
  @Delete('rooms/:id/blocks/:blockId')
  removeBlock(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('blockId', ParseUUIDPipe) blockId: string) {
    return this.rooms.removeBlock(u.userId, id, blockId);
  }

  // --- photos
  @Post('rooms/:id/photos/upload-url')
  photoUpload(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UploadRequestDto) {
    return this.rooms.requestPhotoUpload(u.userId, id, dto);
  }
  @Post('rooms/:id/photos')
  registerPhoto(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegisterRoomPhotoDto) {
    return this.rooms.registerPhoto(u.userId, id, dto);
  }
  @Delete('rooms/:id/photos/:photoId')
  removePhoto(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('photoId', ParseUUIDPipe) photoId: string) {
    return this.rooms.removePhoto(u.userId, id, photoId);
  }

  // --- réservations confirmées
  @Get('reservations')
  reservations(@CurrentUser() u: AuthUser, @Query() q: ReservationsQueryDto) {
    return this.rooms.reservations(u.userId, q);
  }
  @Get('rooms/:id/reservations')
  roomReservations(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ReservationsQueryDto) {
    return this.rooms.reservations(u.userId, { ...q, roomId: id });
  }
}

/** Administration des lieux partenaires : examen des structures et des salles, souscriptions, réservations. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/partners')
export class PartnerAdminController {
  constructor(
    private readonly admin: PartnerAdminService,
    private readonly subscriptions: PartnerSubscriptionService,
  ) {}

  @Get('venues') venues(@Query() q: AdminListQueryDto) { return this.admin.listVenues(q.status, q.limit); }
  @Get('venues/:id') venue(@Param('id', ParseUUIDPipe) id: string) { return this.admin.venueDetail(id); }
  @Post('venues/:id/review')
  reviewVenue(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VenueReviewDto) {
    return this.admin.reviewVenue(u.userId, id, dto);
  }
  @Post('venues/:id/subscription/activate')
  activate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.subscriptions.activate(u.userId, id); }
  @Post('venues/:id/subscription/cancel')
  cancelSubscription(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { note?: string }) {
    return this.subscriptions.cancelByAdmin(u.userId, id, body?.note);
  }

  @Get('rooms') rooms(@Query() q: AdminListQueryDto) { return this.admin.listRooms(q.status, q.limit); }
  @Get('rooms/:id') room(@Param('id', ParseUUIDPipe) id: string) { return this.admin.roomDetail(id); }
  @Post('rooms/:id/review')
  reviewRoom(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomReviewDto) {
    return this.admin.reviewRoom(u.userId, id, dto);
  }
  @Post('rooms/:id/publication')
  publication(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoomPublicationDecisionDto) {
    return this.admin.decidePublication(u.userId, id, dto);
  }

  @Get('reservations') reservations(@Query() q: AdminReservationsQueryDto) { return this.admin.reservations(q); }

  @Get('plans') plans() { return this.subscriptions.listAllPlans(); }
  @Post('plans') createPlan(@Body() dto: PlanDto) { return this.subscriptions.createPlan(dto); }
  @Patch('plans/:id') updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) { return this.subscriptions.updatePlan(id, dto); }
}
