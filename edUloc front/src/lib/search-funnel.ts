import type { Category } from "@/types/category";
import type { EducationLevel } from "@/types/search";
import type { AcademicTrack } from "@/types/track";
import { t } from "@/i18n";

/**
 * Entonnoir de recherche : Niveau (cycle puis niveau précis) → Filière (séries ou mentions, seulement pour
 * Première/Terminale et l'université) → Matière (filtrée par bloc et par série).
 */

export type LevelBlockId = "primaire" | "college" | "lycee" | "licence" | "master" | "doctorat";

export interface LevelBlock {
  id: LevelBlockId;
  label: string;
  levels: EducationLevel[];
}

const BLOCKS: { id: LevelBlockId; label: string; matches: (level: EducationLevel) => boolean }[] = [
  { id: "primaire", get label() { return t("common.primarySchool"); }, matches: (l) => l.category === "Primaire" },
  { id: "college", get label() { return t("common.middleSchool"); }, matches: (l) => l.category === "Collège" },
  { id: "lycee", get label() { return t("common.highSchool"); }, matches: (l) => l.category === "Lycée" },
  { id: "licence", get label() { return t("common.bachelorSDegree"); }, matches: (l) => l.category === "Université" && l.label.startsWith("Licence") },
  { id: "master", get label() { return t("common.masterSDegree"); }, matches: (l) => l.category === "Université" && l.label.startsWith("Master") },
  { id: "doctorat", get label() { return t("common.doctorate"); }, matches: (l) => l.category === "Université" && l.label.startsWith("Doctorat") },
];

/** Regroupe les niveaux du catalogue en blocs parents (ordre du catalogue conservé) ; un niveau hors bloc (« Formation pro ») n'est pas proposé. */
export function groupLevels(levels: EducationLevel[]): LevelBlock[] {
  return BLOCKS.map((block) => ({ id: block.id, label: block.label, levels: levels.filter(block.matches) })).filter(
    (block) => block.levels.length > 0,
  );
}

/**
 * Filière à choisir après un niveau. Le catalogue (GET /catalog/education-levels) la fournit ; les niveaux imbriqués
 * dans d'autres réponses (profil tuteur) n'ont que leur nom et leur catégorie — même règle que le serveur dans ce cas.
 */
export function trackKindOf(level: EducationLevel | null | undefined): "serie" | "mention" | null {
  if (!level) return null;
  if (level.trackKind !== undefined) return level.trackKind;
  if (level.category === "Lycée") return level.label === "Première" || level.label === "Terminale" ? "serie" : null;
  if (level.category === "Université") return level.label === "Formation pro" ? null : "mention";
  return null;
}

/**
 * Matières proposées pour un niveau (et une filière : série au lycée, mention à l'université) : chaque bloc n'affiche
 * que les siennes. Une matière sans filière (`trackCodes` vide) est commune à toutes ; un niveau sans filière à choisir
 * (Seconde, « Formation pro ») ne voit donc que ce tronc commun.
 */
export function subjectsFor(categories: Category[], level: EducationLevel | null, track: AcademicTrack | null): Category[] {
  const levelCategory = level?.category;
  if (!levelCategory) return [];
  return categories.filter((subject) => {
    const levelCategories = subject.levelCategories ?? [];
    if (levelCategories.length > 0 && !levelCategories.includes(levelCategory)) return false;
    if (level && subject.excludedLevels?.includes(level.label)) return false;
    if (levelCategory !== "Lycée" && levelCategory !== "Université") return true;
    const trackCodes = subject.trackCodes ?? [];
    if (trackCodes.length === 0) return true;
    return !!track && trackCodes.includes(track.code);
  });
}

/** La matière se saisit librement uniquement à l'université (après le choix de la mention). */
export const allowsFreeTextSubject = (level: EducationLevel | null): boolean => level?.category === "Université";

/** Vrai quand l'entonnoir est complet : niveau, filière si le niveau en demande une, matière. */
export function isFunnelComplete(criteria: { level: EducationLevel | null; track: AcademicTrack | null; subject: unknown }): boolean {
  if (!criteria.level || !criteria.subject) return false;
  return !criteria.level.trackKind || !!criteria.track;
}
