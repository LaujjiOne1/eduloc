import { createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { formatQuery } from '../../src/modules/matching/embedding/embedding-format';
import type { OllamaEmbeddingService } from '../../src/modules/matching/embedding/ollama-embedding.service';

/**
 * Embeddeur SIMULÉ et déterministe pour les tests d'intégration SQL : deux textes qui contiennent le même marqueur
 * « topic-xxx » ont des vecteurs identiques (similarité parfaite 1,0), des marqueurs différents donnent des vecteurs
 * quasi orthogonaux. Permet de prouver qu'un tuteur inéligible reste exclu MÊME avec une similarité parfaite.
 */
export function vectorFor(text: string): number[] {
  const topic = /topic-([a-z0-9]+)/.exec(text)?.[1] ?? text;
  const bytes: number[] = [];
  for (let counter = 0; bytes.length < 768; counter += 1) {
    bytes.push(...createHash('sha256').update(`${topic}#${counter}`).digest());
  }
  const v = bytes.slice(0, 768).map((b) => b / 127.5 - 1);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

export function makeFakeEmbedder() {
  const fake = {
    down: false,
    available: true,
    queries: [] as string[],
    async embedTexts(texts: string[]) {
      if (this.down) throw new ServiceUnavailableException('MATCHING_UNAVAILABLE');
      return texts.map(vectorFor);
    },
    async embedQuery(text: string) {
      if (this.down) throw new ServiceUnavailableException('MATCHING_UNAVAILABLE');
      this.queries.push(formatQuery(text));
      return vectorFor(text);
    },
    async isAvailable() {
      return this.available && !this.down;
    },
    async assertAvailable() {
      if (!(await this.isAvailable())) throw new ServiceUnavailableException('MATCHING_UNAVAILABLE');
    },
  };
  return { fake, embeddings: fake as unknown as OllamaEmbeddingService };
}
