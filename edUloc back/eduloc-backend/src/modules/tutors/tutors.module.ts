import { Module } from '@nestjs/common';
import {
  AvailabilitiesController, OffersController, PlacesController, TutorsController,
} from './tutors.controller';
import { TutorApplicationsController } from './tutor-applications.controller';
import { TutorApplicationsService } from './tutor-applications.service';
import {
  AvailabilitiesService, OffersService, PlacesService, TutorsService,
} from './tutors.service';

@Module({
  controllers: [TutorsController, OffersController, PlacesController, AvailabilitiesController, TutorApplicationsController],
  providers: [TutorsService, OffersService, PlacesService, AvailabilitiesService, TutorApplicationsService],
})
export class TutorsModule {}
