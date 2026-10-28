import { en } from "./locales/en";
import { fr } from "./locales/fr";
import { mg } from "./locales/mg";

/**
 * Langues de l'application — l'UNIQUE endroit à modifier pour en ajouter une :
 *  1. copier `locales/en/` vers `locales/<code>/` et traduire les fichiers ;
 *  2. ajouter une ligne ci-dessous.
 * `label` s'affiche dans la langue elle-même (sélecteur) ; `intlLocale` pilote les dates et nombres (Intl).
 * Le typage impose que chaque langue ait exactement les mêmes clés que le français (`locales/fr`).
 */
export const LANGUAGES = [
  { code: "fr", label: "Français", intlLocale: "fr-FR", translation: fr },
  { code: "en", label: "English", intlLocale: "en-GB", translation: en },
  { code: "mg", label: "Malagasy", intlLocale: "mg-MG", translation: mg },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** Langue de repli : celle des textes sources et de tout appareil dont la langue n'est pas gérée. */
export const FALLBACK_LANGUAGE: LanguageCode = "fr";

export const isSupportedLanguage = (value: unknown): value is LanguageCode =>
  LANGUAGES.some((language) => language.code === value);

/** « fr-MG », « en_US », « EN » → code géré, sinon null. */
export function matchLanguage(tag: string | null | undefined): LanguageCode | null {
  const base = tag?.toLowerCase().split(/[-_]/)[0];
  return isSupportedLanguage(base) ? base : null;
}

export const intlLocaleOf = (code: LanguageCode): string =>
  LANGUAGES.find((language) => language.code === code)?.intlLocale ?? "fr-FR";
