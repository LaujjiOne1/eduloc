# EduLoc Admin

Back-office de l'administration EduLoc (React + Vite). Il parle uniquement à l'API NestJS réelle : il n'y a ni mode démo ni données fictives.

## Lancer

```bash
npm install
cp .env.example .env.local   # VITE_API_URL, par défaut http://localhost:3003/api
npm run dev                  # http://localhost:5173
```

Connexion : un compte avec `isAdmin = true` (créé par le seed : `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Un compte ordinaire est refusé à la connexion.

## Ce que l'administrateur fait ici

| Section | Actions | Endpoints |
| --- | --- | --- |
| Tableau de bord | file « à traiter », compteurs, réindexation globale | `GET /admin/dashboard`, `POST /admin/matching/reindex` |
| Dossiers tuteurs | ouvrir et approuver/refuser chaque justificatif (approuver un diplôme = attester de son authenticité), valider le niveau académique, appliquer une équivalence de diplôme, approuver/refuser le dossier, suspendre ou rétablir un tuteur, réindexer un tuteur | `/admin/tutor-applications*`, `/admin/tutor-documents/:id/review`, `/admin/tutor-documents/:id/url`, `/admin/tutors/:id/*` (suspend, reinstate, reindex, academic-level) |
| Équivalences de diplômes | créer et trancher les équivalences réutilisées | `/admin/degree-equivalences*` |
| Offres de cours | retirer / rétablir une offre (le tuteur ne peut pas la réactiver) | `GET /admin/offers`, `POST /admin/offers/:id/moderation` |
| Utilisateurs | suspendre / réactiver un compte | `/admin/users*` |
| Réservations | consultation seule (l'administration ne change pas le statut d'une séance) | `GET /admin/bookings`, `GET /admin/partners/reservations` |
| Conflits | résoudre (avec note) ou classer | `/admin/conflicts*` |
| Structures, salles | examiner, demander des corrections, valider, refuser, suspendre, désactiver, rétablir ; retirer une salle de la publication ; activer ou annuler l'offre commerciale | `/admin/partners/venues*`, `/admin/partners/rooms*` |
| Avis sur les salles | masquer (motif obligatoire) / rétablir | `/admin/partners/room-reviews*` |
| Offres commerciales | créer et modifier les plans | `/admin/partners/plans*` |

## Ce que l'administrateur ne fait pas

Changer le rôle d'un utilisateur, forcer le statut d'une réservation, modifier une offre ou un profil, renvoyer un e-mail de vérification : l'API ne le prévoit pas, et le back-office ne le propose donc pas.

`api.ts` et `schema.prisma` à la racine sont des copies héritées du prototype ; l'application ne les utilise pas.
