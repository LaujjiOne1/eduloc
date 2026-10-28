import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { CommunicationModule } from '../communication/communication.module';
import { AcademicLevelService } from './academic-level.service';
import { AdminController } from './admin.controller';
import { AdminDirectoryService } from './admin-directory.service';
import { AdminService } from './admin.service';
import { DegreeEquivalencesService } from './degree-equivalences.service';

@Module({
  imports: [BookingsModule, CommunicationModule],
  controllers: [AdminController],
  providers: [AdminService, AdminDirectoryService, AcademicLevelService, DegreeEquivalencesService],
})
export class AdminModule {}
