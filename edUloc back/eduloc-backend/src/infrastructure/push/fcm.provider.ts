import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../../core/config/app.config';
import { PushMessage, PushProvider } from './push-provider.port';

type Messaging = import('firebase-admin/messaging').Messaging;

@Injectable()
export class FcmProvider implements PushProvider, OnModuleInit {
  private readonly logger = new Logger(FcmProvider.name);
  private messaging: Messaging | null = null;

  constructor(private readonly cfg: AppConfig) {}

  async onModuleInit(): Promise<void> {
    if (!this.cfg.fcmServiceAccountJson) {
      this.logger.warn('FCM non configuré (FCM_SERVICE_ACCOUNT_JSON vide) — push désactivé.');
      return;
    }
    try {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app');
      if (!getApps().length) {
        initializeApp({ credential: cert(JSON.parse(this.cfg.fcmServiceAccountJson)) });
      }
      const { getMessaging } = await import('firebase-admin/messaging');
      this.messaging = getMessaging();
    } catch (err) {
      this.logger.error(`Initialisation FCM impossible: ${(err as Error).message}`);
    }
  }

  async sendToTokens(tokens: string[], message: PushMessage): Promise<void> {
    if (!this.messaging || tokens.length === 0) return;
    try {
      const res = await this.messaging.sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        data: message.data ?? {},
        android: {
          priority: message.priority === 'normal' ? 'normal' : 'high',
          ttl: message.ttlSeconds ? message.ttlSeconds * 1000 : undefined,
          notification: { channelId: message.channelId ?? 'default', sound: message.sound ?? 'default' },
        },
        apns: { headers: { 'apns-priority': message.priority === 'normal' ? '5' : '10' } },
      });
      if (res.failureCount > 0) {
        this.logger.warn(`push: ${res.failureCount}/${tokens.length} échecs`);
      }
    } catch (err) {
      this.logger.warn(`push échoué: ${(err as Error).message}`);
    }
  }
}
