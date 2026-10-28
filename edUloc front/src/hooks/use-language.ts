import { useTranslation } from "react-i18next";

import { LANGUAGES, type LanguageCode, intlLocaleOf, matchLanguage } from "@/i18n/registry";
import { useLanguageStore } from "@/store/language.store";

/** Langue active + changement de langue. Le composant se redessine à chaque changement. */
export function useLanguage() {
  const { i18n } = useTranslation();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const language: LanguageCode = matchLanguage(i18n.language) ?? "fr";
  return { language, intlLocale: intlLocaleOf(language), languages: LANGUAGES, setLanguage };
}
