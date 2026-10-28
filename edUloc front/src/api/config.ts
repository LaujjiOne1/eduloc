/**
 * Configuration de la couche API.
 *
 *   EXPO_PUBLIC_API_URL = "http://192.168.1.20:3003/api"   (facultatif)
 *
 * Sans variable, l'URL est déduite : en développement Expo, l'hôte de la machine qui sert le bundle
 * (donc joignable depuis un téléphone / un émulateur) ; sur le web, l'hôte de la page ; sinon localhost.
 * Le backend écoute sur le port 3003 (PORT du .env du backend).
 */
type Env = Record<string, string | undefined>;
const env: Env = (typeof process !== "undefined" && process.env) || {};

const API_PORT = 3003;

/** Hôte de la machine de développement (Expo) ou de la page web ; null hors de ces contextes (tests Node…). */
function developmentHost(): string | null {
  try {
    // Chargé à la demande : ce module doit rester importable hors React Native (scripts d'intégration Node).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants").default as { expoConfig?: { hostUri?: string } } | undefined;
    const host = Constants?.expoConfig?.hostUri?.split(":")[0];
    if (host) return host;
  } catch {
    // pas d'environnement Expo
  }
  const location = (globalThis as { location?: { hostname?: string } }).location;
  return location?.hostname || null;
}

const baseUrl = env.EXPO_PUBLIC_API_URL ?? `http://${developmentHost() ?? "localhost"}:${API_PORT}/api`;

export const API_CONFIG = {
  baseUrl,
  timeoutMs: 15_000,
  /** Fuseau métier (UTC+3, pas d'heure d'été). */
  businessTimezone: "Indian/Antananarivo",
  businessUtcOffsetMinutes: 180,
};

/**
 * En développement, le backend signe des URL en `localhost` (stockage de fichiers, Centrifugo) que
 * ni un téléphone ni un émulateur ne peuvent joindre. On les réécrit vers l'hôte de l'API.
 */
export function rebaseLocalhost(url: string): string {
  try {
    const target = new URL(url);
    const api = new URL(API_CONFIG.baseUrl);
    const local = ["localhost", "127.0.0.1", "0.0.0.0"];
    if (local.includes(target.hostname) && !local.includes(api.hostname)) {
      target.hostname = api.hostname;
      return target.toString();
    }
  } catch {
    // URL relative ou invalide : inchangée
  }
  return url;
}
