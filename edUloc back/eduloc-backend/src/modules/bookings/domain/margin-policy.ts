/**
 * Marges entre séances (spec lieux partenaires 4.4). Les durées sont des paramètres de configuration à confirmer
 * (BOOKING_BUFFER_MINUTES, BOOKING_TRAVEL_BUFFER_MINUTES, ROOM_TURNOVER_BUFFER_MINUTES), jamais des constantes ici.
 */
export interface MarginConfig {
  /** Marge minimale entre deux séances du même Tuteur au même endroit (ou à distance). */
  bufferMinutes: number;
  /** Marge entre deux séances en présentiel dans des lieux différents. */
  travelBufferMinutes: number;
}

export interface BusyInterval {
  startAt: Date;
  endAt: Date;
  /** Lieu physique (voir locationKeyOf) ; null = séance en ligne (aucun déplacement). */
  locationKey: string | null;
}

const MIN = 60_000;

/** Données de réservation nécessaires pour identifier le lieu physique d'une séance. */
export interface LocationSource {
  teachingMode: string;
  roomId?: string | null;
  placeId?: string | null;
  address?: string | null;
}

/** Deux séances « au même endroit » ont la même clé ; une séance en ligne n'a pas de lieu. */
export function locationKeyOf(b: LocationSource): string | null {
  switch (b.teachingMode) {
    case 'ONLINE':
      return null;
    case 'PARTNER_ROOM':
      return `room:${b.roomId ?? '?'}`;
    case 'AT_HOME_BENEFICIARY':
      return `home:${(b.address ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
    default:
      return b.placeId ? `place:${b.placeId}` : `mode:${b.teachingMode}`;
  }
}

export class MarginPolicy {
  /** Marge exigée entre deux séances : déplacement si les deux sont en présentiel dans des lieux différents. */
  static requiredGapMinutes(a: string | null, b: string | null, cfg: MarginConfig): number {
    if (a !== null && b !== null && a !== b) return Math.max(cfg.bufferMinutes, cfg.travelBufferMinutes);
    return cfg.bufferMinutes;
  }

  /** Plus grande marge possible : fenêtre de recherche des séances voisines. */
  static maxGapMinutes(cfg: MarginConfig): number {
    return Math.max(cfg.bufferMinutes, cfg.travelBufferMinutes);
  }

  /** Première séance qui chevauche le créneau une fois la marge appliquée (marge = 0 → simple chevauchement). */
  static findConflict<T extends BusyInterval>(
    candidate: BusyInterval,
    others: readonly T[],
    cfg: MarginConfig,
  ): T | null {
    for (const other of others) {
      const gap = MarginPolicy.requiredGapMinutes(candidate.locationKey, other.locationKey, cfg) * MIN;
      if (candidate.startAt.getTime() < other.endAt.getTime() + gap && candidate.endAt.getTime() + gap > other.startAt.getTime()) {
        return other;
      }
    }
    return null;
  }

  /** Salle : une seule séance à la fois, plus un éventuel temps de rotation entre deux séances. */
  static roomOverlaps(
    candidate: { startAt: Date; endAt: Date },
    others: readonly { startAt: Date; endAt: Date }[],
    turnoverMinutes: number,
  ): boolean {
    const gap = turnoverMinutes * MIN;
    return others.some((o) => candidate.startAt.getTime() < o.endAt.getTime() + gap && candidate.endAt.getTime() + gap > o.startAt.getTime());
  }
}
