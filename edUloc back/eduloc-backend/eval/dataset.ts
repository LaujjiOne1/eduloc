/**
 * Jeu d'évaluation du matching universitaire (spec §10, lot 7) : tuteurs fictifs mais réalistes, et 40 demandes annotées
 * avec les tuteurs pertinents (2 = très pertinent, 1 = pertinent). Annotations écrites à la main, SANS regarder les
 * scores : un tuteur n'est pertinent que s'il peut réellement aider sur le besoin décrit.
 *
 * Les annotations ne portent que sur des tuteurs ÉLIGIBLES par le niveau (le filtre SQL décide de l'éligibilité,
 * jamais la similarité) : le test unitaire du jeu le vérifie.
 */
import type { Relevance } from './metrics';

export type TutorLevel = 'L3' | 'M1' | 'M2' | 'DOCTORAT';
export type RequestLevel = 'Licence 1' | 'Licence 2' | 'Licence 3' | 'Master 1' | 'Master 2';
export type Group = 'mathématiques' | 'informatique' | 'économie-gestion-droit' | 'sciences-langues' | 'sémantique-sans-mots-communs';

export interface EvalTutor {
  key: string;
  /** Niveau académique VALIDÉ. */
  level: TutorLevel;
  /** Expert professionnel validé Doctorat sans doctorat (E6). */
  expert?: boolean;
  highestDegree: 'LICENCE' | 'MASTER' | 'DOCTORAT';
  degreeTitle: string;
  fieldOfStudy: string;
  specialization: string;
  institution: string;
  subjects: { name: string; competence: string }[];
  experiences: { type: 'ACADEMIC' | 'PROFESSIONAL'; title: string; organization: string; period: string; description: string }[];
  offers: { title: string; description: string; subject: string }[];
}

export interface EvalQuery {
  id: string;
  group: Group;
  level: RequestLevel;
  /** Matière du catalogue (bonus « matière déclarée ») ou saisie libre. */
  subject: { catalog: string } | { text: string };
  need: string;
  relevant: Relevance;
}

const UNI_LEVELS = ['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2'] as const;
export const TUTOR_RANK: Record<TutorLevel, number> = { L3: 6, M1: 7, M2: 8, DOCTORAT: 9 };
export const REQUEST_RANK: Record<RequestLevel, number> = { 'Licence 1': 4, 'Licence 2': 5, 'Licence 3': 6, 'Master 1': 7, 'Master 2': 8 };
/** Niveaux qu'un tuteur peut déclarer enseigner : tous les niveaux universitaires strictement inférieurs au sien. */
export const declaredLevels = (level: TutorLevel): string[] => UNI_LEVELS.filter((l) => REQUEST_RANK[l] < TUTOR_RANK[level]);

const t = (key: string, level: TutorLevel, degreeTitle: string, fieldOfStudy: string, specialization: string,
  subjects: EvalTutor['subjects'], experiences: EvalTutor['experiences'], offers: EvalTutor['offers'],
  extra: Partial<EvalTutor> = {}): EvalTutor => ({
  key, level, highestDegree: level === 'DOCTORAT' ? 'DOCTORAT' : level === 'L3' ? 'LICENCE' : 'MASTER',
  degreeTitle, fieldOfStudy, specialization, institution: 'Université d’Antananarivo', subjects, experiences, offers, ...extra,
});

const acad = (title: string, organization: string, period: string, description: string) => ({ type: 'ACADEMIC' as const, title, organization, period, description });
const pro = (title: string, organization: string, period: string, description: string) => ({ type: 'PROFESSIONAL' as const, title, organization, period, description });

export const TUTORS: EvalTutor[] = [
  t('T01', 'M2', 'Master Mathématiques fondamentales', 'Mathématiques', 'algèbre linéaire, théorie des groupes et des anneaux',
    [{ name: 'Algèbre linéaire', competence: 'espaces vectoriels, bases et dimension, applications linéaires, diagonalisation, valeurs propres, réduction d’endomorphismes' },
      { name: 'Algèbre abstraite', competence: 'groupes, sous-groupes, homomorphismes, anneaux et corps' }],
    [acad('Mémoire sur la réduction de Jordan', 'Université d’Antananarivo', '2022', 'Étude de la décomposition de Jordan et de ses applications aux systèmes linéaires.')],
    [{ title: 'Algèbre linéaire de L1 à L3', subject: 'Algèbre linéaire', description: 'Cours et exercices corrigés : matrices, déterminants, diagonalisation, trigonalisation. Méthode pour rédiger une preuve.' }]),
  t('T02', 'DOCTORAT', 'Doctorat en analyse fonctionnelle', 'Mathématiques', 'analyse réelle, intégration de Lebesgue, espaces de Banach',
    [{ name: 'Analyse réelle', competence: 'suites et séries numériques, critères de convergence, intégrales impropres, intégrale de Riemann, séries entières' }],
    [pro('Chargé de travaux dirigés en analyse', 'Université d’Antananarivo', '2019-2023', 'Animation de TD d’analyse en première et deuxième année de licence.')],
    [{ title: 'Analyse L1-L2 : suites, séries, intégrales', subject: 'Analyse réelle', description: 'Maîtriser les convergences, les intégrales généralisées et les développements limités avec de nombreux exercices.' }]),
  t('T03', 'M2', 'Master Statistique et probabilités', 'Statistique', 'inférence statistique, tests et estimation',
    [{ name: 'Probabilités et statistiques', competence: 'lois discrètes et continues, espérance, variance, loi binomiale, estimation, intervalles de confiance, tests d’hypothèses' }],
    [acad('Mémoire sur les tests non paramétriques', 'Université d’Antananarivo', '2021', 'Comparaison de tests de rang sur des petits échantillons.')],
    [{ title: 'Probabilités et statistiques', subject: 'Probabilités et statistiques', description: 'Variables aléatoires, lois usuelles, théorème central limite, estimation et tests, avec R.' }]),
  t('T04', 'DOCTORAT', 'Doctorat en traitement du signal', 'Traitement du signal', 'analyse spectrale, filtrage numérique, ondelettes',
    [{ name: 'Traitement du signal', competence: 'échantillonnage, transformée de Fourier discrète, filtrage numérique, analyse spectrale, convolution' }],
    [acad('Thèse : débruitage de signaux biomédicaux', 'Université d’Antananarivo', '2018-2022', 'Filtrage adaptatif et analyse temps-fréquence de signaux ECG.')],
    [{ title: 'Traitement du signal et analyse spectrale', subject: 'Traitement du signal', description: 'Comprendre le passage du temps à la fréquence, le filtrage et l’échantillonnage, avec Matlab et Python.' }]),
  t('T05', 'M2', 'Master Physique de l’énergie', 'Physique', 'thermodynamique et machines thermiques',
    [{ name: 'Thermodynamique', competence: 'premier et second principe, entropie, cycles de Carnot, machines thermiques, changements d’état' }],
    [pro('Technicien énergie', 'JIRAMA', '2021-2023', 'Suivi du rendement de groupes thermiques et bilans énergétiques.')],
    [{ title: 'Thermodynamique : principes et cycles', subject: 'Thermodynamique', description: 'Bilans d’énergie, entropie, machines thermiques et exercices types de partiels.' }]),
  t('T06', 'DOCTORAT', 'Doctorat en chimie organique', 'Chimie', 'synthèse organique et spectroscopie',
    [{ name: 'Chimie organique', competence: 'mécanismes réactionnels, substitution nucléophile, élimination, additions, spectroscopie RMN et infrarouge' }],
    [acad('Thèse : synthèse de molécules bioactives', 'Université d’Antananarivo', '2017-2021', 'Synthèse multi-étapes et caractérisation par RMN.')],
    [{ title: 'Chimie organique : mécanismes et RMN', subject: 'Chimie organique', description: 'Apprendre à écrire les mécanismes, prévoir la réactivité et interpréter un spectre RMN.' }]),
  t('T07', 'M2', 'Master MIAGE', 'Informatique de gestion', 'systèmes d’information et bases de données',
    [{ name: 'Bases de données', competence: 'modélisation relationnelle, MERISE, formes normales, SQL, jointures, optimisation de requêtes, transactions' }],
    [pro('Analyste développeur', 'Banque centrale', '2021-2023', 'Conception du schéma relationnel et des requêtes d’un système d’information de gestion.')],
    [{ title: 'Bases de données et SQL', subject: 'Bases de données', description: 'De la modélisation conceptuelle au SQL avancé : normalisation, jointures, vues, index et transactions.' }]),
  t('T08', 'M2', 'Master Informatique parcours Sécurité des systèmes', 'Informatique', 'cryptographie appliquée, gestion des clés',
    [{ name: 'Cryptographie', competence: 'chiffrement symétrique et asymétrique, RSA, courbes elliptiques, signatures, gestion des clés, protocoles' }],
    [acad('Projet de fin d’études : implémentation de RSA', 'Université d’Antananarivo', '2023', 'Conception et implémentation d’algorithmes de chiffrement asymétrique et de gestion des clés.')],
    [{ title: 'Cryptographie et sécurité', subject: 'Cryptographie', description: 'Fondements mathématiques de RSA et des courbes elliptiques, signatures numériques et protocoles sécurisés.' }]),
  t('T09', 'M2', 'Diplôme d’ingénieur logiciel', 'Génie logiciel', 'conception orientée objet, tests et architecture',
    [{ name: 'Programmation', competence: 'Java, Python, programmation orientée objet, UML, tests unitaires, architecture logicielle, design patterns' }],
    [pro('Ingénieur logiciel', 'Axian', '2020-2024', 'Conception d’applications Java, revues de code, intégration continue et tests automatisés.')],
    [{ title: 'Génie logiciel et POO en Java', subject: 'Programmation', description: 'Concevoir une application : diagrammes UML, patrons de conception, tests unitaires et architecture en couches.' }]),
  t('T10', 'DOCTORAT', 'Doctorat en informatique', 'Informatique', 'algorithmique, graphes et complexité',
    [{ name: 'Algorithmique avancée', competence: 'complexité, graphes, plus courts chemins, parcours, programmation dynamique, structures de données' }],
    [acad('Thèse : algorithmes d’approximation sur les graphes', 'Université d’Antananarivo', '2016-2020', 'Algorithmes de plus courts chemins et de couverture dans des graphes de grande taille.')],
    [{ title: 'Algorithmique et structures de données', subject: 'Algorithmique avancée', description: 'Analyser la complexité, maîtriser les graphes (BFS, DFS, Dijkstra) et la programmation dynamique.' }]),
  t('T11', 'M1', 'Master Informatique parcours Réseaux', 'Informatique', 'réseaux et télécommunications',
    [{ name: 'Réseaux informatiques', competence: 'modèle OSI, TCP/IP, adressage IP et sous-réseaux, routage, VLAN, DNS, sécurité réseau' }],
    [pro('Administrateur réseau', 'Telma', '2022-2024', 'Exploitation d’un réseau d’entreprise : routage, VLAN, supervision.')],
    [{ title: 'Réseaux : adressage et routage', subject: 'Réseaux informatiques', description: 'Calcul de sous-réseaux, tables de routage, configuration de routeurs et de commutateurs.' }]),
  t('T12', 'M2', 'Master Data Science', 'Science des données', 'apprentissage automatique et statistiques',
    [{ name: 'Apprentissage automatique', competence: 'régression, classification, arbres de décision, réseaux de neurones, scikit-learn, évaluation de modèles' }],
    [pro('Data scientist', 'Orange Madagascar', '2021-2024', 'Modèles de prédiction de la résiliation client avec réseaux de neurones et forêts aléatoires.')],
    [{ title: 'Machine learning avec Python', subject: 'Apprentissage automatique', description: 'Classification, régression et réseaux de neurones : de la préparation des données à l’évaluation.' }]),
  t('T13', 'M1', 'Master Informatique parcours Génie logiciel', 'Informatique', 'développement web',
    [{ name: 'Programmation', competence: 'JavaScript, React, Node.js, API REST, HTML et CSS, bases de données web' }],
    [pro('Développeur web', 'Agence digitale', '2022-2024', 'Applications React et API REST avec Node.js.')],
    [{ title: 'Développement web moderne', subject: 'Programmation', description: 'Construire une application web complète avec React et une API REST.' }]),
  t('T14', 'M1', 'Master Informatique parcours Systèmes', 'Informatique', 'systèmes d’exploitation',
    [{ name: 'Systèmes d’exploitation', competence: 'processus, threads, ordonnancement, gestion de la mémoire, système de fichiers, Linux, shell' }],
    [acad('Mémoire : ordonnancement temps réel sous Linux', 'Université d’Antananarivo', '2022', 'Étude de politiques d’ordonnancement et de leur impact sur la latence.')],
    [{ title: 'Systèmes d’exploitation et Linux', subject: 'Systèmes d’exploitation', description: 'Processus, mémoire virtuelle, synchronisation et programmation shell sous Linux.' }]),
  t('T15', 'DOCTORAT', 'Doctorat en sciences économiques', 'Économie', 'macroéconomie et croissance',
    [{ name: 'Macroéconomie', competence: 'modèle IS-LM, politique monétaire et budgétaire, inflation, croissance, modèle de Solow, balance des paiements' }],
    [acad('Thèse : politique monétaire dans une petite économie ouverte', 'Université d’Antananarivo', '2015-2019', 'Modélisation de la transmission monétaire et de l’inflation à Madagascar.')],
    [{ title: 'Macroéconomie L2-L3', subject: 'Macroéconomie', description: 'Comprendre IS-LM, la monnaie, l’inflation et la croissance avec des exercices de partiels.' }]),
  t('T16', 'M2', 'Master Économie théorique', 'Économie', 'microéconomie et théorie des jeux',
    [{ name: 'Microéconomie', competence: 'théorie du consommateur, utilité, courbes d’indifférence, équilibre de marché, théorie des jeux, équilibre de Nash' }],
    [acad('Mémoire : jeux répétés et coopération', 'Université d’Antananarivo', '2022', 'Équilibres de Nash dans des jeux répétés.')],
    [{ title: 'Microéconomie et théorie des jeux', subject: 'Microéconomie', description: 'Choix du consommateur, marchés, jeux stratégiques et équilibre de Nash.' }]),
  t('T17', 'M2', 'Master Finance de marché', 'Finance', 'valorisation et gestion de portefeuille',
    [{ name: 'Finance d’entreprise', competence: 'valeur actuelle nette, taux de rentabilité, valorisation d’actions et d’obligations, portefeuille, MEDAF, risque' }],
    [pro('Analyste financier', 'Société de bourse', '2021-2024', 'Valorisation de sociétés et construction de portefeuilles.')],
    [{ title: 'Finance d’entreprise et de marché', subject: 'Finance d’entreprise', description: 'Choix d’investissement (VAN, TRI), valorisation des titres et théorie du portefeuille.' }]),
  t('T18', 'M1', 'Master Comptabilité Contrôle Audit', 'Comptabilité', 'comptabilité générale et fiscalité',
    [{ name: 'Comptabilité', competence: 'comptabilité générale, écritures, bilan, compte de résultat, amortissements, comptabilité analytique, fiscalité' }],
    [pro('Assistant comptable', 'Cabinet d’expertise comptable', '2022-2024', 'Tenue de comptabilité et établissement des états financiers de PME.')],
    [{ title: 'Comptabilité générale', subject: 'Comptabilité', description: 'Écritures, bilan, compte de résultat et opérations d’inventaire avec exercices corrigés.' }]),
  t('T19', 'M2', 'Master Droit des affaires', 'Droit', 'droit des sociétés et des contrats commerciaux',
    [{ name: 'Droit des affaires', competence: 'sociétés commerciales, responsabilité des dirigeants, contrats commerciaux, procédures collectives' }],
    [pro('Juriste d’entreprise', 'Groupe industriel', '2021-2024', 'Rédaction de contrats commerciaux et conseil sur la gouvernance des sociétés.')],
    [{ title: 'Droit des affaires', subject: 'Droit des affaires', description: 'Constitution et fonctionnement des sociétés, contrats commerciaux et difficultés des entreprises.' }]),
  t('T20', 'DOCTORAT', 'Doctorat en droit privé', 'Droit', 'droit des obligations et responsabilité civile',
    [{ name: 'Droit civil', competence: 'théorie générale des obligations, contrats, responsabilité civile, régime des obligations, droit des biens' }],
    [acad('Thèse : la réparation du préjudice corporel', 'Université d’Antananarivo', '2016-2020', 'Étude de la responsabilité civile et de l’indemnisation.')],
    [{ title: 'Droit civil : obligations et responsabilité', subject: 'Droit civil', description: 'Maîtriser le contrat, la faute, le lien de causalité et la réparation.' }]),
  t('T21', 'M1', 'Master Marketing et vente', 'Marketing', 'études de marché et stratégie marketing',
    [{ name: 'Marketing', competence: 'étude de marché, segmentation, ciblage, positionnement, mix marketing, comportement du consommateur' }],
    [pro('Chargé d’études marketing', 'Agence de communication', '2022-2024', 'Enquêtes de satisfaction et plans marketing pour des marques locales.')],
    [{ title: 'Marketing : études et stratégie', subject: 'Marketing', description: 'Construire une étude de marché, segmenter, positionner et bâtir un plan marketing.' }]),
  t('T22', 'M2', 'Master Management de projet', 'Management', 'gestion de projet et méthodes agiles',
    [{ name: 'Gestion de projet', competence: 'planification, diagramme de Gantt, chemin critique, gestion des risques, méthode Agile, Scrum' }],
    [pro('Chef de projet', 'Société de services numériques', '2021-2024', 'Pilotage de projets de développement avec Scrum et suivi du planning.')],
    [{ title: 'Gestion de projet', subject: 'Gestion de projet', description: 'Planifier avec un Gantt et le chemin critique, piloter les risques, travailler en Agile.' }]),
  t('T23', 'DOCTORAT', 'Doctorat en économie quantitative', 'Économétrie', 'économétrie et séries temporelles',
    [{ name: 'Économétrie', competence: 'régression linéaire simple et multiple, moindres carrés ordinaires, tests, hétéroscédasticité, séries temporelles' },
      { name: 'Probabilités et statistiques', competence: 'estimation, tests, lois de probabilité' }],
    [acad('Thèse : prévision de l’inflation par séries temporelles', 'Université d’Antananarivo', '2016-2020', 'Modèles ARIMA et régressions multiples sur données macroéconomiques.')],
    [{ title: 'Économétrie appliquée avec R', subject: 'Économétrie', description: 'Estimer et tester un modèle de régression, diagnostiquer les résidus, prévoir une série.' }]),
  t('T24', 'M2', 'Master Mathématiques appliquées', 'Mathématiques appliquées', 'analyse numérique et équations différentielles',
    [{ name: 'Analyse numérique', competence: 'équations différentielles ordinaires, méthodes d’Euler et de Runge-Kutta, interpolation, résolution numérique, Python' }],
    [acad('Mémoire : schémas numériques pour les EDO raides', 'Université d’Antananarivo', '2022', 'Comparaison de méthodes de Runge-Kutta implicites.')],
    [{ title: 'Analyse numérique avec Python', subject: 'Analyse numérique', description: 'Résoudre numériquement des équations différentielles, estimer l’erreur, programmer les schémas.' }]),
  t('T25', 'DOCTORAT', 'Doctorat en automatique', 'Automatique', 'commande des systèmes asservis',
    [{ name: 'Automatique', competence: 'fonction de transfert, transformée de Laplace, asservissement, stabilité, correcteurs PID, réponse fréquentielle' }],
    [acad('Thèse : commande robuste de systèmes linéaires', 'Université d’Antananarivo', '2015-2019', 'Synthèse de correcteurs par réponse fréquentielle.')],
    [{ title: 'Automatique et asservissements', subject: 'Automatique', description: 'Modéliser un système par fonction de transfert, étudier la stabilité et régler un PID.' }]),
  t('T26', 'M1', 'Master Études anglophones', 'Langues', 'anglais académique et scientifique',
    [{ name: 'Anglais', competence: 'rédaction d’articles scientifiques en anglais, préparation TOEFL et IELTS, expression orale, vocabulaire académique' }],
    [pro('Traductrice scientifique', 'Revue universitaire', '2022-2024', 'Relecture et traduction d’articles scientifiques.')],
    [{ title: 'Anglais scientifique et TOEFL', subject: 'Anglais', description: 'Rédiger un article ou un résumé en anglais, préparer le TOEFL et gagner en aisance à l’oral.' }]),
  t('T27', 'M2', 'Master Biologie moléculaire', 'Biologie', 'génétique et biologie cellulaire',
    [{ name: 'Biologie cellulaire et génétique', competence: 'génétique mendélienne, croisements, ADN et réplication, division cellulaire, biologie moléculaire' }],
    [acad('Mémoire : marqueurs génétiques de la résistance du riz', 'Université d’Antananarivo', '2022', 'Génotypage et analyse de ségrégation.')],
    [{ title: 'Génétique et biologie cellulaire', subject: 'Biologie cellulaire et génétique', description: 'Lois de Mendel, croisements, structure de l’ADN et cycle cellulaire avec exercices.' }]),
  t('T28', 'L3', 'Licence en informatique (en cours, L3)', 'Informatique', 'programmation Python et algorithmique de base',
    [{ name: 'Programmation', competence: 'Python, variables, boucles, fonctions, listes, algorithmique de base, débogage' }],
    [acad('Tuteur de soutien en première année', 'Université d’Antananarivo', '2024', 'Aide aux étudiants de L1 en initiation à la programmation.')],
    [{ title: 'Initiation à la programmation en Python', subject: 'Programmation', description: 'Apprendre à programmer pas à pas : boucles, fonctions, listes et petits projets.' }],
    { highestDegree: 'LICENCE' }),
  t('T29', 'DOCTORAT', 'Diplôme d’ingénieur en cybersécurité (expert professionnel)', 'Cybersécurité', 'sécurité des systèmes d’information, cryptographie en entreprise',
    [{ name: 'Cryptographie', competence: 'chiffrement, PKI et gestion des clés, protocoles TLS, sécurité des systèmes d’information, tests d’intrusion' },
      { name: 'Réseaux informatiques', competence: 'sécurité réseau, pare-feu, VPN, détection d’intrusion' }],
    [pro('Responsable sécurité des systèmes d’information', 'Banque', '2010-2024', 'Déploiement d’une infrastructure à clés publiques et audits de sécurité.')],
    [{ title: 'Sécurité des systèmes et cryptographie en pratique', subject: 'Cryptographie', description: 'Chiffrement, certificats, TLS, gestion des clés et bonnes pratiques de sécurité en entreprise.' }],
    { expert: true, highestDegree: 'MASTER' }),
];

const q = (id: string, group: Group, level: RequestLevel, subject: EvalQuery['subject'], need: string, relevant: Relevance): EvalQuery =>
  ({ id, group, level, subject, need, relevant });

export const QUERIES: EvalQuery[] = [
  // --- Mathématiques ----------------------------------------------------------------------------------------------
  q('Q01', 'mathématiques', 'Licence 1', { catalog: 'Algèbre linéaire' }, 'Je dois comprendre la diagonalisation de matrices et savoir calculer les valeurs propres et les vecteurs propres.', { T01: 2 }),
  q('Q02', 'mathématiques', 'Licence 2', { text: 'Analyse 2' }, 'Intégrales impropres, séries numériques et critères de convergence : je n’arrive pas à savoir quel critère appliquer.', { T02: 2 }),
  q('Q03', 'mathématiques', 'Licence 2', { catalog: 'Probabilités et statistiques' }, 'Lois de probabilité discrètes, espérance et variance, loi binomiale : j’ai besoin de beaucoup d’exercices.', { T03: 2, T23: 1, T12: 1 }),
  q('Q04', 'mathématiques', 'Licence 3', { text: 'Traitement du signal' }, 'Je galère avec les transformées de Fourier et l’analyse de signaux avant mon examen.', { T04: 2, T25: 1 }),
  q('Q05', 'mathématiques', 'Licence 3', { catalog: 'Probabilités et statistiques' }, 'Estimation ponctuelle, intervalles de confiance et tests d’hypothèses sur un échantillon.', { T03: 2, T23: 1 }),
  q('Q06', 'mathématiques', 'Licence 1', { catalog: 'Algèbre linéaire' }, 'Espaces vectoriels, bases, dimension et applications linéaires : je veux revoir tout le cours.', { T01: 2 }),
  q('Q07', 'mathématiques', 'Licence 3', { text: 'Équations différentielles' }, 'Résolution numérique d’équations différentielles ordinaires : méthodes d’Euler et de Runge-Kutta en Python.', { T24: 2 }),
  q('Q08', 'mathématiques', 'Licence 2', { catalog: 'Algèbre abstraite' }, 'Groupes, sous-groupes et homomorphismes : comment démontrer qu’une application est un morphisme ?', { T01: 2 }),
  q('Q09', 'mathématiques', 'Licence 3', { text: 'Économétrie' }, 'Régression linéaire multiple, moindres carrés ordinaires et interprétation des coefficients.', { T23: 2, T03: 1 }),
  q('Q10', 'mathématiques', 'Licence 3', { text: 'Automatique' }, 'Transformée de Laplace, fonction de transfert et stabilité d’un système asservi.', { T25: 2, T04: 1 }),
  // --- Informatique ------------------------------------------------------------------------------------------------
  q('Q11', 'informatique', 'Licence 2', { catalog: 'Bases de données' }, 'Normalisation d’une base en formes normales, requêtes SQL et jointures.', { T07: 2 }),
  q('Q12', 'informatique', 'Licence 3', { catalog: 'Bases de données' }, 'Modélisation avec MERISE, passage au modèle relationnel et requêtes SQL avancées.', { T07: 2 }),
  q('Q13', 'informatique', 'Master 1', { text: 'Cryptographie' }, 'Cryptographie asymétrique : fonctionnement de RSA et gestion des clés pour mon projet.', { T08: 2, T29: 2 }),
  q('Q14', 'informatique', 'Licence 2', { catalog: 'Algorithmique avancée' }, 'Complexité algorithmique et graphes : parcours en largeur, en profondeur et algorithme de Dijkstra.', { T10: 2 }),
  q('Q15', 'informatique', 'Licence 3', { catalog: 'Programmation' }, 'Programmation orientée objet en Java, héritage et diagrammes de classes UML.', { T09: 2, T13: 1 }),
  q('Q16', 'informatique', 'Licence 1', { catalog: 'Programmation' }, 'Initiation à Python : boucles, fonctions et listes, je pars de zéro.', { T28: 2, T09: 1, T13: 1 }),
  q('Q17', 'informatique', 'Licence 2', { text: 'Réseaux' }, 'Adressage IP, calcul de sous-réseaux et principes du routage.', { T11: 2, T29: 1 }),
  q('Q18', 'informatique', 'Master 1', { text: 'Machine learning' }, 'Apprentissage automatique : classification supervisée et réseaux de neurones sur un jeu de données.', { T12: 2 }),
  q('Q19', 'informatique', 'Licence 3', { text: 'Systèmes d’exploitation' }, 'Processus, threads, gestion de la mémoire et commandes sous Linux.', { T14: 2 }),
  q('Q20', 'informatique', 'Licence 2', { catalog: 'Programmation' }, 'Développer une application web avec React et une API REST.', { T13: 2, T09: 1 }),
  q('Q39', 'informatique', 'Licence 1', { text: 'Informatique' }, 'Je suis perdu en première année d’informatique : besoin de méthode et de bases en algorithmique.', { T10: 2, T28: 1, T09: 1 }),
  q('Q40', 'informatique', 'Licence 3', { text: 'Sécurité informatique' }, 'Sécurité des systèmes d’information et protocoles cryptographiques utilisés sur Internet.', { T08: 2, T29: 2, T11: 1 }),
  // --- Sémantique sans mots communs (E11) --------------------------------------------------------------------------
  q('Q21', 'sémantique-sans-mots-communs', 'Licence 3', { text: 'Informatique de gestion' }, 'Je prépare un Master MIAGE et je cherche un tuteur au parcours proche, sur les systèmes d’information.', { T07: 2, T09: 1 }),
  q('Q22', 'sémantique-sans-mots-communs', 'Licence 3', { text: 'Génie logiciel' }, 'Je vise un diplôme d’ingénieur logiciel : conception, tests et architecture d’une application.', { T09: 2, T07: 1 }),
  q('Q23', 'sémantique-sans-mots-communs', 'Licence 2', { text: 'Informatique' }, 'Je suis en Master Informatique l’an prochain : j’ai besoin de revoir programmation et bases de données.', { T07: 1, T09: 1, T10: 1 }),
  q('Q41', 'sémantique-sans-mots-communs', 'Licence 3', { text: 'Mathématiques' }, 'Les transformées de Fourier me bloquent : spectres, fréquences et filtrage d’un signal.', { T04: 2, T25: 1 }),
  // --- Économie, gestion, droit ------------------------------------------------------------------------------------
  q('Q24', 'économie-gestion-droit', 'Licence 2', { catalog: 'Macroéconomie' }, 'Modèle IS-LM, politique monétaire et lien avec l’inflation.', { T15: 2 }),
  q('Q25', 'économie-gestion-droit', 'Licence 1', { text: 'Microéconomie' }, 'Théorie du consommateur : utilité, contrainte budgétaire et courbes d’indifférence.', { T16: 2 }),
  q('Q26', 'économie-gestion-droit', 'Licence 3', { text: 'Finance' }, 'Calcul de la VAN, valorisation d’une action et portefeuille efficient (MEDAF).', { T17: 2 }),
  q('Q27', 'économie-gestion-droit', 'Licence 1', { catalog: 'Comptabilité' }, 'Comprendre le bilan, le compte de résultat et les écritures comptables.', { T18: 2 }),
  q('Q28', 'économie-gestion-droit', 'Licence 3', { catalog: 'Droit des affaires' }, 'Sociétés commerciales et responsabilité des dirigeants en cas de faillite.', { T19: 2, T20: 1 }),
  q('Q29', 'économie-gestion-droit', 'Licence 2', { text: 'Droit civil' }, 'Responsabilité civile et régime des obligations : faute, préjudice et lien de causalité.', { T20: 2, T19: 1 }),
  q('Q30', 'économie-gestion-droit', 'Licence 2', { text: 'Marketing' }, 'Étude de marché, segmentation et mix marketing pour lancer un produit.', { T21: 2 }),
  q('Q31', 'économie-gestion-droit', 'Licence 3', { text: 'Gestion de projet' }, 'Planification d’un projet, diagramme de Gantt, chemin critique et méthode Agile.', { T22: 2 }),
  q('Q32', 'économie-gestion-droit', 'Master 1', { text: 'Microéconomie' }, 'Théorie des jeux : équilibre de Nash, jeux répétés et stratégies dominantes.', { T16: 2 }),
  q('Q33', 'économie-gestion-droit', 'Licence 3', { catalog: 'Macroéconomie' }, 'Croissance économique et modèle de Solow : accumulation du capital et état stationnaire.', { T15: 2, T16: 1 }),
  // --- Sciences et langues -----------------------------------------------------------------------------------------
  q('Q34', 'sciences-langues', 'Licence 2', { catalog: 'Thermodynamique' }, 'Premier et second principe, entropie et cycle de Carnot.', { T05: 2 }),
  q('Q35', 'sciences-langues', 'Licence 3', { catalog: 'Chimie organique' }, 'Mécanismes de substitution nucléophile et interprétation d’un spectre RMN.', { T06: 2 }),
  q('Q36', 'sciences-langues', 'Licence 1', { text: 'Biologie' }, 'Génétique mendélienne, croisements et biologie cellulaire : méthode pour les exercices.', { T27: 2 }),
  q('Q37', 'sciences-langues', 'Licence 2', { text: 'Anglais' }, 'Rédiger un article scientifique en anglais et préparer le TOEFL.', { T26: 2 }),
  q('Q38', 'sciences-langues', 'Master 2', { text: 'Traitement du signal' }, 'Analyse spectrale avancée et filtrage numérique pour mon mémoire.', { T04: 2, T25: 1 }),
];
