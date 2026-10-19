import { CanActivate, Injectable } from '@nestjs/common';
import { OllamaEmbeddingService } from './embedding/ollama-embedding.service';

/**
 * À poser sur les routes qui exigent des embeddings (POST /matching/search, lot 4) :
 * Ollama arrêté ou modèle absent ⇒ 503 MATCHING_UNAVAILABLE, le reste de l'API continue de fonctionner.
 */
@Injectable()
export class MatchingAvailableGuard implements CanActivate {
  constructor(private readonly embeddings: OllamaEmbeddingService) {}

  async canActivate(): Promise<boolean> {
    await this.embeddings.assertAvailable();
    return true;
  }
}
