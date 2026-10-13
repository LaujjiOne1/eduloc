import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RateLimitService } from '../../common/rate-limit.service';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

@Module({
  imports: [HttpModule],
  controllers: [GeoController],
  providers: [GeoService, RateLimitService],
})
export class GeoModule {}
