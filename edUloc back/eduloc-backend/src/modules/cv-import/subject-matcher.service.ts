import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { normalizeSkillName } from '../catalog/domain/degree-policy';
import { formatDocument } from '../matching/embedding/embedding-format';
import { OllamaEmbeddingService } from '../matching/embedding/ollama-embedding.service';
import type { CvEducation, CvExperience, CvSkill, CvSubjectRef } from './cv-schema';

/** En dessous, le rapprochement sémantique est trop incertain : on laisse la compétence « à ajouter à la main ». */
export const EMBEDDING_MATCH_THRESHOLD = 0.78;

export interface MatchCandidate {
  key: string;
  label: string;
  aliases: string[];
  payload: CvSubjectRef;
}

/** Produit scalaire de deux vecteurs normalisés = similarité cosinus. */
export const cosine = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + v * b[i], 0);

/**
 * Rapproche un libellé du CV (« Dév. web », « maths », « Algo ») d'un élément du catalogue :
 *   1. égalité (casse, accents et ponctuation ignorés) ou synonyme déclaré ;
 *   2. inclusion d'un mot entier ;
 *   3. similarité EmbeddingGemma au-dessus d'un seuil (si Ollama répond).
 * EmbeddingGemma n'intervient qu'ici, APRÈS la lecture du CV : il normalise, il ne lit pas.
 */
export async function matchLabel(
  label: string,
  candidates: MatchCandidate[],
  embed?: { queryVector: (text: string) => Promise<number[]>; candidateVectors: () => Promise<number[][]> },
): Promise<{ candidate: MatchCandidate; by: NonNullable<CvSkill['matchedBy']>; score: number } | null> {
  const key = normalizeSkillName(label);
  if (!key) return null;
  const exact = candidates.find((c) => normalizeSkillName(c.label) === key);
  if (exact) return { candidate: exact, by: 'exact', score: 1 };
  const alias = candidates.find((c) => c.aliases.some((a) => normalizeSkillName(a) === key));
  if (alias) return { candidate: alias, by: 'alias', score: 1 };
  const words = new Set(key.split(' '));
  const contained = candidates.find((c) => {
    const name = normalizeSkillName(c.label);
    return key.length >= 4 && (` ${name} `.includes(` ${key} `) || ` ${key} `.includes(` ${name} `)) && name.split(' ').every((w) => words.has(w) || key.includes(w));
  });
  if (contained) return { candidate: contained, by: 'contains', score: 0.9 };
  if (!embed) return null;
  const [query, vectors] = await Promise.all([embed.queryVector(label), embed.candidateVectors()]);
  let best = { index: -1, score: -1 };
  vectors.forEach((v, index) => {
    const score = cosine(query, v);
    if (score > best.score) best = { index, score };
  });
  return best.index >= 0 && best.score >= EMBEDDING_MATCH_THRESHOLD
    ? { candidate: candidates[best.index], by: 'embedding', score: best.score }
    : null;
}

@Injectable()
export class SubjectMatcherService {
  private readonly logger = new Logger(SubjectMatcherService.name);
  private cache: { at: number; candidates: MatchCandidate[]; vectors: Promise<number[][]> | null } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: OllamaEmbeddingService,
  ) {}

  private async candidates() {
    if (this.cache && Date.now() - this.cache.at < 10 * 60_000) return this.cache;
    const subjects = await this.prisma.subject.findMany({ where: { isActive: true, isVerified: true } });
    this.cache = {
      at: Date.now(),
      vectors: null,
      candidates: subjects.map((s) => ({
        key: s.id,
        label: s.name,
        aliases: s.aliases,
        payload: {
          id: s.id, name: s.name, category: s.category, description: s.description,
          levelCategories: s.levelCategories, isVerified: s.isVerified,
        },
      })),
    };
    return this.cache;
  }

  /**
   * Matières du catalogue CITÉES dans un texte (nom ou synonyme, mot entier). C'est le catalogue qui lit le CV, pas le
   * modèle : « mathématiques et physique » → Mathématiques, Physique-Chimie (par synonyme) sans jeton généré.
   */
  async subjectsMentionedIn(text: string): Promise<CvSubjectRef[]> {
    const haystack = ` ${normalizeSkillName(text)} `;
    const { candidates } = await this.candidates();
    return candidates
      .filter((c) => [c.label, ...c.aliases].some((name) => {
        const key = normalizeSkillName(name);
        return key.length >= 4 && haystack.includes(` ${key} `);
      }))
      .map((c) => c.payload);
  }

  /** Matières enseignées de chaque expérience pédagogique, déduites de son intitulé et de sa description. */
  async fillSubjects(experiences: CvExperience[]): Promise<CvExperience[]> {
    const out: CvExperience[] = [];
    for (const x of experiences) {
      const pedagogic = x.type === 'TEACHING' || x.type === 'SUPERVISION';
      if (!pedagogic || x.subjectsTaught) {
        out.push(x);
        continue;
      }
      const found = await this.subjectsMentionedIn(`${x.title} ${x.description ?? ''}`);
      out.push(found.length === 0 ? x : {
        ...x,
        subjectsTaught: found.map((f) => f.name).join(', '),
        warnings: x.warnings.filter((w) => !/Matières enseignées non précisées/.test(w)),
      });
    }
    return out;
  }

  /** Compétences : les matières du catalogue citées dans le CV entier (les outils informatiques ne sont pas des matières). */
  async skillsFromText(text: string): Promise<CvSkill[]> {
    return (await this.subjectsMentionedIn(text)).map((subject) => ({
      label: subject.name, category: subject.category, subject, matchedBy: 'exact' as const, confidence: 0.9,
    }));
  }

  /** Associe chaque compétence du CV à une matière du catalogue quand c'est possible. */
  async matchSkills(skills: CvSkill[]): Promise<CvSkill[]> {
    if (skills.length === 0) return skills;
    const cache = await this.candidates();
    const embedAvailable = await this.embeddings.isAvailable();
    const embed = embedAvailable
      ? {
          queryVector: (text: string) => this.embeddings.embedQuery(text),
          candidateVectors: () => {
            cache.vectors ??= this.embeddings.embedTexts(cache.candidates.map((c) => formatDocument(c.label, `Matière : ${c.label}`)));
            return cache.vectors;
          },
        }
      : undefined;
    const out: CvSkill[] = [];
    for (const skill of skills) {
      try {
        const match = await matchLabel(skill.label, cache.candidates, embed);
        out.push(match ? { ...skill, subject: match.candidate.payload, matchedBy: match.by } : skill);
      } catch (err) {
        this.logger.warn(`Rapprochement de « ${skill.label} » impossible : ${(err as Error).message}`);
        out.push(skill);
      }
    }
    return out;
  }

  /**
   * « Domaine » de la formation : le texte du CV (« Génie logiciel », « Maths pures ») est ramené à la mention du
   * catalogue quand elle est reconnue (série du bac pour un bachelier) ; sinon il reste tel que lu dans le CV.
   */
  async normalizeFields(education: CvEducation[]): Promise<CvEducation[]> {
    const withField = education.filter((e) => e.field);
    if (withField.length === 0) return education;
    const tracks = await this.prisma.academicTrack.findMany({ where: { isActive: true, OR: [{ kind: 'MENTION' }, { kind: 'SERIE', levelName: 'Terminale' }] } });
    const toCandidates = (kind: 'MENTION' | 'SERIE'): MatchCandidate[] =>
      tracks.filter((t) => t.kind === kind).map((t) => ({
        key: t.id, label: t.name, aliases: [],
        payload: { id: t.id, name: t.name, category: t.domain, description: null, levelCategories: [], isVerified: true },
      }));
    const embedAvailable = await this.embeddings.isAvailable();
    const vectorsByKind = new Map<string, Promise<number[][]>>();
    const out: CvEducation[] = [];
    for (const e of education) {
      if (!e.field || !e.degreeId) {
        out.push(e);
        continue;
      }
      const kind = e.degreeId === 'bac' ? 'SERIE' : 'MENTION';
      const candidates = toCandidates(kind);
      const embed = embedAvailable
        ? {
            queryVector: (text: string) => this.embeddings.embedQuery(text),
            candidateVectors: () => {
              if (!vectorsByKind.has(kind)) {
                vectorsByKind.set(kind, this.embeddings.embedTexts(candidates.map((c) => formatDocument(c.label, kind === 'MENTION' ? `Mention : ${c.label}` : `Série : ${c.label}`))));
              }
              return vectorsByKind.get(kind)!;
            },
          }
        : undefined;
      try {
        const match = await matchLabel(e.field, candidates, embed);
        out.push(match ? { ...e, field: match.candidate.label } : e);
      } catch (err) {
        this.logger.warn(`Rapprochement du domaine « ${e.field} » impossible : ${(err as Error).message}`);
        out.push(e);
      }
    }
    return out;
  }
}
