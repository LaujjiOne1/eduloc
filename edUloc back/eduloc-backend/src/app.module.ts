import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfig } from './core/config/app.config';
import { PrismaModule } from './core/prisma/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { CryptoModule } from './core/crypto/crypto.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RealtimeInfrastructureModule } from './infrastructure/realtime/realtime.module';
import { CallsInfrastructureModule } from './infrastructure/calls/calls.module';
import { StorageInfrastructureModule } from './infrastructure/storage/storage.module';
import { PushInfrastructureModule } from './infrastructure/push/push.module';
import { CacheInfrastructureModule } from './infrastructure/cache/cache.module';
import { OutboxInfrastructureModule } from './infrastructure/outbox/outbox.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BeneficiariesModule } from './modules/beneficiaries/beneficiaries.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { TutorsModule } from './modules/tutors/tutors.module';
import { SearchModule } from './modules/search/search.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AdminModule } from './modules/admin/admin.module';
import { GeoModule } from './modules/geo/geo.module';
import { MatchingModule } from './modules/matching/matching.module';
import { CvImportModule } from './modules/cv-import/cv-import.module';
import { PartnersModule } from './modules/partners/partners.module';
import { RoomsModule } from './modules/rooms/rooms.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (cfg: AppConfig) => ({
        secret: cfg.jwtSecret,
        signOptions: { expiresIn: cfg.jwtExpiresIn as `${number}${string}` },
      }),
    }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    RealtimeInfrastructureModule,
    CallsInfrastructureModule,
    StorageInfrastructureModule,
    PushInfrastructureModule,
    CacheInfrastructureModule,
    OutboxInfrastructureModule,
    AuthModule,
    UsersModule,
    BeneficiariesModule,
    CatalogModule,
    TutorsModule,
    SearchModule,
    BookingsModule,
    CommunicationModule,
    ReviewsModule,
    NotificationsModule,
    RealtimeModule,
    AdminModule,
    GeoModule,
    MatchingModule,
    CvImportModule,
    PartnersModule,
    RoomsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
