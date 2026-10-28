/** Durées réservables d'une offre : la durée par défaut plus celles que le Tuteur a configurées (spec 4.3). */
export function allowedDurations(offer: { durationMinutes: number; durationOptions?: number[] | null }): number[] {
  return [...new Set([offer.durationMinutes, ...(offer.durationOptions ?? [])])].sort((a, b) => a - b);
}
