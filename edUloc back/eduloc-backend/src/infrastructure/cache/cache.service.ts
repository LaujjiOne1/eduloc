import { Injectable } from '@nestjs/common';
import { RedisService } from '../../core/redis/redis.service';

const SEARCH_VERSION_KEY = 'search:version';

export const CacheKeys = {
  // v2 : la forme change (trackCodes, trackKind) — une entrée v1 encore en cache ne doit pas être servie.
  subjects: () => 'ref:v6:subjects',
  levels: () => 'ref:v2:levels',
  tracks: () => 'ref:v4:tracks',
  tutorPublic: (tutorProfileId: string) => `tutor:public:v2:${tutorProfileId}`,
  search: (hash: string) => `search:v2:${hash}`,
  slots: (tutorProfileId: string, date: string, offerId: string, durationMinutes: number) =>
    `slots:${tutorProfileId}:${date}:${offerId}:${durationMinutes}`,
  adminDashboard: () => 'admin:dashboard',
  mediaUrl: (attachmentId: string) => `media:url:${attachmentId}`,
  upload: (uploadId: string) => `upload:${uploadId}`,
} as const;

@Injectable()
export class CacheService {
  constructor(private readonly redis: RedisService) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), ttlSeconds);
  }

  /**
   * Cache-aside. `cacheEmpty: false` : un tableau vide n'est pas mémorisé — indispensable pour
   * un référentiel (un catalogue vide avant le seed resterait 24 h « vide » malgré les données).
   */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
    options: { cacheEmpty?: boolean } = {},
  ): Promise<T> {
    const cached = await this.getJson<T>(key);
    if (cached !== null) return cached;
    const value = await producer();
    if (options.cacheEmpty === false && Array.isArray(value) && value.length === 0) return value;
    await this.setJson(key, value, ttlSeconds);
    return value;
  }

  /**
   * Clé d'un résultat de recherche, versionnée : incrémenter la version (bumpSearch) invalide
   * d'un coup TOUTES les recherches en cache (approbation / suspension d'un tuteur).
   */
  async searchKey(hash: string): Promise<string> {
    const version = (await this.redis.get(SEARCH_VERSION_KEY)) ?? '0';
    return CacheKeys.search(`${version}:${hash}`);
  }

  async bumpSearch(): Promise<void> {
    await this.redis.raw.incr(SEARCH_VERSION_KEY);
  }

  async invalidate(...keys: string[]): Promise<void> {
    await this.redis.del(...keys);
  }
}
