import { monthNames, weekdayNames } from "@/i18n/dates";

export interface CalendarCell {
  day: number;
  /** ISO date, "2026-09-19". */
  date: string;
  hasAvailability: boolean;
}

export interface CalendarMonth {
  year: number;
  /** 0-indexed, matches JS Date. */
  month: number;
  label: string;
  /** Monday-first grid — null cells pad the start of the first week. */
  cells: (CalendarCell | null)[];
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "septembre 2026" → "Septembre 2026", matching the mock's calendar header. */
export function formatMonthLabel(year: number, month: number): string {
  const label = monthNames()[month];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${year}`;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * Builds a Monday-first month grid, flagging which days have at least one
 * available slot (drives the BookDate calendar's accent dots).
 */
export function buildCalendarMonth(year: number, month: number, availableDates: Set<string>): CalendarMonth {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday

  const cells: (CalendarCell | null)[] = new Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = toIsoDate(year, month, day);
    cells.push({ day, date, hasAvailability: availableDates.has(date) });
  }

  return { year, month, label: formatMonthLabel(year, month), cells };
}

/** Parses "2026-09-19" into the { year, month } BookDate's calendar view needs. */
export function yearMonthFromIsoDate(date: string): { year: number; month: number } {
  const [year, month] = date.split("-").map(Number);
  return { year, month: month - 1 };
}


/** "2026-09-19" → "Samedi 19 septembre", matching the tutor dashboard's day labels. */
export function formatDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${weekdayNames()[date.getDay()]} ${day} ${monthNames()[month - 1]}`;
}

/**
 * The next `count` ISO dates starting today, each paired with its day label —
 * powers 57_TutorAvailabilityEdit's "Date" picker in create mode (no calendar
 * grid provided in that mock, so a bounded upcoming-dates list stands in for
 * a native date-picker, which isn't installed in this project).
 */
export function upcomingDateOptions(count: number, from: Date = new Date()): { id: string; label: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const iso = toIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
    return { id: iso, label: formatDayLabel(iso) };
  });
}
