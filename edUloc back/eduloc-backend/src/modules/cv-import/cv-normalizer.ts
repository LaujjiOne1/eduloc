import { normalizeSkillName } from '../catalog/domain/degree-policy';
import type { CvAudience, CvDegreeId, CvEducation, CvExperience, CvExperienceType, CvPrefill, CvSkill, RawCv } from './cv-schema';

/**
 * Validation et normalisation de ce que le LLM a proposé. Principe : le CV est la seule source de vérité. Tout ce que le
 * modèle avance sans le retrouver dans le texte du CV (intitulé, structure, année, compétence) est écarté ou signalé
 * « à vérifier » — on préfère un champ vide à une expérience inventée.
 */

const EXPERIENCE_TYPE_MAP: Record<string, CvExperienceType> = {
  ENSEIGNEMENT: 'TEACHING',
  SOUTIEN_SCOLAIRE: 'TEACHING',
  PROFESSIONNEL: 'PROFESSIONAL',
  ACADEMIQUE: 'SUPERVISION', // encadrement académique (monitorat, tutorat…)
  PROJET: 'ACADEMIC', // projet académique
  BENEVOLAT: 'VOLUNTEER',
};

const AUDIENCE_MAP: Record<string, CvAudience> = {
  PRIMAIRE: 'Primaire',
  COLLEGE: 'Collège',
  LYCEE: 'Lycée',
  UNIVERSITE: 'Université',
};

const LEVEL_TO_DEGREE: Record<string, CvDegreeId> = {
  BAC: 'bac', L1: 'licence', L2: 'licence', L3: 'licence', M1: 'master', M2: 'master', DOCTORAT: 'doctorat',
};

const DEGREE_RANK: Record<CvDegreeId, number> = { bac: 1, licence: 2, master: 3, doctorat: 4 };

/** Mots qui trahissent une expérience d'enseignement quand le modèle n'a pas su la typer. */
const TEACHING_WORDS = /\b(r[ée]p[ée]titeur|enseignant|professeur|soutien scolaire|cours particuliers?|tuteur|tutorat|aide aux devoirs|animateur p[ée]dagogique|formateur|moniteur)\b/i;

const MAX_SKILLS = 30;
const MIN_TOKEN_LENGTH = 3;

const clean = (v: string | null | undefined): string | null => {
  const s = v?.replace(/\s+/g, ' ').trim();
  return s ? s : null;
};

/** Mots significatifs d'un texte (minuscules, sans accents ni ponctuation). */
const tokens = (v: string): string[] => normalizeSkillName(v).split(' ').filter((t) => t.length >= MIN_TOKEN_LENGTH);

/**
 * Part des mots de `value` retrouvés dans le CV (0 à 1). Sert de garde-fou anti-hallucination : un intitulé ou une
 * structure dont aucun mot n'apparaît dans le texte lu a été inventé par le modèle.
 */
export function groundedRatio(value: string | null | undefined, sourceText: string): number {
  const words = value ? tokens(value) : [];
  if (words.length === 0) return value ? 1 : 0; // trop court pour être vérifié (« AFPA ») : on ne le rejette pas
  const haystack = ` ${normalizeSkillName(sourceText)} `;
  return words.filter((w) => haystack.includes(w)).length / words.length;
}

const MONTHS: Record<string, string> = {
  janvier: '01', janv: '01', fevrier: '02', fevr: '02', mars: '03', avril: '04', avr: '04', mai: '05', juin: '06',
  juillet: '07', juil: '07', aout: '08', septembre: '09', sept: '09', octobre: '10', oct: '10', novembre: '11', nov: '11',
  decembre: '12', dec: '12',
};

/** « aujourd'hui », « en cours », « présent » : la période n'est pas terminée. */
export const isOngoing = (v: string | null | undefined): boolean => !!v && /aujourd|en cours|pr[ée]sent|actuel|now|current/i.test(v);

/**
 * AAAA-MM ou AAAA. Accepte AAAA-MM(-JJ), MM/AAAA et les mois en toutes lettres (« Septembre 2023 », « sept. 2021 »), que
 * le modèle recopie tels quels. Une année absente du texte du CV est une date inventée : null.
 */
export function normalizeDate(value: string | null | undefined, sourceText: string): string | null {
  const v = clean(value);
  if (!v) return null;
  let year: string | null = null;
  let month: string | null = null;
  const iso = v.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
  const yearOnly = v.match(/^(\d{4})$/);
  const french = v.match(/^(0?[1-9]|1[0-2])[/.-](\d{4})$/);
  const named = normalizeSkillName(v).match(/^([a-z]+)\s+(\d{4})$/);
  if (iso) [, year, month] = iso;
  else if (yearOnly) year = yearOnly[1];
  else if (french) {
    year = french[2];
    month = french[1].padStart(2, '0');
  } else if (named && MONTHS[named[1]]) {
    year = named[2];
    month = MONTHS[named[1]];
  }
  if (!year) return null;
  const y = Number(year);
  if (y < 1960 || y > new Date().getFullYear() + 1) return null;
  if (!sourceText.includes(year)) return null;
  return month ? `${year}-${month}` : year;
}

/** Public encadré déduit des mots du CV (jamais deviné au-delà) : « Terminale C et D » → Lycée. */
export function inferAudience(text: string): CvAudience[] {
  const t = normalizeSkillName(text);
  const out: CvAudience[] = [];
  if (/\b(primaire|ecole primaire|cp1|cp2|ce1|cm1|cm2)\b/.test(t)) out.push('Primaire');
  if (/\b(college|bepc|6eme|5eme|4eme|3eme)\b/.test(t)) out.push('Collège');
  if (/\b(lycee|lyceens?|seconde|premiere|terminale|bac|baccalaureat)\b/.test(t)) out.push('Lycée');
  if (/\b(universite|etudiants?|licence|l1|l2|l3|master|m1|m2|doctorat)\b/.test(t)) out.push('Université');
  return out;
}

export function buildPeriod(start: string | null, end: string | null): string {
  if (start && end) return `${start} — ${end}`;
  if (start) return start;
  return end ?? '';
}

const plausibleEmail = (v: string | null) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null);
const plausiblePhone = (v: string | null) => (v && v.replace(/\D/g, '').length >= 8 ? v : null);

/**
 * Diplôme d'une formation. Le LIBELLÉ du diplôme (« Licence en Informatique ») prime sur le niveau proposé par le modèle :
 * un petit modèle confond facilement « Licence » et « BAC ». Le niveau fin (L3, M2) n'est gardé que s'il est cohérent.
 */
function inferDegree(level: string | null, degree: string | null): { id: CvDegreeId | null; level: string | null } {
  const upper = level?.toUpperCase() ?? null;
  const fromLevel = upper ? LEVEL_TO_DEGREE[upper] : undefined;
  const text = normalizeSkillName(degree ?? '');
  let fromText: CvDegreeId | null = null;
  if (/\bdoctorat\b|\bphd\b/.test(text)) fromText = 'doctorat';
  else if (/\bmaster\b|\bmaitrise\b|\bingenieur\b|\bdea\b|\bdess\b|\bbac 5\b/.test(text)) fromText = 'master';
  else if (/\blicence\b|\bbachelor\b|\bbac 3\b|\bdut\b|\bbts\b/.test(text)) fromText = 'licence';
  else if (/\bbaccalaureat\b|\bbac\b/.test(text)) fromText = 'bac';
  if (fromText) return { id: fromText, level: fromLevel === fromText ? upper : fromText === 'bac' ? 'BAC' : null };
  return fromLevel ? { id: fromLevel, level: upper } : { id: null, level: null };
}

/**
 * Description d'une expérience reprise TELLE QUELLE du CV (jamais générée) : les lignes qui suivent son intitulé, jusqu'à la
 * prochaine entrée (ligne contenant un tiret cadratin) ou rubrique (ligne courte). Évite de faire écrire au modèle un
 * long texte libre, qui coûte une seconde par jeton sur CPU.
 */
export function descriptionFromSource(title: string | null, sourceText: string): string | null {
  if (!title) return null;
  const lines = sourceText.split('\n').map((l) => l.trim());
  const key = normalizeSkillName(title);
  const start = lines.findIndex((l) => key.length >= 4 && normalizeSkillName(l).includes(key));
  if (start < 0) return null;
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line || line.includes(' — ') || /^[\p{L}\s]{1,24}$/u.test(line)) break;
    out.push(line);
    if (out.join(' ').length > 400) break;
  }
  const text = out.join(' ').trim();
  return text ? text.slice(0, 500) : null;
}

export function normalizeCv(raw: RawCv, sourceText: string): CvPrefill {
  const globalWarnings: string[] = [];
  let dropped = 0;

  // --- Formation ------------------------------------------------------------------------------------------------
  const education: CvEducation[] = [];
  for (const e of raw.education) {
    const degreeLabel = clean(e.degree);
    const fieldRaw = clean(e.field_or_mention);
    const institutionRaw = clean(e.institution);
    if (!degreeLabel && !fieldRaw && !institutionRaw) continue;
    const warnings: string[] = [];
    const { id, level } = inferDegree(clean(e.level), degreeLabel);
    if (!id) warnings.push('Niveau d’études non identifié dans le CV.');
    let institution = institutionRaw;
    if (institution && groundedRatio(institution, sourceText) < 0.5) {
      warnings.push('Établissement introuvable dans le CV : à vérifier.');
      institution = null;
    }
    if (!institution) warnings.push('Établissement manquant.');
    if (!fieldRaw) warnings.push('Domaine ou mention manquant.');
    const start = normalizeDate(e.start_date, sourceText);
    const end = normalizeDate(e.end_date, sourceText);
    const status = e.status === 'EN_COURS' || e.status === 'OBTENU' ? e.status : isOngoing(e.end_date) ? 'EN_COURS' : null;
    education.push({
      degreeId: id, level, degreeLabel, field: fieldRaw, institution,
      period: buildPeriod(start, isOngoing(e.end_date) ? 'en cours' : end), status, confidence: e.confidence ?? 0.5, warnings,
    });
  }
  // Le diplôme le plus élevé en premier : c'est celui qui pré-remplit « Formation initiale ».
  education.sort((a, b) => (b.degreeId ? DEGREE_RANK[b.degreeId] : 0) - (a.degreeId ? DEGREE_RANK[a.degreeId] : 0));
  if (education.length === 0) globalWarnings.push('Aucune formation détectée : renseignez votre niveau d’études à la main.');

  // --- Expériences ----------------------------------------------------------------------------------------------
  const experiences: CvExperience[] = [];
  const seen = new Set<string>();
  for (const x of raw.experiences) {
    const title = clean(x.title);
    const organization = clean(x.organization);
    if (!title && !organization) continue;
    const titleOk = title ? groundedRatio(title, sourceText) >= 0.5 : false;
    const orgOk = organization ? groundedRatio(organization, sourceText) >= 0.5 : false;
    if (!titleOk && !orgOk) {
      dropped += 1; // ni l'intitulé ni la structure ne figurent dans le CV : invention du modèle
      continue;
    }
    const key = normalizeSkillName(`${title ?? ''} ${organization ?? ''}`);
    if (seen.has(key)) continue;
    seen.add(key);

    const warnings: string[] = [];
    let confidence = x.confidence ?? 0.5;
    if (!titleOk) {
      warnings.push('Intitulé introuvable dans le CV : à vérifier.');
      confidence *= 0.5;
    }
    if (!orgOk && organization) {
      warnings.push('Structure introuvable dans le CV : à vérifier.');
      confidence *= 0.5;
    }
    const start = normalizeDate(x.start_date, sourceText);
    const end = normalizeDate(x.end_date, sourceText);
    const ongoing = isOngoing(x.end_date);
    if ((x.start_date && !start) || (x.end_date && !end && !ongoing)) warnings.push('Une date n’a pas été retrouvée dans le CV : à vérifier.');
    const period = buildPeriod(start, ongoing ? 'en cours' : end);
    if (!period) warnings.push('Période manquante.');
    else if (!end && !ongoing) warnings.push('Date de fin non précisée.');
    if (!organization || !orgOk) warnings.push('Établissement, entreprise ou structure manquant(e).');

    const mapped = x.type ? EXPERIENCE_TYPE_MAP[x.type.toUpperCase()] : undefined;
    const inferred = mapped ?? (/^projet\b/i.test(title ?? '') ? 'ACADEMIC' : TEACHING_WORDS.test(`${title ?? ''} ${x.description ?? ''}`) ? 'TEACHING' : 'PROFESSIONAL');
    // Un emploi sans mot d'enseignement ni de projet est « professionnel » par défaut : rien à confirmer. Le reste est une déduction.
    if (!mapped && inferred !== 'PROFESSIONAL' && !/^projet\b/i.test(title ?? '')) warnings.push('Type d’expérience à confirmer.');
    // Public encadré et matières n'ont de sens que pour l'enseignement et l'encadrement : un petit modèle les remplit
    // aussi pour un poste de développeur (« tous les niveaux », « Python »), ce qui fausserait le rapprochement.
    const teachesOrSupervises = inferred === 'TEACHING' || inferred === 'SUPERVISION';
    const description = clean(x.description)?.slice(0, 1000) ?? descriptionFromSource(title, sourceText);
    const fromModel = [...new Set((x.levels ?? []).map((l) => AUDIENCE_MAP[l.toUpperCase()]).filter((a): a is CvAudience => !!a))];
    const audience = teachesOrSupervises ? (fromModel.length > 0 ? fromModel : inferAudience(`${title ?? ''} ${description ?? ''}`)) : [];
    const subjects = teachesOrSupervises ? (x.taught_subjects ?? []).filter((s) => groundedRatio(s, sourceText) >= 0.5) : [];
    if (teachesOrSupervises) {
      if (audience.length === 0) warnings.push('Public encadré non précisé (primaire, collège, lycée, université).');
      if (subjects.length === 0) warnings.push('Matières enseignées non précisées.');
    }

    experiences.push({
      type: inferred,
      title: title ?? organization ?? '',
      organization: organization ?? '',
      period,
      description,
      subjectsTaught: subjects.length ? subjects.join(', ').slice(0, 300) : null,
      audience,
      confidence: Math.round(confidence * 100) / 100,
      // Un projet personnel ou de cours n'a pas toujours de structure : ce n'est pas une information manquante.
      warnings: inferred === 'ACADEMIC' ? warnings.filter((w) => !/Établissement, entreprise/.test(w)) : warnings,
    });
  }
  if (dropped > 0) {
    globalWarnings.push(`${dropped} élément${dropped > 1 ? 's' : ''} proposé${dropped > 1 ? 's' : ''} par l’analyse n’a pas été retrouvé${dropped > 1 ? 's' : ''} dans votre CV et a été ignoré${dropped > 1 ? 's' : ''}.`);
  }
  if (experiences.length === 0) globalWarnings.push('Aucune expérience détectée : ajoutez-les à la main.');
  // Les expériences d'enseignement d'abord : ce sont elles qui pèsent le plus dans le rapprochement.
  experiences.sort((a, b) => Number(b.type === 'TEACHING') - Number(a.type === 'TEACHING'));

  // --- Compétences ----------------------------------------------------------------------------------------------
  const skills: CvSkill[] = [];
  const skillSeen = new Set<string>();
  for (const s of raw.skills) {
    const label = clean(s.label);
    if (!label || label.length > 60) continue;
    const key = normalizeSkillName(label);
    if (key.length < 2 || skillSeen.has(key) || groundedRatio(label, sourceText) < 0.5) continue;
    skillSeen.add(key);
    skills.push({ label, category: clean(s.category), subject: null, matchedBy: null, confidence: s.confidence ?? 0.5 });
    if (skills.length >= MAX_SKILLS) break;
  }

  return {
    profile: {
      fullName: clean(raw.profile.full_name ?? null),
      phone: plausiblePhone(clean(raw.profile.phone ?? null)),
      email: plausibleEmail(clean(raw.profile.email ?? null)),
      city: clean(raw.profile.city ?? null),
    },
    education,
    experiences,
    skills,
    languages: raw.languages
      .map((l) => ({ language: clean(l.language) ?? '', level: clean(l.level) }))
      .filter((l) => l.language),
    warnings: globalWarnings,
  };
}
