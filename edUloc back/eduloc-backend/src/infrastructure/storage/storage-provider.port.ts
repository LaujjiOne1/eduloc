export interface SignedUpload {
  signedUrl: string;
  token: string;
  storagePath: string;
}

export interface StoredObjectInfo {
  exists: boolean;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageProvider {
  createSignedUploadUrl(bucket: string, storagePath: string, upsert?: boolean): Promise<SignedUpload>;
  createSignedReadUrl(bucket: string, storagePath: string, expiresInSeconds?: number): Promise<string>;
  getObjectInfo(bucket: string, storagePath: string): Promise<StoredObjectInfo>;
  deleteObject(bucket: string, storagePath: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** Chemins non devinables : UUID par message / conversation. */
export function voiceMessagePath(conversationId: string, messageId: string, ext: string): string {
  return `conv/${conversationId}/${messageId}${ext}`;
}
export function documentPath(conversationId: string, messageId: string, ext: string): string {
  return `conv/${conversationId}/${messageId}${ext}`;
}
export function tutorDocumentPath(applicationId: string, documentId: string, ext: string): string {
  return `applications/${applicationId}/${documentId}${ext}`;
}
export function tutorIntroVideoPath(tutorProfileId: string, videoId: string, ext: string): string {
  return `tutor-videos/${tutorProfileId}/${videoId}${ext}`;
}
export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3',
    'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
  };
  return map[mime] ?? '.bin';
}
