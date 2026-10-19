import { z } from 'zod';

/**
 * Sortie BRUTE demandée au LLM : on lui fait remplir exactement le formulaire EduLoc, pas résumer le CV.
 * `null` pour toute information absente — jamais de valeur inventée. Chaque champ est tolérant (le modèle se trompe de
 * type de temps en temps) ; la vraie validation est faite ensuite par cv-normalizer.
 */
export const CV_EXPERIENCE_TYPES = ['ENSEIGNEMENT', 'SOUTIEN_SCOLAIRE', 'PROFESSIONNEL', 'ACADEMIQUE', 'PROJET', 'BENEVOLAT'] as const;
export const CV_LEVELS = ['BAC', 'L1', 'L2', 'L3', 'M1', 'M2', 'DOCTORAT'] as const;
export const CV_AUDIENCES = ['PRIMAIRE', 'COLLEGE', 'LYCEE', 'UNIVERSITE'] as const;
export const CV_SKILL_CATEGORIES = ['MATIERE', 'OUTIL', 'LANGAGE', 'COMPETENCE'] as const;

/**
 * JSON Schema transmis à Ollama (paramètre `format`) : la sortie est contrainte, pas seulement demandée.
 *
 * MINIMAL À DESSEIN : sur CPU, un petit modèle génère ~5 jetons/s, et chaque jeton de sortie coûte une seconde. Le modèle ne
 * RECOPIE donc rien : il reçoit le CV en lignes numérotées et indique seulement le numéro de la ligne où commence chaque
 * diplôme (`e`) et chaque expérience (`x`) — des entiers seuls, une dizaine de jetons au total. Intitulé, structure, dates,
 * type, public et matières sont lus ensuite par le serveur dans le texte du CV (cv-entries.ts, mots-clés et catalogue).
 */
export const CV_JSON_SCHEMA = {
  type: 'object',
  properties: {
    e: { type: 'array', items: { type: 'integer' } },
    x: { type: 'array', items: { type: 'integer' } },
  },
  required: ['e', 'x'],
} as const;

const text = z.preprocess((v) => (typeof v === 'string' ? v.trim() || null : v == null ? null : String(v)), z.string().nullable());
const confidence = z.preprocess((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5), z.number());
const textList = z.preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim()) : []), z.array(z.string()));

export const rawCvSchema = z.object({
  profile: z
    .object({ full_name: text, phone: text, email: text, city: text })
    .partial()
    .default({}),
  education: z
    .array(
      z.object({
        degree: text.optional(),
        level: text.optional(),
        field_or_mention: text.optional(),
        institution: text.optional(),
        start_date: text.optional(),
        end_date: text.optional(),
        status: text.optional(),
        confidence: confidence.optional(),
      }),
    )
    .default([]),
  experiences: z
    .array(
      z.object({
        type: text.optional(),
        title: text.optional(),
        organization: text.optional(),
        start_date: text.optional(),
        end_date: text.optional(),
        description: text.optional(),
        taught_subjects: textList.optional(),
        levels: textList.optional(),
        confidence: confidence.optional(),
      }),
    )
    .default([]),
  skills: z
    .array(z.object({ label: text.optional(), category: text.optional(), confidence: confidence.optional() }))
    .default([]),
  languages: z.array(z.object({ language: text.optional(), level: text.optional() })).default([]),
});

export type RawCv = z.infer<typeof rawCvSchema>;

/** Sortie du modèle `{"e":[12,14],"x":[17,26]}` → numéros de ligne des diplômes et des expériences. */
export const modelOutputSchema = z
  .object({
    e: z.array(z.coerce.number().int()).default([]),
    x: z.array(z.coerce.number().int()).default([]),
  })
  .transform((o) => ({ education: o.e.map((n) => ({ n })), experiences: o.x.map((n) => ({ n })) }));

/** Numéros de ligne gardés en cache pour un fichier déjà analysé (même forme que `LineEntries`). */
export const compactCvSchema = z.object({
  education: z.array(z.object({ n: z.coerce.number().int() })).default([]),
  experiences: z.array(z.object({ n: z.coerce.number().int(), ty: text.optional() })).default([]),
});

// ---------------------------------------------------------------------------------------------------------------------
// Résultat NORMALISÉ renvoyé à l'application : ce qui pré-remplit le formulaire, que le tuteur relit et confirme.
// ---------------------------------------------------------------------------------------------------------------------

export type CvDegreeId = 'bac' | 'licence' | 'master' | 'doctorat';
export type CvExperienceType = 'TEACHING' | 'SUPERVISION' | 'PROFESSIONAL' | 'ACADEMIC' | 'VOLUNTEER';
export type CvAudience = 'Primaire' | 'Collège' | 'Lycée' | 'Université';

export interface CvSubjectRef {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  levelCategories: string[];
  isVerified: boolean;
}

export interface CvEducation {
  degreeId: CvDegreeId | null;
  /** Niveau fin lu dans le CV (L3, M2…). */
  level: string | null;
  degreeLabel: string | null;
  /** Mention ou série reconnue dans la nomenclature EduLoc, à défaut le texte du CV. */
  field: string | null;
  institution: string | null;
  period: string;
  status: 'EN_COURS' | 'OBTENU' | null;
  confidence: number;
  warnings: string[];
}

export interface CvExperience {
  type: CvExperienceType;
  title: string;
  organization: string;
  period: string;
  description: string | null;
  subjectsTaught: string | null;
  audience: CvAudience[];
  confidence: number;
  warnings: string[];
}

export interface CvSkill {
  label: string;
  category: string | null;
  /** Matière du catalogue rapprochée (égalité, synonyme, puis similarité EmbeddingGemma) ; null = à ajouter à la main. */
  subject: CvSubjectRef | null;
  matchedBy: 'exact' | 'alias' | 'contains' | 'embedding' | null;
  confidence: number;
}

export interface CvPrefill {
  profile: { fullName: string | null; phone: string | null; email: string | null; city: string | null };
  education: CvEducation[];
  experiences: CvExperience[];
  skills: CvSkill[];
  languages: { language: string; level: string | null }[];
  /** Avertissements globaux (aucune expérience trouvée, diplôme absent…). */
  warnings: string[];
}
