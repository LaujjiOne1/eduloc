import { Module } from '@nestjs/common';
import { RateLimitService } from '../../common/rate-limit.service';
import { SearchModule } from '../search/search.module';
import { OllamaEmbeddingService } from './embedding/ollama-embedding.service';
import { ChunkBuilderService } from './indexing/chunk-builder.service';
import { DocumentTextService } from './indexing/document-text.service';
import { PaddleOcrClient } from './indexing/paddle-ocr.client';
import { IndexingProcessor } from './indexing/indexing.processor';
import { SearchIndexService } from './indexing/search-index.service';
import { HealthController } from './health.controller';
import { MatchingAvailableGuard } from './matching-available.guard';
import { MatchingController } from './matching.controller';
import { NextSlotsService } from './search/next-slots.service';
import { MatchingSearchService } from './search/matching-search.service';
import { PreselectionRepository } from './search/preselection.repository';
import { SemanticRankingRepository } from './search/semantic-ranking.repository';

@Module({
  imports: [SearchModule],
  controllers: [HealthController, MatchingController],
  providers: [
    OllamaEmbeddingService, MatchingAvailableGuard, ChunkBuilderService, SearchIndexService, PaddleOcrClient, DocumentTextService, IndexingProcessor,
    RateLimitService, PreselectionRepository, SemanticRankingRepository, NextSlotsService, MatchingSearchService,
  ],
  exports: [OllamaEmbeddingService, MatchingAvailableGuard, SearchIndexService, DocumentTextService, IndexingProcessor],
})
export class MatchingModule {}
