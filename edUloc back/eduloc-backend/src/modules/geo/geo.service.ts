import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CacheService } from '../../infrastructure/cache/cache.service';

export interface GeoPlace {
  label: string;
  latitude: number;
  longitude: number;
}

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
/** Les résultats d'une adresse changent très peu : cache 30 jours (politique d'usage Nominatim). */
const CACHE_TTL_SECONDS = 30 * 86_400;
/** Madagascar : [ouest, nord, est, sud] — borne les résultats au pays. */
const MG_VIEWBOX = '42.5,-11.9,50.6,-25.7';

/**
 * Géocodage via OpenStreetMap Nominatim, derrière le backend : cache, User-Agent identifié
 * (obligatoire pour Nominatim) et aucune clé exposée au client.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(
    private readonly http: HttpService,
    private readonly cache: CacheService,
  ) {}

  async search(query: string): Promise<GeoPlace[]> {
    const q = query.trim().toLowerCase();
    return this.cache.wrap(`geo:search:${q}`, CACHE_TTL_SECONDS, async () => {
      const items = await this.get<NominatimItem[]>('/search', {
        q,
        format: 'jsonv2',
        limit: '5',
        countrycodes: 'mg',
        viewbox: MG_VIEWBOX,
        bounded: '1',
        'accept-language': 'fr',
      });
      return items.map((item) => this.toPlace(item));
    });
  }

  async reverse(lat: number, lng: number): Promise<GeoPlace | null> {
    // ~110 m de précision : suffisant pour un libellé de quartier, et bien meilleur taux de cache.
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    return this.cache.wrap(`geo:reverse:${key}`, CACHE_TTL_SECONDS, async () => {
      const item = await this.get<NominatimItem & { error?: string }>('/reverse', {
        lat: String(lat),
        lon: String(lng),
        format: 'jsonv2',
        zoom: '16',
        'accept-language': 'fr',
      });
      return item.error ? null : { ...this.toPlace(item), latitude: lat, longitude: lng };
    });
  }

  private toPlace(item: NominatimItem): GeoPlace {
    // « Ankorondrano, Antananarivo, Analamanga, Madagascar » → « Ankorondrano, Antananarivo »
    const label = item.display_name.split(',').slice(0, 2).map((part) => part.trim()).join(', ');
    return { label, latitude: Number(item.lat), longitude: Number(item.lon) };
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    try {
      const res = await firstValueFrom(this.http.get<T>(`${NOMINATIM}${path}`, {
        params,
        timeout: 6000,
        headers: { 'User-Agent': 'EduLoc/2.0 (geocoding proxy)' },
      }));
      return res.data;
    } catch (err) {
      this.logger.warn(`Nominatim ${path} indisponible : ${(err as Error).message}`);
      throw new ServiceUnavailableException('GEOCODING_UNAVAILABLE');
    }
  }
}
