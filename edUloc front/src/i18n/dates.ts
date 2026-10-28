import { currentIntlLocale, t } from "./index";

/** Noms des jours (dimanche en premier, comme Date.getDay()) dans la langue active. */
export const weekdayNames = (): string[] => t("date.days", { returnObjects: true }) as unknown as string[];

/** Noms des mois (minuscules) dans la langue active. */
export const monthNames = (): string[] => t("date.months", { returnObjects: true }) as unknown as string[];

/** Mois abrégés dans la langue active. */
export const monthShortNames = (): string[] => t("date.monthsShort", { returnObjects: true }) as unknown as string[];

/** Nombre formaté selon la locale active (« 1,5 » / « 1.5 »). */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  value.toLocaleString(currentIntlLocale(), options);
