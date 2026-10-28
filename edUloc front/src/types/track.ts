/** Filière choisie à l'étape 2 de la recherche : série du lycée ou mention universitaire (côté API : AcademicTrack). */
export interface AcademicTrack {
  id: string;
  kind: "serie" | "mention";
  /** « OSE », « A1 »… pour une série ; slug stable pour une mention. */
  code: string;
  label: string;
  /** Domaine mère d'une mention (jamais affiché : sert au rapprochement côté serveur). */
  domain: string | null;
  /** Série : réforme en cours (« nouveau ») ou « ancien » programme. */
  programme: "nouveau" | "ancien" | null;
  /** Série : « Première » ou « Terminale » — chaque niveau a les siennes (PS ↔ TS, POSE ↔ TOSE, PL ↔ TL). */
  levelName: string | null;
}
