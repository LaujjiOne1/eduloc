/**
 * Client HTTP du back-office : jetons JWT, renouvellement automatique et erreurs lisibles.
 * Il parle uniquement à l'API réelle ; il n'existe aucun mode de démonstration.
 */
import type { AdminSession, LoginResponse } from '../types';

export const API_URL: string = (import.meta.env?.VITE_API_URL as string | undefined) ?? 'http://localhost:3003/api';

const ACCESS_KEY = 'eduloc_admin_access';
const REFRESH_KEY = 'eduloc_admin_refresh';
const SESSION_KEY = 'eduloc_admin_session';

/** Erreur renvoyée par l'API (application/problem+json) : `message` est déjà lisible en français. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const read = (key: string): string | null => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* stockage indisponible : la session ne survivra pas au rechargement */ }
};

export const tokenStore = {
  hasSession: () => read(ACCESS_KEY) !== null && read(REFRESH_KEY) !== null,
  session(): AdminSession | null {
    const raw = read(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AdminSession; } catch { return null; }
  },
  save(res: LoginResponse) {
    write(ACCESS_KEY, res.accessToken);
    write(REFRESH_KEY, res.refreshToken);
    write(SESSION_KEY, JSON.stringify({ id: res.user.id, firstName: res.user.firstName, lastName: res.user.lastName }));
  },
  clear() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
    write(SESSION_KEY, null);
  },
};

let onSessionLost: (() => void) | null = null;
/** Appelé quand la session ne peut plus être renouvelée : l'application revient à l'écran de connexion. */
export const setSessionLostHandler = (fn: (() => void) | null) => { onSessionLost = fn; };

async function toError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null) as { detail?: string; title?: string; code?: string; errors?: { field: string; message: string }[] } | null;
  const fields = body?.errors?.length ? ` (${body.errors.map((e) => `${e.field} ${e.message}`.trim()).join(' ; ')})` : '';
  return new ApiError(
    `${body?.detail ?? body?.title ?? `Erreur ${res.status}`}${fields}`,
    res.status,
    body?.code,
  );
}

let refreshing: Promise<boolean> | null = null;

/** Un seul renouvellement à la fois : le jeton de rafraîchissement est à usage unique côté serveur. */
function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = read(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const next = await res.json() as { accessToken: string; refreshToken: string };
      write(ACCESS_KEY, next.accessToken);
      write(REFRESH_KEY, next.refreshToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
}

const withQuery = (path: string, query?: Query) => {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

export async function request<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${withQuery(path, opts.query)}`, {
      method: opts.method ?? 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(read(ACCESS_KEY) ? { Authorization: `Bearer ${read(ACCESS_KEY)}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(`Le serveur est injoignable (${API_URL}). Vérifiez que le backend tourne.`, 0, 'NETWORK');
  }

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refreshTokens()) return request<T>(path, opts, true);
    tokenStore.clear();
    onSessionLost?.();
    throw new ApiError('Votre session a expiré. Reconnectez-vous.', 401, 'TOKEN_INVALID');
  }
  if (!res.ok) throw await toError(res);
  return res.status === 204 ? (undefined as T) : (await res.json() as T);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await request<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
  // Le back-office est réservé aux administrateurs : on ne garde pas de jetons d'un compte ordinaire.
  if (!res.user.isAdmin) throw new ApiError('Ce compte n’a pas les droits d’administrateur.', 403, 'ADMIN_REQUIRED');
  tokenStore.save(res);
  return res;
}

export async function logout(): Promise<void> {
  const refreshToken = read(REFRESH_KEY);
  const accessToken = read(ACCESS_KEY);
  tokenStore.clear();
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
}
