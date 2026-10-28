// Hermes n'expose pas toujours Intl.PluralRules, dont i18next a besoin pour choisir entre _one / _other (le polyfill
// ne s'installe que si l'API native manque, et couvre aussi les futures langues).
import "intl-pluralrules";
import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { FALLBACK_LANGUAGE, LANGUAGES, type LanguageCode, intlLocaleOf, matchLanguage } from "./registry";

/** Langue de l'appareil si elle est gérée, sinon la langue de repli. */
export function deviceLanguage(): LanguageCode {
  try {
    for (const locale of getLocales()) {
      const match = matchLanguage(locale.languageTag) ?? matchLanguage(locale.languageCode);
      if (match) return match;
    }
  } catch {
    // module natif indisponible (rendu serveur, tests) : repli ci-dessous
  }
  return FALLBACK_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map((language) => [language.code, { translation: language.translation }])),
  lng: deviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: LANGUAGES.map((language) => language.code),
  interpolation: { escapeValue: false }, // React Native n'interprète pas le HTML
  returnNull: false,
  initAsync: false,
});

// Web : lecteurs d'écran et traduction automatique du navigateur se fient à <html lang>.
const syncDocumentLanguage = (lng: string) => {
  if (typeof document !== "undefined") document.documentElement.lang = lng;
};
syncDocumentLanguage(i18n.language);
i18n.on("languageChanged", syncDocumentLanguage);

/** `t` utilisable hors composant (services, mappers, formateurs). Dans un composant, préférer `useTranslation()`. */
export const t = i18n.t.bind(i18n);

/** Langue active (toujours un code géré). */
export const currentLanguage = (): LanguageCode => matchLanguage(i18n.language) ?? FALLBACK_LANGUAGE;

/** Locale Intl de la langue active (« fr-FR », « en-GB »…) pour dates et nombres. */
export const currentIntlLocale = (): string => intlLocaleOf(currentLanguage());

export default i18n;
