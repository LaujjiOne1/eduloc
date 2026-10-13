import { Global, Module } from '@nestjs/common';
import { ExpoPushProvider } from './expo-push.provider';
import { FcmProvider } from './fcm.provider';
import { PushDispatcher } from './push-dispatcher';
import { PUSH_PROVIDER } from './push-provider.port';

@Global()
@Module({
  providers: [FcmProvider, ExpoPushProvider, PushDispatcher, { provide: PUSH_PROVIDER, useExisting: PushDispatcher }],
  exports: [PUSH_PROVIDER],
})
export class PushInfrastructureModule {}
