import type { AuthTokensDto, MeDto } from "./contracts/dto";

/**
 * Session : jetons + utilisateur courant (MeDto, rôle-aware).
 * Remplace CURRENT_TUTOR_ID / CURRENT_BENEFICIARY_ID : l'identité vient de /me.
 *
 * La persistance est injectable (expo-secure-store en prod) :
 *   setSessionStorage({ load, save, clear })
 */
export interface SessionStorage {
  load(): Promise<AuthTokensDto | null>;
  save(tokens: AuthTokensDto): Promise<void>;
  clear(): Promise<void>;
}

const memoryStorage: SessionStorage = {
  async load() {
    return null;
  },
  async save() {},
  async clear() {},
};

type Listener = (user: MeDto | null) => void;

let storage: SessionStorage = memoryStorage;
let restoring: Promise<unknown> | null = null;
let tokens: AuthTokensDto | null = null;
let currentUser: MeDto | null = null;
const listeners = new Set<Listener>();

export const Session = {
  setStorage(s: SessionStorage) {
    storage = s;
  },
  async restore(): Promise<AuthTokensDto | null> {
    restoring = storage.load().then((loaded) => {
      // Une connexion survenue pendant la lecture du stockage prime sur ce qui y était persisté.
      tokens ??= loaded;
    });
    await restoring;
    return tokens;
  },
  /**
   * Résolu quand la lecture des jetons persistés est terminée. Toute requête authentifiée l'attend :
   * sans cela, un écran ouvert avant la fin de la restauration partirait sans jeton, échouerait au
   * refresh et DÉCONNECTERAIT l'utilisateur.
   */
  whenReady(): Promise<unknown> {
    return restoring ?? Promise.resolve();
  },
  getTokens(): AuthTokensDto | null {
    return tokens;
  },
  async setTokens(t: AuthTokensDto) {
    tokens = t;
    await storage.save(t);
  },
  getUser(): MeDto | null {
    return currentUser;
  },
  setUser(u: MeDto | null) {
    currentUser = u;
    listeners.forEach((l) => l(u));
  },
  async clear() {
    tokens = null;
    currentUser = null;
    await storage.clear();
    listeners.forEach((l) => l(null));
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
