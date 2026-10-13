# EduLoc V2 — Spécification : matching sémantique tuteur ↔ demande (niveaux universitaires)

> Document de référence pour l'agent de développement.
> Stack : NestJS · Prisma 7 · PostgreSQL (Supabase) + pgvector · Ollama · Upstash Redis.
> Modèle d'embedding : **EmbeddingGemma 2** (Google DeepMind, publié le 6 octobre 2026).

---

## 0. Objectif et périmètre

Quand un Demandeur cherche un tuteur pour un Bénéficiaire de niveau universitaire, EduLoc doit
proposer les tuteurs **admissibles** (règles métier strictes) les plus **pertinents** pour le besoin
exprimé (« diagonalisation de matrices », « normalisation en bases de données », « macroéconomie L2 »…),
même si le tuteur n'utilise pas les mêmes mots.

| Niveau du bénéficiaire | Méthode |
|---|---|
| CE → Terminale | Inchangée : règles déterministes (matière + niveau). Hors périmètre de ce document. |
| Université (catégorie de niveau `Université`) | Phase 1 (présélection SQL) → Phase 2 (tri sémantique) → Phase 3 (disponibilités). |

Hors périmètre de cette itération : LLM de justification/réévaluation des candidats (prévu plus tard,
voir §11), paiement.

### Principes non négociables

1. **Le backend décide de l'admissibilité.** La recherche sémantique ne fait que *classer* des tuteurs déjà admissibles. Elle ne peut jamais rendre visible ou réservable un tuteur suspendu, non validé, ou sans offre active.
2. **Seules les données validées alimentent l'index.** Profil d'un tuteur dont le dossier est approuvé, documents au statut `APPROVED` uniquement.
3. **Un embedding n'est pas une preuve.** La similarité mesure une proximité de sens, pas une compétence ni l'authenticité d'un document (voir §8).
4. **Aucun contenu de document n'est montré au Demandeur.** Les explications de match utilisent des libellés (« Expérience : Projet de fin d'études en cryptographie »), jamais le texte d'un CV ou d'un diplôme.
5. **Présélection inclusive, évaluation rigoureuse, preuves transparentes.** La Phase 1 n'exclut que ce qui est explicitement incompatible ; la Phase 2 juge la pertinence ; une mention « vérifié » n'est affichée que pour l'élément précis qu'EduLoc a réellement contrôlé (§13, décision 4).

---

## 1. Décisions techniques

| Sujet | Décision |
|---|---|
| Modèle | `embeddinggemma-2` via Ollama. Pour l'index de recherche (texte uniquement) : tag **`embeddinggemma-2:270m`** (texte seul, ~378 Mo). Le tag `740m`/`latest` (texte + image, ~1,3 Go) n'est nécessaire que pour le pré-contrôle d'images (§8, optionnel). |
| Dimension | **768** (dimension native). Les troncatures Matryoshka (512/256/128) ne sont pas utilisées en V1. Si un jour on tronque : re-normaliser L2 après troncature, et requêtes + documents doivent avoir la même dimension. |
| Précision | Si le modèle est un jour servi hors Ollama (sentence-transformers, vLLM…) : **bfloat16 ou float32, jamais float16** (le modèle renvoie des NaN ou des vecteurs dégradés en float16, sans erreur). |
| Fenêtre de contexte | 8 192 tokens par entrée (limite du modèle). Nos chunks font ≤ 500 tokens. |
| API Ollama | `POST {OLLAMA_URL}/api/embed` avec `{ "model": "...", "input": string \| string[] }` → `embeddings: number[][]`. Ne pas utiliser l'ancienne route `/api/embeddings`. Envoyer par lots (≤ 16 textes). |
| Préfixes de tâche (obligatoires) | **Document indexé** : `title: {titre} \| text: {contenu}` (`title: none` si pas de titre). **Requête** : `task: search result \| query: {requête}`. Les préfixes s'appliquent au texte seulement, jamais aux images. |
| Distance | Cosinus (`<=>` de pgvector). Similarité = `1 - distance`. |
| Stockage | Table dédiée `tutor_search_chunks` (plusieurs vecteurs par tuteur). |
| Index ANN | Aucun en V1 : la Phase 1 réduit les candidats, un scan exact est plus précis et suffisamment rapide. Ajouter un index HNSW (`vector_cosine_ops`) seulement si la table dépasse ~50 000 chunks, avec `SET hnsw.iterative_scan = relaxed_order` pour rester correct malgré le filtre. |
| Calcul asynchrone | Les embeddings ne sont **jamais** calculés dans la requête HTTP d'un tuteur. Réindexation via l'outbox existante (`OutboxEvent`, `eventType = 'TUTOR_SEARCH_REINDEX'`). |
| Cache | Embedding de requête mis en cache dans Redis : clé `emb:q:{sha256(model+texte)}`, TTL 24 h. |
| Configuration | `OLLAMA_URL`, `EMBEDDING_MODEL` (`embeddinggemma-2:270m`), `EMBEDDING_DIM` (768), poids et seuils de scoring (§6.4) en variables d'environnement / config NestJS. |
| Déploiement | **Docker Compose** : backend NestJS + Ollama dans un réseau privé, Ollama jamais exposé sur Internet, modèle téléchargé par un service d'initialisation. Détails en §14. |

---

## 2. Données utilisées

### 2.1 Côté tuteur (ce qui est vectorisé)

| Donnée | Source dans le schéma | Rôle |
|---|---|---|
| Niveau d'études | `TutorProfile.highestDegree` | **Filtre dur** (Phase 1) + contexte dans le chunk PROFILE |
| Intitulé du diplôme, domaine, spécialisation | **Nouveaux champs** `degreeTitle`, `fieldOfStudy`, `specialization`, `degreeInstitution` (§3.2) | Chunk PROFILE |
| Expériences académiques et professionnelles | `TutorExperience` (type, title, organization, period, description) | Un chunk EXPERIENCE par expérience |
| Matières et compétences | `TutorSubject` + `Subject.name` + `Subject.aliases` + `competenceDescription` | Un chunk SUBJECT par matière ; les niveaux déclarés servent de **filtre dur** (Phase 1) |
| Offres universitaires | `Offer.title` + `Offer.description` | Un chunk OFFER par offre active (texte souvent le plus riche) |
| Pièces justificatives validées | `TutorDocument` (CV, relevé de notes, diplôme, certificat, preuve pro) au statut `APPROVED` → texte extrait | Chunks DOCUMENT (§5.3) |

Non vectorisés : prix, format, durée, lieux, disponibilités, note (filtres SQL ou bonus numériques),
`bio` (texte marketing peu discriminant ; peut être ajouté plus tard au chunk PROFILE si les tests le justifient),
documents `IDENTITY` (jamais indexés).

### 2.2 Côté demande (ce qui est vectorisé à la volée)

Il n'existe pas de modèle « Demande » persistant : la demande est le corps de la requête de recherche.

```ts
// POST /matching/search
interface MatchingSearchDto {
  beneficiaryId: string;          // obligatoire : donne le niveau (educationLevelId)
  subjectId?: string;             // matière du catalogue, si choisie
  subjectText?: string;           // matière saisie librement (ex. « Analyse 2 »)
  needDescription: string;        // précision du besoin, 10 à 1 000 caractères, OBLIGATOIRE
  objective?: ObjectiveType;      // défaut : Beneficiary.objective
  format?: TeachingFormat;        // défaut : Beneficiary.preferredFormat
  limit?: number;                 // défaut 10, max 20
}
```

Règles : au moins un de `subjectId` / `subjectText` est requis. `educationLevelId` vient **toujours** du
bénéficiaire (le Demandeur ne choisit pas un autre niveau). Le bénéficiaire doit appartenir au Demandeur
connecté et ne pas être archivé.

---

## 3. Modifications du schéma Prisma

### 3.1 Extension pgvector (migration `--create-only`)

En **tête** de la migration (l'extension doit exister avant la création de la colonne `vector`) :

```sql
-- Supabase : l'extension s'installe dans le schéma "extensions"
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
```

Ajouter aussi une fonction de rang de diplôme utilisée par la Phase 1 :

```sql
CREATE OR REPLACE FUNCTION degree_rank(d text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE d
    WHEN 'BAC' THEN 1 WHEN 'LICENCE' THEN 2
    WHEN 'MASTER' THEN 3 WHEN 'DOCTORAT' THEN 4
    ELSE 0 END  -- OTHER / NULL : non admissible à l'université tant que l'admin n'a pas
                -- validé une équivalence (table degree_equivalences, §3.2 et §13 décision 2)
$$;
```

Valeurs de `EducationLevel.requiredDegree` à poser par seed / migration de données (§13, décision 1) :

```sql
UPDATE education_levels SET "requiredDegree" = 'LICENCE'
 WHERE category = 'Université' AND name IN ('L1', 'L2', 'L3');
UPDATE education_levels SET "requiredDegree" = 'MASTER'
 WHERE category = 'Université' AND name IN ('M1', 'M2');
```
(Adapter les `name` aux libellés réels du catalogue `education_levels`.)

### 3.2 Champs ajoutés

```prisma
enum TutorDocumentType {
  IDENTITY
  DIPLOMA
  CERTIFICATE
  PROFESSIONAL_PROOF
  CV          // nouveau
  TRANSCRIPT  // nouveau : relevé de notes (liste réelle des cours suivis = indice fort)
  OTHER
}

enum SearchChunkSource {
  PROFILE
  SUBJECT
  EXPERIENCE
  OFFER
  DOCUMENT
}

enum DegreeEquivalenceStatus {
  PENDING   // diplôme rencontré, pas encore tranché
  VALIDATED // équivalence retenue par EduLoc, réutilisable
  REJECTED  // aucune équivalence reconnue
}

/// Table administrable des équivalences de diplômes hors catégories principales (§13, décision 2).
/// Une équivalence validée une fois est réutilisée pour les tuteurs suivants qui déclarent le même diplôme.
model DegreeEquivalence {
  id               String                  @id @default(uuid())
  /// Intitulé du diplôme tel que déclaré (ex. « Diplôme d'ingénieur en informatique », « DUT Génie électrique »).
  degreeTitle      String
  /// Pays ou système éducatif (ex. « Madagascar », « France », « Maurice »).
  country          String
  /// Spécialité, si elle conditionne l'équivalence ("" sinon : pas de null, pour que l'unicité fonctionne).
  specialty        String                  @default("")
  /// Niveau retenu par EduLoc : BAC | LICENCE | MASTER | DOCTORAT. Null si REJECTED.
  equivalentDegree String?
  status           DegreeEquivalenceStatus @default(PENDING)
  notes            String?                 @db.Text
  validatedById    String?
  validatedBy      User?                   @relation("DegreeEquivalenceValidator", fields: [validatedById], references: [id], onDelete: SetNull)
  validatedAt      DateTime?
  createdAt        DateTime                @default(now())
  updatedAt        DateTime                @updatedAt

  tutorProfiles TutorProfile[]

  @@unique([degreeTitle, country, specialty])
  @@index([status])
  @@map("degree_equivalences")
}

model TutorProfile {
  // ... champs existants
  /// Si highestDegree = OTHER : équivalence appliquée par l'admin. À l'approbation, highestDegree
  /// reçoit equivalentDegree (valeur effective utilisée par la règle R3) ; le lien garde la trace de la décision.
  degreeEquivalenceId String?
  degreeEquivalence   DegreeEquivalence? @relation(fields: [degreeEquivalenceId], references: [id], onDelete: SetNull)
  /// Intitulé exact du diplôme le plus élevé (ex. « Master Informatique, parcours Sécurité des systèmes »).
  degreeTitle       String?
  /// Domaine d'études (ex. « Informatique », « Économie », « Mathématiques »).
  fieldOfStudy      String?
  /// Spécialisation, parcours ou sujet de mémoire.
  specialization    String?
  /// Établissement ayant délivré le diplôme le plus élevé.
  degreeInstitution String?
  /// Dernière réindexation réussie de la recherche sémantique.
  searchIndexedAt   DateTime?

  searchChunks TutorSearchChunk[]
}

model TutorDocument {
  // ... champs existants
  /// Texte extrait (PDF texte ou OCR). Jamais exposé au Demandeur.
  extractedText    String?          @db.Text
  extractionStatus TranscriptStatus @default(NONE) // réutilise NONE | PENDING | DONE | FAILED
  /// Pré-contrôle automatique INDICATIF pour l'admin (type détecté, champs extraits, incohérences). Jamais décisionnel.
  autoCheck        Json?
}

model Subject {
  // ... champs existants
  /// Synonymes et intitulés alternatifs (ex. « Algèbre 1 », « Algèbre linéaire L1 »). Inclus dans le chunk SUBJECT.
  aliases String[] @default([])
}

model Beneficiary {
  // ... champs existants
  /// Filière / parcours universitaire (ex. « Licence Informatique, parcours Génie logiciel »).
  studyProgram String?
  institution  String?

  matchingSearches MatchingSearch[]
}

/// Unité de texte indexée pour la recherche sémantique d'un tuteur.
model TutorSearchChunk {
  id             String       @id @default(uuid())
  tutorProfileId String
  tutorProfile   TutorProfile @relation(fields: [tutorProfileId], references: [id], onDelete: Cascade)

  sourceType SearchChunkSource
  /// Id de la source : tutorProfileId (PROFILE), subjectId (SUBJECT), TutorExperience.id, Offer.id, TutorDocument.id
  sourceId   String
  chunkIndex Int    @default(0)

  /// Libellé affichable pour expliquer un match. Jamais d'extrait de document.
  label       String
  /// Texte exact envoyé au modèle (préfixe inclus), données personnelles retirées.
  content     String  @db.Text
  /// sha256(embeddingModel + EMBEDDING_DIM + content) : ne recalculer que si ça change.
  contentHash String
  /// Dénormalisé pour le bonus « matière déclarée » (SUBJECT et OFFER).
  subjectId   String?

  /// Lecture / écriture via SQL brut uniquement.
  embedding      Unsupported("vector(768)")?
  embeddingModel String
  embeddedAt     DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tutorProfileId, sourceType, sourceId, chunkIndex])
  @@index([tutorProfileId])
  @@map("tutor_search_chunks")
}

/// Journal des recherches : sert à évaluer et calibrer le matching.
model MatchingSearch {
  id               String          @id @default(uuid())
  requesterId      String
  requester        User            @relation("RequesterMatchingSearches", fields: [requesterId], references: [id], onDelete: Cascade)
  beneficiaryId    String?
  beneficiary      Beneficiary?    @relation(fields: [beneficiaryId], references: [id], onDelete: SetNull)

  educationLevelId String
  subjectId        String?
  subjectText      String?
  needDescription  String          @db.Text
  objective        ObjectiveType?
  format           TeachingFormat?

  candidateCount   Int
  /// [{ tutorProfileId, rank, finalScore, bestSim, bestSource }]
  results          Json
  embeddingModel   String
  durationMs       Int?
  createdAt        DateTime        @default(now())

  bookings Booking[]

  @@index([requesterId, createdAt])
  @@map("matching_searches")
}

model Booking {
  // ... champs existants
  /// Recherche d'où vient la réservation (mesure de conversion du matching).
  matchingSearchId String?
  matchingSearch   MatchingSearch? @relation(fields: [matchingSearchId], references: [id], onDelete: SetNull)
}

// Dans User : ajouter
//   matchingSearches             MatchingSearch[]    @relation("RequesterMatchingSearches")
//   validatedDegreeEquivalences  DegreeEquivalence[] @relation("DegreeEquivalenceValidator")
```

Le formulaire tuteur (inscription / modification de profil) doit exposer `degreeTitle`, `fieldOfStudy`,
`specialization`, `degreeInstitution`, et le pays du diplôme lorsque `highestDegree = OTHER`.

Traitement d'un diplôme `OTHER` à la revue du dossier (§13, décision 2) :
1. L'écran admin cherche une `DegreeEquivalence` correspondant à (intitulé, pays, spécialité).
2. Trouvée et `VALIDATED` : l'admin l'applique ; `highestDegree` reçoit `equivalentDegree`.
3. Absente : l'admin la crée (examen manuel), la tranche (`VALIDATED` avec un niveau, ou `REJECTED`), puis l'applique. La décision est conservée et réutilisée.
4. Aucune équivalence en dur dans le code : pas de règle automatique du type « DUT = LICENCE » ou « ingénieur = MASTER ».

---

## 4. Machine d'indexation (quand réindexer)

Un tuteur est **réindexé entièrement** (opération idempotente) quand :

| Événement | Action |
|---|---|
| Dossier approuvé (`TutorApplication` → `APPROVED`) | Réindexation complète |
| Modification de profil (champs §2.1), d'une expérience, d'une matière, d'une offre | Réindexation (si le tuteur est approuvé) |
| Document passé à `APPROVED` (après extraction de texte) | Réindexation |
| Document rejeté ou supprimé | Réindexation (ses chunks disparaissent) |
| Tuteur suspendu | Rien : la Phase 1 l'exclut déjà. Les chunks sont conservés pour une éventuelle réactivation. |
| Suppression du compte | Cascade Prisma (`onDelete: Cascade`) |
| Changement de `EMBEDDING_MODEL` ou `EMBEDDING_DIM` | Script de réindexation globale (commande CLI) |

Mécanisme : dans la transaction métier, écrire un `OutboxEvent` `TUTOR_SEARCH_REINDEX`
(`aggregateType = 'TutorProfile'`, `aggregateId = tutorProfileId`). Le relay appelle
`SearchIndexService.reindexTutor(tutorProfileId)`. Plusieurs événements en attente pour un même tuteur
sont fusionnés (un seul traitement).

`reindexTutor` :
1. Construire la liste complète des chunks attendus (§5).
2. Pour chaque chunk, calculer `contentHash` ; ne demander à Ollama que les chunks nouveaux ou modifiés (lots de ≤ 16).
3. Dans une transaction : upsert des chunks, suppression des chunks qui ne sont plus attendus.
4. Mettre à jour `TutorProfile.searchIndexedAt`.
5. Si Ollama est indisponible : ne rien supprimer, garder les anciens chunks, laisser l'outbox réessayer (backoff existant).

---

## 5. Construction des chunks (le « chunking »)

### 5.1 Principe : découper par unité métier, pas par taille

On ne concatène **pas** tout le profil (et encore moins le CV entier) en un seul texte, même si les
8 192 tokens du modèle le permettraient. Un vecteur unique fait la moyenne de tout le profil : un tuteur
qui a *un* projet très précis en cryptographie noyé dans trois pages de développement web ressortirait mal
pour la requête « cryptographie asymétrique ». Avec un chunk par unité de sens, ce projet a son propre
vecteur et la requête le retrouve directement.

### 5.2 Gabarits des chunks structurés

Normalisation commune avant formatage : Unicode NFC, espaces multiples réduits, lignes vides supprimées,
champs vides omis (pas de « Spécialisation : null »). Texte conservé dans sa langue d'origine
(le modèle est multilingue).

**PROFILE** — 1 par tuteur, `sourceId = tutorProfileId`, `label = "Parcours académique"`
```
title: Parcours académique | text: Niveau d'études : Master. Diplôme : Master Informatique, parcours Sécurité des systèmes. Domaine : Informatique. Spécialisation : cryptographie appliquée, mémoire sur la gestion des clés. Établissement : Université de Fianarantsoa.
```

**SUBJECT** — 1 par matière déclarée (toutes les lignes `TutorSubject` d'une même matière regroupées),
`sourceId = subjectId`, `subjectId = subjectId`, `label = "Matière : {Subject.name}"`
```
title: Algèbre linéaire | text: Matière : Algèbre linéaire (aussi appelée : Algèbre 1, Algèbre linéaire L1). Niveaux enseignés : Licence 1, Licence 2. Compétences : espaces vectoriels, diagonalisation, réduction d'endomorphismes.
```
Si `competenceDescription` est vide, le chunk existe quand même (matière + niveaux).
Les matières non vérifiées (`isVerified = false`) sont indexées : seul un tuteur approuvé est indexé,
et l'approbation rend sa matière visible.

**EXPERIENCE** — 1 par `TutorExperience`, `sourceId = experience.id`,
`label = "Expérience académique : {title}"` ou `"Expérience professionnelle : {title}"`
```
title: Projet de fin d'études — implémentation de RSA | text: Expérience académique. Projet de fin d'études — implémentation de RSA, Université de Fianarantsoa, 2024. Conception et implémentation d'algorithmes de chiffrement asymétrique et de gestion des clés.
```

**OFFER** — 1 par offre active (`isActive` et `disabledByAdminAt IS NULL`) de niveau universitaire ou sans
niveau, `sourceId = offer.id`, `subjectId = offer.subjectId`, `label = "Offre : {title}"`
```
title: {offer.title} | text: Matière : {subject.name}. {offer.description}
```

### 5.3 Chunks DOCUMENT (CV, relevé de notes, diplôme, certificat, preuve pro)

Conditions : `status = APPROVED`, `type ≠ IDENTITY`, `extractionStatus = DONE`.

**Extraction du texte** (au moment de l'upload, en tâche de fond) :
- PDF texte : extraction directe (`pdfjs-dist` ou `pdf-parse`).
- PDF scanné ou image (JPG/PNG) : OCR (Tesseract avec les langues `fra` + `eng`, ou service OCR équivalent).
- Résultat stocké dans `TutorDocument.extractedText` ; `extractionStatus = DONE | FAILED`.

**Nettoyage** avant découpage :
- Retirer les données personnelles inutiles au matching : e-mails, numéros de téléphone, adresses postales, numéros d'identité / CIN, dates de naissance, numéros de diplôme (regex + liste noire).
- Retirer en-têtes et pieds de page répétés, numéros de page, lignes de moins de 3 caractères.

**Découpage** (sur le texte nettoyé) :
1. Découper d'abord sur les titres de section (lignes courtes en majuscules ou finissant par « : », ex. « EXPÉRIENCES », « FORMATION », « COMPÉTENCES », « PROJETS »).
2. Si une section dépasse la cible, la redécouper sur les paragraphes, puis sur les phrases.
3. **Cible : ~400 tokens par chunk, maximum 500** ; **chevauchement : ~15 %** (dernières phrases du chunk précédent) uniquement quand une section est coupée en plusieurs morceaux.
4. Estimation des tokens sans tokenizer : `Math.ceil(caractères / 3.5)` (texte français) ; garder une marge.
5. Plafonds : 10 chunks par document, 30 chunks DOCUMENT par tuteur (on garde les premiers).

Formatage : `title: {Type du document} — {titre de section} | text: {contenu}`, `sourceId = document.id`,
`chunkIndex` = position.

**Libellés (`label`) selon ce qui a réellement été contrôlé** (§13, décision 4). Le statut `APPROVED`
signifie que l'admin a accepté le document dans le dossier ; il ne vaut « vérifié » que pour les types dont
l'admin contrôle effectivement l'authenticité :

| Type | Ce que l'admin contrôle | `label` |
|---|---|---|
| `DIPLOMA` | Authenticité du diplôme | « Diplôme vérifié : {intitulé} » |
| `TRANSCRIPT` | Authenticité du relevé | « Relevé de notes vérifié » |
| `CERTIFICATE` | Authenticité du certificat | « Certificat vérifié : {intitulé} » |
| `PROFESSIONAL_PROOF` | La preuve de l'expérience | « Expérience vérifiée : {intitulé} » |
| `CV` | Cohérence avec le dossier, pas l'authenticité de chaque ligne | « Mentionné dans le CV » (jamais « vérifié ») |
| `OTHER` | Selon le cas | « Pièce jointe au dossier » (jamais « vérifié ») |

Le libellé porte sur **l'élément précis** contrôlé ; il ne doit jamais laisser entendre que tout le profil
est vérifié. Le contrôle humain est fait au moment de l'approbation (`TutorDocument.status`) : l'écran admin
doit le rappeler (« approuver ce diplôme = attester de son authenticité »).

---

## 6. Recherche

### 6.1 Vue d'ensemble

```
MatchingSearchDto
  → Validation (bénéficiaire du Demandeur, niveau universitaire, besoin 10–1000 car.)
  → Phase 1 : présélection SQL déterministe         → liste de tutorProfileId candidats
  → Phase 2 : tri sémantique (pgvector) + scoring   → top K classé + explications
  → Phase 3 : disponibilités réelles du top K       → prochains créneaux libres
  → Journal MatchingSearch                          → réponse
```

Si le niveau du bénéficiaire n'est **pas** universitaire, l'endpoint renvoie la recherche classique
existante (règles déterministes), sans Phase 2.

### 6.2 Phase 1 — Présélection déterministe (aucune IA)

Un tuteur est candidat si **toutes** les conditions sont vraies :

| # | Règle | Champs |
|---|---|---|
| R1 | Profil visible et non suspendu | `TutorProfile.isVisible = true`, `suspendedAt IS NULL` (`isVisible` est maintenu dans la transaction d'approbation/suspension : c'est la source de vérité) |
| R2 | Compte actif | `User.status = 'ACTIVE'`, `deletedAt IS NULL` |
| R3 | Diplôme suffisant pour le niveau | `degree_rank(highestDegree) >= degree_rank(EducationLevel.requiredDegree)` |
| R4 | A déclaré enseigner **ce niveau** (au moins une matière) | `EXISTS TutorSubject` avec `educationLevelId = niveau du bénéficiaire` |
| R5 | A au moins une offre active compatible | `Offer.isActive`, `disabledByAdminAt IS NULL`, `educationLevelId = niveau` ou `NULL`, format compatible (ci-dessous) |
| R6 | Est indexé | `EXISTS TutorSearchChunk` avec `embeddingModel = EMBEDDING_MODEL` et `embedding IS NOT NULL` |
| R7 | (si format présentiel demandé et bénéficiaire géolocalisé) Lieu compatible | `Place` actif dans le rayon (PostGIS `ST_DWithin`) — optionnel en V1 |

Compatibilité de format : demande `ONLINE` → offre `ONLINE` ou `BOTH` ; demande `IN_PERSON` → offre
`IN_PERSON` ou `BOTH` ; demande `BOTH` ou absente → toute offre.

**Sens de R3** (§13, décision 1) : `requiredDegree` est un critère d'**admissibilité** uniquement. Un
diplôme plus élevé n'apporte aucun point dans le classement (il n'entre pas dans le score §6.4).

**Sens de R5 pour une offre « sans niveau »** (§13, décision 3) : `educationLevelId = NULL` veut dire que
l'offre n'est pas limitée à un niveau, donc qu'elle n'est pas *incompatible* avec le niveau demandé. Elle
rend le tuteur admissible, rien de plus. Elle ne prouve pas qu'il sait enseigner ce sujet précis à ce
niveau : c'est la Phase 2 qui en juge, sur l'ensemble de ses chunks (une offre générale en programmation
ne remontera pas pour « cryptographie avancée L3 » si rien d'autre dans le profil ne s'en approche). R4
reste exigée en parallèle : le tuteur doit avoir déclaré ce niveau pour au moins une matière.

La **matière n'est pas un filtre dur** à l'université : c'est justement le rôle de la Phase 2 de
rapprocher « Analyse 2 » d'un tuteur qui a déclaré « Mathématiques — calcul intégral ». Elle sert de bonus (§6.4).

SQL indicatif (via `Prisma.sql`, paramètres liés) :

```sql
SELECT tp.id
FROM tutor_profiles tp
JOIN users u ON u.id = tp."userId"
JOIN education_levels el ON el.id = ${levelId}
WHERE tp."isVisible" = true
  AND tp."suspendedAt" IS NULL
  AND u.status = 'ACTIVE' AND u."deletedAt" IS NULL
  AND degree_rank(tp."highestDegree") >= degree_rank(el."requiredDegree")
  AND EXISTS (SELECT 1 FROM tutor_subjects ts
              WHERE ts."tutorProfileId" = tp.id AND ts."educationLevelId" = ${levelId})
  AND EXISTS (SELECT 1 FROM offers o
              WHERE o."tutorProfileId" = tp.id AND o."isActive" AND o."disabledByAdminAt" IS NULL
                AND (o."educationLevelId" = ${levelId} OR o."educationLevelId" IS NULL)
                AND o.format = ANY(${allowedFormats}::"TeachingFormat"[]))
  AND EXISTS (SELECT 1 FROM tutor_search_chunks c
              WHERE c."tutorProfileId" = tp.id AND c."embeddingModel" = ${model}
                AND c.embedding IS NOT NULL);
```

Si 0 candidat : réponse vide avec `reason` (`NO_TUTOR_FOR_LEVEL`, `NO_TUTOR_FOR_FORMAT`…) pour que
l'application propose d'élargir (ex. passer en ligne). Ne pas assouplir les règles automatiquement.

### 6.3 Phase 2 — Tri sémantique

**1. Texte de la requête** (champs vides omis) :
```
task: search result | query: Matière : {subject.name ou subjectText}. Niveau : {niveau}. Filière : {studyProgram}. Besoin : {needDescription}. Objectif : {objectif en clair}.
```
`needDescription` est conservée telle quelle (pas de reformulation). Embedding → cache Redis (§1).

**2. Similarités par chunk, restreintes aux candidats** (scan exact) :
```sql
WITH scored AS (
  SELECT c."tutorProfileId", c."sourceType", c."sourceId", c.label, c."subjectId",
         1 - (c.embedding <=> ${queryVector}::vector) AS sim
  FROM tutor_search_chunks c
  WHERE c."tutorProfileId" = ANY(${candidateIds}::text[])
    AND c."embeddingModel" = ${model}
    AND c.embedding IS NOT NULL
)
SELECT DISTINCT ON ("tutorProfileId", "sourceType") *
FROM scored
ORDER BY "tutorProfileId", "sourceType", sim DESC;
```
Le vecteur est passé sous forme de chaîne `'[0.12,-0.03,...]'` (`JSON.stringify(vector)`).

Le résultat donne, pour chaque candidat, **la meilleure similarité par type de source**.
Le score final est calculé en TypeScript (fonction pure, testée unitairement).

### 6.4 Scoring (valeurs initiales, à calibrer — §10)

```
bestSim       = max des similarités, toutes sources confondues
corroboration = nombre de sources distinctes dont sim ≥ bestSim − 0.10, moins 1   (0 à 4)
subjectBonus  = 0.03 si subjectId demandé ∈ matières déclarées du tuteur (chunk SUBJECT ou OFFER avec ce subjectId)
ratingBonus   = 0.02 × noteBayésienne / 5
                noteBayésienne = (rating × reviewsCount + 3.5 × 5) / (reviewsCount + 5)

finalScore = bestSim + 0.02 × corroboration + subjectBonus + ratingBonus
```

- `bestSim` domine volontairement : le meilleur indice direct compte le plus.
- La corroboration récompense un tuteur dont plusieurs éléments indépendants (matière déclarée **et** expérience **et** document) pointent vers le besoin.
- Les bonus sont faibles pour ne jamais faire passer un tuteur bien noté mais hors sujet devant un tuteur pertinent.
- Le niveau de diplôme n'entre pas dans le score : il ne sert qu'à l'admissibilité (R3).
- Filtre de pertinence **relatif** : garder les candidats avec `finalScore ≥ meilleurScore − 0.15`, puis les `limit` premiers. Ne pas utiliser de seuil absolu tant qu'il n'a pas été calibré.
- Tous les coefficients sont en configuration.

**Explications renvoyées** : pour chaque tuteur, les 2 meilleurs `label` (ex. « Expérience académique :
Projet de fin d'études — implémentation de RSA », « Matière : Algèbre linéaire »). Le score numérique
n'est pas affiché au Demandeur (usage interne / admin).

### 6.5 Phase 3 — Disponibilités

Pour le top K seulement : calculer les 3 prochains créneaux libres sur 14 jours (règles `Availability`
actives, moins `BlockedPeriod` et `Booking` `PENDING`/`CONFIRMED`/`IN_PROGRESS`, fuseau du tuteur).
Un tuteur sans créneau reste listé avec `nextSlots: []` et un indicateur « pas de créneau proche »
(il ne disparaît pas : le Demandeur peut le contacter). Le contrôle final de réservabilité reste celui du
module de réservation existant.

### 6.6 Réponse

```ts
interface MatchingSearchResponse {
  searchId: string;
  results: Array<{
    tutorProfileId: string;
    displayName: string;
    profilePhoto: string | null;
    rating: number;
    reviewsCount: number;
    matchReasons: string[];          // labels (§5.2, §5.3), jamais de contenu de document ; « vérifié » seulement selon §5.3
    offers: Array<{ id: string; title: string; price: string; currency: string; format: TeachingFormat }>;
    nextSlots: Array<{ startAt: string; endAt: string }>;
  }>;
  reason?: 'NO_TUTOR_FOR_LEVEL' | 'NO_TUTOR_FOR_FORMAT' | 'NO_RELEVANT_TUTOR';
}
```

Chaque recherche est journalisée dans `MatchingSearch`. Une réservation créée depuis un résultat porte
`matchingSearchId`.

---

## 7. Module NestJS

```
src/matching/
  matching.module.ts
  embedding/ollama-embedding.service.ts   // client /api/embed, lots, retries, timeout, normalisation L2 de sécurité
  indexing/chunk-builder.service.ts       // §5 : fonctions pures construisant les chunks
  indexing/document-text.service.ts       // extraction PDF / OCR + nettoyage PII
  indexing/search-index.service.ts        // reindexTutor(), réindexation globale
  search/preselection.repository.ts       // §6.2 (SQL brut)
  search/semantic-ranking.repository.ts   // §6.3 (SQL brut)
  search/scoring.ts                       // §6.4 (fonction pure)
  search/matching-search.service.ts       // orchestration Phases 1→3 + journal
  matching.controller.ts                  // POST /matching/search
  cli/reindex-all.command.ts              // réindexation globale
```

`OllamaEmbeddingService` : timeout 10 s, 2 retries, vérifie que chaque vecteur a `EMBEDDING_DIM`
valeurs et ne contient pas de `NaN` (sinon erreur, pas d'écriture).

Au démarrage (`onModuleInit`), le service appelle `GET {OLLAMA_URL}/api/tags` et vérifie que
`EMBEDDING_MODEL` est présent. S'il manque ou si Ollama ne répond pas, le backend **démarre quand même**
(le reste de l'application ne dépend pas d'Ollama) mais journalise une erreur et marque le matching comme
indisponible : `POST /matching/search` renvoie alors `503` avec le code `MATCHING_UNAVAILABLE`, et les
réindexations restent en attente dans l'outbox. Le service ne déclenche **jamais** lui-même un
téléchargement de modèle (c'est le rôle du service `ollama-init`, §14).

---

## 8. Documents justificatifs et multimodalité : ce que l'embedding peut et ne peut pas faire

EmbeddingGemma 2 accepte texte, images, vidéo et audio dans un même espace vectoriel. Côté Ollama, la
page du modèle annonce **texte et image** pour les tags `440m` et `740m` ; l'audio n'y est pas indiqué
(à vérifier avant tout usage).

**Ce qu'il NE peut PAS faire : vérifier qu'un tuteur possède réellement un diplôme.**
Un embedding résume « de quoi parle » une image. Il ne lit pas de façon fiable le nom du titulaire,
l'intitulé exact ou l'année, et il ne détecte pas un faux. Une photo de faux diplôme de Master aura un
vecteur très proche d'un vrai. La vérification reste **une décision humaine de l'admin** (flux
`TutorApplication` existant).

**Ce qu'on peut automatiser pour aider l'admin (indicatif, stocké dans `TutorDocument.autoCheck`)** :

| Contrôle | Méthode | Usage |
|---|---|---|
| Le fichier ressemble-t-il au type déclaré ? | Embedding de l'image (tag `740m`) comparé aux embeddings de libellés (« diplôme universitaire », « relevé de notes », « carte d'identité », « certificat de formation », « photo sans rapport ») avec le préfixe `task: classification \| query: …` pour les libellés ; on retient le libellé le plus proche (classement relatif, car les scores entre modalités différentes ne sont pas calibrés entre eux) | Alerte admin : « déclaré DIPLOMA, ressemble à une photo sans rapport » |
| Champs du diplôme | OCR (§5.3) puis extraction par règles / regex : nom, intitulé, établissement, année | Pré-remplissage de la fiche de revue admin |
| Cohérence | Nom extrait vs `User.lastName` ; niveau de l'intitulé (Licence/Master/Doctorat) vs `highestDegree` déclaré | Alerte admin « incohérence possible », jamais rejet automatique |

Règles :
- Les embeddings d'images ne vont **pas** dans `tutor_search_chunks` : la recherche est texte ↔ texte.
- Les documents `IDENTITY` ne sont ni OCRisés pour le matching, ni indexés.
- Ce pré-contrôle est optionnel en V1 (lot 6 du plan, §12).

---

## 9. Sécurité et données personnelles

- `tutor_search_chunks.content` et `extractedText` : jamais renvoyés par une API publique ; accessibles à l'admin uniquement.
- PII retirées avant embedding (§5.3) : elles n'apportent rien au matching.
- Tout est calculé sur l'infrastructure EduLoc (Ollama auto-hébergé) : aucun document n'est envoyé à un service tiers.
- **Ollama n'a aucune authentification** : quiconque atteint son port peut l'utiliser, télécharger ou supprimer des modèles. Il ne doit donc jamais être publié sur Internet ; seul le backend le joint, par le réseau Docker privé (§14).
- Rate limit sur `POST /matching/search` (ex. 30 / min / utilisateur) : chaque appel déclenche un embedding.
- Suppression de compte : cascade sur chunks et journaux.

---

## 10. Tests et calibration

**Tests unitaires** : chaque gabarit de chunk, le nettoyage PII, le découpage (tailles, chevauchement,
plafonds), `scoring.ts`, la compatibilité de format, `degree_rank`.

**Tests d'intégration** (base de test avec pgvector) : chaque règle R1–R6 exclut bien le tuteur concerné ;
un tuteur suspendu n'apparaît jamais même avec une similarité parfaite ; une modification d'expérience
déclenche une réindexation et seuls les chunks modifiés sont recalculés (hash).

**Jeu d'évaluation** (avant mise en production) : 30 à 50 demandes universitaires réalistes, chacune
annotée avec les tuteurs pertinents (par toi ou l'équipe). Mesurer recall@10 et nDCG@10. Calibrer les
coefficients de §6.4 et décider d'un éventuel seuil absolu à partir de ces mesures, puis à partir de
`MatchingSearch` (clics, réservations) une fois en production.

---

## 11. Améliorations prévues (hors V1)

1. **Recherche hybride lexicale + sémantique** : index plein texte PostgreSQL (`to_tsvector('french', content)`) sur les chunks, fusion des deux classements par Reciprocal Rank Fusion. Utile pour les sigles et termes exacts (« RSA », « UML », « SQL », « IS-LM ») que l'embedding peut sous-pondérer.
2. **Référentiel de matières universitaires** : enrichir `Subject.aliases` et ajouter des notions par matière, pour mieux rapprocher les intitulés qui varient d'une université à l'autre.
3. **LLM de justification** (Phase 2 bis) : sur le top 5 uniquement, produire une explication courte et les lacunes identifiées, à partir des chunks déjà trouvés. Le backend garde la main sur l'admissibilité.
4. **Recherche vocale** : l'application est orientée vocal ; transcrire la demande (speech-to-text) puis la traiter comme `needDescription`. Préférer la transcription à l'embedding audio direct (texte vérifiable, journalisable).
5. **Recommandations sans recherche** : vecteur du bénéficiaire (filière + notes) pour proposer des tuteurs dès l'accueil.
6. **Index HNSW** quand le volume le justifie (§1).

---

## 12. Plan d'implémentation (un lot = une étape validable)

| Lot | Contenu | Critère d'acceptation |
|---|---|---|
| 1 | Migration : extension vector, `degree_rank`, valeurs `requiredDegree` universitaires (§3.1), champs §3.2, modèles `TutorSearchChunk`, `MatchingSearch` et `DegreeEquivalence` ; formulaire/API tuteur pour les nouveaux champs de profil ; API admin des équivalences (liste, création, validation, application à un dossier) | `prisma migrate dev` passe ; les nouveaux champs sont éditables par le tuteur ; une équivalence validée est réutilisée pour un second tuteur au même diplôme |
| 2 | Docker (§14) : `Dockerfile` du backend, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example` ; `OllamaEmbeddingService` + config + vérification au démarrage | `docker compose up` télécharge le modèle puis démarre l'API ; test : un texte → 768 valeurs, sans NaN ; Ollama arrêté → `503 MATCHING_UNAVAILABLE`, le reste de l'API fonctionne ; le port 11434 n'est pas joignable depuis l'extérieur de la machine |
| 3 | `ChunkBuilderService` (PROFILE, SUBJECT, EXPERIENCE, OFFER) + `SearchIndexService.reindexTutor` + événement outbox + CLI de réindexation globale | Tests unitaires des gabarits ; réindexation idempotente ; hash respecté |
| 4 | Phase 1 + Phase 2 + scoring + endpoint + journal `MatchingSearch` | Tests R1–R6 ; un tuteur suspendu n'apparaît jamais ; réponse au format §6.6 |
| 5 | Phase 3 (disponibilités du top K) | Créneaux cohérents avec réservations et périodes bloquées |
| 6 | Documents : extraction texte (PDF + OCR, Tesseract ajouté à l'image Docker du backend, §14.5), nettoyage PII, chunks DOCUMENT ; pré-contrôle `autoCheck` optionnel | Un CV approuvé produit des chunks ; un document `IDENTITY` n'en produit jamais |
| 7 | Jeu d'évaluation + script de mesure recall@10 / nDCG@10 | Rapport de mesure avec les coefficients actuels |

---

## 13. Décisions produit

Ligne directrice : présélection **inclusive** (ne pas exclure inutilement des personnes compétentes),
évaluation **rigoureuse** des compétences, preuves **transparentes** (ne jamais induire le Demandeur en
erreur sur les qualifications d'un tuteur). Trois notions restent séparées : le niveau d'études minimum
(admissibilité), la pertinence pour la matière (Phase 2) et les preuves affichées (libellés §5.3).

### Décision 1 — Diplôme minimum par niveau (`EducationLevel.requiredDegree`)

| Niveau demandé | Diplôme minimum |
|---|---|
| L1, L2, L3 | `LICENCE` |
| M1, M2 | `MASTER` |

- C'est un critère d'admissibilité (R3), jamais un score : un diplôme supérieur ne fait pas monter un tuteur dans le classement.
- Il évite qu'un tuteur soit admissible seulement parce que son diplôme « parle » de la bonne discipline sans avoir le niveau attendu.
- Mise en œuvre : §3.1 (valeurs posées en migration), §6.2 (R3), §6.4.

### Décision 2 — Diplômes `OTHER` : table d'équivalences administrable

- Pas d'équivalence codée en dur (ni « DUT = LICENCE », ni « ingénieur = MASTER ») : le niveau dépend du diplôme précis, du pays et du parcours.
- Table `DegreeEquivalence` (§3.2) : intitulé, pays / système éducatif, spécialité, niveau retenu, statut, auteur et date de la validation.
- L'admin valide au cas par cas ; la décision est conservée et réutilisée pour les dossiers suivants au même diplôme.

| Diplôme déclaré | Traitement |
|---|---|
| Diplôme d'ingénieur | Équivalence à déterminer selon le diplôme et le parcours |
| DUT / BTS | Évaluer le niveau reconnu et la spécialité ; pas d'assimilation automatique à une licence |
| Diplôme étranger | Vérification du niveau et de l'équivalence par l'administration |
| Autre diplôme | Examen manuel si aucune correspondance n'existe |

Tant qu'aucune équivalence n'est appliquée, un diplôme `OTHER` a le rang 0 (non admissible à l'université).

### Décision 3 — Offre « sans niveau » : acceptée, sous conditions

- R5 est conservée : une offre sans niveau rend le tuteur **admissible** car elle n'est pas explicitement incompatible.
- Elle ne vaut **pas** preuve de compétence : la pertinence est jugée en Phase 2 sur la spécialisation, les expériences et les compétences.
- R4 (niveau déclaré pour au moins une matière) et R3 (diplôme minimum) restent exigées.
- Mise en œuvre : §6.2.

### Décision 4 — Mention « vérifié » affichée au Demandeur

- Affichée **uniquement** pour un élément réellement contrôlé par EduLoc, et en nommant cet élément (« Diplôme vérifié », « Expérience vérifiée »), jamais un « profil vérifié » global.
- Un document fourni mais non contrôlé, ou un document utilisé par le matching sans contrôle d'authenticité (CV), ne porte jamais la mention.
- La proximité sémantique d'un document avec une demande n'est pas une vérification.
- Mise en œuvre : libellés §5.3, réponse §6.6.

### Points encore ouverts

1. **Étudiants en cours de formation** : le diplôme minimum doit-il être *obtenu*, ou un étudiant inscrit dans le niveau correspondant peut-il être admissible ? Avec la décision 1 telle quelle, un étudiant de M1 (Licence obtenue) peut enseigner jusqu'en L3, mais un étudiant de L3 sans Licence obtenue ne peut enseigner aucun niveau universitaire. Si EduLoc veut ouvrir le tutorat aux étudiants avancés, il faudra distinguer « diplôme obtenu » et « niveau en cours » (nouveau champ, preuve d'inscription, règle R3 adaptée).
2. **Niveaux doctoraux** : faut-il un `requiredDegree = DOCTORAT` pour un accompagnement en doctorat, ou laisser `MASTER` ?
3. **Écran admin** : formuler explicitement, au moment d'approuver un document, que l'approbation d'un diplôme, d'un relevé, d'un certificat ou d'une preuve d'expérience atteste son authenticité (condition de la décision 4).
4. **Hébergeur de production** : choisir la plateforme (VPS en Europe de l'Ouest, ou PaaS acceptant un service privé avec volume persistant) selon les exigences de §14.6.

---

## 14. Déploiement avec Docker

### 14.1 Architecture

```
                Internet
                   │  HTTPS (reverse proxy / plateforme)
                   ▼
        ┌──────────────────────┐        réseau Docker privé « eduloc »
        │  api (NestJS)        │ ─────────────────────────────┐
        │  port 3000           │                              ▼
        └──────────┬───────────┘                   ┌────────────────────┐
                   │                               │ ollama             │
                   │ TLS                           │ port 11434 interne │
                   ▼                               │ volume ollama_models│
        Supabase (Postgres + pgvector)             └────────────────────┘
        Upstash Redis                                       ▲
                                                            │ une fois au démarrage
                                                   ┌────────────────────┐
                                                   │ ollama-init        │
                                                   │ « ollama pull »    │
                                                   └────────────────────┘
```

- La base reste sur **Supabase** et Redis sur **Upstash** : ils ne sont pas conteneurisés en production.
- Seule l'API est publiée. Ollama n'a **pas** de section `ports` : il n'est joignable que par l'API, via le nom de service `ollama` sur le réseau privé (§9 : Ollama n'a pas d'authentification).
- Le modèle est stocké dans un volume nommé : il est téléchargé une fois et survit aux redémarrages et mises à jour des conteneurs.

### 14.2 `docker-compose.yml` (production)

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    env_file: .env                      # DATABASE_URL (Supabase), REDIS_URL (Upstash), secrets…
    environment:
      OLLAMA_URL: http://ollama:11434   # nom du service sur le réseau privé
      EMBEDDING_MODEL: embeddinggemma-2:270m
      EMBEDDING_DIM: "768"
    ports:
      - "3000:3000"                     # derrière le reverse proxy HTTPS
    depends_on:
      ollama-init:
        condition: service_completed_successfully
    restart: unless-stopped
    networks: [eduloc]

  ollama:
    image: ollama/ollama:${OLLAMA_VERSION}   # version épinglée, jamais "latest"
    volumes:
      - ollama_models:/root/.ollama
    environment:
      OLLAMA_KEEP_ALIVE: "-1"           # garde le modèle en mémoire : pas de latence de rechargement
    # Pas de "ports" : Ollama n'est pas publié hors du réseau Docker.
    healthcheck:
      test: ["CMD", "ollama", "list"]
      interval: 10s
      timeout: 5s
      retries: 12
    deploy:
      resources:
        limits:
          memory: 2g                    # à ajuster après mesure (§14.6)
    restart: unless-stopped
    networks: [eduloc]

  ollama-init:
    image: ollama/ollama:${OLLAMA_VERSION}
    environment:
      OLLAMA_HOST: http://ollama:11434  # le CLI pilote le serveur du service "ollama"
    entrypoint: ["ollama", "pull", "embeddinggemma-2:270m"]
    depends_on:
      ollama:
        condition: service_healthy
    restart: "no"                       # tâche ponctuelle ; idempotente si le modèle est déjà là
    networks: [eduloc]

volumes:
  ollama_models:

networks:
  eduloc:
    driver: bridge
```

Points importants :
- **`ollama pull`, pas `ollama run`** : `run` ouvre une session interactive de génération, inutile pour un modèle d'embedding. `pull` télécharge seulement.
- **Tag précis** `embeddinggemma-2:270m` (texte seul, ~378 Mo) : c'est le modèle de l'index (§1). Sans tag, Ollama prend `latest`, la version multimodale de ~1,3 Go.
- **`OLLAMA_VERSION` épinglée** dans `.env` : choisir une version récente qui prend en charge `embeddinggemma-2` (modèle publié en octobre 2026) et la faire évoluer volontairement. `latest` peut changer le comportement sans prévenir.
- **Pas de clé `version:`** en tête du fichier : elle est obsolète avec Docker Compose v2.
- Si le pré-contrôle d'images (§8, lot 6) est activé plus tard : ajouter une seconde ligne de `pull` pour `embeddinggemma-2:740m` et réévaluer la mémoire.

### 14.3 `docker-compose.dev.yml` (développement local)

Utilisé avec `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`.

```yaml
services:
  ollama:
    ports:
      - "127.0.0.1:11434:11434"   # accessible depuis ta machine seulement, pour tester avec curl

  db-test:
    image: pgvector/pgvector:pg17   # base jetable avec pgvector pour les tests d'intégration (§10)
    environment:
      POSTGRES_USER: eduloc
      POSTGRES_PASSWORD: eduloc
      POSTGRES_DB: eduloc_test
    ports:
      - "127.0.0.1:5433:5432"
    tmpfs:
      - /var/lib/postgresql/data    # données en mémoire : remise à zéro à chaque démarrage
    networks: [eduloc]
```

- La liaison sur `127.0.0.1` évite d'exposer Ollama et la base de test au réseau local.
- Les tests d'intégration utilisent `db-test` (avec les migrations Prisma et l'extension `vector`), jamais la base Supabase.
- Test rapide d'Ollama depuis ta machine :
  ```bash
  curl http://127.0.0.1:11434/api/embed -d '{"model":"embeddinggemma-2:270m","input":"task: search result | query: diagonalisation de matrices"}'
  ```
  La réponse doit contenir `embeddings` avec un tableau de 768 nombres.

### 14.4 Variables d'environnement (`.env.example`)

```dotenv
# Base et cache (services managés)
DATABASE_URL=postgresql://...supabase...
DIRECT_URL=postgresql://...supabase...   # si utilisé par les migrations Prisma
REDIS_URL=rediss://...upstash...

# Embeddings
OLLAMA_VERSION=x.y.z                     # version épinglée de l'image ollama/ollama
EMBEDDING_MODEL=embeddinggemma-2:270m
EMBEDDING_DIM=768
# OLLAMA_URL est fixé dans docker-compose.yml (http://ollama:11434)
```

`.env` n'est jamais versionné ; seul `.env.example` l'est.

### 14.5 Image Docker du backend

- Build multi-étapes : étape `build` (installation des dépendances, `prisma generate`, compilation NestJS), étape finale `node:<LTS>-slim` avec uniquement `dist/`, `node_modules` de production et le client Prisma généré.
- Exécuter le processus avec l'utilisateur non root `node`.
- **Migrations** : ne pas lancer `prisma migrate deploy` à chaque démarrage de conteneur. Les exécuter comme une étape de déploiement distincte (commande ponctuelle `docker compose run --rm api npx prisma migrate deploy`, ou étape de la CI), avant de démarrer la nouvelle version.
- **Lot 6 (OCR)** : ajouter `tesseract-ocr`, `tesseract-ocr-fra` et `tesseract-ocr-eng` (paquets `apt`) dans l'étape finale, ou placer l'OCR dans un conteneur dédié si l'image du backend devient trop lourde.
- `HEALTHCHECK` sur une route `GET /health` qui répond même si Ollama est indisponible (la disponibilité du matching est un état distinct, exposé dans la réponse : `{ "status": "ok", "matching": "available" | "unavailable" }`).

### 14.6 Exigences pour l'hébergement

| Exigence | Raison |
|---|---|
| Région Europe de l'Ouest | Cohérent avec l'hébergement prévu pour EduLoc et la base Supabase |
| Service Ollama **privé** (non publié) | Ollama n'a pas d'authentification (§9) |
| **Volume persistant** pour `/root/.ollama` | Sinon le modèle est retéléchargé à chaque redéploiement |
| Mémoire : prévoir **au moins 1 à 2 Go** pour le conteneur Ollama | Le modèle texte pèse ~378 Mo sur disque ; la consommation réelle en mémoire est à mesurer en charge avant de fixer la limite |
| CPU suffisant ; GPU **non nécessaire** en V1 | Le modèle texte est petit ; les volumes (quelques chunks par tuteur, une requête par recherche) restent faibles |

GPU (seulement si un jour on vectorise de gros volumes d'un coup, par exemple une réindexation globale
de milliers de documents) : installer le NVIDIA Container Toolkit sur l'hôte et ajouter au service `ollama` :

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

### 14.7 Procédure de déploiement

1. `docker compose pull` puis `docker compose build api`.
2. Migrations : `docker compose run --rm api npx prisma migrate deploy`.
3. `docker compose up -d` : `ollama` démarre, `ollama-init` télécharge le modèle s'il manque puis s'arrête, l'`api` démarre ensuite.
4. Vérifier `GET /health` → `"matching": "available"`.
5. Au premier déploiement ou après un changement de modèle : lancer la réindexation globale (`cli/reindex-all.command.ts`, §7).
