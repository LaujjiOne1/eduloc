import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { AuthService } from "@/services/auth.service";
import type { AuthenticatedUser } from "@/types/auth";

// Expo Router statically renders routes on the server (Node) during web
// export/SSR, where `window` doesn't exist — AsyncStorage's web shim reaches
// for `window.localStorage` and crashes if touched there. `window` is always
// defined at runtime (browser or React Native), so this only no-ops on the
// server, and rehydrates normally once the client takes over.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const authStorage = () => (typeof window === "undefined" ? noopStorage : AsyncStorage);

/** Which dashboard the signed-in user is currently operating as — set by 37_ModeChoice / 36_ModeSwitch. */
export type UserMode = "apprenti" | "tutor";

interface AuthStore {
  /** The signed-in, verified user — null means "not authenticated". */
  user: AuthenticatedUser | null;
  /** Set right after signup succeeds, before the email is verified. */
  pendingUser: AuthenticatedUser | null;
  /** True once AsyncStorage rehydration has run, so screens can avoid a flash of "logged out". */
  hasHydrated: boolean;
  /**
   * No role/approval model exists on AuthenticatedUser yet (AGENTS.md §8) —
   * this only remembers which of the two dashboards 36_ModeSwitch/37_ModeChoice
   * last sent the user to, so ModeSwitch can show the correct mode as active.
   * It does not gate access to either dashboard.
   */
  activeMode: UserMode;
  /**
   * Where to send the user after a successful login/signup+verify, when they
   * were detoured through auth from somewhere other than the booking flow's
   * default (e.g. the tutor-onboarding wizard). Null means "use the default
   * destination that screen already hardcodes" — transient, not persisted.
   */
  returnTo: Href | null;
  setUser: (user: AuthenticatedUser) => void;
  setPendingUser: (user: AuthenticatedUser) => void;
  clearPendingUser: () => void;
  /** Promotes pendingUser to user once the verification code is confirmed. */
  confirmPendingUser: () => void;
  setActiveMode: (mode: UserMode) => void;
  setReturnTo: (route: Href | null) => void;
  logout: () => void;
  /** La session a été perdue côté serveur (refresh refusé) : on vide l'UI sans rappeler /auth/logout. */
  sessionLost: () => void;
}

/**
 * The single source of truth for "is anyone logged in", used by the BookDate
 * auth gate to decide whether to route straight to Beneficiary or detour
 * through Login. Persisted (user only) so a returning user doesn't have to
 * log in again on every app launch.
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      pendingUser: null,
      hasHydrated: false,
      activeMode: "apprenti",
      returnTo: null,

      setUser: (user) => set({ user, pendingUser: null }),

      setPendingUser: (pendingUser) => set({ pendingUser }),
      clearPendingUser: () => set({ pendingUser: null }),

      confirmPendingUser: () =>
        set((s) => ({ user: s.pendingUser ?? s.user, pendingUser: null })),

      setActiveMode: (activeMode) => set({ activeMode }),

      setReturnTo: (returnTo) => set({ returnTo }),

      sessionLost: () => set({ user: null, pendingUser: null, activeMode: "apprenti" }),

      logout: () => {
        // Best-effort: revoke the refresh token server-side, but never block
        // the local sign-out on a network failure.
        AuthService.logout().catch(() => undefined);
        set({ user: null, pendingUser: null, activeMode: "apprenti", returnTo: null });
      },
    }),
    {
      name: "eduloc-auth",
      storage: createJSONStorage(authStorage),
      partialize: (state) => ({ user: state.user, activeMode: state.activeMode }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hasHydrated: true });
      },
    },
  ),
);
