import { API_CONFIG } from "../config";
import type { HHmm, IsoDate, IsoDateTime, MoneyDto } from "../contracts/dto";
import { t } from "@/i18n";
import { monthShortNames, monthNames, weekdayNames } from "@/i18n/dates";

/**
 * Tous les libellés d'écran sont calculés ici, à partir des dates ISO UTC de l'API.
 * Fuseau métier Indian/Antananarivo = UTC+3 fixe (pas d'heure d'été) : on n'utilise pas
 * Intl.timeZone (support inégal sous Hermes) → calcul déterministe et testable.
 */
const OFFSET_MS = API_CONFIG.businessUtcOffsetMinutes * 60_000;
const pad = (n: number) => String(n).padStart(2, "0");

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hours: number;
  minutes: number;
  dayOfWeek: number; // 0 = dimanche
}

export function toLocalParts(iso: IsoDateTime): LocalParts {
  const d = new Date(new Date(iso).getTime() + OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    dayOfWeek: d.getUTCDay(),
  };
}

/** "2026-10-03" (date locale) */
export function localDate(iso: IsoDateTime): IsoDate {
  const p = toLocalParts(iso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
/** "14:00" (heure locale) */
export function localTime(iso: IsoDateTime): HHmm {
  const p = toLocalParts(iso);
  return `${pad(p.hours)}:${pad(p.minutes)}`;
}
/** Date + heure locales → ISO UTC. */
export function localToUtcIso(date: IsoDate, time: HHmm): IsoDateTime {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - OFFSET_MS).toISOString();
}
/** Jour de la semaine d'une date locale "YYYY-MM-DD" (0 = dimanche). */
export function dayOfWeekOf(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function dayName(dayOfWeek: number): string {
  return weekdayNames()[dayOfWeek] ?? "";
}
/** "Samedi 3 octobre" — accepte un ISO datetime ou une date locale "YYYY-MM-DD". */
export function dateLabel(isoOrDate: string): string {
  const iso = isoOrDate.length === 10 ? localToUtcIso(isoOrDate, "12:00") : isoOrDate;
  const p = toLocalParts(iso);
  return `${weekdayNames()[p.dayOfWeek]} ${p.day} ${monthNames()[p.month - 1]}`;
}
export function timeRangeLabel(startIso: IsoDateTime, endIso: IsoDateTime): string {
  return `${localTime(startIso)} → ${localTime(endIso)}`;
}
export function hhmmRangeLabel(start: HHmm, end: HHmm): string {
  return `${start} → ${end}`;
}

/** 120 → "2 heures", 90 → "1 heure 30", 45 → "45 minutes" */
export function durationLongLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t("date.minutes", { count: m });
  const hours = t("date.hours", { count: h });
  return m ? `${hours} ${pad(m)}` : hours;
}
/** 120 → "2h", 90 → "1h30", 45 → "45 min" */
export function durationShortLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h${pad(m)}` : `${h}h`;
}
/** Durée écoulée entre deux instants → "1h 5min" / "12 min" */
export function elapsedLabel(fromIso: IsoDateTime, toIso: IsoDateTime): string {
  const minutes = Math.max(1, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m} min`;
}
/** 37000 → "00:37" */
export function audioDurationLabel(ms: number | null | undefined): string {
  const s = Math.round((ms ?? 0) / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
/** "00:37" → 37000 (compat anciens écrans qui manipulent un libellé) */
export function audioDurationMs(label: string): number {
  const [m, s] = label.split(":").map(Number);
  return ((m || 0) * 60 + (s || 0)) * 1000;
}
/** 2202009 → "2.1 Mo" */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${t("date.byteUnit")}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${t("date.kilobyteUnit")}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${t("date.megabyteUnit")}`;
}
/** "2.1 Mo" → octets (compat) */
export function fileSizeBytes(label: string): number {
  const n = parseFloat(label.replace(",", "."));
  if (/m[ob]/i.test(label)) return Math.round(n * 1024 * 1024);
  if (/k[ob]/i.test(label)) return Math.round(n * 1024);
  return Math.round(n) || 1;
}
/** { "25000.00", "MGA" } → "25 000 Ar" */
export function priceLabel(money: MoneyDto): string {
  const n = Math.round(Number(money.amount));
  const grouped = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  return money.currency === "MGA" ? `${grouped} Ar` : `${grouped} ${money.currency}`;
}

/** Groupe de la liste des notifications : "Aujourd'hui" / "Hier" / "Samedi 3 octobre" */
export function dateGroupLabel(iso: IsoDateTime, now: Date = new Date()): string {
  const day = localDate(iso);
  const today = localDate(now.toISOString());
  const yesterday = localDate(new Date(now.getTime() - 86_400_000).toISOString());
  if (day === today) return t("common.today");
  if (day === yesterday) return t("api.datetime.yesterday");
  return dateLabel(iso);
}
/** "À l'instant" / "12 min" / "3h" / "Hier" / "3 oct." */
export function relativeTimeLabel(iso: IsoDateTime, now: Date = new Date()): string {
  const diffMin = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return t("api.datetime.justNow");
  if (diffMin < 60) return `${diffMin} min`;
  const day = localDate(iso);
  if (day === localDate(now.toISOString())) return `${Math.floor(diffMin / 60)}h`;
  if (day === localDate(new Date(now.getTime() - 86_400_000).toISOString())) return t("api.datetime.yesterday");
  const p = toLocalParts(iso);
  return `${p.day} ${monthShortNames()[p.month - 1]}`;
}
