import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../core/config/app.config';
import { isExpoPushToken, PushMessage, PushProvider } from './push-provider.port';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Push via le service Expo : iOS (APNs) et Android (FCM) sans SDK Firebase côté serveur.
 * Nécessite une application compilée (EAS / dev build) dont les identifiants push sont configurés.
 */
@Injectable()
export class ExpoPushProvider implements PushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);

  constructor(private readonly cfg: AppConfig) {}

  async sendToTokens(tokens: string[], message: PushMessage): Promise<void> {
    const targets = tokens.filter(isExpoPushToken);
    for (let i = 0; i < targets.length; i += CHUNK) {
      const batch = targets.slice(i, i + CHUNK).map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: message.sound ?? 'default',
        priority: message.priority ?? 'high',
        channelId: message.channelId ?? 'default',
        ttl: message.ttlSeconds,
        // iOS : s'affiche même en mode concentration (appel entrant).
        interruptionLevel: message.priority === 'normal' ? 'active' : 'time-sensitive',
      }));
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(this.cfg.expoAccessToken ? { authorization: `Bearer ${this.cfg.expoAccessToken}` } : {}),
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(8000),
        });
        const body = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
        const failed = (body?.data ?? []).filter((t) => t.status === 'error');
        if (!res.ok || failed.length) {
          this.logger.warn(
            `push Expo: ${failed.length || batch.length}/${batch.length} échecs (${failed[0]?.details?.error ?? failed[0]?.message ?? res.status})`,
          );
        }
      } catch (err) {
        this.logger.warn(`push Expo échoué: ${(err as Error).message}`);
      }
    }
  }
}
