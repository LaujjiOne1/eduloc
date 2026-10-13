/** Règle de disponibilité (forme minimale découplée de Prisma). */
export interface AvailabilityRule {
  id: string;
  dayOfWeek: number;
  startTime: string; // "HH:mm" heure locale du fuseau `timezone`
  endTime: string;
  timezone: string;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
  offerId: string | null;
  placeId: string | null;
  placeType: string | null; // PlaceType
}

export type TeachingMode = 'ONLINE' | 'AT_HOME_BENEFICIARY' | 'AT_HOME_TUTOR' | 'PUBLIC_PLACE';

const MODE_TO_PLACE: Record<TeachingMode, string> = {
  ONLINE: 'ONLINE',
  AT_HOME_BENEFICIARY: 'BENEFICIARY_HOME',
  AT_HOME_TUTOR: 'TUTOR_HOME',
  PUBLIC_PLACE: 'PUBLIC_PLACE',
};

interface TzParts {
  day: number;
  minutes: number;
  /** Date LOCALE (fuseau de la règle) au format AAAA-MM-JJ. */
  date: string;
}

// Un Intl.DateTimeFormat coûte cher à construire et computeSlots l'appelle des milliers de fois.
const formatters = new Map<string, Intl.DateTimeFormat>();

function tzParts(date: Date, timeZone: string): TzParts {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
    formatters.set(timeZone, fmt);
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: days[parts.weekday] ?? 0,
    minutes: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export class SlotPolicy {
  /** Le créneau [startAt, endAt) doit être couvert ENTIÈREMENT par une règle active. */
  static matchRule(
    rules: AvailabilityRule[],
    startAt: Date,
    endAt: Date,
    teachingMode: TeachingMode,
    placeId: string | undefined,
    offerId: string,
  ): AvailabilityRule | null {
    if (startAt >= endAt) return null;
    for (const rule of rules) {
      if (!rule.isActive) continue;
      if (rule.offerId && rule.offerId !== offerId) continue;
      const s = tzParts(startAt, rule.timezone);
      const e = tzParts(new Date(endAt.getTime() - 1), rule.timezone);
      // validFrom / validUntil sont des DATES (jours inclus) dans le fuseau de la règle :
      // une disponibilité ponctuelle a validFrom = validUntil = le jour concerné.
      if (rule.validFrom && s.date < isoDate(rule.validFrom)) continue;
      if (rule.validUntil && e.date > isoDate(rule.validUntil)) continue;
      if (s.day !== e.day) continue;
      if (s.day !== rule.dayOfWeek) continue;
      const rs = toMin(rule.startTime);
      const re = toMin(rule.endTime);
      if (s.minutes < rs || e.minutes >= re) continue;
      if (rule.placeId && placeId && rule.placeId !== placeId) continue;
      if (rule.placeType && rule.placeType !== MODE_TO_PLACE[teachingMode]) continue;
      if (placeId && !rule.placeId && rule.placeType !== MODE_TO_PLACE[teachingMode]) continue;
      return rule;
    }
    return null;
  }

  /** Prochains créneaux calculés en mémoire (anti-N+1 : 2 requêtes pour 20 tuteurs). */
  static computeSlots(
    rules: AvailabilityRule[],
    blocked: { startAt: Date; endAt: Date }[],
    busy: { startAt: Date; endAt: Date }[],
    from: Date,
    days: number,
    durationMin: number,
    teachingModes: TeachingMode[],
    offerId: string,
    notBefore: Date = from,
  ): { startAt: Date; endAt: Date; availabilityId: string; placeId: string | null; teachingMode: TeachingMode }[] {
    const out: { startAt: Date; endAt: Date; availabilityId: string; placeId: string | null; teachingMode: TeachingMode }[] = [];
    // Créneaux proposés = consécutifs, sans chevauchement, par plage et par mode (18:00, 19:00, 20:00 pour des
    // séances d'1 h) plutôt que toutes les demi-heures. La réservation accepte quand même n'importe quel départ
    // couvert par la plage (matchRule) : seule la LISTE affichée est allégée.
    const lastEnd = new Map<string, number>();
    const dayMs = 86_400_000;
    const stepMs = 30 * 60_000;
    for (let d = 0; d < days && out.length < 20; d++) {
      const dayStart = new Date(from.getTime() + d * dayMs);
      for (let t = 0; t < dayMs; t += stepMs) {
        const s = new Date(dayStart.getTime() + t);
        if (s.getTime() < notBefore.getTime()) continue;
        const e = new Date(s.getTime() + durationMin * 60_000);
        if (blocked.some((b) => s < b.endAt && e > b.startAt)) continue;
        if (busy.some((b) => s < b.endAt && e > b.startAt)) continue;
        const emittedPlaceless = new Set<string>();
        for (const teachingMode of teachingModes) {
          if (out.length >= 20) break;
          const rule = SlotPolicy.matchRule(rules, s, e, teachingMode, undefined, offerId);
          if (rule) {
            // Une plage sans lieu précis autorise tous les modes : un seul créneau suffit (pas de doublons).
            if (!rule.placeType) {
              if (emittedPlaceless.has(rule.id)) continue;
              emittedPlaceless.add(rule.id);
            }
            const key = `${rule.id}|${teachingMode}`;
            if (s.getTime() < (lastEnd.get(key) ?? 0)) continue;
            lastEnd.set(key, e.getTime());
            out.push({
              startAt: s,
              endAt: e,
              availabilityId: rule.id,
              placeId: rule.placeId,
              teachingMode,
            });
          }
        }
        if (out.length >= 20) break;
      }
    }
    return out;
  }
}
