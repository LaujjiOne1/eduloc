import { create } from "zustand";

import type { AcademicTrack } from "@/types/track";
import type { InPersonModeId, LocationFormatId, TutorGender } from "@/types/common";
import type { EducationLevel } from "@/types/search";
import type { LocalFile } from "@/types/message";
import { canTeachLevel } from "@/lib/degree-policy";
import type { ExperienceAudienceId, TutorExperienceType } from "@/lib/experience-types";
import { backgroundFromCv, experienceFromCv, skillFromCv } from "@/lib/cv-prefill";
import type { CvPrefillDto } from "@/types/cv-import";
import type { TutorApplication, TutorDocumentKind, TutorSkill } from "@/types/tutor-application";
import { t } from "@/i18n";

/**
 * UI-only types for the onboarding wizard's offer/location/availability steps.
 *
 * Draft values are submitted together with the tutor application; the server
 * stores them in the tutor profile and its related offer/place/availability
 * records before the application is reviewed.
 */
export interface TutorIdentityFields {
  firstName: string;
  lastName: string;
  /** Sexe : choisit la silhouette par défaut du tuteur (sans photo). */
  gender: TutorGender | null;
  birthDate: string;
  phone: string;
  email: string;
}

export type { TutorExperienceType } from "@/lib/experience-types";

export interface TutorExperienceEntry {
  id: string;
  type: TutorExperienceType;
  title: string;
  organization: string;
  period: string;
  /** Public encadré (primaire, collège, lycée, université). */
  audience: ExperienceAudienceId[];
  /** Matières ou compétences enseignées. */
  subjects?: string;
  description?: string;
  /** Pré-remplie à partir du CV : à relire. L'enregistrement par le tuteur lève les avertissements de l'import. */
  fromCv?: boolean;
  warnings?: string[];
}

export type EducationDegreeId = "bac" | "licence" | "master" | "doctorat" | "other";

export interface EducationDegree {
  id: EducationDegreeId;
  label: string;
}

export interface TutorBackgroundFields {
  degree: EducationDegree | null;
  field: string;
  institution: string;
  experience: string;
  experiences: TutorExperienceEntry[];
}

export interface TutorSubjectLevels {
  skill: TutorSkill;
  levels: EducationLevel[];
}

export type OfferDurationId = "45m" | "1h" | "1h30" | "2h" | "3h";

export interface OfferDuration {
  id: OfferDurationId;
  label: string;
  hours: number;
}

export interface TutorOfferDraft {
  id: string;
  skill: TutorSkill | null;
  level: EducationLevel | null;
  /** Série (Première/Terminale, obligatoire) ou mention (université, facultative) de l'offre. */
  track: AcademicTrack | null;
  /** Case cochée sur la carte de la matière : seules les offres cochées sont envoyées. */
  enabled: boolean;
  title: string;
  description: string;
  duration: OfferDuration | null;
  hourlyRate: number;
  priceCalculated: number;
}

export interface TutorLocationEntry {
  id: string;
  label: string;
  /** beneficiary_home = zone où le tuteur se déplace ; tutor_home = son adresse d'accueil ; public_place = point de rencontre. */
  kind: InPersonModeId;
  /** 0 pour l'adresse d'accueil (pas de zone). */
  radiusKm: number;
  /** Exactement un lieu principal est exigé par le serveur : toujours le premier de la liste (voir `withPrimary`). */
  isPrimary: boolean;
  /** Coordonnées géocodées : la recherche de tuteurs est géographique (un lieu sans coordonnées n'est jamais trouvé). */
  latitude: number;
  longitude: number;
}

const KIND_ORDER: InPersonModeId[] = ["beneficiary_home", "tutor_home", "public_place"];

/** Trie les lieux par type et marque le premier comme principal (le serveur exige exactement un lieu principal). */
function withPrimary(locations: TutorLocationEntry[]): TutorLocationEntry[] {
  const sorted = [...locations].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return sorted.map((loc, i) => ({ ...loc, isPrimary: i === 0 }));
}

/** Tarif horaire proposé par défaut, en ariary (Ar). */
export const DEFAULT_HOURLY_RATE = 20_000;

export interface TutorAvailabilityEntry {
  id: string;
  dateLabel: string;
  timeRangeLabel: string;
  format: LocationFormatId;
  locationLabel: string | null;
}

export interface WeeklyDaySlot {
  id: string;
  startTime: string;
  endTime: string;
  format: LocationFormatId;
}

export interface WeeklyDayAvailability {
  dayId: string;
  dayLabel: string;
  active: boolean;
  slots: WeeklyDaySlot[];
}

/** Disponibilité ponctuelle : un jour précis (AAAA-MM-JJ), une seule fois — par opposition à la grille hebdomadaire. */
export interface DateSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  format: LocationFormatId;
}

export interface TutorDocumentEntry {
  kind: TutorDocumentKind;
  label: string;
  provided: boolean;
  fileName?: string;
  fileSize?: string;
  file?: LocalFile;
}

export interface TutorIntroVideo {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  duration: number | null;
}

const INITIAL_IDENTITY: TutorIdentityFields = {
  firstName: "",
  lastName: "",
  gender: null,
  birthDate: "",
  phone: "",
  email: "",
};

const INITIAL_BACKGROUND: TutorBackgroundFields = {
  degree: null,
  field: "",
  institution: "",
  experience: "",
  experiences: [],
};

export const createDefaultOffer = (id = "offer-1"): TutorOfferDraft => ({
  id,
  skill: null,
  level: null,
  track: null,
  enabled: true,
  // Titre et description sont générés à l'envoi (matière + niveau) ; le tarif est toujours à l'heure.
  title: "",
  description: "",
  duration: { id: "1h", label: t("common.n1Hour"), hours: 1 },
  hourlyRate: 0,
  priceCalculated: 0,
});

const newOfferId = () => `offer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

const INITIAL_DOCUMENTS: TutorDocumentEntry[] = [
  { kind: "identity", label: "Pièce justificative (CNI / Passeport)", provided: false },
  { kind: "diploma", label: "Diplôme le plus élevé", provided: false },
  { kind: "other", label: "Autre document (CV / Certification)", provided: false },
];

/** Aucun lieu par défaut : le tuteur choisit sa vraie zone (adresse géocodée). */
const INITIAL_LOCATIONS: TutorLocationEntry[] = [];

/** Grille vide au départ : aucun jour coché, aucun créneau — le tuteur coche ses jours puis ajoute ses plages. */
export const INITIAL_WEEKLY_AVAILABILITY: WeeklyDayAvailability[] = [
  { dayId: "mon", get dayLabel() { return t("common.monday"); }, active: false, slots: [] },
  { dayId: "tue", get dayLabel() { return t("common.tuesday"); }, active: false, slots: [] },
  { dayId: "wed", get dayLabel() { return t("common.wednesday"); }, active: false, slots: [] },
  { dayId: "thu", get dayLabel() { return t("common.thursday"); }, active: false, slots: [] },
  { dayId: "fri", get dayLabel() { return t("common.friday"); }, active: false, slots: [] },
  { dayId: "sat", get dayLabel() { return t("common.saturday"); }, active: false, slots: [] },
  { dayId: "sun", get dayLabel() { return t("common.sunday"); }, active: false, slots: [] },
];

interface TutorApplicationStore {
  identity: TutorIdentityFields;
  background: TutorBackgroundFields;
  /** Le tuteur a confirmé un pré-remplissage issu de son CV : les champs encore vides sont signalés. */
  cvApplied: boolean;
  skills: TutorSkill[];
  subjectLevels: TutorSubjectLevels[];
  bio: string;
  introVideo: TutorIntroVideo | null;
  /** Une offre par (matière, niveau[, série]) : le tuteur fixe un prix horaire par niveau enseigné. */
  offers: TutorOfferDraft[];
  formats: LocationFormatId[];
  /** Façons d'enseigner en présentiel acceptées par le tuteur (utile quand le format « présentiel » est coché). */
  inPersonModes: InPersonModeId[];
  locations: TutorLocationEntry[];
  availability: TutorAvailabilityEntry[];
  weeklyAvailability: WeeklyDayAvailability[];
  dateAvailability: DateSlot[];
  documents: TutorDocumentEntry[];
  application: TutorApplication | null;
  isPendingValidation: boolean;

  setIdentity: (fields: Partial<TutorIdentityFields>) => void;
  setBackground: (fields: Partial<TutorBackgroundFields>) => void;
  /** Applique ce que le tuteur a retenu de la proposition issue de son CV (formation, expériences, compétences). */
  applyCvPrefill: (prefill: CvPrefillDto, keep: { education: boolean; experiences: number[]; skills: number[] }) => void;
  addExperience: (entry: Omit<TutorExperienceEntry, "id">) => void;
  updateExperience: (id: string, entry: Partial<TutorExperienceEntry>) => void;
  removeExperience: (id: string) => void;
  toggleSkill: (skill: TutorSkill) => void;
  /** Ajoute une compétence (sans doublon) — choisie dans les suggestions ou créée librement. */
  addSkill: (skill: TutorSkill) => void;
  setSkillScope: (skillId: string, scope: string) => void;
  toggleSubjectLevel: (skill: TutorSkill, level: EducationLevel) => void;
  setBio: (bio: string) => void;
  setIntroVideo: (video: TutorIntroVideo | null) => void;
  /** Aligne les offres sur les niveaux déclarés : une ligne par niveau, sans toucher aux prix déjà saisis. */
  syncOffersWithLevels: () => void;
  /** « Ajouter un niveau » : déclare le niveau pour la matière si besoin et ajoute sa ligne de tarif (ou une autre série). */
  addLevelOffer: (skill: TutorSkill, level: EducationLevel) => void;
  updateOfferAtIndex: (index: number, fields: Partial<TutorOfferDraft>) => void;
  removeOfferAtIndex: (index: number) => void;
  toggleFormat: (format: LocationFormatId) => void;
  /** Coche / décoche une façon d'enseigner en présentiel ; décocher retire les lieux qui lui étaient associés. */
  toggleInPersonMode: (mode: InPersonModeId) => void;
  updateTravelRadius: (radiusKm: number) => void;
  /** Définit (ou remplace) la zone de déplacement chez l'élève à partir d'une adresse géocodée. */
  setTravelZone: (label: string, coordinates: { latitude: number; longitude: number }, radiusKm?: number) => void;
  /** Définit (ou remplace) l'adresse où le tuteur accueille ses élèves. */
  setTutorHome: (label: string, coordinates: { latitude: number; longitude: number }) => void;
  addPublicPlace: (label: string, radiusKm: number, coordinates: { latitude: number; longitude: number }) => void;
  removeLocation: (id: string) => void;
  toggleWeeklyDay: (dayId: string) => void;
  addWeeklySlot: (dayId: string, startTime: string, endTime: string, format?: LocationFormatId) => void;
  removeWeeklySlot: (dayId: string, slotId: string) => void;
  addDateSlot: (date: string, startTime: string, endTime: string, format: LocationFormatId) => void;
  removeDateSlot: (slotId: string) => void;
  removeDocumentFile: (kind: TutorDocumentKind) => void;
  attachDocumentFile: (kind: TutorDocumentKind, file: LocalFile, fileSize: string) => void;
  setApplication: (application: TutorApplication) => void;
  setIsPendingValidation: (val: boolean) => void;
  reset: () => void;
}

export const useTutorApplicationStore = create<TutorApplicationStore>((set) => ({
  identity: INITIAL_IDENTITY,
  background: INITIAL_BACKGROUND,
  cvApplied: false,
  skills: [],
  subjectLevels: [],
  bio: "",
  introVideo: null,
  offers: [],
  formats: [],
  inPersonModes: [],
  locations: INITIAL_LOCATIONS,
  availability: [],
  weeklyAvailability: INITIAL_WEEKLY_AVAILABILITY,
  dateAvailability: [],
  documents: INITIAL_DOCUMENTS,
  application: null,
  isPendingValidation: false,

  setIdentity: (fields) => set((s) => ({ identity: { ...s.identity, ...fields } })),

  applyCvPrefill: (prefill, keep) =>
    set((s) => {
      // Une nouvelle importation remplace la précédente : ses expériences ne sont jamais en double.
      const manual = (s.background.experiences ?? []).filter((e) => !e.fromCv);
      const imported: TutorExperienceEntry[] = keep.experiences
        .map((i) => prefill.experiences[i])
        .filter(Boolean)
        .map((x) => ({ ...experienceFromCv(x), id: `exp-cv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}` }));
      const experiences = [...manual, ...imported];

      const fromCv = keep.education ? backgroundFromCv(prefill.education) : null;
      const background: TutorBackgroundFields = {
        ...s.background,
        // Un champ déjà saisi à la main n'est jamais écrasé par une valeur vide du CV.
        degree: fromCv?.degree ?? s.background.degree,
        field: fromCv?.field || s.background.field,
        institution: fromCv?.institution || s.background.institution,
        experiences,
        experience: experiences.map((e) => `${e.title} (${e.organization})`).join(", "),
      };

      const known = new Set(s.skills.map((sk) => sk.id));
      const skills = [...s.skills];
      for (const i of keep.skills) {
        const skill = prefill.skills[i] ? skillFromCv(prefill.skills[i]) : null;
        if (skill && !known.has(skill.id)) {
          known.add(skill.id);
          skills.push(skill);
        }
      }
      return { background, skills, cvApplied: true };
    }),

  setBackground: (fields) =>
    set((s) => {
      const background = { ...s.background, ...fields };
      if (!fields.degree || fields.degree.id === s.background.degree?.id) return { background };
      // Le diplôme borne les niveaux enseignables : on retire ceux que le nouveau diplôme n'autorise plus.
      const degreeId = fields.degree.id;
      const subjectLevels = s.subjectLevels.map((sl) => ({ ...sl, levels: sl.levels.filter((l) => canTeachLevel(degreeId, l)) }));
      const offers = s.offers.filter((o) => !o.level || canTeachLevel(degreeId, o.level));
      return { background, subjectLevels, offers };
    }),

  addExperience: (entry) =>
    set((s) => {
      const newEntry: TutorExperienceEntry = {
        ...entry,
        id: `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      };
      const experiences = [...(s.background.experiences ?? []), newEntry];
      return {
        background: {
          ...s.background,
          experiences,
          experience: experiences.map((e) => `${e.title} (${e.organization})`).join(", "),
        },
      };
    }),

  updateExperience: (id, fields) =>
    set((s) => {
      const experiences = (s.background.experiences ?? []).map((exp) =>
        exp.id === id ? { ...exp, ...fields } : exp
      );
      return {
        background: {
          ...s.background,
          experiences,
          experience: experiences.map((e) => `${e.title} (${e.organization})`).join(", "),
        },
      };
    }),

  removeExperience: (id) =>
    set((s) => {
      const experiences = (s.background.experiences ?? []).filter((exp) => exp.id !== id);
      return {
        background: {
          ...s.background,
          experiences,
          experience: experiences.map((e) => `${e.title} (${e.organization})`).join(", "),
        },
      };
    }),

  toggleSkill: (skill) =>
    set((s) => {
      const exists = s.skills.some((sk) => sk.id === skill.id);
      const newSkills = exists ? s.skills.filter((sk) => sk.id !== skill.id) : [...s.skills, skill];
      return {
        skills: newSkills,
        subjectLevels: exists ? s.subjectLevels.filter((sl) => sl.skill.id !== skill.id) : s.subjectLevels,
        offers: exists ? s.offers.filter((o) => o.skill?.id !== skill.id) : s.offers,
      };
    }),

  addSkill: (skill) =>
    set((s) => (s.skills.some((sk) => sk.id === skill.id) ? s : { skills: [...s.skills, skill] })),

  setSkillScope: (skillId, scope) =>
    set((s) => {
      const withScope = (sk: TutorSkill): TutorSkill => (sk.id === skillId ? { ...sk, scope } : sk);
      return {
        skills: s.skills.map(withScope),
        subjectLevels: s.subjectLevels.map((sl) => ({ ...sl, skill: withScope(sl.skill) })),
        offers: s.offers.map((o) => (o.skill ? { ...o, skill: withScope(o.skill) } : o)),
      };
    }),

  toggleSubjectLevel: (skill, level) =>
    set((s) => {
      const index = s.subjectLevels.findIndex((sl) => sl.skill.id === skill.id);
      if (index === -1) {
        return { subjectLevels: [...s.subjectLevels, { skill, levels: [level] }] };
      }
      const entry = s.subjectLevels[index];
      const hasLevel = entry.levels.some((l) => l.id === level.id);
      const levels = hasLevel ? entry.levels.filter((l) => l.id !== level.id) : [...entry.levels, level];
      const next = [...s.subjectLevels];
      next[index] = { ...entry, levels };
      // Un niveau retiré emporte ses lignes de tarif.
      const offers = hasLevel ? s.offers.filter((o) => !(o.skill?.id === skill.id && o.level?.id === level.id)) : s.offers;
      return { subjectLevels: next, offers };
    }),

  setBio: (bio) => set({ bio }),

  setIntroVideo: (introVideo) => set({ introVideo }),

  syncOffersWithLevels: () =>
    set((s) => {
      const wanted = s.subjectLevels.flatMap((sl) => sl.levels.map((level) => ({ skill: sl.skill, level })));
      const sameRow = (o: TutorOfferDraft, w: { skill: TutorSkill; level: EducationLevel }) =>
        o.skill?.id === w.skill.id && o.level?.id === w.level.id;
      const kept = s.offers.filter((o) => wanted.some((w) => sameRow(o, w)));
      const added = wanted
        .filter((w) => !kept.some((o) => sameRow(o, w)))
        .map((w) => ({ ...createDefaultOffer(newOfferId()), skill: w.skill, level: w.level }));
      const rank = (o: TutorOfferDraft) => wanted.findIndex((w) => sameRow(o, w));
      const offers = [...kept, ...added].sort((x, y) => rank(x) - rank(y));
      return { offers };
    }),

  addLevelOffer: (skill, level) =>
    set((s) => {
      const entry = s.subjectLevels.find((sl) => sl.skill.id === skill.id);
      const declared = entry?.levels.some((l) => l.id === level.id) ?? false;
      const subjectLevels = declared
        ? s.subjectLevels
        : entry
          ? s.subjectLevels.map((sl) => (sl === entry ? { ...sl, levels: [...sl.levels, level] } : sl))
          : [...s.subjectLevels, { skill, levels: [level] }];
      const row: TutorOfferDraft = { ...createDefaultOffer(newOfferId()), skill, level };
      const lastOfSkill = s.offers.reduce((last, o, i) => (o.skill?.id === skill.id ? i : last), -1);
      const offers = [...s.offers];
      offers.splice(lastOfSkill === -1 ? offers.length : lastOfSkill + 1, 0, row);
      return { subjectLevels, offers };
    }),

  updateOfferAtIndex: (index, fields) =>
    set((s) => {
      const target = s.offers[index];
      if (!target) return s;
      const updated = { ...target, ...fields };
      const hours = updated.duration?.hours ?? 1;
      updated.priceCalculated = Math.round(hours * (updated.hourlyRate ?? 0));
      const offers = [...s.offers];
      offers[index] = updated;
      return { offers };
    }),

  removeOfferAtIndex: (index) => set((s) => ({ offers: s.offers.filter((_, i) => i !== index) })),

  toggleFormat: (format) =>
    set((s) => {
      const on = s.formats.includes(format);
      return {
        formats: on ? s.formats.filter((f) => f !== format) : [...s.formats, format],
        // Sans présentiel, plus de façon d'enseigner ni de lieu physique à conserver.
        ...(on && format === "in_person" ? { inPersonModes: [], locations: [] } : {}),
      };
    }),

  toggleInPersonMode: (mode) =>
    set((s) => {
      const on = s.inPersonModes.includes(mode);
      return {
        inPersonModes: on ? s.inPersonModes.filter((m) => m !== mode) : [...s.inPersonModes, mode],
        locations: on ? withPrimary(s.locations.filter((loc) => loc.kind !== mode)) : s.locations,
      };
    }),

  updateTravelRadius: (radiusKm) =>
    set((s) => ({
      locations: s.locations.map((loc) => (loc.kind === "beneficiary_home" ? { ...loc, radiusKm } : loc)),
    })),

  setTravelZone: (label, coordinates, radiusKm = 10) =>
    set((s) => {
      const previous = s.locations.find((loc) => loc.kind === "beneficiary_home");
      const zone: TutorLocationEntry = {
        id: previous?.id ?? "loc-travel",
        label,
        kind: "beneficiary_home",
        radiusKm: previous?.radiusKm ?? radiusKm,
        isPrimary: false,
        ...coordinates,
      };
      return { locations: withPrimary([...s.locations.filter((loc) => loc.kind !== "beneficiary_home"), zone]) };
    }),

  setTutorHome: (label, coordinates) =>
    set((s) => {
      const home: TutorLocationEntry = { id: "loc-tutor-home", label, kind: "tutor_home", radiusKm: 0, isPrimary: false, ...coordinates };
      return { locations: withPrimary([...s.locations.filter((loc) => loc.kind !== "tutor_home"), home]) };
    }),

  addPublicPlace: (label, radiusKm, coordinates) =>
    set((s) => ({
      locations: withPrimary([
        ...s.locations,
        { id: `loc-${Date.now()}`, label, kind: "public_place", radiusKm, isPrimary: false, ...coordinates },
      ]),
    })),

  removeLocation: (id) => set((s) => ({ locations: withPrimary(s.locations.filter((loc) => loc.id !== id)) })),

  toggleWeeklyDay: (dayId) =>
    set((s) => ({
      weeklyAvailability: s.weeklyAvailability.map((d) => (d.dayId === dayId ? { ...d, active: !d.active } : d)),
    })),

  addWeeklySlot: (dayId, startTime, endTime, format = "in_person") =>
    set((s) => ({
      weeklyAvailability: s.weeklyAvailability.map((d) =>
        d.dayId === dayId
          ? {
              ...d,
              active: true,
              slots: [...d.slots, { id: `slot-${Date.now()}`, startTime, endTime, format }],
            }
          : d,
      ),
    })),

  removeWeeklySlot: (dayId, slotId) =>
    set((s) => ({
      weeklyAvailability: s.weeklyAvailability.map((d) =>
        d.dayId === dayId ? { ...d, slots: d.slots.filter((slot) => slot.id !== slotId) } : d,
      ),
    })),

  addDateSlot: (date, startTime, endTime, format) =>
    set((s) => ({
      dateAvailability: [
        ...s.dateAvailability,
        { id: `date-slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date, startTime, endTime, format },
      ].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    })),

  removeDateSlot: (slotId) => set((s) => ({ dateAvailability: s.dateAvailability.filter((slot) => slot.id !== slotId) })),

  removeDocumentFile: (kind) =>
    set((s) => ({
      documents: s.documents.map((d) =>
        d.kind === kind ? { ...d, provided: false, file: undefined, fileName: undefined, fileSize: undefined } : d,
      ),
    })),

  attachDocumentFile: (kind, file, fileSize) =>
    set((s) => ({
      documents: s.documents.map((d) =>
        d.kind === kind
          ? { ...d, provided: true, file, fileName: file.fileName, fileSize }
          : d,
      ),
    })),

  setApplication: (application) => set({ application }),

  setIsPendingValidation: (val) => set({ isPendingValidation: val }),

  reset: () =>
    set({
      identity: INITIAL_IDENTITY,
      background: INITIAL_BACKGROUND,
      cvApplied: false,
      skills: [],
      subjectLevels: [],
      bio: "",
      introVideo: null,
      offers: [],
      formats: [],
      inPersonModes: [],
      locations: INITIAL_LOCATIONS,
      availability: [],
      weeklyAvailability: INITIAL_WEEKLY_AVAILABILITY,
      dateAvailability: [],
      documents: INITIAL_DOCUMENTS,
      application: null,
      isPendingValidation: false,
    }),
}));
