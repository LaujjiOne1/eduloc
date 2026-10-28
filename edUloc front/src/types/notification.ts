/** [v1~] type = NotificationType Prisma en minuscules */
export type AppNotificationType =
  | "booking_request"
  | "booking_confirmed"
  | "booking_refused"
  | "booking_cancelled"
  | "session_started"
  | "session_completed"
  | "review_request"
  | "tutor_application"
  | "tutor_application_approved"
  | "tutor_application_rejected"
  | "tutor_suspended"
  | "voice_message"
  | "document_message"
  | "incoming_call"
  | "missed_call"
  | "reminder"
  | "system";

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  message: string;
  isRead: boolean; // [v1+]
  createdAt: string; // [v1+]
  timeLabel: string; // calculé depuis createdAt
  dateGroup: string; // calculé depuis createdAt
  target: { bookingId?: string; conversationId?: string } | null; // [v1+] navigation
}
