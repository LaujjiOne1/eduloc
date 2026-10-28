import type {
  RoomPublicationId,
  RoomStatusId,
  SubscriptionStatusId,
  VenueDocumentKind,
  VenueTypeId,
} from "@/types/partner";
import { t } from "@/i18n";

export const VENUE_TYPE_LABELS: Record<VenueTypeId, string> = {
  get training_center() { return t("lib.partnerLabels.trainingCentre"); },
  get school() { return t("lib.partnerLabels.schoolEducationalInstitution"); },
  get library() { return t("lib.partnerLabels.libraryMediaLibrary"); },
  get coworking() { return t("lib.partnerLabels.coworkingSpace"); },
  get company() { return t("lib.partnerLabels.companyRoomSuitedToLearning"); },
  get association() { return t("lib.partnerLabels.association"); },
  get community_center() { return t("lib.partnerLabels.communityCentre"); },
  get other() { return t("common.other"); },
};

export const VENUE_DOCUMENT_LABELS: Record<VenueDocumentKind, string> = {
  get ownership_proof() { return t("lib.partnerLabels.proofOfTheRightTo"); },
  business_registration: "Immatriculation / statuts",
  get manager_identity() { return t("lib.partnerLabels.managerSIdDocument"); },
  get insurance() { return t("lib.partnerLabels.insurance"); },
  get other() { return t("lib.partnerLabels.otherSupportingDocument"); },
};

/** Statut de dossier (structure ou salle) → libellé et ton du badge. */
export const REVIEW_STATUS: Record<RoomStatusId, { label: string; tone: "neutral" | "warning" | "success" | "error" | "info" }> = {
  draft: { get label() { return t("lib.partnerLabels.draft"); }, tone: "neutral" },
  submitted: { get label() { return t("lib.partnerLabels.pendingVerification"); }, tone: "info" },
  under_review: { get label() { return t("lib.partnerLabels.underVerification"); }, tone: "info" },
  approved: { get label() { return t("results.results.verified"); }, tone: "success" },
  needs_correction: { get label() { return t("lib.partnerLabels.correctionsRequested"); }, tone: "warning" },
  suspended: { get label() { return t("lib.partnerLabels.suspended"); }, tone: "error" },
  rejected: { get label() { return t("lib.partnerLabels.rejected"); }, tone: "error" },
  disabled: { get label() { return t("lib.partnerLabels.disabled"); }, tone: "neutral" },
};

export const PUBLICATION_LABELS: Record<RoomPublicationId, string> = {
  get unpublished() { return t("lib.partnerLabels.notPublished"); },
  get published() { return t("lib.partnerLabels.published"); },
  get unpublished_by_admin() { return t("lib.partnerLabels.unpublishedByEduloc"); },
};

export const SUBSCRIPTION_LABELS: Record<SubscriptionStatusId, string> = {
  get not_selected() { return t("partnerDashboard.subscription.noPlanChosen"); },
  get pending() { return t("lib.partnerLabels.awaitingActivation"); },
  get active() { return t("tutorDashboard.offers.active"); },
  get expired() { return t("lib.partnerLabels.expired"); },
  get cancelled() { return t("lib.partnerLabels.cancelled"); },
};

/** Champs manquants renvoyés par le serveur → libellé lisible. */
export const MISSING_FIELD_LABELS: Record<string, string> = {
  get name() { return t("partnerDashboard.room.roomName"); },
  get addressLine() { return t("lib.partnerLabels.exactAddress"); },
  get city() { return t("partnerDashboard.room.city"); },
  get position() { return t("lib.partnerLabels.positionLatitudeAndLongitude"); },
  get zoneLabel() { return t("partnerDashboard.room.areaShownPublicly"); },
  get capacity() { return t("lib.partnerLabels.capacity"); },
  get pricePerHour() { return t("lib.partnerLabels.hourlyRate"); },
  get rules() { return t("partnerDashboard.room.rulesOfUse"); },
  get availabilities() { return t("partnerDashboard.room.openingHours"); },
};

