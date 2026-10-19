import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '../../core/config/app.config';
import { SignedUpload, StorageProvider, StoredObjectInfo } from './storage-provider.port';

@Injectable()
export class SupabaseStorageProvider implements StorageProvider {
  private readonly logger = new Logger(SupabaseStorageProvider.name);
  private readonly client: SupabaseClient;

  constructor(cfg: AppConfig) {
    // service_role : le client mobile n'accède JAMAIS directement aux données.
    this.client = createClient(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createSignedUploadUrl(bucket: string, storagePath: string, upsert = false): Promise<SignedUpload> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath, { upsert });
    if (error || !data) throw new Error(`createSignedUploadUrl: ${error?.message ?? 'empty'}`);
    return { signedUrl: data.signedUrl, token: data.token, storagePath };
  }

  async createSignedReadUrl(bucket: string, storagePath: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) throw new Error(`createSignedUrl: ${error?.message ?? 'empty'}`);
    return data.signedUrl;
  }

  async getObjectInfo(bucket: string, storagePath: string): Promise<StoredObjectInfo> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .list(storagePath.split('/').slice(0, -1).join('/'), {
        limit: 100,
        search: storagePath.split('/').pop(),
      });
    const obj = data?.find((f) => f.name === storagePath.split('/').pop());
    if (error || !obj) return { exists: false, sizeBytes: 0, mimeType: '' };
    return { exists: true, sizeBytes: obj.metadata?.size ?? 0, mimeType: obj.metadata?.mimetype ?? '' };
  }

  async downloadObject(bucket: string, storagePath: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(bucket).download(storagePath);
    if (error || !data) throw new Error(`download ${bucket}/${storagePath}: ${error?.message ?? 'empty'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteObject(bucket: string, storagePath: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([storagePath]);
    if (error) this.logger.warn(`suppression ${bucket}/${storagePath}: ${error.message}`);
  }
}
