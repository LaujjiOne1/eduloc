import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AuthTokensDto } from "./contracts/dto";
import type { SessionStorage } from "./session";

const STORAGE_KEY = "eduloc-session-tokens";

/**
 * AsyncStorage-backed SessionStorage for `Session.setStorage()`. Expo Router
 * statically renders routes on the server (Node) during web export/SSR,
 * where `window` doesn't exist — AsyncStorage's web shim reaches for
 * `window.localStorage` and crashes if touched there (same guard as
 * store/auth.store.ts). `window` is always defined at runtime (browser or
 * React Native), so this only no-ops on the server.
 */
export const asyncStorageSession: SessionStorage = {
  async load() {
    if (typeof window === "undefined") return null;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthTokensDto) : null;
  },
  async save(tokens) {
    if (typeof window === "undefined") return;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  },
  async clear() {
    if (typeof window === "undefined") return;
    await AsyncStorage.removeItem(STORAGE_KEY);
  },
};
