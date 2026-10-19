import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACADEMIC_RANK } from '../../src/modules/catalog/domain/academic-scale';
import {
  allowedFormats, isTutorEligible, minimumTutorRank,
} from '../../src/modules/matching/search/level-eligibility';
import { buildQueryText } from '../../src/modules/matching/search/matching-search.service';
import {
  DEFAULT_SCORING, TutorScoreInput, bayesianRating, rankTutors, scoreTutor,
} from '../../src/modules/matching/search/scoring';

const R = ACADEMIC_RANK;
const U = 'Université';

describe('éligibilité de niveau — table explicite E5 (niveau de la demande × niveau validé du tuteur)', () => {
  /** Table de la spec, écrite en toutes lettres : volontairement indépendante de l'implémentation. */
  const TABLE: Record<string, { request: number; eligibleTutors: string[] }> = {
    L1: { request: R.L1, eligibleTutors: ['L2', 'L3', 'M1', 'M2', 'DOCTORAT'] },
    L2: { request: R.L2, eligibleTutors: ['L3', 'M1', 'M2', 'DOCTORAT'] },
    L3: { request: R.L3, eligibleTutors: ['M1', 'M2', 'DOCTORAT'] },
    M1: { request: R.M1, eligibleTutors: ['M2', 'DOCTORAT'] },
    M2: { request: R.M2, eligibleTutors: ['DOCTORAT'] },
    // E7 : choix par défaut (non défini par le produit) — seuls les tuteurs de niveau Doctorat.
    DOCTORAT: { request: R.DOCTORAT, eligibleTutors: ['DOCTORAT'] },
  };
  const TUTOR_LEVELS = [
    { key: 'PRIMAIRE', rank: R.PRIMAIRE, category: 'Primaire' },
    { key: 'COLLEGE', rank: R.COLLEGE, category: 'Collège' },
    { key: 'LYCEE_BAC', rank: R.LYCEE_BAC, category: 'Lycée' },
    { key: 'L1', rank: R.L1, category: U }, { key: 'L2', rank: R.L2, category: U }, { key: 'L3', rank: R.L3, category: U },
    { key: 'M1', rank: R.M1, category: U }, { key: 'M2', rank: R.M2, category: U }, { key: 'DOCTORAT', rank: R.DOCTORAT, category: U },
  ];

  for (const [requestName, { request, eligibleTutors }] of Object.entries(TABLE)) {
    it(`demande ${requestName} : exactement ${eligibleTutors.join(', ')}`, () => {
      const accepted = TUTOR_LEVELS.filter((t) => isTutorEligible(request, { rank: t.rank, category: t.category })).map((t) => t.key);
      assert.deepEqual(accepted, eligibleTutors);
    });
  }

  it('aucun tuteur de rang ≤ demande n’est jamais éligible (hors Doctorat/Doctorat, E7)', () => {
    for (const requestRank of [R.L1, R.L2, R.L3, R.M1, R.M2]) {
      for (const t of TUTOR_LEVELS.filter((x) => x.rank <= requestRank)) {
        assert.equal(isTutorEligible(requestRank, { rank: t.rank, category: t.category }), false, `demande ${requestRank} / tuteur ${t.key}`);
      }
    }
  });

  it('un tuteur L1 n’est jamais éligible pour une demande L1', () => {
    assert.equal(isTutorEligible(R.L1, { rank: R.L1, category: U }), false);
  });

  it('un tuteur sans niveau validé (ou hors échelle) n’est jamais éligible à l’université', () => {
    for (const request of [R.L1, R.L2, R.L3, R.M1, R.M2, R.DOCTORAT]) {
      assert.equal(isTutorEligible(request, null), false);
      assert.equal(isTutorEligible(request, { rank: null, category: U }), false);
    }
  });

  it('un niveau hors du bloc universitaire n’est pas éligible, même de rang supérieur', () => {
    assert.equal(isTutorEligible(R.L1, { rank: 99, category: 'Lycée' }), false);
  });

  it('une demande hors échelle (« Formation pro ») ou non universitaire n’a aucun tuteur éligible', () => {
    assert.equal(isTutorEligible(null, { rank: R.DOCTORAT, category: U }), false);
    assert.equal(isTutorEligible(R.LYCEE_BAC, { rank: R.DOCTORAT, category: U }), false);
  });

  it('expert professionnel validé (niveau Doctorat) : éligible pour M2 et Doctorat', () => {
    // L'expert est enregistré au niveau Doctorat (E6) : aucune règle spéciale côté éligibilité.
    assert.equal(isTutorEligible(R.M2, { rank: R.DOCTORAT, category: U }), true);
    assert.equal(isTutorEligible(R.DOCTORAT, { rank: R.DOCTORAT, category: U }), true);
  });

  it('minimumTutorRank : rang + 1, plafonné au Doctorat', () => {
    assert.deepEqual([R.L1, R.L2, R.L3, R.M1, R.M2, R.DOCTORAT].map(minimumTutorRank), [5, 6, 7, 8, 9, 9]);
  });
});

describe('compatibilité de format (spec §6.2)', () => {
  it('ONLINE → ONLINE|BOTH ; IN_PERSON → IN_PERSON|BOTH ; BOTH/absent → tout', () => {
    assert.deepEqual(allowedFormats('ONLINE'), ['ONLINE', 'BOTH']);
    assert.deepEqual(allowedFormats('IN_PERSON'), ['IN_PERSON', 'BOTH']);
    assert.deepEqual(allowedFormats('BOTH'), ['ONLINE', 'IN_PERSON', 'BOTH']);
    assert.deepEqual(allowedFormats(null), ['ONLINE', 'IN_PERSON', 'BOTH']);
    assert.deepEqual(allowedFormats(undefined), ['ONLINE', 'IN_PERSON', 'BOTH']);
  });
});

describe('texte de la requête (spec §6.3)', () => {
  it('assemble matière, niveau, filière, besoin, objectif ; champs vides omis, besoin intact', () => {
    assert.equal(
      buildQueryText({ subject: 'Analyse 2', level: 'Licence 2', studyProgram: 'Licence Informatique', need: 'Intégrales impropres et séries.', objective: 'REMEDIAL' }),
      'Matière : Analyse 2. Niveau : Licence 2. Filière : Licence Informatique. Besoin : Intégrales impropres et séries. Objectif : remise à niveau.',
    );
    assert.equal(
      buildQueryText({ subject: null, level: 'Master 1', studyProgram: null, need: 'Cryptographie asymétrique', objective: null }),
      'Niveau : Master 1. Besoin : Cryptographie asymétrique',
    );
  });

  it('mention universitaire : « Domaine: …. Mention: …. Cours Spécifique: …. » en tête, domaine retrouvé côté serveur', () => {
    assert.equal(
      buildQueryText({
        subject: 'Analyse 2', level: 'Licence 2', studyProgram: null, need: 'Séries entières.', objective: null,
        track: { kind: 'MENTION', name: 'Mathématiques', domain: 'Sciences, Technologies et Santé' },
      }),
      'Domaine: Sciences, Technologies et Santé. Mention: Mathématiques. Cours Spécifique: Analyse 2. Niveau : Licence 2. Besoin : Séries entières.',
    );
  });

  it('série du lycée : ajoutée sans changer le reste', () => {
    assert.equal(
      buildQueryText({ subject: 'Littérature', level: 'Terminale', studyProgram: null, need: 'Commentaire composé', objective: null, track: { kind: 'SERIE', name: 'Série L', domain: null } }),
      'Matière : Littérature. Série : Série L. Niveau : Terminale. Besoin : Commentaire composé',
    );
  });
});

describe('scoring (spec §6.4)', () => {
  const input = (patch: Partial<TutorScoreInput> & { tutorProfileId: string }): TutorScoreInput => ({
    sims: [], declaresRequestedSubject: false, rating: 3.5, reviewsCount: 0, ...patch,
  });

  it('finalScore = bestSim + 0,02 × corroboration + bonus matière + bonus note', () => {
    const s = scoreTutor(input({
      tutorProfileId: 't',
      sims: [
        { sourceType: 'EXPERIENCE', sim: 0.8, label: 'Expérience académique : RSA' },
        { sourceType: 'SUBJECT', sim: 0.75, label: 'Matière : Algèbre' },
        { sourceType: 'OFFER', sim: 0.5, label: 'Offre : x' },
      ],
      declaresRequestedSubject: true, rating: 5, reviewsCount: 15,
    }))!;
    assert.equal(s.bestSim, 0.8);
    assert.equal(s.bestSource, 'EXPERIENCE');
    assert.equal(s.corroboration, 1, 'EXPERIENCE et SUBJECT sont à moins de 0,10 du meilleur ; OFFER non');
    assert.equal(s.subjectBonus, 0.03);
    const rating = (5 * 15 + 3.5 * 5) / 20;
    assert.ok(Math.abs(s.ratingBonus - (0.02 * rating) / 5) < 1e-12);
    assert.ok(Math.abs(s.finalScore - (0.8 + 0.02 + 0.03 + s.ratingBonus)) < 1e-12);
    assert.deepEqual(s.matchReasons, ['Expérience académique : RSA', 'Matière : Algèbre']);
  });

  it('note bayésienne : sans avis, tout le monde vaut 3,5', () => {
    assert.equal(bayesianRating(0, 0, DEFAULT_SCORING), 3.5);
    assert.equal(bayesianRating(5, 0, DEFAULT_SCORING), 3.5);
  });

  it('les bonus restent faibles : un tuteur bien noté mais hors sujet ne dépasse pas un tuteur pertinent', () => {
    const relevant = input({ tutorProfileId: 'a', sims: [{ sourceType: 'SUBJECT', sim: 0.7, label: 'A' }], rating: 3.5 });
    const offTopic = input({
      tutorProfileId: 'b', sims: [{ sourceType: 'SUBJECT', sim: 0.45, label: 'B' }], declaresRequestedSubject: true, rating: 5, reviewsCount: 500,
    });
    const ranked = rankTutors([offTopic, relevant], 10);
    assert.equal(ranked[0].tutorProfileId, 'a');
  });

  it('filtre de pertinence RELATIF : garde finalScore ≥ meilleur − 0,15, puis limite', () => {
    const mk = (id: string, sim: number) => input({ tutorProfileId: id, sims: [{ sourceType: 'SUBJECT', sim, label: id }] });
    const ranked = rankTutors([mk('c', 0.5), mk('a', 0.9), mk('b', 0.8), mk('d', 0.74)], 10);
    assert.deepEqual(ranked.map((r) => r.tutorProfileId), ['a', 'b']);
    assert.deepEqual(rankTutors([mk('a', 0.9), mk('b', 0.89), mk('c', 0.88)], 2).map((r) => r.tutorProfileId), ['a', 'b']);
  });

  it('départage les égalités par identifiant, ignore un tuteur sans similarité, liste vide sûre', () => {
    const mk = (id: string) => input({ tutorProfileId: id, sims: [{ sourceType: 'SUBJECT', sim: 0.6, label: id }] });
    assert.deepEqual(rankTutors([mk('b'), mk('a'), input({ tutorProfileId: 'z' })], 10).map((r) => r.tutorProfileId), ['a', 'b']);
    assert.deepEqual(rankTutors([], 10), []);
  });

  it('les explications sont des libellés distincts, au plus deux', () => {
    const s = scoreTutor(input({
      tutorProfileId: 't',
      sims: [
        { sourceType: 'DOCUMENT', sim: 0.9, label: 'Diplôme vérifié' },
        { sourceType: 'OFFER', sim: 0.85, label: 'Diplôme vérifié' },
        { sourceType: 'SUBJECT', sim: 0.8, label: 'Matière : Algèbre' },
        { sourceType: 'PROFILE', sim: 0.7, label: 'Parcours académique' },
      ],
    }))!;
    assert.deepEqual(s.matchReasons, ['Diplôme vérifié', 'Matière : Algèbre']);
  });

  it('les coefficients sont configurables', () => {
    const sims = [{ sourceType: 'SUBJECT' as const, sim: 0.5, label: 'x' }];
    const s = scoreTutor(input({ tutorProfileId: 't', sims, declaresRequestedSubject: true }), { ...DEFAULT_SCORING, subjectBonus: 0.1 })!;
    assert.ok(Math.abs(s.subjectBonus - 0.1) < 1e-12);
  });
});
