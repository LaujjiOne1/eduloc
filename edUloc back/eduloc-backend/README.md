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
