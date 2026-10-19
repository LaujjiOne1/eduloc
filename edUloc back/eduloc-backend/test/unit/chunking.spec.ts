import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ChunkBuilderService, MAX_CHUNKS_PER_DOCUMENT, MAX_DOCUMENT_CHUNKS_PER_TUTOR, TutorIndexSource, documentLabel,
} from '../../src/modules/matching/indexing/chunk-builder.service';
import { scrubPii } from '../../src/modules/matching/indexing/pii';
import {
  MAX_TOKENS, estimateTokens, isSectionTitle, normalizeText, splitBody, splitSections,
} from '../../src/modules/matching/indexing/text-splitter';

const builder = new ChunkBuilderService();

const source = (patch: Partial<TutorIndexSource> = {}): TutorIndexSource => ({
  id: 'tutor-1', highestDegree: 'MASTER', degreeTitle: 'Master Informatique, parcours Sécurité des systèmes',
  fieldOfStudy: 'Informatique', specialization: 'cryptographie appliquée, mémoire sur la gestion des clés',
  degreeInstitution: 'Université de Fianarantsoa',
  subjects: [], experiences: [], offers: [], documents: [], ...patch,
});

describe('gabarits des chunks structurés (spec §5.2)', () => {
  it('PROFILE : titre « Parcours académique », champs vides omis', () => {
    const [chunk] = builder.build(source());
    assert.equal(chunk.sourceType, 'PROFILE');
    assert.equal(chunk.sourceId, 'tutor-1');
    assert.equal(chunk.label, 'Parcours académique');
    assert.equal(
      chunk.content,
      "title: Parcours académique | text: Niveau d'études : Master. Diplôme : Master Informatique, parcours Sécurité des systèmes. " +
        'Domaine : Informatique. Spécialisation : cryptographie appliquée, mémoire sur la gestion des clés. ' +
        'Établissement : Université de Fianarantsoa.',
    );
    const sparse = builder.build(source({ degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null }))[0];
    assert.equal(sparse.content, "title: Parcours académique | text: Niveau d'études : Master.");
    assert.ok(!/null|undefined/.test(sparse.content));
  });

  it('PROFILE : aucun chunk pour un profil sans information', () => {
    assert.deepEqual(builder.build(source({ highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null })), []);
  });

  it('SUBJECT : un chunk par matière, niveaux et compétences regroupés, alias inclus', () => {
    const chunks = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      subjects: [
        { subjectId: 's1', subjectName: 'Algèbre linéaire', aliases: ['Algèbre 1', 'Algèbre linéaire L1'], levelName: 'Licence 1', competenceDescription: 'espaces vectoriels, diagonalisation' },
        { subjectId: 's1', subjectName: 'Algèbre linéaire', aliases: ['Algèbre 1', 'Algèbre linéaire L1'], levelName: 'Licence 2', competenceDescription: 'espaces vectoriels, diagonalisation' },
        { subjectId: 's2', subjectName: 'Probabilités', aliases: [], levelName: 'Licence 2', competenceDescription: null },
      ],
    }));
    assert.equal(chunks.length, 2);
    const algebra = chunks.find((c) => c.sourceId === 's1')!;
    assert.equal(algebra.label, 'Matière : Algèbre linéaire');
    assert.equal(algebra.subjectId, 's1');
    assert.equal(
      algebra.content,
      'title: Algèbre linéaire | text: Matière : Algèbre linéaire (aussi appelée : Algèbre 1, Algèbre linéaire L1). ' +
        'Niveaux enseignés : Licence 1, Licence 2. Compétences : espaces vectoriels, diagonalisation',
    );
    // Sans compétence : le chunk existe quand même (matière + niveaux).
    assert.equal(chunks.find((c) => c.sourceId === 's2')!.content, 'title: Probabilités | text: Matière : Probabilités. Niveaux enseignés : Licence 2.');
  });

  it('EXPERIENCE : libellé selon le type, gabarit de la spec', () => {
    const chunks = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      experiences: [
        { id: 'e1', type: 'ACADEMIC', title: 'Projet de fin d’études — implémentation de RSA', organization: 'Université de Fianarantsoa', period: '2024', description: 'Conception et implémentation d’algorithmes de chiffrement asymétrique.' },
        { id: 'e2', type: 'PROFESSIONAL', title: 'Développeur', organization: 'ACME', period: '2022-2024', description: null },
      ],
    }));
    const e1 = chunks.find((c) => c.sourceId === 'e1')!;
    assert.equal(e1.label, 'Expérience académique : Projet de fin d’études — implémentation de RSA');
    assert.equal(
      e1.content,
      'title: Projet de fin d’études — implémentation de RSA | text: Expérience académique. Projet de fin d’études — implémentation de RSA, Université de Fianarantsoa, 2024. Conception et implémentation d’algorithmes de chiffrement asymétrique.',
    );
    assert.equal(chunks.find((c) => c.sourceId === 'e2')!.label, 'Expérience professionnelle : Développeur');
  });

  it('EXPERIENCE : enseignement / soutien scolaire — le public et les matières enseignées entrent dans le texte', () => {
    const chunks = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      experiences: [
        { id: 'e1', type: 'TEACHING', title: 'Répétiteur', organization: 'Centre de soutien Antsirabe', period: '2021-2023', description: 'Aide aux devoirs.', audience: ['Collège', 'Lycée'], subjectsTaught: 'Mathématiques, Physique' },
        { id: 'e2', type: 'VOLUNTEER', title: 'Animateur', organization: 'ONG', period: '2020', description: null },
      ],
    }));
    const e1 = chunks.find((c) => c.sourceId === 'e1')!;
    assert.equal(e1.label, 'Expérience d’enseignement et de soutien scolaire : Répétiteur');
    assert.equal(
      e1.content,
      'title: Répétiteur | text: Expérience d’enseignement et de soutien scolaire. Répétiteur, Centre de soutien Antsirabe, 2021-2023. Public : Collège, Lycée. Matières ou compétences enseignées : Mathématiques, Physique. Aide aux devoirs.',
    );
    assert.equal(chunks.find((c) => c.sourceId === 'e2')!.label, 'Bénévolat : Animateur');
  });

  it('OFFER : titre de l’offre, matière puis description, subjectId dénormalisé', () => {
    const [chunk] = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      offers: [{ id: 'o1', title: 'Cryptographie avancée L3', description: 'RSA, courbes elliptiques.', subjectId: 's9', subjectName: 'Algorithmique avancée' }],
    }));
    assert.equal(chunk.label, 'Offre : Cryptographie avancée L3');
    assert.equal(chunk.subjectId, 's9');
    assert.equal(chunk.content, 'title: Cryptographie avancée L3 | text: Matière : Algorithmique avancée. RSA, courbes elliptiques.');
  });

  it('normalise : NFC, espaces multiples, lignes vides', () => {
    const [chunk] = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      offers: [{ id: 'o1', title: 'Café   noir', description: 'a  b\n\n\nc', subjectId: 's', subjectName: 'M' }],
    }));
    assert.equal(chunk.content, 'title: Café noir | text: Matière : M. a b\nc');
    assert.equal(chunk.content, chunk.content.normalize('NFC'));
  });

  it('retire les données personnelles saisies dans les champs libres', () => {
    const chunks = builder.build(source({
      specialization: 'cryptographie, contact aina@example.mg ou 034 12 345 67',
      offers: [{ id: 'o1', title: 'Cours', description: 'Appelez-moi au +261 34 12 345 67 ou écrivez à moi@exemple.com', subjectId: 's', subjectName: 'M' }],
    }));
    const all = chunks.map((c) => c.content).join('\n');
    assert.ok(!/@/.test(all) && !/345 67/.test(all), all);
  });

  it('un texte long est découpé en plusieurs chunks de ≤ 500 tokens qui répètent l’en-tête', () => {
    const sentence = 'La diagonalisation des endomorphismes repose sur les valeurs propres. ';
    const chunks = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      experiences: [{ id: 'e1', type: 'PROFESSIONAL', title: 'Enseignant', organization: 'Lycée', period: '2020', description: sentence.repeat(120) }],
    }));
    assert.ok(chunks.length > 1);
    chunks.forEach((c, i) => {
      assert.equal(c.chunkIndex, i);
      assert.equal(c.label, 'Expérience professionnelle : Enseignant');
      assert.ok(estimateTokens(c.content) <= MAX_TOKENS, `chunk ${i} : ${estimateTokens(c.content)} tokens`);
      assert.ok(c.content.startsWith('title: Enseignant | text: Expérience professionnelle. Enseignant, Lycée, 2020.'));
    });
  });

  it('est déterministe (même entrée, mêmes chunks, même ordre)', () => {
    const input = source({ subjects: [{ subjectId: 'b', subjectName: 'B', aliases: [], levelName: 'L1', competenceDescription: null }, { subjectId: 'a', subjectName: 'A', aliases: [], levelName: 'L1', competenceDescription: null }] });
    assert.deepEqual(builder.build(input), builder.build(structuredClone(input)));
  });
});

describe('chunks DOCUMENT et libellés (spec §5.3, décision 4)', () => {
  const cv = [
    'EXPÉRIENCES', 'Développeur web chez ACME, 2020-2023.', 'Projet de chiffrement RSA.',
    'FORMATION', 'Master Informatique, Université de Fianarantsoa.', 'COMPÉTENCES', 'Python, cryptographie, SQL.',
  ].join('\n');

  it('découpe sur les titres de section et préfixe « Type — section »', () => {
    const chunks = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      documents: [{ id: 'd1', type: 'CV', fileName: 'cv.pdf', extractedText: cv }],
    }));
    assert.equal(chunks.length, 3);
    assert.ok(chunks.every((c) => c.sourceType === 'DOCUMENT' && c.sourceId === 'd1' && c.subjectId === null));
    assert.deepEqual(chunks.map((c) => c.chunkIndex), [0, 1, 2]);
    assert.ok(chunks[0].content.startsWith('title: CV — EXPÉRIENCES | text: '));
  });

  it('« vérifié » uniquement pour l’élément réellement contrôlé ; jamais pour un CV ou une pièce diverse', () => {
    assert.equal(documentLabel('DIPLOMA'), 'Diplôme vérifié');
    assert.equal(documentLabel('TRANSCRIPT'), 'Relevé de notes vérifié');
    assert.equal(documentLabel('CERTIFICATE'), 'Certificat vérifié');
    assert.equal(documentLabel('PROFESSIONAL_PROOF'), 'Expérience vérifiée');
    assert.equal(documentLabel('CV'), 'Mentionné dans le CV');
    assert.equal(documentLabel('OTHER'), 'Pièce jointe au dossier');
    assert.ok(!/vérifi/i.test(documentLabel('CV')) && !/vérifi/i.test(documentLabel('OTHER')));
  });

  it('le libellé ne contient jamais d’extrait du document', () => {
    const chunks = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      documents: [{ id: 'd1', type: 'DIPLOMA', fileName: 'diplome-secret.pdf', extractedText: 'DIPLÔME\nMaster en cryptographie délivré à Aina.' }],
    }));
    assert.ok(chunks.every((c) => c.label === 'Diplôme vérifié' && !/cryptographie|secret/.test(c.label)));
  });

  it('plafonne à 10 chunks par document et 30 chunks DOCUMENT par tuteur', () => {
    const big = Array.from({ length: 60 }, (_, i) => `SECTION ${i}\n${'Texte du paragraphe. '.repeat(10)}`).join('\n');
    const one = builder.build(source({ highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null, documents: [{ id: 'd1', type: 'CV', fileName: null, extractedText: big }] }));
    assert.equal(one.length, MAX_CHUNKS_PER_DOCUMENT);
    const many = builder.build(source({
      highestDegree: null, degreeTitle: null, fieldOfStudy: null, specialization: null, degreeInstitution: null,
      documents: ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => ({ id, type: 'CV' as const, fileName: null, extractedText: big })),
    }));
    assert.equal(many.length, MAX_DOCUMENT_CHUNKS_PER_TUTOR);
  });
});

describe('nettoyage des données personnelles (spec §5.3)', () => {
  it('retire e-mails, téléphones, CIN, dates de naissance, numéros de diplôme et adresses', () => {
    const dirty = [
      'Email : aina.rakoto@gmail.com', 'Tél : 034 12 345 67',
      'Mobile +261 32 98 765 43', 'CIN : 101 234 567 890', 'Née le 12/03/1998 à Fianarantsoa',
      'N° de diplôme : MA-2021-04512', 'Adresse : Lot IVG 12 Ambohijatovo, Antananarivo',
      'Master Informatique 2021', 'Projet RSA 2022-2024',
    ].join('\n');
    const out = scrubPii(dirty);
    for (const forbidden of ['@', '034 12', '98 765', '101 234', '1998', 'MA-2021', 'Ambohijatovo']) {
      assert.ok(!out.includes(forbidden), `« ${forbidden} » devrait être retiré : ${out}`);
    }
    assert.ok(out.includes('Master Informatique 2021') && out.includes('Projet RSA 2022-2024'), out);
  });

  it('ne touche ni aux années, ni aux périodes, ni aux nombres ordinaires', () => {
    const safe = 'Licence 2019 2020 2021, Bac 2018, 120 crédits ECTS, note 15,5/20, TD de 3 heures';
    assert.equal(scrubPii(safe), safe);
  });
});

describe('découpage de texte', () => {
  it('reconnaît les titres de section', () => {
    assert.equal(isSectionTitle('EXPÉRIENCES'), true);
    assert.equal(isSectionTitle('Compétences :'), true);
    assert.equal(isSectionTitle('Développeur web chez ACME, 2020-2023.'), false);
    assert.equal(isSectionTitle('ab'), false);
  });

  it('sépare les sections et normalise', () => {
    const sections = splitSections('Intro\nFORMATION\nMaster\nCOMPÉTENCES:\nPython');
    assert.deepEqual(sections, [{ title: null, body: 'Intro' }, { title: 'FORMATION', body: 'Master' }, { title: 'COMPÉTENCES', body: 'Python' }]);
    assert.equal(normalizeText('  a   b \r\n\r\n c '), 'a b\nc');
  });

  it('un texte court reste en un seul morceau', () => {
    assert.deepEqual(splitBody('Un texte court.'), ['Un texte court.']);
  });

  it('découpe un long texte en morceaux ≤ cible, avec un recouvrement d’environ 15 %', () => {
    const sentences = Array.from({ length: 200 }, (_, i) => `Phrase numéro ${i} sur la diagonalisation des matrices.`);
    const parts = splitBody(sentences.join(' '), 400);
    assert.ok(parts.length > 2);
    for (const part of parts) assert.ok(estimateTokens(part) <= 400, `${estimateTokens(part)} tokens`);
    // Le début de chaque morceau reprend la fin du précédent.
    for (let i = 1; i < parts.length; i += 1) {
      const lastOfPrevious = parts[i - 1].split('\n').pop()!;
      assert.ok(parts[i].includes(lastOfPrevious), `recouvrement manquant entre ${i - 1} et ${i}`);
    }
    // Rien n'est perdu.
    for (const s of sentences) assert.ok(parts.some((p) => p.includes(s)), s);
  });

  it('coupe de force une chaîne sans espace', () => {
    const parts = splitBody('x'.repeat(6000), 400);
    assert.ok(parts.length >= 4);
    for (const part of parts) assert.ok(estimateTokens(part) <= 400);
  });
});
