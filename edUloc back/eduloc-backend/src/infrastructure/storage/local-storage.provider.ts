import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { AppConfig } from '../../core/config/app.config';
import { SignedUpload, StorageProvider, StoredObjectInfo } from './storage-provider.port';

interface LocalTokenClaims {
  /** bucket */
  b: string;
  /** chemin dans le bucket */
  p: string;
  /** usage : upload | read */
  u: 'upload' | 'read';
  /** expiration (epoch seconds) */
  e: number;
}

/**
 * Stockage sur disque pour le DÉVELOPPEMENT (aucun projet Supabase requis).
 * Même contrat que Supabase : URL d'upload signée → PUT direct, URL de lecture signée.
 * Interdit en production (cf. AppConfig).
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly root: string;

  constructor(private readonly cfg: AppConfig) {
    this.root = resolve(cfg.storageLocalDir);
    this.logger.warn(`Stockage LOCAL actif (${this.root}) — développement uniquement.`);
  }

  async createSignedUploadUrl(bucket: string, storagePath: string): Promise<SignedUpload> {
    const token = this.sign({ b: bucket, p: storagePath, u: 'upload', e: this.expiry(900) });
    return { signedUrl: `${this.cfg.apiUrl}/api/dev-storage/upload/${token}`, token, storagePath };
  }

  async createSignedReadUrl(bucket: string, storagePath: string, expiresInSeconds = 3600): Promise<string> {
    const token = this.sign({ b: bucket, p: storagePath, u: 'read', e: this.expiry(expiresInSeconds) });
    return `${this.cfg.apiUrl}/api/dev-storage/object/${token}`;
  }

  async getObjectInfo(bucket: string, storagePath: string): Promise<StoredObjectInfo> {
    try {
      const file = this.pathFor(bucket, storagePath);
      const stat = await fs.stat(file);
      const mimeType = await fs.readFile(`${file}.mime`, 'utf8').catch(() => '');
      return { exists: true, sizeBytes: stat.size, mimeType: mimeType.trim() };
    } catch {
      return { exists: false, sizeBytes: 0, mimeType: '' };
    }
  }

  async deleteObject(bucket: string, storagePath: string): Promise<void> {
    const file = this.pathFor(bucket, storagePath);
    await fs.rm(file, { force: true });
    await fs.rm(`${file}.mime`, { force: true });
  }

  // ---- utilisé par DevStorageController ----

  /** Vérifie un jeton et retourne le fichier cible ; lève si invalide, expiré ou d'un autre usage. */
  resolveToken(token: string, usage: LocalTokenClaims['u']): { file: string; bucket: string; storagePath: string } {
    const claims = this.verify(token);
    if (!claims || claims.u !== usage || claims.e < Math.floor(Date.now() / 1000)) {
      throw new Error('INVALID_STORAGE_TOKEN');
    }
    return { file: this.pathFor(claims.b, claims.p), bucket: claims.b, storagePath: claims.p };
  }

  async prepareWrite(file: string): Promise<void> {
    await fs.mkdir(dirname(file), { recursive: true });
  }

  async writeMime(file: string, mimeType: string): Promise<void> {
    await fs.writeFile(`${file}.mime`, mimeType);
  }

  async readMime(file: string): Promise<string> {
    return (await fs.readFile(`${file}.mime`, 'utf8').catch(() => '')).trim();
  }

  // ---- internes ----

  private expiry(seconds: number): number {
    return Math.floor(Date.now() / 1000) + seconds;
  }

  private pathFor(bucket: string, storagePath: string): string {
    const file = resolve(join(this.root, bucket, storagePath));
    // Empêche toute sortie du répertoire racine (../).
    if (!file.startsWith(this.root + sep)) throw new Error('INVALID_STORAGE_PATH');
    return file;
  }

  private sign(claims: LocalTokenClaims): string {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  private verify(token: string): LocalTokenClaims | null {
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expected = Buffer.from(this.mac(body));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LocalTokenClaims;
    } catch {
      return null;
    }
  }

  private mac(body: string): string {
    return createHmac('sha256', this.cfg.jwtSecret).update(`storage:${body}`).digest('base64url');
  }
}
