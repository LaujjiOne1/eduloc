import type { TutorGender } from "./common";
/** [v1~] Conversation par PAIRE demandeur/tuteur (ADR-12), plus par réservation. */
export interface ConversationSummary {
  id: string;
  status: "open" | "read_only" | "closed";
  viewerRole: "requester" | "tutor";
  counterpartName: string; // tuteur (vue demandeur) ou demandeur (vue tuteur)
  counterpartInitial: string;
  /** Vue demandeur : sexe / photo du tuteur (avatar) ; absents côté tuteur (le correspondant est un demandeur). */
  counterpartGender?: TutorGender | null;
  counterpartPhotoUrl?: string | null;
  bookingId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  canSend: boolean;
  canCall: boolean;
}

interface BaseMessage {
  id: string;
  conversationId: string; // [v1+]
  bookingId: string | null; // [v1~] contexte (réservation courante de la conversation)
  authorLabel: string; // "Vous" ou prénom
  isMine: boolean;
  createdAt: string;
}
export interface VoiceMessage extends BaseMessage {
  type: "voice";
  attachmentId: string; // [v1+] → GET /attachments/:id/url pour lire
  durationMs: number; // [v1+]
  durationLabel: string;
  waveform: number[]; // [v1+]
  listenedAt: string | null; // [v1+]
  transcript: string | null; // [v1+]
}
export interface DocumentMessage extends BaseMessage {
  type: "document";
  attachmentId: string; // [v1+]
  fileName: string;
  fileSizeLabel: string;
  mimeType: string; // [v1+]
}
export interface SystemMessage extends BaseMessage {
  type: "system" | "call_event"; // [v1+]
  text: string;
}
export type ConversationMessage = VoiceMessage | DocumentMessage | SystemMessage;

/** Fichier local prêt à l'envoi (expo-av / expo-document-picker). */
export interface LocalFile {
  uri: string;
  mimeType: string;
  sizeBytes: number;
  fileName?: string;
}
