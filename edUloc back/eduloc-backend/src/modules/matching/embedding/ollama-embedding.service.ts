import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AppConfig } from '../../../core/config/app.config';
import { RedisService } from '../../../core/redis/redis.service';
import { assertValidVector, formatQuery, l2Normalize } from './embedding-format';

const REQUEST_TIMEOUT_MS = 10_000;
/** Le premier appel charge le modèle en mémoire (plusieurs secondes sur CPU) : le préchauffage a un délai plus large. */
const WARMUP_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const MAX_BATCH = 16;
const QUERY_CACHE_TTL_SECONDS = 24 * 3600;
/** Une indisponibilité constatée est réévaluée au plus toutes les 10 s (pas d'appel Ollama à chaque requête). */
const STATUS_TTL_MS = 10_000;

export const MATCHING_UNAVAILABLE = 'MATCHING_UNAVAILABLE';

/** Réponse 4xx d'Ollama : une nouvelle tentative ne changerait rien. */
class OllamaClientError extends Error {}

/**
 * Client des embeddings (Ollama auto-hébergé, jamais exposé sur Internet).
 *
 *  - Ne télécharge JAMAIS de modèle : c'est le rôle du service `ollama-init`.
 *  - Au démarrage, vérifie la présence du modèle ; s'il manque, le backend démarre quand même et le matching
 *    est marqué indisponible (503 MATCHING_UNAVAILABLE), le reste de l'API n'en dépend pas.
 *  - Les textes reçus sont envoyés tels quels : les préfixes de tâche sont ajoutés par l'appelant
 *    (formatDocument / formatQuery), jamais deux fois.
 *  - Les embeddings de DOCUMENTS ne se calculent jamais dans une requête HTTP utilisateur (outbox, lot 3) ;
 *    seule la requête de recherche (`embedQuery`) l'est, avec cache Redis.
 */
@Injectable()
export class OllamaEmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(OllamaEmbeddingService.name);
  private status: { available: boolean; checkedAt: number } = { available: false, checkedAt: 0 };

  constructor(
    private readonly cfg: AppConfig,
    private readonly redis: RedisService,
  ) {}

  get model(): string {
    return this.cfg.embeddingModel;
  }

  get dimension(): number {
    return this.cfg.embeddingDim;
  }

  async onModuleInit(): Promise<void> {
    const available = await this.refreshStatus();
    if (available) {
      this.logger.log(`Matching disponible : modèle ${this.model} présent sur ${this.cfg.ollamaUrl}.`);
      void this.warmUp(); // sans bloquer le démarrage de l'API
    }
  }

  /**
   * Charge le modèle en mémoire pour que la première recherche réelle ne dépasse pas le délai de 10 s.
   * Un échec est sans conséquence (journalisé) : les vraies requêtes réessaient et signalent 503 le cas échéant.
   */
  async warmUp(): Promise<void> {
    try {
      const res = await this.fetchWithTimeout(
        `${this.cfg.ollamaUrl}/api/embed`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: this.model, input: ['warm-up'] }) },
        WARMUP_TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      this.logger.warn(`Préchauffage du modèle impossible : ${(err as Error).message}`);
    }
  }

  /** État courant, réévalué si le dernier contrôle a plus de 10 s. Ne lève jamais. */
  async isAvailable(): Promise<boolean> {
    if (Date.now() - this.status.checkedAt < STATUS_TTL_MS) return this.status.available;
    return this.refreshStatus();
  }

  /** 503 MATCHING_UNAVAILABLE si Ollama ne répond pas ou si le modèle manque. */
  async assertAvailable(): Promise<void> {
    if (!(await this.isAvailable())) throw new ServiceUnavailableException(MATCHING_UNAVAILABLE);
  }

  /** `GET /api/tags` : le modèle configuré doit figurer dans les modèles installés. */
  private async refreshStatus(): Promise<boolean> {
    let available = false;
    try {
      const res = await this.fetchWithTimeout(`${this.cfg.ollamaUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
      const installed = (body.models ?? []).flatMap((m) => [m.name, m.model]).filter((n): n is string => !!n);
      available = installed.some((name) => this.sameModel(name, this.model));
      if (!available) {
        this.logger.error(
          `Modèle ${this.model} absent d'Ollama (${installed.join(', ') || 'aucun modèle'}) : matching indisponible. ` +
            'Il se télécharge via le service ollama-init, jamais depuis l’API.',
        );
      }
    } catch (err) {
      this.logger.error(`Ollama injoignable sur ${this.cfg.ollamaUrl} (${(err as Error).message}) : matching indisponible.`);
    }
    this.status = { available, checkedAt: Date.now() };
    return available;
  }

  /** « nom » équivaut à « nom:latest » (convention Ollama). */
  private sameModel(installed: string, wanted: string): boolean {
    const withTag = (n: string) => (n.includes(':') ? n : `${n}:latest`);
    return withTag(installed) === withTag(wanted);
  }

  /**
   * Embeddings de textes DÉJÀ préfixés, par lots de 16 au plus. Chaque vecteur est vérifié (dimension, NaN)
   * puis normalisé L2 ; au moindre vecteur invalide la fonction lève et rien ne doit être écrit.
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const batch = texts.slice(i, i + MAX_BATCH);
      const embeddings = await this.requestEmbeddings(batch);
      if (embeddings.length !== batch.length) {
        throw new Error(`Ollama a renvoyé ${embeddings.length} embeddings pour ${batch.length} textes.`);
      }
      for (const e of embeddings) {
        assertValidVector(e, this.dimension);
        vectors.push(l2Normalize(e));
      }
    }
    return vectors;
  }

  /** Embedding d'une requête (préfixe `task: search result | query:`), mis en cache 24 h dans Redis. */
  async embedQuery(query: string): Promise<number[]> {
    const text = formatQuery(query);
    const key = `emb:q:${createHash('sha256').update(this.model + text).digest('hex')}`;
    const cached = await this.readCache(key);
    if (cached) return cached;
    const [vector] = await this.embedTexts([text]);
    await this.redis.set(key, JSON.stringify(vector), QUERY_CACHE_TTL_SECONDS).catch(() => undefined);
    return vector;
  }

  private async readCache(key: string): Promise<number[] | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      const vector = JSON.parse(raw) as unknown;
      assertValidVector(vector, this.dimension);
      return vector;
    } catch {
      return null; // cache illisible ou périmé (autre dimension) : on recalcule
    }
  }

  /** `POST /api/embed` avec timeout de 10 s et 2 nouvelles tentatives ; échec définitif ⇒ 503. */
  private async requestEmbeddings(input: string[]): Promise<number[][]> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const res = await this.fetchWithTimeout(`${this.cfg.ollamaUrl}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: this.model, input }),
        });
        if (res.status >= 400 && res.status < 500) {
          throw new OllamaClientError(`Ollama HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);
        }
        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        const body = (await res.json()) as { embeddings?: number[][] };
        if (!Array.isArray(body.embeddings)) throw new Error('Réponse Ollama sans champ « embeddings ».');
        return body.embeddings;
      } catch (err) {
        lastError = err;
        if (err instanceof OllamaClientError) break;
        if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    this.status = { available: false, checkedAt: Date.now() };
    this.logger.error(`Embeddings indisponibles : ${(lastError as Error).message}`);
    throw new ServiceUnavailableException(MATCHING_UNAVAILABLE);
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
