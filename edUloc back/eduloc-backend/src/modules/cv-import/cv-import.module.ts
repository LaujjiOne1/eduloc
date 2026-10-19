import { Module } from '@nestjs/common';
import { RateLimitService } from '../../common/rate-limit.service';
import { MatchingModule } from '../matching/matching.module';
import { CvExtractorService } from './cv-extractor.service';
import { CvImportController } from './cv-import.controller';
import { CvImportService } from './cv-import.service';
import { SubjectMatcherService } from './subject-matcher.service';

@Module({
  imports: [MatchingModule],
  controllers: [CvImportController],
  providers: [CvImportService, CvExtractorService, SubjectMatcherService, RateLimitService],
})
export class CvImportModule {}
