import { create } from "zustand";

import { uuid } from "@/api/http";

import type { SavedBeneficiary } from "@/types/beneficiary";
import type { Offer, OfferSlot } from "@/types/offer";
import type { PartnerRoom } from "@/types/room";

/** Choix faits sur BookDate en plus du créneau : durée, et salle partenaire avec les besoins de la séance. */
export interface SessionChoice {
  /** Durée choisie parmi celles de l'offre ; null = durée par défaut de l'offre. */
  durationMinutes: number | null;
  room: PartnerRoom | null;
  participantsCount: number;
  requiredEquipment: string[];
}

const DEFAULT_CHOICE: SessionChoice = { durationMinutes: null, room: null, participantsCount: 1, requiredEquipment: [] };

interface BookingWizardStore {
  offer: Offer | null;
  slot: OfferSlot | null;
  choice: SessionChoice;
  /** A real, saved beneficiary — chosen from the address book or just created (AGENTS.md contract needs a beneficiaryId). */
  beneficiary: SavedBeneficiary | null;
  /** Only sent to the API when the resolved teaching mode is "at_home_beneficiary". */
  beneficiaryAddress: string;
  /** DifficultyId ("theoretical" | "practical" | ...) — empty string means "not set". */
  difficulty: string;
  /** Objectif pédagogique ("remedial" | "ongoing" | "excellence") — vide tant qu'il n'est pas choisi. */
  objective: string;
  /** Précision du besoin, envoyée au tuteur (requesterNote) — facultative. */
  note: string;
  /** Id of the Booking BookingSummary just created — lets BookingPending's "Voir la demande" open the real 23_BookingDetailPending. */
  createdBookingId: string | null;
  /** Même clé pour toutes les tentatives d'envoi d'une demande (Idempotency-Key) ; renouvelée si l'offre/le créneau change. */
  idempotencyKey: string;
  /** Offre choisie sur sa fiche : le créneau se choisit ensuite, sur le calendrier (BookDate). */
  setOffer: (offer: Offer) => void;
  setBooking: (offer: Offer, slot: OfferSlot, choice?: SessionChoice) => void;
  setBeneficiary: (beneficiary: SavedBeneficiary) => void;
  setBeneficiaryAddress: (address: string) => void;
  setDifficulty: (difficulty: string) => void;
  setObjective: (objective: string) => void;
  setNote: (note: string) => void;
  setCreatedBookingId: (id: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  offer: null,
  slot: null,
  choice: DEFAULT_CHOICE,
  beneficiary: null,
  beneficiaryAddress: "",
  difficulty: "",
  objective: "",
  note: "",
  createdBookingId: null,
  idempotencyKey: "",
};

/**
 * Holds the offer/slot picked on BookDate plus the beneficiary chosen (or
 * just created) on Beneficiary and the need (objective, difficulty, note) given on
 * BeneficiaryProfile — asked here rather than in the search, since it only matters
 * once a tutor is chosen — so none of it is lost while the user detours
 * through Login/Signup/Verify (AGENTS.md §13: navigation must never drop
 * already-entered data). Reset once the request has actually been sent
 * (BookingPending's "Retour à l'accueil"), mirroring how the search wizard is
 * reset from Home's `goToSearch`.
 */
export const useBookingWizardStore = create<BookingWizardStore>((set) => ({
  ...INITIAL_STATE,

  setOffer: (offer) => set({ offer, slot: null, choice: DEFAULT_CHOICE, idempotencyKey: uuid() }),

  setBooking: (offer, slot, choice = DEFAULT_CHOICE) => set({ offer, slot, choice, idempotencyKey: uuid() }),

  setBeneficiary: (beneficiary) => set({ beneficiary }),

  setBeneficiaryAddress: (beneficiaryAddress) => set({ beneficiaryAddress }),

  setDifficulty: (difficulty) => set({ difficulty }),

  setObjective: (objective) => set({ objective }),

  setNote: (note) => set({ note }),

  setCreatedBookingId: (createdBookingId) => set({ createdBookingId }),

  reset: () => set({ ...INITIAL_STATE }),
}));
