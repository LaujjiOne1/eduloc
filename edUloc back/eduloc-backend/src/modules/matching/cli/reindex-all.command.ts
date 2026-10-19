/**
 * Réindexation globale (spec §4 et §7) : à lancer au premier déploiement et après un changement de
 * EMBEDDING_MODEL ou EMBEDDING_DIM (le hash inclut le modèle : tout est alors recalculé).
 *
 *   node dist/modules/matching/cli/reindex-all.command.js            # tous les tuteurs approuvés
 *   node dist/modules/matching/cli/reindex-all.command.js <id> ...   # seulement ces tuteurs
 *   docker compose run --rm api node dist/modules/matching/cli/reindex-all.command.js
 */
import 'dotenv/config';
import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../../../core/prisma/prisma.module';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisModule } from '../../../core/redis/redis.module';
import { CacheInfrastructureModule } from '../../../infrastructure/cache/cache.module';
import { StorageInfrastructureModule } from '../../../infrastructure/storage/storage.module';
import { MatchingModule } from '../matching.module';
import { OllamaEmbeddingService } from '../embedding/ollama-embedding.service';
import { SearchIndexService } from '../indexing/search-index.service';

// MatchingModule dépend du stockage (extraction des justificatifs) et de SearchModule (cache) : même socle que AppModule.
@Module({
  imports: [PrismaModule, RedisModule, CacheInfrastructureModule, StorageInfrastructureModule, MatchingModule],
})
class ReindexCliModule {}

async function main(): Promise<number> {
  const app = await NestFactory.createApplicationContext(ReindexCliModule, { logger: ['error', 'warn', 'log'] });
  const logger = new Logger('ReindexAll');
  try {
    const embeddings = app.get(OllamaEmbeddingService);
    if (!(await embeddings.isAvailable())) {
      logger.error('Matching indisponible (Ollama injoignable ou modèle absent) : réindexation impossible.');
      return 2;
    }
    const prisma = app.get(PrismaService);
    const index = app.get(SearchIndexService);
    const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
    const tutors = requested.length
      ? requested.map((id) => ({ id }))
      : await prisma.tutorProfile.findMany({
          where: { applications: { some: { status: 'APPROVED' } } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
    let failed = 0;
    let embedded = 0;
    for (const [i, tutor] of tutors.entries()) {
      try {
        const result = await index.reindexTutor(tutor.id);
        embedded += result.embedded;
        logger.log(`[${i + 1}/${tutors.length}] ${tutor.id} : ${result.indexed ? `${result.embedded} calculé(s), ${result.kept} inchangé(s), ${result.deleted} supprimé(s)` : 'ignoré (non approuvé)'}`);
      } catch (err) {
        failed += 1;
        logger.error(`[${i + 1}/${tutors.length}] ${tutor.id} : ${(err as Error).message}`);
      }
    }
    logger.log(`Terminé : ${tutors.length - failed}/${tutors.length} tuteur(s) indexé(s), ${embedded} chunk(s) calculé(s), ${failed} échec(s).`);
    return failed ? 1 : 0;
  } finally {
    await app.close();
  }
}

void main().then((code) => process.exit(code));
