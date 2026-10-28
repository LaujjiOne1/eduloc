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
   des PENDING chevauchantes du tuteur (une salle n'est jamais bloquée par une PENDING).
6. **Prévenance** : réservation ≥ 24 h (`BOOKING_MIN_NOTICE_HOURS`) ; annulation gratuite ≥ 24 h (sinon justification).
7. **Appels LiveKit** uniquement sur réservation `CONFIRMED`/`IN_PROGRESS`.
8. **Conservation des médias** : 12 mois après la fin de la séance (job planifié).

## Candidature tuteur

Une candidature est rattachée à un compte utilisateur existant et authentifié. `POST` ou
`PATCH /tutor-applications` enregistre le profil, les expériences détaillées, matières,
offres, lieux et disponibilités en brouillon. Les justificatifs et la vidéo sont envoyés
directement vers Supabase Storage via les routes `/tutor-applications/:id/documents/uploads`
et `/tutor-applications/:id/video/uploads`, puis leurs métadonnées sont enregistrées dans
PostgreSQL. `POST /tutor-applications/:id/submit` valide et transmet le dossier.

## Lieux partenaires (salles d'étude)

Spécification : `EduLoc_specification_fonctionnelle_lieux_partenaires.md` (racine du dépôt).

- **Gestionnaire** (`/partner/*`, aucun rôle global : posséder une structure suffit) : structure + justificatifs →
  salles (brouillon, horaires, fermetures, photos) → soumission **salle par salle** → souscription → publication.
- **Administration** (`/admin/partners/*`) : examen des structures et des salles (valider, corrections, rejeter,
  suspendre, dépublier), historique des statuts, souscriptions (`activate`), plans, réservations de salle.
- **Public** (sans compte) : `GET /rooms`, `GET /rooms/:id` (zone approximative, distance arrondie à 500 m, jamais
  d'adresse), `GET /booking-options/:offerId` (modes, durées, salles acceptées par le tuteur) et
  `GET /booking-options/:offerId/slots?date=&mode=&roomId=&durationMinutes=` (créneaux de la date).
- **Tuteur** : `GET|PUT|DELETE /tutors/me/rooms/:roomId` déclare les salles où il accepte d'intervenir (aucun blocage
  de la salle) ; `partnerRoom: true` sur une disponibilité la réserve au mode salle ; `durationOptions` sur une offre
  ajoute des durées (prix proportionnel).
- **Réservation** : `POST /bookings` avec `teachingMode: PARTNER_ROOM` + `roomId` (+ `durationMinutes`,
  `participantsCount`, `requiredEquipment`). La demande reste `PENDING` **sans rien bloquer** ; à l'acceptation tout est
  revérifié dans une transaction (verrou tuteur puis salle). Séance et salle sont la même ligne : confirmées ensemble.
  Conflit → 409 `ROOM_NO_LONGER_AVAILABLE` / `SLOT_NO_LONGER_AVAILABLE`, la demande reste `PENDING`, un `Conflict` est
  ouvert et le demandeur comme le tuteur sont notifiés (`booking.conflict`).
- **Adresse exacte** : copiée dans la réservation à la confirmation seulement, et renvoyée uniquement pour
  `CONFIRMED` / `IN_PROGRESS` / `COMPLETED` (jamais avant, jamais après annulation). Aucun événement outbox ni message
  ne la contient.
- **Garde-fous SQL** : `bookings_room_no_overlap` (exclusion par salle), `bookings_room_mode`,
  `rooms_published_requires_approval`, une seule souscription ouverte par structure.
- **Offre commerciale** : `PartnerPlan` (prix/durée en données) + `VenueSubscription` rattachée à la **structure**.
  `npm run db:seed` crée un plan gratuit `PILOT`. Une salle n'est réservable que si salle + structure sont validées,
  la salle publiée et active, et la souscription `ACTIVE` non expirée (`bookableRoomWhere`, source unique).
- **À configurer** (`.env`) : `BOOKING_MIN_NOTICE_HOURS` (24), `BOOKING_SLOT_STEP_MINUTES`, `BOOKING_BUFFER_MINUTES`,
  `BOOKING_TRAVEL_BUFFER_MINUTES`, `ROOM_TURNOVER_BUFFER_MINUTES` ; buckets `SUPABASE_PARTNER_DOCS_BUCKET` (privé) et
  `SUPABASE_ROOM_PHOTOS_BUCKET` à créer côté Supabase.

## Appels audio / vidéo (LiveKit)

`docker compose up -d livekit`. **`LIVEKIT_NODE_IP`** (dans `.env`) est l'adresse que les clients utilisent pour joindre le serveur
média : sans elle LiveKit annonce l'IP interne de Docker (172.x) et l'appel sonne puis échoue (« could not establish pc
connection »). `127.0.0.1` suffit pour un navigateur sur le même PC ; pour un téléphone, mettre l'IP LAN du PC (ex. `192.168.1.194`)
et redémarrer le conteneur (`docker compose up -d livekit`). Ports à laisser ouverts dans le pare-feu : 7880/tcp, 7881/tcp, 7882/udp.
Sur Android / iOS, les appels exigent un build de développement (WebRTC natif) : voir le README du front.

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

### Prix, commission, blocage du créneau, avis sur les salles (2026-10-22)

- **Devis** : `POST /bookings/quote` (même corps que `POST /bookings`) vérifie la demande, renvoie le prix détaillé
  (`tutorFee`, `travelFee`, `roomFee`, `serviceFee`, `total`) et **bloque** le créneau du Tuteur et la salle pendant
  `BOOKING_HOLD_MINUTES` (15). `POST /bookings` avec `holdId` consomme le blocage, revérifie tout et refuse si le total a
  changé (`PRICE_CHANGED`). Un blocage actif n'est opposable qu'aux AUTRES demandeurs ; l'expiration est évaluée à la lecture.
- **Prix** : total = tarif du Tuteur + déplacement (grille commune par tranche : ≤ 3 km 0 Ar, ≤ 7 km 5 000, ≤ 12 km 8 000,
  au-delà 10 000) + salle + frais de service (`PLATFORM_COMMISSION_RATE`, 10 % **du tarif du Tuteur seulement**).
  Le déplacement se calcule entre la position de référence du Tuteur et la position approximative du Demandeur
  (`beneficiaryLatitude/Longitude`) ; hors zone : `OUT_OF_TRAVEL_ZONE`. Les colonnes `commissionRate` du Tuteur et de la
  salle sont prévues mais **non lues** au MVP. Tarif horaire d'une salle plafonné par `ROOM_MAX_HOURLY_FEE`.
- **Avis sur les salles** : `POST /room-reviews` (séance TERMINÉE tenue dans la salle, auteur = Demandeur ou Tuteur de la
  séance, un avis par séance et par auteur), `GET /rooms/:id/reviews` (public), réponse unique du partenaire
  (`POST /partner/room-reviews/:id/reply`), masquage par l'administrateur avec motif (`POST /admin/partners/room-reviews/:id/hide`).
- **Structures** : statuts En attente (SUBMITTED) / En cours (UNDER_REVIEW) / Vérifié (APPROVED) / **Refusé** (REJECTED,
  motif obligatoire, nouvelle soumission possible) / Suspendu / **Désactivé** (DISABLED). NIF et STAT facultatifs, **obligatoires
  pour passer Vérifié** ; jamais dans une API publique.
- **Matching** : après le tri sémantique, classement final 0,60 pédagogie + 0,20 disponibilité + 0,10 proximité + 0,10 qualité
  (`MATCHING_WEIGHT_*`). La distance n'entre jamais dans le modèle sémantique. Plancher absolu `MATCHING_MIN_SIMILARITY` (0,65).
- **Migrations** : `prisma/migrations/20261022*` ; retour arrière manuel dans `prisma/rollbacks/`. Toujours sauvegarder
  (`pg_dump -Fc`) et essayer sur une copie restaurée avant de migrer. Avec Prisma 7, `DIRECT_URL` du `.env` prime sur
  `DATABASE_URL` : pour une base jetable, surcharger **les deux** variables.
