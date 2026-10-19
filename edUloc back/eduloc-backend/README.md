# EduLoc V2 — Backend API

Monolithe modulaire NestJS · Prisma 7 · PostgreSQL + PostGIS · Supabase Storage ·
Centrifugo · Upstash/Redis · LiveKit (ADR-06 : remplace Stream Video) · FCM.

## Démarrage rapide (local)

```bash
cp .env.example .env
docker compose up -d db pgadmin redis centrifugo livekit
npm install
npx prisma migrate dev --name init   # coller prisma/sql/001_constraints.sql dans la migration créée
npx prisma generate
npm run start:dev
```

Swagger : http://localhost:3000/docs

pgAdmin : http://localhost:5050 (identifiants définis par `PGADMIN_DEFAULT_EMAIL`
et `PGADMIN_DEFAULT_PASSWORD` dans `.env`). Le serveur PostgreSQL du Compose est
préconfiguré dans pgAdmin sous le nom **EduLoc PostgreSQL**. Ces identifiants par
défaut sont réservés au développement local.

Les e-mails de vérification d’adresse et de réinitialisation du mot de passe sont envoyés
par Resend depuis l’outbox. Configurez `RESEND_API_KEY` et `MAIL_FROM` dans `.env`.
L’e-mail contient le jeton à copier dans l’écran de vérification de l’application.
`MAIL_FROM` accepte une adresse seule ou un expéditeur au format `EduLoc <adresse@domaine.com>`.

## Architecture

- **Controllers** : validation DTO (`class-validator`), guards, aucune logique métier.
- **Application Services** : une transaction par use case, orchestration, écriture outbox.
- **Domaine pur** (`src/modules/*/domain`) : `BookingStateMachine`, `SlotPolicy`,
  `CommunicationPolicy`, `SessionPolicy`, `BookingPolicy` — testables sans base.
- **Repositories** : requêtes Prisma / SQL brut PostGIS, `TransactionClient` propagé.
- **Ports / Adaptateurs** (`src/infrastructure`) : Centrifugo, LiveKit, Supabase
  Storage, FCM, Redis. Remplaçables sans toucher au métier.

## Règles structurantes (attachment — priorité absolue)

1. **Zéro texte utilisateur** : seuls `VOICE`, `DOCUMENT`, `SYSTEM`, `CALL_EVENT`.
2. **Les fichiers ne traversent jamais NestJS** : URL d'upload signées Supabase Storage,
   métadonnées transitoires dans Redis (`upload:{uploadId}`, TTL 15 min).
3. **Outbox transactionnelle** : aucun événement temps réel / externe dans le service
   métier ; tout passe par `outbox_events`, publié par le relay (SKIP LOCKED).
4. **Concurrence** : `pg_advisory_xact_lock` par tuteur + contrainte d'exclusion SQL.
5. **Pas de blocage PENDING** : premier tuteur qui accepte valide ; auto-refus SYSTEM
   des PENDING chevauchantes.
6. **Prévenance** : réservation ≥ 2 h ; annulation gratuite ≥ 24 h (sinon justification).
7. **Appels LiveKit** uniquement sur réservation `CONFIRMED`/`IN_PROGRESS`.
8. **Conservation des médias** : 12 mois après la fin de la séance (job planifié).

## Candidature tuteur

Une candidature est rattachée à un compte utilisateur existant et authentifié. `POST` ou
`PATCH /tutor-applications` enregistre le profil, les expériences détaillées, matières,
offres, lieux et disponibilités en brouillon. Les justificatifs et la vidéo sont envoyés
directement vers Supabase Storage via les routes `/tutor-applications/:id/documents/uploads`
et `/tutor-applications/:id/video/uploads`, puis leurs métadonnées sont enregistrées dans
PostgreSQL. `POST /tutor-applications/:id/submit` valide et transmet le dossier.

## Structure

```
src/
├── main.ts / app.module.ts
├── core/            # env (zod), PrismaService (adapter pg), Redis, Crypto
├── common/          # erreurs domaine, filtre Problem Details, guards, idempotence
├── infrastructure/  # realtime (Centrifugo), calls (LiveKit), storage (Supabase),
│                    # push (FCM), cache (Redis), outbox (writer + relay)
└── modules/         # auth, users, beneficiaries, catalog, tutors, search,
                     # bookings, communication, reviews, notifications, realtime, admin
```

## Recherche sémantique (matching tuteur ↔ demande universitaire)

Spécification : `../eduloc-recherche-semantique.md`. Principe : **le backend décide de l'éligibilité, en SQL, avant tout
calcul sémantique** ; l'IA ne fait que classer des tuteurs déjà admissibles.

- **Éligibilité hiérarchique** (`src/modules/matching/search/level-eligibility.ts`) : rang du niveau académique
  VALIDÉ du tuteur strictement supérieur à celui de la demande (L1 → L2…Doctorat, M2 → Doctorat ou expert validé ;
  demande Doctorat → Doctorat). Un tuteur sans niveau validé n'est jamais éligible. Échelle : `academic-scale.ts`.
- **Admin** : `PUT /admin/tutors/:id/academic-level`, équivalences de diplômes `/admin/degree-equivalences`,
  revue des justificatifs `POST /admin/tutor-documents/:id/review` (approuver un diplôme = attester de son authenticité).
- **Indexation** : événements outbox `TUTOR_SEARCH_REINDEX` / `TUTOR_DOCUMENT_EXTRACT` (jamais dans une requête HTTP).
  Réindexation globale (premier déploiement, changement de modèle) :
  `docker compose run --rm api node dist/modules/matching/cli/reindex-all.command.js`.
- **Recherche** : `POST /matching/search` (503 `MATCHING_UNAVAILABLE` si Ollama est arrêté ; 30 requêtes / min).
  `GET /health` expose `{ status, matching }` sans dépendre d'Ollama.
- **Ollama** : jamais publié sur Internet. `docker compose up -d --no-deps ollama ollama-init`, ou avec
  `-f docker-compose.dev.yml` pour l'atteindre depuis `127.0.0.1:11434`. Modèle par défaut `hf.co/unsloth/embeddinggemma-2-GGUF:UD-Q4_K_XL`
  (GGUF unsloth, 768 dimensions ; exige Ollama ≥ 0.40.4 — la 0.40.3 répond « unknown model architecture »). Changer de modèle impose de réindexer (`POST /admin/matching/reindex`).
- **Migrations** : `npx prisma migrate deploy` (jamais au démarrage du conteneur). La base locale utilise l'image
  `docker/db` (PostGIS + pgvector).

### Données de test pour le front

`npm run db:seed:matching` crée 29 tuteurs fictifs (niveaux académiques validés, matières, offres, disponibilités en ligne)
et écrit `MATCHING-TEST-DATA.md` : comptes (`tNN@matching.eduloc.mg` / `Demo12345!`) et 41 scénarios « niveau + matière + besoin
→ tuteurs attendus ». Côté front : connecté, parcours « Pour moi », niveau de la catégorie Université.

### Essayer la recherche (exemple guidé)

```bash
npm run db:seed          # comptes et tuteurs de démo (admin@eduloc.mg / Admin12345!, demo@eduloc.mg / Demo12345!)
npm run start:dev        # API sur le PORT du .env ; Ollama requis pour la partie universitaire
npm run try:matching     # lycée (classique) puis licence 2 (sémantique) : valide le niveau de 2 tuteurs de démo,
                         # demande leur indexation, puis affiche les résultats ; API_URL_TRY pour changer l'URL
```

Si une recherche universitaire est vide, c'est presque toujours l'une de ces trois causes : tuteur **sans niveau
académique validé** (`PUT /admin/tutors/:id/academic-level`), tuteur **pas encore indexé**
(`POST /admin/matching/reindex`, calculé en tâche de fond avec Ollama), ou **aucun tuteur de rang strictement supérieur**
à celui de la demande ayant déclaré ce niveau.

### Tests

```bash
npm test                      # unitaires (sans base)
TEST_DATABASE_URL=postgresql://eduloc:eduloc@localhost:5434/eduloc npm run test:int   # base pgvector jetable
OLLAMA_URL=http://127.0.0.1:11434 EMBEDDING_MODEL=hf.co/unsloth/embeddinggemma-2-GGUF:UD-Q4_K_XL npm run test:int # + Ollama réel
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db-test          # base jetable
npm run matching:eval         # recall@10 / nDCG@10 → eval/report.md (Ollama réel + base jetable)
```
