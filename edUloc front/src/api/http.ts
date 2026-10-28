import { API_CONFIG } from "./config";
import type { ProblemDto } from "./contracts/dto";
import { ApiError } from "./errors";
import { Session } from "./session";
import { currentLanguage } from "@/i18n";

/**
 * Client API unique. Tous les services passent par `api.*` ; les écrans ne font jamais de fetch eux-mêmes.
 * Authentification : jeton d'accès en en-tête Bearer, renouvelé automatiquement (refresh) sur 401.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Query = Record<string, string | number | boolean | undefined | null | string[]>;

export interface ApiRequest {
  method: HttpMethod;
  path: string; // "/bookings/123/accept" (sans baseUrl)
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** false pour les routes publiques (pas d'Authorization) */
  auth?: boolean;
}

export interface RawResponse {
  status: number;
  body: unknown;
}

export interface Transport {
  send(req: ApiRequest, accessToken: string | null): Promise<RawResponse>;
}

function buildQuery(query?: Query): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    const value = Array.isArray(v) ? v.join(",") : String(v);
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const httpTransport: Transport = {
  async send(req, accessToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
    try {
      const res = await fetch(`${API_CONFIG.baseUrl}${req.path}${buildQuery(req.query)}`, {
        method: req.method,
        signal: controller.signal,
        headers: {
          Accept: "application/json, application/problem+json",
          "Accept-Language": currentLanguage(),
          ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(accessToken && req.auth !== false ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...req.headers,
        },
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    } catch (e) {
      if ((e as Error).name === "AbortError") throw ApiError.local("timeout");
      throw ApiError.local("network_error");
    } finally {
      clearTimeout(timer);
    }
  },
};

async function getTransport(): Promise<Transport> {
  return httpTransport;
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(transport: Transport): Promise<boolean> {
  const t = Session.getTokens();
  if (!t) return false;
  refreshing ??= transport
    .send({ method: "POST", path: "/auth/refresh", body: { refreshToken: t.refreshToken }, auth: false }, null)
    .then(async (r) => {
      if (r.status !== 200) return false;
      await Session.setTokens(r.body as never);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(req: ApiRequest): Promise<T> {
  if (req.auth !== false) await Session.whenReady();
  const transport = await getTransport();
  let res = await transport.send(req, Session.getTokens()?.accessToken ?? null);

  if (res.status === 401 && req.auth !== false && !req.path.startsWith("/auth/")) {
    if (await tryRefresh(transport)) {
      res = await transport.send(req, Session.getTokens()?.accessToken ?? null);
    } else {
      await Session.clear();
    }
  }
  if (res.status >= 200 && res.status < 300) return res.body as T;
  throw ApiError.fromProblem((res.body ?? {}) as Partial<ProblemDto>, res.status);
}

/** UUID v4 sans dépendance (Hermes n'expose pas toujours crypto.randomUUID). */
export function uuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const api = {
  request,
  get: <T>(path: string, query?: Query, opts: Partial<ApiRequest> = {}) =>
    request<T>({ method: "GET", path, query, ...opts }),
  post: <T>(path: string, body?: unknown, opts: Partial<ApiRequest> = {}) =>
    request<T>({ method: "POST", path, body, ...opts }),
  put: <T>(path: string, body?: unknown, opts: Partial<ApiRequest> = {}) =>
    request<T>({ method: "PUT", path, body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts: Partial<ApiRequest> = {}) =>
    request<T>({ method: "PATCH", path, body, ...opts }),
  delete: <T = void>(path: string, opts: Partial<ApiRequest> = {}) => request<T>({ method: "DELETE", path, ...opts }),
};
