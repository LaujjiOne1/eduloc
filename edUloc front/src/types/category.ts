/** Category = Subject côté API (Prisma `Subject`). */
export interface Category {
  id: string; // [v1~] UUID Subject (était "programming", "math"…)
  label: string; // = Subject.name
  group: string | null; // [v1+] = Subject.category ("Programmation")
  /** Matière saisie librement (absente du catalogue) : id synthétique, envoyée au serveur comme texte (`subjectText`). */
  freeText?: boolean;
  /** Catégories de niveaux où la matière s'enseigne (« Primaire », « Lycée »…) ; vide = tous. */
  levelCategories?: string[];
  /** Séries du lycée concernées (codes) ; vide = toutes. */
  trackCodes?: string[];
}
