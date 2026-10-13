import { Injectable } from '@nestjs/common';
import { ExpoPushProvider } from './expo-push.provider';
import { FcmProvider } from './fcm.provider';
import { isExpoPushToken, PushMessage, PushProvider } from './push-provider.port';

/** Aiguille chaque jeton vers son fournisseur (Expo ou FCM natif). */
@Injectable()
export class PushDispatcher implements PushProvider {
  constructor(private readonly expo: ExpoPushProvider, private readonly fcm: FcmProvider) {}

  async sendToTokens(tokens: string[], message: PushMessage): Promise<void> {
    const expoTokens = tokens.filter(isExpoPushToken);
    const fcmTokens = tokens.filter((token) => !isExpoPushToken(token));
    await Promise.all([this.expo.sendToTokens(expoTokens, message), this.fcm.sendToTokens(fcmTokens, message)]);
  }
}
