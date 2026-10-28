import { Module } from '@nestjs/common';
import { PartnersModule } from '../partners/partners.module';
import { BookingOptionsService } from './booking-options.service';
import {
  AdminRoomReviewsController, BookingOptionsController, PartnerRoomReviewsController, RoomReviewsController, RoomsController,
  TutorRoomsController,
} from './rooms.controller';
import { RoomReviewsService } from './room-reviews.service';
import { RoomsService } from './rooms.service';

@Module({
  imports: [PartnersModule],
  controllers: [
    RoomsController, TutorRoomsController, BookingOptionsController, RoomReviewsController, PartnerRoomReviewsController,
    AdminRoomReviewsController,
  ],
  providers: [RoomsService, BookingOptionsService, RoomReviewsService],
})
export class RoomsModule {}
