import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { RateLimitService } from '../../common/rate-limit.service';
import { CatalogService } from './catalog.service';

@Module({ controllers: [CatalogController], providers: [CatalogService, RateLimitService] })
export class CatalogModule {}
