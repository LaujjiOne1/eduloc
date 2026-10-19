import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { OllamaEmbeddingService } from './embedding/ollama-embedding.service';

/**
 * Sonde `GET /health` (hors préfixe /api). Répond toujours 200 tant que l'API tourne, même sans Ollama :
 * la disponibilité du matching est un état distinct (spec §14.5).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly embeddings: OllamaEmbeddingService) {}

  @Public()
  @Get()
  async health(): Promise<{ status: 'ok'; matching: 'available' | 'unavailable' }> {
    return { status: 'ok', matching: (await this.embeddings.isAvailable()) ? 'available' : 'unavailable' };
  }
}
