import { UnprocessableEntityException } from '@nestjs/common';
import { trackKindOfLevel } from './education-levels';

/** Lecture minimale de la base : accepte PrismaService comme un client de transaction. */
interface TrackReader {
  educationLevel: {
    findUnique(args: { where: { id: string }; select: { name: true; category: true } }): Promise<{ name: string; category: string } | null>;
  };
  academicTrack: {
    findFirst(args: { where: { id: string; isActive: true }; select: { kind: true; levelName: true } }): Promise<{ kind: 'SERIE' | 'MENTION'; levelName: string | null } | null>;
  };
}

/**
 * Cohérence niveau / filière d'une offre :
 *   - Première et Terminale exigent une série (la réforme et l'ancien programme coexistent : OSE, S, L, A1, A2, C, D) ;
 *   - une mention n'est jamais obligatoire, mais si elle est donnée le niveau doit être universitaire ;
 *   - une série est propre à son niveau (Première ↔ Terminale en parallèle) ;
 *   - une filière ne peut pas accompagner un niveau qui n'en a pas (Primaire, Collège, Seconde).
 */
export async function assertOfferTrack(db: TrackReader, educationLevelId: string | null | undefined, trackId: string | null | undefined): Promise<void> {
  const level = educationLevelId
    ? await db.educationLevel.findUnique({ where: { id: educationLevelId }, select: { name: true, category: true } })
    : null;
  const expectedKind = level ? trackKindOfLevel(level.category, level.name) : null;

  if (!trackId) {
    if (expectedKind === 'SERIE') throw new UnprocessableEntityException('TRACK_REQUIRED');
    return;
  }
  const track = await db.academicTrack.findFirst({ where: { id: trackId, isActive: true }, select: { kind: true, levelName: true } });
  if (!track) throw new UnprocessableEntityException('UNKNOWN_TRACK');
  if (track.kind !== expectedKind) throw new UnprocessableEntityException('TRACK_NOT_ALLOWED_FOR_LEVEL');
  // Une série est celle d'un niveau précis : PS pour la Première, TS pour la Terminale.
  if (track.kind === 'SERIE' && track.levelName !== level?.name) throw new UnprocessableEntityException('TRACK_NOT_ALLOWED_FOR_LEVEL');
}
