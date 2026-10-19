import type { Prisma } from '../../../generated/prisma/client';
import { TUTOR_DOCUMENT_EXTRACT, TUTOR_SEARCH_REINDEX } from '../../../infrastructure/outbox/outbox-event-types';

type OutboxDb = Pick<Prisma.TransactionClient, 'outboxEvent'>;

async function enqueue(db: OutboxDb, eventType: string, aggregateType: string, aggregateId: string, payload: Prisma.InputJsonObject) {
  // Un événement identique déjà en attente (non réservé) suffit : les doublons sont de toute façon fusionnés au traitement.
  const pending = await db.outboxEvent.findFirst({
    where: { eventType, aggregateId, processedAt: null, lockedUntil: null },
    select: { id: true },
  });
  if (pending) return;
  await db.outboxEvent.create({ data: { aggregateType, aggregateId, eventType, recipientIds: [], payload } });
}

/**
 * Demande la réindexation complète d'un tuteur (spec §4). À appeler DANS la transaction métier qui modifie le profil,
 * une expérience, une matière, une offre ou le statut d'un document : l'embedding n'est jamais calculé dans la requête HTTP.
 */
export const enqueueTutorReindex = (db: OutboxDb, tutorProfileId: string) =>
  enqueue(db, TUTOR_SEARCH_REINDEX, 'TutorProfile', tutorProfileId, {});

/** Demande l'extraction du texte d'un document uploadé (tâche de fond, lot 6). */
export const enqueueDocumentExtraction = (db: OutboxDb, tutorDocumentId: string) =>
  enqueue(db, TUTOR_DOCUMENT_EXTRACT, 'TutorDocument', tutorDocumentId, {});
