import { currentIntlLocale } from "@/i18n";
/** Utilitaires de semaine (semaine du lundi au dimanche, comme la grille hebdomadaire du tuteur). */

const DAY_MS = 86_400_000;

/** Lundi 00:00 (heure locale) de la semaine contenant `date`. */
export function startOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (monday.getDay() + 6) % 7; // lundi = 0 … dimanche = 6
  monday.setDate(monday.getDate() - offset);
  return monday;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const weekDays = (monday: Date): Date[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** Nombre de semaines entre deux lundis (arrondi, robuste au changement d'heure). */
export const weeksBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / (7 * DAY_MS));

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** « Octobre 2026 » ; sur deux mois : « Oct. – nov. 2026 ». */
export function weekMonthLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const month = (d: Date, style: "long" | "short") => new Intl.DateTimeFormat(currentIntlLocale(), { month: style }).format(d);
  if (monday.getMonth() === sunday.getMonth()) return `${cap(month(monday, "long"))} ${monday.getFullYear()}`;
  const years = monday.getFullYear() === sunday.getFullYear() ? `${sunday.getFullYear()}` : `${monday.getFullYear()}/${sunday.getFullYear()}`;
  return `${cap(month(monday, "short"))} – ${month(sunday, "short")} ${years}`;
}

/** « 12 – 18 octobre » ; sur deux mois : « 28 sept. – 4 oct. ». */
export function weekRangeLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date, withMonth: boolean) =>
    withMonth ? new Intl.DateTimeFormat(currentIntlLocale(), { day: "numeric", month: "short" }).format(d) : String(d.getDate());
  return monday.getMonth() === sunday.getMonth()
    ? `${monday.getDate()} – ${new Intl.DateTimeFormat(currentIntlLocale(), { day: "numeric", month: "long" }).format(sunday)}`
    : `${fmt(monday, true)} – ${fmt(sunday, true)}`;
}

/** « 12 oct. » */
export const shortDateLabel = (date: Date): string =>
  new Intl.DateTimeFormat(currentIntlLocale(), { day: "numeric", month: "short" }).format(date);

/** AAAA-MM-JJ (heure locale). */
export const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** « 2026-10-30 » → Date locale (minuit). */
export function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Premier jour du mois contenant `date`, décalé de `delta` mois. */
export const monthStart = (date: Date, delta = 0): Date => new Date(date.getFullYear(), date.getMonth() + delta, 1);

/** « Octobre 2026 ». */
export const monthYearLabel = (date: Date): string => cap(new Intl.DateTimeFormat(currentIntlLocale(), { month: "long", year: "numeric" }).format(date));

/** « Ven. 30 oct. » */
export const compactDateLabel = (date: Date): string =>
  cap(new Intl.DateTimeFormat(currentIntlLocale(), { weekday: "short", day: "numeric", month: "short" }).format(date));
