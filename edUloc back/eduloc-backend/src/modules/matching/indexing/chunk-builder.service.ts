import { Injectable } from '@nestjs/common';
import { formatDocument } from '../embedding/embedding-format';
import { scrubPii } from './pii';
import { MAX_TOKENS, estimateTokens, normalizeText, splitBody, splitSections } from './text-splitter';

export type SearchChunkSourceType = 'PROFILE' | 'SUBJECT' | 'EXPERIENCE' | 'OFFER' | 'DOCUMENT';

/** Un chunk attendu pour un tuteur : `content` est le texte EXACT envoyé au modèle (préfixe inclus). */
export interface ExpectedChunk {
  sourceType: SearchChunkSourceType;
  sourceId: string;
  chunkIndex: number;
  /** Libellé affichable pour expliquer un match. Jamais d'extrait de document. */
  label: string;
  content: string;
  subjectId: string | null;
}

/** Données d'un tuteur, déjà filtrées : seul ce qui est validé alimente l'index. */
const EXPERIENCE_KINDS: Record<string, string> = {
  TEACHING: 'Expérience d’enseignement et de soutien scolaire',
  SUPERVISION: 'Encadrement académique',
  PROFESSIONAL: 'Expérience professionnelle',
  ACADEMIC: 'Expérience académique',
  VOLUNTEER: 'Bénévolat',
};

export interface TutorIndexSource {
  id: string;
  highestDegree: string | null;
  degreeTitle: string | null;
  fieldOfStudy: string | null;
  specialization: string | null;
  degreeInstitution: string | null;
  /** Une ligne par TutorSubject. */
  subjects: { subjectId: string; subjectName: string; aliases: string[]; levelName: string; competenceDescription: string | null }[];
  experiences: {
    id: string; type: 'PROFESSIONAL' | 'ACADEMIC' | 'TEACHING' | 'SUPERVISION' | 'VOLUNTEER'; title: string; organization: string;
    period: string; description: string | null; audience?: string[]; subjectsTaught?: string | null;
  }[];
  /** Offres ACTIVES (isActive et non désactivées par l'admin) de niveau universitaire ou sans niveau. */
  offers: { id: string; title: string; description: string; subjectId: string; subjectName: string }[];
  /** Documents APPROUVÉS, non IDENTITY, au texte extrait (lot 6). */
  documents: {
    id: string;
    type: 'DIPLOMA' | 'CERTIFICATE' | 'PROFESSIONAL_PROOF' | 'CV' | 'TRANSCRIPT' | 'ENROLLMENT_CERTIFICATE' | 'OTHER';
    fileName: string | null;
    extractedText: string;
  }[];
}

const DEGREE_LABELS: Record<string, string> = {
  BAC: 'Baccalauréat',
  LICENCE: 'Licence',
  MASTER: 'Master',
  DOCTORAT: 'Doctorat',
  OTHER: 'Autre diplôme',
};

/** Plafonds de la spec : 10 chunks par document, 30 chunks DOCUMENT par tuteur. */
export const MAX_CHUNKS_PER_DOCUMENT = 10;
export const MAX_DOCUMENT_CHUNKS_PER_TUTOR = 30;

/** Champs vides omis (« Spécialisation : null » n'existe pas) ; phrases séparées par un point. */
const fields = (entries: [string, string | null | undefined][]): string =>
  entries
    .map(([name, value]) => [name, value ? normalizeText(scrubPii(value)).replace(/\n/g, ' ').trim() : ''] as const)
    .filter(([, value]) => value.length > 0)
    .map(([name, value]) => (name ? `${name} : ${value}` : value))
    .map((sentence) => (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`))
    .join(' ');

const clean = (value: string | null | undefined): string => (value ? normalizeText(scrubPii(value)) : '');

/**
 * Construit la liste COMPLÈTE des chunks attendus d'un tuteur (spec §5), par unité métier et non par taille.
 * Fonctions pures : aucune lecture en base, aucun appel réseau. Un texte trop long pour un chunk est découpé
 * (chunkIndex croissant, même libellé) ; un chunk ne dépasse jamais 500 tokens.
 */
@Injectable()
export class ChunkBuilderService {
  build(source: TutorIndexSource): ExpectedChunk[] {
    return [
      ...this.profile(source),
      ...this.subjects(source),
      ...this.experiences(source),
      ...this.offers(source),
      ...this.documents(source),
    ];
  }

  /** PROFILE : un par tuteur, `sourceId = tutorProfileId`. */
  private profile(s: TutorIndexSource): ExpectedChunk[] {
    const text = fields([
      ["Niveau d'études", s.highestDegree ? DEGREE_LABELS[s.highestDegree] ?? s.highestDegree : null],
      ['Diplôme', s.degreeTitle],
      ['Domaine', s.fieldOfStudy],
      ['Spécialisation', s.specialization],
      ['Établissement', s.degreeInstitution],
    ]);
    if (!text) return [];
    return this.pack('PROFILE', s.id, 'Parcours académique', 'Parcours académique', '', text, null);
  }

  /** SUBJECT : un par matière déclarée (toutes les lignes TutorSubject d'une même matière regroupées). */
  private subjects(s: TutorIndexSource): ExpectedChunk[] {
    const bySubject = new Map<string, TutorIndexSource['subjects']>();
    for (const row of s.subjects) bySubject.set(row.subjectId, [...(bySubject.get(row.subjectId) ?? []), row]);
    const out: ExpectedChunk[] = [];
    for (const [subjectId, rows] of [...bySubject.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const name = clean(rows[0].subjectName);
      const aliases = [...new Set(rows[0].aliases.map(clean).filter(Boolean))];
      const levels = [...new Set(rows.map((r) => r.levelName))];
      const competences = [...new Set(rows.map((r) => clean(r.competenceDescription)).filter(Boolean))];
      const head = fields([
        ['Matière', aliases.length ? `${name} (aussi appelée : ${aliases.join(', ')})` : name],
        ['Niveaux enseignés', levels.join(', ')],
      ]);
      out.push(...this.pack('SUBJECT', subjectId, name, `Matière : ${name}`, head, competences.length ? `Compétences : ${competences.join(' ; ')}` : '', subjectId));
    }
    return out;
  }

  /** EXPERIENCE : une par TutorExperience. */
  private experiences(s: TutorIndexSource): ExpectedChunk[] {
    const out: ExpectedChunk[] = [];
    for (const e of [...s.experiences].sort((a, b) => a.id.localeCompare(b.id))) {
      const title = clean(e.title);
      const kind = EXPERIENCE_KINDS[e.type] ?? 'Expérience professionnelle';
      // Public encadré et matières enseignées pèsent dans le rapprochement : une expérience de soutien scolaire compte
      // plus qu'un poste sans lien avec l'enseignement.
      const detail = fields([
        ['Public', (e.audience ?? []).join(', ')],
        ['Matières ou compétences enseignées', clean(e.subjectsTaught)],
      ]);
      const head = `${kind}. ${fields([['', [title, clean(e.organization), clean(e.period)].filter(Boolean).join(', ')]])}${detail ? ` ${detail}` : ''}`;
      out.push(...this.pack('EXPERIENCE', e.id, title, `${kind} : ${title}`, head, clean(e.description), null));
    }
    return out;
  }

  /** OFFER : une par offre active ; souvent le texte le plus riche. */
  private offers(s: TutorIndexSource): ExpectedChunk[] {
    const out: ExpectedChunk[] = [];
    for (const o of [...s.offers].sort((a, b) => a.id.localeCompare(b.id))) {
      const title = clean(o.title);
      out.push(...this.pack('OFFER', o.id, title, `Offre : ${title}`, `Matière : ${clean(o.subjectName)}.`, clean(o.description), o.subjectId));
    }
    return out;
  }

  /**
   * DOCUMENT (CV, relevé, diplôme, certificat, preuve pro) : texte déjà nettoyé, découpé par sections puis paragraphes.
   * Le libellé dit ce qui a réellement été contrôlé (spec §5.3, décision 4) ; jamais d'extrait du document.
   */
  private documents(s: TutorIndexSource): ExpectedChunk[] {
    const out: ExpectedChunk[] = [];
    let total = 0;
    for (const doc of [...s.documents].sort((a, b) => a.id.localeCompare(b.id))) {
      if (total >= MAX_DOCUMENT_CHUNKS_PER_TUTOR) break;
      const typeName = DOCUMENT_TYPE_NAMES[doc.type];
      const label = documentLabel(doc.type, doc.fileName);
      const pieces: { section: string | null; text: string }[] = [];
      for (const section of splitSections(clean(doc.extractedText))) {
        const reserve = estimateTokens(`title: ${typeName} — ${section.title ?? ''} | text: `) + 5;
        for (const part of splitBody(section.body, Math.min(400, MAX_TOKENS - reserve))) {
          pieces.push({ section: section.title, text: part });
        }
      }
      pieces.slice(0, MAX_CHUNKS_PER_DOCUMENT).forEach((piece, index) => {
        if (total >= MAX_DOCUMENT_CHUNKS_PER_TUTOR) return;
        total += 1;
        out.push({
          sourceType: 'DOCUMENT',
          sourceId: doc.id,
          chunkIndex: index,
          label,
          content: formatDocument(piece.section ? `${typeName} — ${piece.section}` : typeName, piece.text),
          subjectId: null,
        });
      });
    }
    return out;
  }

  /**
   * Assemble `title | text` ; si l'ensemble dépasse 500 tokens, le corps est découpé en plusieurs chunks
   * qui répètent l'en-tête (matière, niveaux…) pour rester interprétables isolément.
   */
  private pack(
    sourceType: SearchChunkSourceType,
    sourceId: string,
    title: string,
    label: string,
    head: string,
    body: string,
    subjectId: string | null,
  ): ExpectedChunk[] {
    const prefixCost = estimateTokens(`title: ${title} | text: ${head} `) + 5;
    const parts = body ? splitBody(body, Math.max(80, Math.min(400, MAX_TOKENS - prefixCost))) : [''];
    return parts.map((part, chunkIndex) => ({
      sourceType,
      sourceId,
      chunkIndex,
      label,
      content: formatDocument(title, [head, part].filter(Boolean).join(' ')),
      subjectId,
    }));
  }
}

const DOCUMENT_TYPE_NAMES: Record<TutorIndexSource['documents'][number]['type'], string> = {
  DIPLOMA: 'Diplôme',
  CERTIFICATE: 'Certificat',
  PROFESSIONAL_PROOF: 'Preuve professionnelle',
  CV: 'CV',
  TRANSCRIPT: 'Relevé de notes',
  ENROLLMENT_CERTIFICATE: 'Certificat de scolarité',
  OTHER: 'Pièce jointe',
};

/**
 * « Vérifié » uniquement pour l'élément précis que l'admin contrôle ; CV et pièces diverses ne le sont jamais.
 * Le nom de fichier n'est pas un extrait de contenu mais il est choisi par le tuteur : on ne l'affiche pas.
 */
export function documentLabel(type: TutorIndexSource['documents'][number]['type'], _fileName?: string | null): string {
  switch (type) {
    case 'DIPLOMA': return 'Diplôme vérifié';
    case 'TRANSCRIPT': return 'Relevé de notes vérifié';
    case 'CERTIFICATE': return 'Certificat vérifié';
    case 'ENROLLMENT_CERTIFICATE': return 'Certificat de scolarité vérifié';
    case 'PROFESSIONAL_PROOF': return 'Expérience vérifiée';
    case 'CV': return 'Mentionné dans le CV';
    default: return 'Pièce jointe au dossier';
  }
}
