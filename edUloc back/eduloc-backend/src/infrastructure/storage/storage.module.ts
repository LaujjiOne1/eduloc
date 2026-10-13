import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../core/config/app.config';
import { SupabaseStorageProvider } from './supabase-storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { DevStorageController } from './dev-storage.controller';
import { STORAGE_PROVIDER } from './storage-provider.port';

@Global()
@Module({
  controllers: [DevStorageController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [AppConfig],
      useFactory: (cfg: AppConfig) =>
        cfg.storageDriver === 'local' ? new LocalStorageProvider(cfg) : new SupabaseStorageProvider(cfg),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageInfrastructureModule {}
