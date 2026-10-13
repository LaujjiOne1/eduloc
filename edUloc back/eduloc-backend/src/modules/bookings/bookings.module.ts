import { Module } from '@nestjs/common';
import { RateLimitService } from '../../common/rate-limit.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { LessonRemindersService } from './lesson-reminders.service';
import { BookingsRepository } from './bookings.repository';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository, RateLimitService, LessonRemindersService],
  exports: [BookingsService],
})
export class BookingsModule {}
