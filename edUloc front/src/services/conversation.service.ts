import { api, uuid } from "@/api/http";
import { ApiError } from "@/api/errors";
import { toConversationSummary, toMessage } from "@/api/mappers";
import type { BookingDto, ConversationDto, MessageDto, Page, UploadTicketDto } from "@/api/contracts/dto";
import { rebaseLocalhost } from "@/api/config";
import { normalizeAudioMime, uploadToSignedUrl } from "@/api/upload";
import type { ConversationMessage, ConversationSummary, LocalFile } from "@/types/message";
import { t } from "@/i18n";

export { ApiError as ConversationServiceError };

/** Types acceptés par le serveur (VOICE_MIME / DOC_MIME) : tout le reste est refusé en 422. */
const VOICE_MIME = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg"];
const DOCUMENT_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_VOICE_MS = 300_000;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/**
 * UNE conversation par paire demandeur/tuteur (ADR-12). Les écrans atteints par bookingId passent par
 * getConversationForBooking(bookingId), qui lit booking.conversationId puis la conversation.
 *
 * Routes : GET /conversations[/:id] · GET /conversations/:id/messages?type&cursor · POST /conversations/:id/read
 *          POST /conversations/:id/uploads + PUT URL signée + POST /conversations/:id/messages
 *          GET /attachments/:id/url · POST /messages/:id/listened
 * Pas de message texte (ADR-04) : vocal, document, système et événements d'appel uniquement.
 */
export const ConversationService = {
  async getConversations(): Promise<ConversationSummary[]> {
    const page = await api.get<Page<ConversationDto>>("/conversations", { limit: 50 });
    return page.items.map(toConversationSummary);
  },

  async getConversation(conversationId: string): Promise<ConversationSummary> {
    return toConversationSummary(await api.get<ConversationDto>(`/conversations/${conversationId}`));
  },

  async getConversationForBooking(bookingId: string): Promise<ConversationSummary> {
    const booking = await api.get<BookingDto>(`/bookings/${bookingId}`);
    if (!booking.conversationId) {
      throw ApiError.local("not_found", t("services.conversationservice.noConversationHasBeenOpened"));
    }
    return ConversationService.getConversation(booking.conversationId);
  },

  async getConversationMessages(
    conversationId: string,
    opts: { type?: "document" | "voice"; cursor?: string; bookingId?: string | null } = {},
  ): Promise<{ items: ConversationMessage[]; nextCursor: string | null }> {
    const page = await api.get<Page<MessageDto>>(`/conversations/${conversationId}/messages`, {
      type: opts.type?.toUpperCase(),
      cursor: opts.cursor,
      limit: 50,
    });
    return { items: page.items.map((m) => toMessage(m, opts.bookingId ?? null)), nextCursor: page.nextCursor };
  },

  /** Fil complet d'une réservation (marque aussi la conversation comme lue). */
  async getMessages(bookingId: string): Promise<ConversationMessage[]> {
    const conversation = await ConversationService.getConversationForBooking(bookingId);
    const { items } = await ConversationService.getConversationMessages(conversation.id, { bookingId });
    void ConversationService.markRead(conversation.id).catch(() => undefined);
    return items;
  },

  /**
   * Vocal : ticket → PUT direct vers le stockage → confirmation. Le fichier ne traverse jamais l'API.
   * Erreurs : "communication_not_allowed" (lecture seule), "pending_message_limit" (3 vocaux max avant réponse).
   */
  async sendVoiceMessage(conversationId: string, voice: { file: LocalFile; durationMs: number; waveform?: number[] }): Promise<ConversationMessage> {
    const mimeType = normalizeAudioMime(voice.file.mimeType, voice.file.uri);
    if (!VOICE_MIME.includes(mimeType)) {
      throw ApiError.local("validation_error", t("services.conversationservice.thisAudioFormatIsNot"));
    }
    if (voice.durationMs < 500) throw ApiError.local("validation_error", t("services.conversationservice.theVoiceMessageIsToo"));
    if (voice.durationMs > MAX_VOICE_MS) throw ApiError.local("validation_error", t("services.conversationservice.theVoiceMessageExceeds5"));

    const ticket = await api.post<UploadTicketDto>(`/conversations/${conversationId}/uploads`, {
      kind: "VOICE",
      mimeType,
      sizeBytes: voice.file.sizeBytes,
      durationMs: Math.round(voice.durationMs),
    });
    await uploadToSignedUrl(ticket, { ...voice.file, mimeType });
    const msg = await api.post<MessageDto>(`/conversations/${conversationId}/messages`, {
      type: "VOICE",
      uploadId: ticket.uploadId,
      clientMessageId: uuid(),
      waveform: voice.waveform?.slice(0, 64),
    });
    return toMessage(msg);
  },

  async sendDocument(conversationId: string, file: LocalFile): Promise<ConversationMessage> {
    if (!DOCUMENT_MIME.includes(file.mimeType)) {
      throw ApiError.local("validation_error", t("services.conversationservice.onlyPdfsAndImagesJpeg"));
    }
    if (file.sizeBytes > MAX_DOCUMENT_BYTES) throw ApiError.local("validation_error", t("services.conversationservice.theFileExceeds20Mb"));

    const ticket = await api.post<UploadTicketDto>(`/conversations/${conversationId}/uploads`, {
      kind: "DOCUMENT",
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      fileName: file.fileName,
    });
    await uploadToSignedUrl(ticket, file);
    const msg = await api.post<MessageDto>(`/conversations/${conversationId}/messages`, {
      type: "DOCUMENT",
      uploadId: ticket.uploadId,
      clientMessageId: uuid(),
    });
    return toMessage(msg);
  },

  async markRead(conversationId: string): Promise<void> {
    await api.post(`/conversations/${conversationId}/read`);
  },
  async markListened(messageId: string): Promise<void> {
    await api.post(`/messages/${messageId}/listened`);
  },
  /** URL signée (1 h) pour lire un vocal / ouvrir un document. */
  async getAttachmentUrl(attachmentId: string): Promise<string> {
    return rebaseLocalhost((await api.get<{ url: string }>(`/attachments/${attachmentId}/url`)).url);
  },
};
