import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TUTOR_DOCUMENT_EXTRACT, TUTOR_SEARCH_REINDEX } from '../../../infrastructure/outbox/outbox-event-types';
import { MATCHING_UNAVAILABLE, OllamaEmbeddingService } from '../embedding/ollama-embedding.service';
import { DocumentTextService } from './document-text.service';
import { SearchIndexService } from './search-index.service';

interface ClaimedEvent {
  id: string;
  aggregateId: string;
  eventType: string;
  attempts: number;
}

/** Au-delà, l'événement est abandonné (sauf indisponibilité d'Ollama : on réessaie tant qu'il est down). */
const MAX_ATTEMPTS = 10;
/** Réservation d'un lot : si le process meurt, les événements redeviennent disponibles après ce délai. */
const CLAIM_MINUTES = 10;

export type IndexingHandler = (aggregateId: string) => Promise<void>;

/**
 * Traite les événements d'indexation de l'outbox (TUTOR_SEARCH_REINDEX, TUTOR_DOCUMENT_EXTRACT) hors du relay
 * générique : l'appel à Ollama peut durer plus longtemps que la transaction du relay.
 *  - Plusieurs événements en attente pour un même agrégat sont FUSIONNÉS (un seul traitement).
 *  - Ollama indisponible ⇒ les événements de réindexation ne sont même pas réservés : ils attendent, sans
 *    consommer de tentative (l'outbox « réessaie » tant que le matching est indisponible).
 */
@Injectable()
export class IndexingProcessor {
  private readonly logger = new Logger(IndexingProcessor.name);
  private readonly handlers = new Map<string, IndexingHandler>();
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: OllamaEmbeddingService,
    private readonly index: SearchIndexService,
    private readonly documents: DocumentTextService,
  ) {
    this.register(TUTOR_SEARCH_REINDEX, async (tutorProfileId) => void (await this.index.reindexTutor(tutorProfileId)));
    this.register(TUTOR_DOCUMENT_EXTRACT, (documentId) => this.documents.extractDocument(documentId));
  }

  register(eventType: string, handler: IndexingHandler): void {
    this.handlers.set(eventType, handler);
  }

  @Cron('*/5 * * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processPending();
    } catch (err) {
      this.logger.error(`Traitement des événements d'indexation : ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Un passage : réserve, fusionne, traite. Public pour les tests et la commande de réindexation. */
  async processPending(): Promise<number> {
    const all = [...this.handlers.keys()];
    // Les réindexations exigent Ollama ; l'extraction de texte n'en dépend pas.
    const types = (await this.embeddings.isAvailable()) ? all : all.filter((type) => type !== TUTOR_SEARCH_REINDEX);
    if (!types.length) return 0;

    const claimed = await this.prisma.$queryRaw<ClaimedEvent[]>(Prisma.sql`
      UPDATE outbox_events SET "lockedUntil" = now() + ${CLAIM_MINUTES} * interval '1 minute'
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE "processedAt" IS NULL AND "eventType" = ANY(${types}::text[])
          AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
        ORDER BY "createdAt" ASC LIMIT 100 FOR UPDATE SKIP LOCKED)
      RETURNING id, "aggregateId", "eventType", attempts`);
    if (!claimed.length) return 0;

    const groups = new Map<string, ClaimedEvent[]>();
    for (const ev of claimed) groups.set(`${ev.eventType}|${ev.aggregateId}`, [...(groups.get(`${ev.eventType}|${ev.aggregateId}`) ?? []), ev]);

    for (const events of groups.values()) {
      const { eventType, aggregateId } = events[0];
      const ids = events.map((e) => e.id);
      try {
        await this.handlers.get(eventType)!(aggregateId);
        await this.prisma.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { processedAt: new Date(), lastError: null } });
      } catch (err) {
        await this.fail(events, err as Error);
      }
    }
    return claimed.length;
  }

  private async fail(events: ClaimedEvent[], err: Error): Promise<void> {
    const unavailable = err.message === MATCHING_UNAVAILABLE;
    for (const ev of events) {
      const attempts = unavailable ? ev.attempts : ev.attempts + 1;
      const abandoned = !unavailable && attempts >= MAX_ATTEMPTS;
      await this.prisma.outboxEvent.update({
        where: { id: ev.id },
        data: {
          attempts,
          lastError: err.message.slice(0, 500),
          lockedUntil: new Date(Date.now() + Math.min(60_000, 2 ** Math.min(attempts, 6) * 1000)),
          ...(abandoned ? { processedAt: new Date() } : {}),
        },
      });
    }
    this.logger.warn(`${events[0].eventType} ${events[0].aggregateId} : ${err.message}`);
  }
}
