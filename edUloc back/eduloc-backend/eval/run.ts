/**
 * Mesure du matching (lot 7, spec §10) : recall@10 et nDCG@10 sur le jeu d'évaluation, avec les coefficients ACTUELS.
 *
 *   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-deps ollama ollama-init
 *   TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5434/eduloc \
 *   OLLAMA_URL=http://127.0.0.1:11434 EMBEDDING_MODEL=hf.co/unsloth/embeddinggemma-2-GGUF:UD-Q4_K_XL npm run matching:eval
 *
 * Écrit eval/report.md et eval/report.json. Utilise un Ollama RÉEL et une base jetable (jamais Supabase ni la base de dev) ;
 * les données créées sont supprimées à la fin.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { AppConfig } from '../src/core/config/app.config';
import type { PrismaService } from '../src/core/prisma/prisma.service';
import type { RedisService } from '../src/core/redis/redis.service';
import type { RateLimitService } from '../src/common/rate-limit.service';
import type { SearchService } from '../src/modules/search/search.service';
import { OllamaEmbeddingService } from '../src/modules/matching/embedding/ollama-embedding.service';
import { ChunkBuilderService } from '../src/modules/matching/indexing/chunk-builder.service';
import { SearchIndexService } from '../src/modules/matching/indexing/search-index.service';
import { allowedFormats, isTutorEligible, minimumTutorRank } from '../src/modules/matching/search/level-eligibility';
import { MatchingSearchService, buildQueryText } from '../src/modules/matching/search/matching-search.service';
import { NextSlotsService } from '../src/modules/matching/search/next-slots.service';
import { PreselectionRepository } from '../src/modules/matching/search/preselection.repository';
import { SemanticRankingRepository } from '../src/modules/matching/search/semantic-ranking.repository';
import { DEFAULT_SCORING, ScoringConfig, SourceType, TutorScoreInput, rankTutors } from '../src/modules/matching/search/scoring';
import {
  EvalQuery, QUERIES, REQUEST_RANK, TUTORS, TUTOR_RANK, declaredLevels, type Group, type RequestLevel,
} from './dataset';
import { mean, ndcgAtK, quantile, recallAtK } from './metrics';

const K = 10;
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL requis (base jetable pgvector, jamais Supabase ni la base de dev).');
if (/supabase\.(co|com)/i.test(url)) throw new Error('Refus : TEST_DATABASE_URL pointe vers Supabase.');
if (!process.env.OLLAMA_URL) throw new Error('OLLAMA_URL requis (Ollama réel).');

const cfg = {
  ollamaUrl: process.env.OLLAMA_URL.replace(/\/$/, ''),
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'hf.co/unsloth/embeddinggemma-2-GGUF:UD-Q4_K_XL',
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? 768),
  bookingMinNoticeHours: 2,
  matchingScoring: DEFAULT_SCORING,
} as AppConfig;

const pool = new pg.Pool({ connectionString: url, max: 4 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const db = prisma as unknown as PrismaService;
const memory = new Map<string, string>();
const redis = { get: async (k: string) => memory.get(k) ?? null, set: async (k: string, v: string) => void memory.set(k, v) } as unknown as RedisService;
const embeddings = new OllamaEmbeddingService(cfg, redis);
const index = new SearchIndexService(db, cfg, embeddings, new ChunkBuilderService());
const preselection = new PreselectionRepository(db);
const ranking = new SemanticRankingRepository(db);
const service = new MatchingSearchService(
  db, cfg, { consume: async () => undefined } as unknown as RateLimitService, embeddings, preselection, ranking,
  new NextSlotsService(db, cfg), { searchOffers: async () => [] } as unknown as SearchService,
);

const run = randomUUID().slice(0, 8);
const userIds: string[] = [];
const subjectIds: string[] = [];
const keyById = new Map<string, string>();
const subjectIdByName = new Map<string, string>();

const levelId = async (name: string, category = 'Université') =>
  (await prisma.educationLevel.findUniqueOrThrow({ where: { name_category: { name, category } } })).id;
const TUTOR_LEVEL_NAME = { L3: 'Licence 3', M1: 'Master 1', M2: 'Master 2', DOCTORAT: 'Doctorat' } as const;

async function buildWorld() {
  for (const tutor of TUTORS) {
    for (const s of tutor.subjects) {
      if (subjectIdByName.has(s.name)) continue;
      // Noms propres (le texte de la requête et des chunks en dépend) : on réutilise la matière du catalogue si elle existe.
      const existing = await prisma.subject.findUnique({ where: { name: s.name } });
      if (existing) {
        subjectIdByName.set(s.name, existing.id);
        continue;
      }
      const subject = await prisma.subject.create({ data: { name: s.name, isVerified: true, levelCategories: ['Université'] } });
      subjectIds.push(subject.id);
      subjectIdByName.set(s.name, subject.id);
    }
  }
  for (const tutor of TUTORS) {
    const user = await prisma.user.create({
      data: { firstName: tutor.key, lastName: `Eval-${run}`, email: `${tutor.key.toLowerCase()}-${run}@eval.example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true },
    });
    userIds.push(user.id);
    const profile = await prisma.tutorProfile.create({
      data: {
        userId: user.id, displayName: tutor.key, highestDegree: tutor.highestDegree, degreeTitle: tutor.degreeTitle,
        fieldOfStudy: tutor.fieldOfStudy, specialization: tutor.specialization, degreeInstitution: tutor.institution, isVisible: true,
        academicLevelId: await levelId(TUTOR_LEVEL_NAME[tutor.level]), academicLevelValidatedAt: new Date(),
        academicLevelNote: tutor.expert ? 'Expert professionnel (jeu d’évaluation)' : null,
      },
    });
    keyById.set(profile.id, tutor.key);
    await prisma.tutorApplication.create({ data: { tutorProfileId: profile.id, status: 'APPROVED' } });
    for (const s of tutor.subjects) {
      for (const level of declaredLevels(tutor.level)) {
        await prisma.tutorSubject.create({
          data: { tutorProfileId: profile.id, subjectId: subjectIdByName.get(s.name)!, educationLevelId: await levelId(level), competenceDescription: s.competence },
        });
      }
    }
    for (const e of tutor.experiences) {
      await prisma.tutorExperience.create({ data: { tutorProfileId: profile.id, type: e.type, title: e.title, organization: e.organization, period: e.period, description: e.description } });
    }
    for (const o of tutor.offers) {
      await prisma.offer.create({
        data: { tutorProfileId: profile.id, subjectId: subjectIdByName.get(o.subject)!, educationLevelId: null, title: o.title, description: o.description, price: 20000, format: 'BOTH' },
      });
    }
    await index.reindexTutor(profile.id);
  }
}

async function main() {
  await embeddings.onModuleInit();
  await embeddings.warmUp();
  if (!(await embeddings.isAvailable())) throw new Error(`Modèle ${cfg.embeddingModel} indisponible sur ${cfg.ollamaUrl}.`);

  console.log(`Création du monde d'évaluation (${TUTORS.length} tuteurs) et indexation avec ${cfg.embeddingModel}…`);
  const started = Date.now();
  try {
    await buildWorld();
    const chunkCount = await prisma.tutorSearchChunk.count({ where: { tutorProfileId: { in: [...keyById.keys()] } } });
    console.log(`Indexation terminée : ${chunkCount} chunks en ${((Date.now() - started) / 1000).toFixed(1)} s.`);

    const requester = await prisma.user.create({
      data: { firstName: 'Eval', lastName: `Req-${run}`, email: `req-${run}@eval.example.mg`, password: 'x', status: 'ACTIVE', emailVerified: true },
    });
    userIds.push(requester.id);
    const beneficiaryByLevel = new Map<RequestLevel, string>();
    for (const level of Object.keys(REQUEST_RANK) as RequestLevel[]) {
      beneficiaryByLevel.set(level, (await prisma.beneficiary.create({
        data: { requesterId: requester.id, firstName: level, relationship: 'SELF', educationLevelId: await levelId(level) },
      })).id);
    }

    const configs: Record<string, ScoringConfig> = {
      'Coefficients actuels (spec §6.4)': DEFAULT_SCORING,
      'Sans bonus (matière et note)': { ...DEFAULT_SCORING, subjectBonus: 0, ratingBonus: 0 },
      'Sans corroboration': { ...DEFAULT_SCORING, corroborationWeight: 0 },
      'bestSim seul': { ...DEFAULT_SCORING, subjectBonus: 0, ratingBonus: 0, corroborationWeight: 0 },
      'Sans filtre de pertinence relatif': { ...DEFAULT_SCORING, relevanceWindow: Infinity },
      'Filtre relatif 0,10': { ...DEFAULT_SCORING, relevanceWindow: 0.1 },
      'Filtre relatif 0,20': { ...DEFAULT_SCORING, relevanceWindow: 0.2 },
      'Filtre relatif 0,25': { ...DEFAULT_SCORING, relevanceWindow: 0.25 },
      'Filtre relatif 0,30': { ...DEFAULT_SCORING, relevanceWindow: 0.3 },
    };

    interface Row {
      query: EvalQuery;
      returned: string[];
      recall: number;
      ndcg: number;
      missed: { key: string; rel: number; rank: number | null; sim: number | null }[];
      topSims: { key: string; sim: number; rel: number }[];
      eligibilityViolations: number;
    }
    const rows: Row[] = [];
    const ablation = new Map<string, { recall: number[]; ndcg: number[] }>(Object.keys(configs).map((n) => [n, { recall: [], ndcg: [] }]));
    const relevantSims: number[] = [];
    const irrelevantSims: number[] = [];
    let violations = 0;

    for (const query of QUERIES) {
      const subjectName = 'catalog' in query.subject ? query.subject.catalog : query.subject.text;
      const result = await service.search(requester.id, {
        beneficiaryId: beneficiaryByLevel.get(query.level)!,
        ...('catalog' in query.subject ? { subjectId: subjectIdByName.get(query.subject.catalog)! } : { subjectText: query.subject.text }),
        needDescription: query.need,
        limit: K,
      }) as { results: { tutorProfileId: string }[] };
      const returned = result.results.map((r) => keyById.get(r.tutorProfileId) ?? '?');

      // Garde-fou : tout tuteur renvoyé est ÉLIGIBLE par le niveau (rang strictement supérieur).
      let bad = 0;
      for (const id of result.results.map((r) => r.tutorProfileId)) {
        const tutor = TUTORS.find((t) => t.key === keyById.get(id))!;
        if (!isTutorEligible(REQUEST_RANK[query.level], { rank: TUTOR_RANK[tutor.level], category: 'Université' })) bad += 1;
      }
      violations += bad;

      // Même pipeline, mais classement complet des candidats (analyse des manqués et ablations).
      const levelRank = REQUEST_RANK[query.level];
      const sameRank = await prisma.educationLevel.findMany({ where: { category: 'Université', academicRank: levelRank }, select: { id: true } });
      const candidates = await preselection.findCandidateIds({
        minTutorRank: minimumTutorRank(levelRank), levelIds: sameRank.map((l) => l.id), formats: allowedFormats(null),
        embeddingModel: cfg.embeddingModel, requesterId: requester.id,
      });
      const vector = await embeddings.embedQuery(buildQueryText({ subject: subjectName, level: query.level, studyProgram: null, need: query.need, objective: null }));
      const sims = await ranking.bestSimilarities(vector, candidates, cfg.embeddingModel);
      const declaring = 'catalog' in query.subject ? await ranking.tutorsDeclaringSubject(candidates, subjectIdByName.get(query.subject.catalog)!) : new Set<string>();
      const profiles = await prisma.tutorProfile.findMany({ where: { id: { in: candidates } }, select: { id: true, rating: true, reviewsCount: true } });
      const inputs: TutorScoreInput[] = profiles.map((p) => ({
        tutorProfileId: p.id,
        sims: sims.filter((s) => s.tutorProfileId === p.id).map((s) => ({ sourceType: s.sourceType as SourceType, sim: s.sim, label: s.label })),
        declaresRequestedSubject: declaring.has(p.id), rating: p.rating, reviewsCount: p.reviewsCount,
      }));
      for (const [name, scoring] of Object.entries(configs)) {
        const keys = rankTutors(inputs, K, scoring).map((r) => keyById.get(r.tutorProfileId)!);
        ablation.get(name)!.recall.push(recallAtK(keys, query.relevant, K));
        ablation.get(name)!.ndcg.push(ndcgAtK(keys, query.relevant, K));
      }
      const full = rankTutors(inputs, 1000, { ...DEFAULT_SCORING, relevanceWindow: Infinity });
      const bestSimByKey = new Map(full.map((r) => [keyById.get(r.tutorProfileId)!, r.bestSim]));
      const fullKeys = full.map((r) => keyById.get(r.tutorProfileId)!);
      for (const [key, sim] of bestSimByKey) (query.relevant[key] ? relevantSims : irrelevantSims).push(sim);

      const direct = rankTutors(inputs, K, DEFAULT_SCORING).map((r) => keyById.get(r.tutorProfileId)!);
      if (direct.join() !== returned.join()) console.warn(`  ! ${query.id} : le service et le pipeline direct divergent (${returned.join()} / ${direct.join()})`);
      rows.push({
        query, returned,
        recall: recallAtK(returned, query.relevant, K),
        ndcg: ndcgAtK(returned, query.relevant, K),
        missed: Object.entries(query.relevant).filter(([key]) => !returned.includes(key)).map(([key, rel]) => ({
          key, rel, rank: fullKeys.includes(key) ? fullKeys.indexOf(key) + 1 : null, sim: bestSimByKey.get(key) ?? null,
        })),
        topSims: full.slice(0, 5).map((r) => ({ key: keyById.get(r.tutorProfileId)!, sim: r.bestSim, rel: query.relevant[keyById.get(r.tutorProfileId)!] ?? 0 })),
        eligibilityViolations: bad,
      });
      process.stdout.write(`  ${query.id} recall=${rows[rows.length - 1].recall.toFixed(2)} ndcg=${rows[rows.length - 1].ndcg.toFixed(2)}\n`);
    }

    // --- Agrégats ---------------------------------------------------------------------------------------------------
    const groups = [...new Set(QUERIES.map((qq) => qq.group))] as Group[];
    const agg = (subset: Row[]) => ({ n: subset.length, recall: mean(subset.map((r) => r.recall)), ndcg: mean(subset.map((r) => r.ndcg)) });
    const overall = agg(rows);
    const byGroup = groups.map((g) => ({ group: g, ...agg(rows.filter((r) => r.query.group === g)) }));
    const f = (x: number) => x.toFixed(3);
    const missed = rows.filter((r) => r.missed.length);

    const md: string[] = [];
    md.push('# Rapport de mesure du matching sémantique (lot 7)', '');
    md.push(`Généré le ${new Date().toISOString().slice(0, 10)} par \`npm run matching:eval\`.`, '');
    md.push('## Conditions', '');
    md.push(`- Modèle d'embedding : \`${cfg.embeddingModel}\` (dimension ${cfg.embeddingDim}), Ollama réel ; préfixes \`title: … | text: …\` / \`task: search result | query: …\`.`);
    md.push(`- Jeu d'évaluation : ${TUTORS.length} tuteurs fictifs (${chunkCount} chunks), **${QUERIES.length} demandes** annotées à la main (fichier \`eval/dataset.ts\`).`);
    md.push(`- Éligibilité : filtre SQL hiérarchique (rang strictement supérieur, E5/E8) ; violations constatées : **${violations}**.`);
    md.push(`- Coefficients : corroboration ${DEFAULT_SCORING.corroborationWeight} (fenêtre ${DEFAULT_SCORING.corroborationWindow}), bonus matière ${DEFAULT_SCORING.subjectBonus}, bonus note ${DEFAULT_SCORING.ratingBonus} (a priori ${DEFAULT_SCORING.ratingPriorMean} sur ${DEFAULT_SCORING.ratingPriorWeight} avis), filtre relatif ${DEFAULT_SCORING.relevanceWindow}.`);
    md.push('- Pertinence graduée : 2 = très pertinent, 1 = pertinent ; gain nDCG = 2^rel − 1.', '');
    md.push('## Résultats avec les coefficients actuels', '');
    md.push(`| | recall@${K} | nDCG@${K} | demandes |`, '|---|---|---|---|');
    md.push(`| **Ensemble** | **${f(overall.recall)}** | **${f(overall.ndcg)}** | ${overall.n} |`);
    for (const g of byGroup) md.push(`| ${g.group} | ${f(g.recall)} | ${f(g.ndcg)} | ${g.n} |`);
    md.push('', '## Sensibilité aux coefficients (mêmes similarités, classements recalculés)', '');
    md.push(`| Configuration | recall@${K} | nDCG@${K} |`, '|---|---|---|');
    for (const [name, v] of ablation) md.push(`| ${name} | ${f(mean(v.recall))} | ${f(mean(v.ndcg))} |`);
    md.push('', '## Distribution de la meilleure similarité (aide au choix d\'un éventuel seuil absolu)', '');
    md.push('| | min | 10 % | médiane | 90 % | max | effectif |', '|---|---|---|---|---|---|---|');
    const dist = (name: string, v: number[]) => `| ${name} | ${f(Math.min(...v))} | ${f(quantile(v, 0.1))} | ${f(quantile(v, 0.5))} | ${f(quantile(v, 0.9))} | ${f(Math.max(...v))} | ${v.length} |`;
    md.push(dist('Tuteurs pertinents (annotés)', relevantSims), dist('Tuteurs éligibles non pertinents', irrelevantSims), '');
    md.push('## Détail par demande', '');
    md.push(`| Demande | Niveau | Groupe | recall@${K} | nDCG@${K} | Top 3 renvoyé | Pertinents |`, '|---|---|---|---|---|---|---|');
    for (const r of rows) {
      md.push(`| ${r.query.id} | ${r.query.level} | ${r.query.group} | ${f(r.recall)} | ${f(r.ndcg)} | ${r.returned.slice(0, 3).join(', ')} | ${Object.entries(r.query.relevant).map(([k, v]) => `${k}:${v}`).join(', ')} |`);
    }
    md.push('', '## Pertinents non retrouvés dans le top 10', '');
    if (missed.length === 0) md.push('Aucun : tous les tuteurs annotés pertinents sont dans le top 10.');
    else for (const r of missed) md.push(`- **${r.query.id}** (${r.query.level}) « ${r.query.need.slice(0, 70)}… » : ${r.missed.map((m) => `${m.key} (pertinence ${m.rel}, rang ${m.rank ?? 'hors candidats'}${m.sim === null ? '' : `, sim ${m.sim.toFixed(3)}`})`).join(' ; ')}`);
    md.push('', '## Lecture', '');
    const windowRows = [...ablation].filter(([n]) => n.startsWith('Filtre relatif') || n.startsWith('Sans filtre') || n.startsWith('Coefficients actuels'));
    const bestWindow = windowRows.map(([n, v]) => ({ n, recall: mean(v.recall), ndcg: mean(v.ndcg) })).sort((x, y) => y.recall - x.recall || y.ndcg - x.ndcg)[0];
    md.push(`- Observation : avec les coefficients actuels, les manqués sont des tuteurs de pertinence 1 écartés par le filtre relatif (${DEFAULT_SCORING.relevanceWindow}) ; la configuration au meilleur recall du tableau est « ${bestWindow.n} » (recall ${f(bestWindow.recall)}, nDCG ${f(bestWindow.ndcg)}). Aucun coefficient n'est modifié ici : c'est une décision de calibrage pour l'équipe.`);
    md.push('- Ces valeurs servent de **référence** : toute modification des coefficients ou du modèle doit être comparée à ce rapport.');
    md.push('- Le jeu est volontairement petit et propre (tuteurs fictifs, textes soignés) : il mesure la mécanique, pas la qualité en production. Recalibrer ensuite avec `MatchingSearch` (clics, réservations).');
    md.push('- Aucun seuil absolu n\'est retenu : voir la distribution ci-dessus ; le filtre relatif reste la règle tant que le recouvrement entre pertinents et non pertinents n\'est pas levé.');
    writeFileSync(join(__dirname, 'report.md'), md.join('\n') + '\n', 'utf8');
    writeFileSync(join(__dirname, 'report.json'), JSON.stringify({
      model: cfg.embeddingModel, scoring: DEFAULT_SCORING, k: K, overall, byGroup,
      ablation: Object.fromEntries([...ablation].map(([n, v]) => [n, { recall: mean(v.recall), ndcg: mean(v.ndcg) }])),
      violations, queries: rows.map((r) => ({ id: r.query.id, recall: r.recall, ndcg: r.ndcg, returned: r.returned, missed: r.missed })),
    }, null, 2) + '\n', 'utf8');
    console.log(`\nrecall@${K} = ${f(overall.recall)}  nDCG@${K} = ${f(overall.ndcg)}  (${overall.n} demandes, ${violations} violation(s) d'éligibilité)`);
    console.log('Rapport : eval/report.md');
  } finally {
    await prisma.matchingSearch.deleteMany({ where: { requesterId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
