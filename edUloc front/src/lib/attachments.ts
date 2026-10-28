import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";

import { ApiError } from "@/api/errors";
import { ConversationService } from "@/services/conversation.service";
import type { LocalFile } from "@/types/message";
import { t } from "@/i18n";

/** Mêmes limites que le serveur (bucket « documents » : PDF + images, 20 Mo). */
export const CHAT_DOCUMENT_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const CHAT_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export const fileSizeLabel = (bytes: number): string => {
  const kb = Math.round(bytes / 1024);
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} Mo` : `${kb} Ko`;
};

/**
 * Ouvre le sélecteur de fichiers de l'appareil. Retourne null si l'utilisateur annule ;
 * lève une ApiError("validation_error") si le fichier n'est pas acceptable.
 */
export async function pickChatDocument(): Promise<LocalFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: CHAT_DOCUMENT_MIME,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  const mimeType = (asset.mimeType ?? "").toLowerCase();
  if (!CHAT_DOCUMENT_MIME.includes(mimeType)) {
    throw ApiError.local("validation_error", t("lib.attachments.chooseAPdfOrAn"));
  }
  if (!asset.size || asset.size > CHAT_DOCUMENT_MAX_BYTES) {
    throw ApiError.local("validation_error", t("lib.attachments.theDocumentMustBe20"));
  }
  return { uri: asset.uri, mimeType, sizeBytes: asset.size, fileName: asset.name };
}

/** Ouvre un document de la conversation : URL signée (1 h) dans le navigateur / la visionneuse du système. */
export async function openAttachment(attachmentId: string): Promise<void> {
  const url = await ConversationService.getAttachmentUrl(attachmentId);
  await WebBrowser.openBrowserAsync(url);
}
