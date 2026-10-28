import { Module } from '@nestjs/common';
import { PartnerAdminController, PartnerController } from './partner.controller';
import { PartnerAdminService } from './partner-admin.service';
import { PartnerRoomsService } from './partner-rooms.service';
import { PartnerSubscriptionService } from './partner-subscription.service';
import { PartnerUploadsService } from './partner-support';
import { PartnerVenueService } from './partner-venue.service';

@Module({
  controllers: [PartnerController, PartnerAdminController],
  providers: [
    PartnerUploadsService, PartnerVenueService, PartnerRoomsService, PartnerSubscriptionService, PartnerAdminService,
  ],
  exports: [PartnerUploadsService],
})
export class PartnersModule {}
