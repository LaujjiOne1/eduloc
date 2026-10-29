/** Category = Subject côté API (Prisma `Subject`). */
export interface Category {
  id: string; // [v1~] UUID Subject (était "programming", "math"…)
  label: string; // = Subject.name
  group: string | null; // [v1+] = Subject.category ("Programmation")
  /** Matière saisie librement (absente du catalogue) : id synthétique, envoyée au serveur comme texte (`subjectText`). */
  freeText?: boolean;
  /** Catégories de niveaux où la matière s'enseigne (« Primaire », « Lycée »…) ; vide = tous. */
  levelCategories?: string[];
  /** Filières concernées (codes : séries du lycée ou mentions universitaires) ; vide = toutes. */
  trackCodes?: string[];
  /** Niveaux précis (« 11ème »…) où la matière n'est pas proposée malgré sa catégorie ; vide = aucun. */
  excludedLevels?: string[];
}
