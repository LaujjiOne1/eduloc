import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import i18n, { deviceLanguage } from "@/i18n";
import { type LanguageCode, isSupportedLanguage } from "@/i18n/registry";

// Même garde que auth.store : le rendu serveur d'Expo Router (export web) n'a pas de `window`.
const noopStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const languageStorage = () => (typeof window === "undefined" ? noopStorage : AsyncStorage);

interface LanguageStore {
  /** Choix explicite de l'utilisateur ; null = suivre la langue de l'appareil. */
  preference: LanguageCode | null;
  hasHydrated: boolean;
  setLanguage: (code: LanguageCode) => void;
  /** Revient à la langue de l'appareil. */
  followDevice: () => void;
}

const apply = (code: LanguageCode) => {
  if (i18n.language !== code) void i18n.changeLanguage(code);
};

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      preference: null,
      hasHydrated: false,
      setLanguage: (code) => {
        set({ preference: code });
        apply(code);
      },
      followDevice: () => {
        set({ preference: null });
        apply(deviceLanguage());
      },
    }),
    {
      name: "eduloc-language",
      storage: createJSONStorage(languageStorage),
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        const stored = state?.preference;
        if (isSupportedLanguage(stored)) apply(stored);
        useLanguageStore.setState({ hasHydrated: true });
      },
    },
  ),
);
