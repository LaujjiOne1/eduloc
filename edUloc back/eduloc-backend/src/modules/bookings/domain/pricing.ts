/**
 * Prix d'une séance (décisions produit du 2026-10-22). Fonctions pures, sans accès base ni configuration :
 * les taux et plafonds sont passés par l'appelant (AppConfig).
 *
 *   total payé par le Demandeur = tarif du Tuteur + frais de déplacement + frais de salle + frais de service EduLoc
 *
 * Le tarif du Tuteur lui revient en entier ; la commission est un SUPPLÉMENT payé par le Demandeur (« frais de service »),
 * calculé sur le seul tarif du Tuteur. Les frais de déplacement reviennent au Tuteur, les frais de salle au partenaire.
 */

/** Une tranche de la grille COMMUNE de déplacement : distance maximale incluse (km) → forfait (Ar). */
export interface TravelTier { upToKm: number; fee: number }

/** Grille du MVP (forfait par tranche, pas de tarif au kilomètre, pas de grille par Tuteur). */
export const TRAVEL_FEE_GRID: readonly TravelTier[] = [
  { upToKm: 3, fee: 0 },
  { upToKm: 7, fee: 5_000 },
  { upToKm: 12, fee: 8_000 },
  { upToKm: Number.POSITIVE_INFINITY, fee: 10_000 },
];

/** Forfait de déplacement pour une distance à vol d'oiseau (mètres) : tranches ouvertes à gauche, fermées à droite. */
export function travelFeeForDistance(distanceM: number, grid: readonly TravelTier[] = TRAVEL_FEE_GRID): number {
  const km = Math.max(0, distanceM) / 1000;
  return (grid.find((tier) => km <= tier.upToKm) ?? grid[grid.length - 1]).fee;
}

/** Plus haut forfait de la grille : référence du plafond du tarif horaire d'une salle (jamais plus chère que le déplacement). */
export const MAX_TRAVEL_FEE = TRAVEL_FEE_GRID[TRAVEL_FEE_GRID.length - 1].fee;

export interface PriceInput {
  /** Tarif du Tuteur pour la durée choisie. */
  tutorFee: number;
  travelFee?: number;
  roomFee?: number;
  /** Taux de commission sur le tarif du Tuteur (0,10 = 10 %). */
  commissionRate: number;
}

export interface PriceBreakdown {
  tutorFee: number;
  travelFee: number;
  roomFee: number;
  serviceFeeRate: number;
  serviceFee: number;
  total: number;
  /** Répartition enregistrée pour chaque réservation. */
  split: { tutor: number; partner: number; platform: number };
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function computePriceBreakdown(input: PriceInput): PriceBreakdown {
  if (input.commissionRate < 0 || input.commissionRate > 1) throw new RangeError('commissionRate must be within [0, 1]');
  const tutorFee = round2(input.tutorFee);
  const travelFee = round2(input.travelFee ?? 0);
  const roomFee = round2(input.roomFee ?? 0);
  const serviceFee = round2(tutorFee * input.commissionRate);
  return {
    tutorFee,
    travelFee,
    roomFee,
    serviceFeeRate: input.commissionRate,
    serviceFee,
    total: round2(tutorFee + travelFee + roomFee + serviceFee),
    split: { tutor: round2(tutorFee + travelFee), partner: roomFee, platform: serviceFee },
  };
}
