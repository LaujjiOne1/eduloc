import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { BookingsService } from './bookings.service';
import { CancelBookingDto, CreateBookingDto, ListBookingsQueryDto, RefuseBookingDto, StartSessionDto } from './dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  /** Devis : prix détaillé + blocage du créneau (Tuteur et salle) le temps de finaliser. */
  @Post('quote')
  quote(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.service.quote(user.userId, dto);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.service.createBooking(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListBookingsQueryDto) {
    return this.service.listMine(user.userId, q.role, q.status, q.limit);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getForUser(user.userId, id);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.acceptBooking(user.userId, id);
  }

  @Post(':id/refuse')
  refuse(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefuseBookingDto) {
    return this.service.refuseBooking(user.userId, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelBookingDto) {
    return this.service.cancelBooking(user.userId, id, dto, user.isAdmin);
  }

  @Get(':id/otp')
  otp(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getOtp(user.userId, id);
  }

  /** Cours en ligne : envoie le code au Tuteur dans la conversation (message système, pas de texte libre). */
  @Post(':id/otp/share')
  shareOtp(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.shareOtp(user.userId, id);
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartSessionDto) {
    return this.service.startSession(user.userId, id, dto.otp);
  }

  @Post(':id/complete')
  complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.completeSession(user.userId, id);
  }
}
