import { normalizeSkillName } from '../catalog/domain/degree-policy';
import { type RawCv, rawCvSchema } from './cv-schema';

/**
 * Lecture « par numéros de ligne » : au lieu de faire RECOPIER au modèle chaque intitulé, structure et date (des centaines de
 * jetons à ~5 jetons/s sur CPU), on lui montre le CV en lignes numérotées et il n'indique que OÙ commence chaque diplôme et
 * chaque expérience, et de quel type. Le serveur lit ensuite la ligne avec des règles. Trois avantages : une dizaine de secondes
 * de génération au lieu de deux minutes, des valeurs qui viennent forcément du CV (aucune invention possible), et des
 * résultats identiques d'un essai à l'autre.
 */

export interface PreparedCv {
  /** Lignes non vides du CV, trimmées — l'index est le numéro de ligne montré au modèle. */
  lines: string[];
  /** Intitulé normalisé de la rubrique de chaque ligne (« langues », « competences »…), null avant la première. */
  headings: (string | null)[];
  /** Rubrique de chaque ligne (null avant la première rubrique repérée) : une formation n'est pas une expérience. */
  sections: ('education' | 'experience' | 'other' | null)[];
  /** Entrées repérées SANS modèle (ligne datée d'une rubrique Formation / Expériences) : repli quand le modèle ne répond rien. */
  guess: LineEntries;
  /** Ce que le modèle lit : `n| texte`, limité aux rubriques Formation et Expériences quand elles sont repérables. */
  prompt: string;
}

const EDUCATION_HEADING = /^(formations?|etudes|parcours academique|parcours scolaire|diplomes?|education|cursus)\b/;
const EXPERIENCE_HEADING = /^(experiences?|experience professionnelle|experiences professionnelles|parcours professionnel|stages?|emplois?|projets?|benevolat|activites?|engagements?|work experience|employment)\b/;
const OTHER_HEADING = /^(profil|resume|a propos|objectif|competences?|langues?|disponibilites?|loisirs|centres? d interet|references?|contact|outils|certifications?|informations?|atouts|qualites)\b/;

const headingKind = (line: string): 'education' | 'experience' | 'other' | null => {
  if (line.length > 40 || /[.:;]\s*$/.test(line) && line.length > 25) return null;
  const key = normalizeSkillName(line);
  if (EDUCATION_HEADING.test(key)) return 'education';
  if (EXPERIENCE_HEADING.test(key)) return 'experience';
  if (OTHER_HEADING.test(key)) return 'other';
  return null;
};

export function prepareCv(text: string): PreparedCv {
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const kinds = lines.map(headingKind);
  const hasRelevant = kinds.some((k) => k === 'education' || k === 'experience');
  const sent: number[] = [];
  let keep = !hasRelevant; // aucune rubrique repérée : on envoie tout
  lines.forEach((_, i) => {
    const k = kinds[i];
    if (k) keep = k === 'education' || k === 'experience';
    if (keep) sent.push(i);
  });
  // Repli déterministe : dans chaque rubrique, une ligne qui porte une période est le début d'une entrée.
  const guess: LineEntries = { education: [], experiences: [] };
  const sections: PreparedCv['sections'] = [];
  const headings: PreparedCv['headings'] = [];
  let section: 'education' | 'experience' | 'other' | null = null;
  let heading: string | null = null;
  lines.forEach((line, i) => {
    const k = kinds[i];
    if (k) {
      section = k;
      heading = normalizeSkillName(line);
    }
    sections.push(section);
    headings.push(heading);
    if (k || (section !== 'education' && section !== 'experience') || /[.!?]$/.test(line) || BULLET.test(line)) return;
    if (section === 'education' && (extractPeriod(line).start || DEGREE_START.test(line))) guess.education.push({ n: i });
    else if (section === 'experience' && extractPeriod(line).start) guess.experiences.push({ n: i, ty: null });
  });
  const shown = sent.filter((i) => isHeaderCandidate(lines, kinds, i));
  return { lines, sections, headings, guess, prompt: shown.map((i) => `${i}| ${lines[i].slice(0, PROMPT_LINE_MAX)}`).join('\n') };
}

/** Au-delà, la fin d'une ligne ne dit plus où commence une entrée. */
const PROMPT_LINE_MAX = 120;

/**
 * Sur CPU, LIRE le CV coûte plus cher que répondre (~11 jetons/s) : les puces de description qui suivent un intitulé
 * (« - Développement de modules backend… ») ne sont jamais le début d'une entrée et sont retirées de ce que le modèle lit.
 * Elles restent dans le CV : le serveur les lit pour la description, le public et les matières. Une puce est gardée si elle
 * porte une date, ou si la liste de puces suit directement un titre de rubrique (entrées présentées en liste à puces).
 */
function isHeaderCandidate(lines: string[], kinds: ReturnType<typeof headingKind>[], i: number): boolean {
  if (!BULLET.test(lines[i]) || extractPeriod(lines[i]).start) return true;
  for (let j = i - 1; j >= 0; j -= 1) {
    if (kinds[j]) return true; // la liste suit un titre de rubrique
    if (!BULLET.test(lines[j])) return false; // elle suit un intitulé : description
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------

const MONTH = '(?:janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\\.?';
const DATE = `(?:${MONTH}\\s+)?(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])[/.-](?:19|20)\\d{2}`;
const ONGOING = "aujourd['’]?\\s*hui|en cours|pr[ée]sent|actuel(?:lement)?|à ce jour";
const RANGE = new RegExp(`\\(?\\b(${DATE})\\s*(?:-|–|—|à|au|jusqu['’]à|/)\\s*(${DATE}|${ONGOING})\\)?(?:\\s*\\((?:${ONGOING})\\))?`, 'i');
const SINGLE = new RegExp(`\\(?\\b(${DATE})\\b\\)?`, 'i');
const RANGE_YEARS = /\b((?:19|20)\d{2})\s*-\s*((?:19|20)\d{2})\b/;

/** Période lue dans un texte : début, fin (ou « en cours »), et le texte restant sans elle. */
export function extractPeriod(text: string): { start: string | null; end: string | null; rest: string } {
  const range = text.match(RANGE) ?? text.match(RANGE_YEARS);
  if (range) return { start: range[1], end: range[2], rest: text.replace(range[0], ' ') };
  const single = text.match(SINGLE);
  if (single) return { start: single[1], end: null, rest: text.replace(single[0], ' ') };
  return { start: null, end: null, rest: text };
}

const SEPARATORS = /\s+[—–|·]\s+|\s+-\s+/;

// L'OCR lit parfois une barre verticale « | » comme « I » ou « l » en fin de segment (« … (MDAT) I 2024 - 2025 »).
const tidy = (s: string): string =>
  s.replace(/\s+[Il|]\s*$/, '').replace(/[\s,;:(]+$/g, '').replace(/^[\s,;:)]+/g, '').replace(/\s+/g, ' ').trim();

const DEGREE_START = /^(licence|master|doctorat|baccalaur[ée]at|bac\b|ing[ée]nieur|dut\b|bts\b|dea\b|dess\b|bachelor|certificat|dipl[oô]me)/i;
const ROLE_WORDS = /\b(stagiaire|d[ée]veloppeu[rs]e?|analyste|ing[ée]nieure?|enseignant[e]?|professeu?r?e?|assistant[e]?|responsable|chef|directeu?r?i?c?e?|tuteu?r?i?c?e?|r[ée]p[ée]titeu?r?i?c?e?|formateu?r?i?c?e?|animateu?r?i?c?e?|moniteu?r?i?c?e?|consultant[e]?|technicien[ne]?|charg[ée]e? de|b[ée]n[ée]vole|serveu?r?s?e?|vendeu?r?s?e?)\b/i;
const BULLET = /^[-•*·▪●–]\s/;

const INSTITUTION = /universit|[ée]cole|lyc[ée]e|institut|facult|coll[èe]ge|\biut\b|\bens[a-z]*\b|centre|academ|acad[ée]mie|campus/i;

/** Les lignes qui suivent : une phrase de description (verbe, point final, long texte) n'est pas une structure. */
const looksLikeOrganization = (line: string | undefined): boolean =>
  !!line && line.length <= 70 && !/[.!?]$/.test(line) && !extractPeriod(line).start;

export interface ParsedEntry {
  title: string | null;
  organization: string | null;
  start: string | null;
  end: string | null;
}

/** Un segment qui ressemble à une liste de technologies (« ReactJs, ExpressJs, MariaDB ») plutôt qu'à un intitulé. */
const looksLikeTechList = (text: string): boolean => {
  const head = tidy(text.split(/\s-|-(?=[A-Z])/)[0]);
  return (head.match(/,/g) ?? []).length >= 2 || /^[A-Za-z+#.]{1,12}(\s*[,/]\s*[A-Za-z+#.]{1,12})+$/.test(head);
};

const isPlainLine = (line: string | undefined): line is string =>
  !!line && line.length <= 110 && !BULLET.test(line) && !extractPeriod(line).start && !headingKind(line);

/**
 * Une expérience, dans les trois mises en page courantes :
 *   - « Intitulé — Structure — Période » sur une ligne ;
 *   - « Structure   Période » puis le poste sur la ligne suivante (« Stagiaire développeur ») : le poste est l'intitulé ;
 *   - titre de projet seul, puis « Technologies   Période » : le titre est la ligne précédente.
 */
export function parseExperienceLine(lines: string[], n: number): ParsedEntry {
  const header = lines[n] ?? '';
  let { start, end, rest } = extractPeriod(header);
  if (!start) {
    // Ligne de dates seule, juste après l'intitulé ou après la structure.
    for (const offset of [1, 2]) {
      const next = extractPeriod(lines[n + offset] ?? '');
      if (next.start && next.rest.trim().length < 6) {
        ({ start, end } = next);
        break;
      }
    }
  }
  const segments = rest.split(SEPARATORS).map(tidy).filter(Boolean);
  let title: string | null = segments[0]?.replace(/^projet(?: acad[ée]mique)?\s*:\s*/i, '') || null;
  let organization: string | null = segments[1] ?? null;

  const next = lines[n + 1];
  const prev = lines[n - 1];
  if (title && segments.length === 1 && isPlainLine(next) && ROLE_WORDS.test(next) && !ROLE_WORDS.test(title)) {
    // « Ministère … 2024 - 2025 » puis « Stagiaire développeur » : la première ligne est la structure.
    organization = title;
    title = tidy(next);
  } else if (title && looksLikeTechList(title) && isPlainLine(prev)) {
    // « Application de gestion » puis « ReactJs, ExpressJs 2023-2024 » : le titre est la ligne précédente.
    organization = null;
    title = tidy(prev);
  } else if (!organization && looksLikeOrganization(next) && !extractPeriod(next ?? '').start) {
    organization = tidy(next as string);
  }
  return { title, organization, start, end };
}

/** Une formation : diplôme, domaine déduit du diplôme, établissement reconnu par ses mots (université, école, lycée…). */
export function parseEducationLine(lines: string[], n: number): ParsedEntry & { field: string | null } {
  let at = n;
  // L'entrée désigne parfois la ligne de l'établissement : le diplôme est alors la ligne précédente.
  if (!DEGREE_START.test(lines[at] ?? '') && INSTITUTION.test(lines[at] ?? '') && DEGREE_START.test(lines[at - 1] ?? '')) at -= 1;
  const header = lines[at] ?? '';
  const { start, end, rest } = extractPeriod(header);
  const segments = rest.split(SEPARATORS).map(tidy).filter(Boolean);
  let degreeText = segments[0] ?? '';
  let institution = segments.slice(1).find((s) => INSTITUTION.test(s)) ?? null;
  if (!institution) {
    // « Master en Informatique, Université d'Antananarivo » : la virgule sépare le diplôme de l'établissement.
    const parts = degreeText.split(/\s*,\s*/);
    const at = parts.findIndex((part, i) => i > 0 && INSTITUTION.test(part));
    if (at > 0) {
      institution = tidy(parts.slice(at).join(', '));
      degreeText = parts.slice(0, at).join(', ');
    }
  }
  const degree = tidy(degreeText.replace(/\((?:en cours|obtenu)\)/gi, '')) || null;
  if (!institution && INSTITUTION.test(lines[at + 1] ?? '') && !DEGREE_START.test(lines[at + 1] ?? '')) {
    // Établissement sur la ligne suivante : « Ecole Nationale d'Informatique - ENI ».
    institution = tidy(lines[at + 1].split(SEPARATORS)[0]);
  }
  institution ??= segments[1] ?? null;
  const field = degree
    ? tidy(degree.replace(/^(licence|master|doctorat|baccalaur[ée]at|bac|ing[ée]nieur|dut|bts|dea|dess|bachelor)\s*(?:\d|[lm][1-3])?\s*(?:professionnel(?:le)?|pro)?\s*(?:en|de|d['’]|:|-)?\s*/i, ''))
    : null;
  return { title: degree, organization: institution, start, end, field: field || null };
}

/** Une ligne qui peut ouvrir une entrée : ni rubrique, ni phrase de description ; elle porte une période ou des séparateurs. */
function isEntryHeader(line: string | undefined): boolean {
  if (!line || headingKind(line) || line.length > 170 || /[.!?]$/.test(line)) return false;
  return !!extractPeriod(line).start || SEPARATORS.test(line) || DEGREE_START.test(line);
}

/**
 * Entrées du modèle recalées sur le texte, puis complétées par le repli déterministe. Un petit modèle se trompe d'une ligne
 * (rubrique « Expériences » prise pour une expérience, ligne de description à la place de l'intitulé) : on recale sur la
 * ligne voisine qui ressemble à un en-tête d'entrée, ou on écarte. Les en-têtes datés qu'il a oubliés sont ajoutés.
 */
export function reconcileEntries(model: LineEntries, cv: PreparedCv): LineEntries {
  const snap = (n: number): number | null => [n, n - 1, n + 1].find((c) => isEntryHeader(cv.lines[c])) ?? null;
  // « Ecole Nationale d'Informatique - ENI » juste sous « Master 2 en Génie Logiciel » : l'école complète le diplôme.
  const isSchoolOfPreviousDegree = (n: number) =>
    DEGREE_START.test(cv.lines[n - 1] ?? '') && !DEGREE_START.test(cv.lines[n] ?? '') && INSTITUTION.test(cv.lines[n] ?? '');
  // Une ligne de la rubrique Formation n'est pas une expérience, et inversement (le modèle les confond parfois).
  // Quand le CV a des rubriques, l'en-tête (nom, adresse, contact) qui les précède n'est ni un diplôme ni une expérience.
  const hasSections = cv.sections.some((s) => s === 'education' || s === 'experience');
  const merge = <T extends { n: number }>(fromModel: T[], fromGuess: T[], forbidden: 'education' | 'experience'): T[] => {
    const byLine = new Map<number, T>();
    for (const entry of fromModel) {
      const n = snap(entry.n);
      if (n === null || cv.sections[n] === forbidden || (hasSections && cv.sections[n] === null)) continue;
      if (!isSchoolOfPreviousDegree(n) && !byLine.has(n)) byLine.set(n, { ...entry, n });
    }
    for (const entry of fromGuess) if (!byLine.has(entry.n)) byLine.set(entry.n, entry);
    return [...byLine.values()].sort((a, b) => a.n - b.n);
  };
  return {
    education: merge(model.education, cv.guess.education, 'experience'),
    experiences: merge(model.experiences, cv.guess.experiences, 'education'),
  };
}

export interface LineEntries {
  education: { n: number }[];
  experiences: { n: number; ty?: string | null }[];
}

/** Entrées désignées par le modèle → même format que la sortie « copiée », lue par règles dans le texte du CV. */
export function typeFromHeading(heading: string | null | undefined): string | null {
  if (!heading) return null;
  if (/^projets?/.test(heading)) return 'PROJET';
  if (/^(benevolat|engagements?|associati|vie associative)/.test(heading)) return 'BENEVOLAT';
  if (/^(experiences? professionnelles?|parcours professionnel|stages?|emplois?|work experience|employment)/.test(heading)) return 'PROFESSIONNEL';
  return null;
}

const SUPERVISION_ROLE = /\b(moniteurs?|monitrices?|monitorat|tuteurs?|tutrices?|tutorat|assistante? d['’ ]enseignement|vacataires?|charg[ée]e? de (?:td|travaux))\b/i;
const SUPPORT_ROLE = /\b(r[ée]p[ée]titeurs?|r[ée]p[ée]titrices?|cours particuliers?|soutien scolaire|aide aux devoirs)\b/i;
const TEACHING_ROLE = /\b(enseignante?|professeure?|instituteurs?|institutrices?|formateurs?|formatrices?)\b/i;
const VOLUNTEER_ROLE = /\b(b[ée]n[ée]voles?|b[ée]n[ée]volat|volontaires?)\b/i;

/** Type d'une expérience d'après son intitulé : le modèle n'a plus à le deviner (un jeton de moins par entrée, et déterministe). */
export function typeFromRole(title: string): string | null {
  if (SUPERVISION_ROLE.test(title)) return 'ACADEMIQUE';
  if (SUPPORT_ROLE.test(title)) return 'SOUTIEN_SCOLAIRE';
  if (TEACHING_ROLE.test(title)) return 'ENSEIGNEMENT';
  if (VOLUNTEER_ROLE.test(title)) return 'BENEVOLAT';
  return null;
}

export function entriesToRaw(entries: LineEntries, lines: string[], headings: (string | null)[] = []): RawCv {
  const inRange = (n: number) => Number.isInteger(n) && n >= 0 && n < lines.length;
  const seenDegrees = new Set<string>();
  const education = entries.education.filter((e) => inRange(e.n)).flatMap((e) => {
    const p = parseEducationLine(lines, e.n);
    const key = normalizeSkillName(`${p.title ?? ''} ${p.organization ?? ''}`);
    if (!key || seenDegrees.has(key)) return [];
    seenDegrees.add(key);
    return [{ degree: p.title, field_or_mention: p.field, institution: p.organization, start_date: p.start, end_date: p.end, confidence: 0.9 }];
  });
  const experiences = entries.experiences.filter((x) => inRange(x.n)).map((x) => {
    const p = parseExperienceLine(lines, x.n);
    // « Projet académique : … » est un projet, quoi qu'en dise le modèle ; sinon l'intitulé (« Répétitrice », « Monitorat »…)
    // décide, puis un éventuel type donné par le modèle, puis la rubrique.
    const byHeading = typeFromHeading(headings[x.n]);
    const isProject = /^projet\b/i.test(lines[x.n] ?? '') || byHeading === 'PROJET';
    const type = isProject ? 'PROJET' : (typeFromRole(p.title ?? lines[x.n] ?? '') ?? x.ty ?? byHeading);
    return { type, title: p.title, organization: p.organization, start_date: p.start, end_date: p.end, confidence: 0.9 };
  });
  return rawCvSchema.parse({ education, experiences });
}

/** Rubriques où citer une matière ne dit rien de ce que le tuteur enseigne (« Français : courant » = une langue parlée). */
const NOT_SKILLS = /^(langues?|loisirs|centres? d interet|disponibilites?|references?|contact)\b/;

/** Texte du CV sans les rubriques Langues, Loisirs… : sert à repérer les matières enseignables dans le catalogue. */
export function textForSkills(cv: PreparedCv): string {
  return cv.lines.filter((_, i) => !(cv.headings[i] && NOT_SKILLS.test(cv.headings[i] as string))).join('\n');
}
