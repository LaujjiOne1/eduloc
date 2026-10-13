export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Canal Android (« calls » : sonnerie prioritaire, « default » sinon). */
  channelId?: string;
  priority?: 'high' | 'normal';
  /** Durée de vie côté fournisseur : un appel qui ne sonne plus ne doit pas arriver en retard. */
  ttlSeconds?: number;
  sound?: string;
}

export interface PushProvider {
  sendToTokens(tokens: string[], message: PushMessage): Promise<void>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** Jeton Expo (`ExponentPushToken[…]`) ; tout le reste est un jeton FCM natif. */
export const isExpoPushToken = (token: string): boolean => /^Expo(nent)?PushToken\[.+\]$/.test(token);
