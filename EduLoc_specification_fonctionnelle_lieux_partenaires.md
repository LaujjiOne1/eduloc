# EduLoc V2 --- Spécification fonctionnelle des lieux partenaires et de la réservation des séances

-   **Type de document :** spécification fonctionnelle de conception
-   **Périmètre :** lieux d'étude partenaires, lieux d'intervention des
    tuteurs et réservation de séances
-   **Version :** 1.0 --- décisions intégrées le 17 octobre 2026
-   **Statut :** base de conception à valider avec le responsable
    produit
-   **Hors périmètre principal :** paiement en ligne, location
    récurrente de salles sans élève, réservation de blocs horaires par
    les tuteurs, gestion avancée des places de cours collectifs

------------------------------------------------------------------------

## 1. Objectif

Permettre à un Demandeur de réserver une séance éducative avec un
Tuteur, en choisissant un mode et un lieu parmi les possibilités que le
Tuteur accepte et qui sont disponibles à la date demandée.

Pour une séance dans un lieu partenaire, EduLoc doit vérifier la
compatibilité entre le Tuteur, la salle, les horaires, la durée, les
règles de réservation et les besoins de la séance.

**Règle centrale :** le Demandeur choisit ; le Tuteur définit les modes
et lieux où il accepte d'intervenir ; le Partenaire lieu déclare les
salles et leurs disponibilités ; EduLoc calcule les possibilités et
vérifie les conflits.

La déclaration d'un lieu d'intervention par un Tuteur ne constitue
jamais une réservation de la salle.

## 2. Acteurs et responsabilités

### 2.1 Visiteur / Demandeur

-   Peut rechercher des Tuteurs et consulter leurs profils sans créer de
    compte.
-   Choisit une offre, un Bénéficiaire, un mode ou lieu et un créneau.
-   Crée ou utilise un compte lorsqu'il effectue une action nécessitant
    une identité, notamment l'envoi d'une demande de réservation.
-   Peut réserver pour lui-même ou pour un autre Bénéficiaire.
-   Consulte l'état de ses demandes et réservations.

### 2.2 Tuteur

-   Déclare les modes de séance qu'il accepte : en ligne, chez le
    Bénéficiaire, chez lui ou dans un lieu partenaire.
-   Définit ses disponibilités, les durées de séance qu'il propose et,
    si nécessaire, sa zone de déplacement.
-   Indique les salles partenaires dans lesquelles il accepte
    d'intervenir. Une évolution pourra lui permettre d'accepter toutes
    les salles partenaires compatibles dans une zone.
-   Reçoit les demandes et les accepte ou les refuse.
-   Ne doit pas louer ou réserver une salle à l'avance pour qu'elle
    puisse être proposée à une séance individuelle.

### 2.3 Gestionnaire partenaire lieu

-   Gère une structure pouvant contenir plusieurs salles.
-   Déclare les informations de la structure, les documents
    justificatifs et les informations propres à chaque salle.
-   Définit pour chaque salle les horaires disponibles, la capacité, les
    équipements, les tarifs et les conditions d'utilisation.
-   Soumet chaque salle séparément pour validation.
-   Consulte les réservations confirmées de ses salles.
-   N'a pas à approuver manuellement chaque réservation lorsque les
    conditions de réservation automatique sont remplies.

### 2.4 Administrateur EduLoc

-   Examine les dossiers de structure et les salles.
-   Valide, demande des corrections, rejette ou suspend une salle.
-   Contrôle les informations nécessaires à la publication et peut
    retirer une salle de la publication.
-   Consulte les réservations et intervient sur les incidents ou
    conflits selon ses permissions.

### 2.5 Système EduLoc

-   Calcule les créneaux compatibles.
-   Applique le préavis minimal et les règles de durée et de marge.
-   Empêche les doubles réservations confirmées.
-   Revérifie les ressources au moment où le Tuteur accepte une demande.
-   Révèle l'adresse exacte du lieu partenaire uniquement après la
    confirmation définitive de la séance et de la salle.

## 3. Modèle de choix du lieu

Le Demandeur choisit le lieu pendant le parcours de réservation. EduLoc
n'affiche que les options compatibles avec le Tuteur, l'offre, le
Bénéficiaire et la date recherchée.

  -----------------------------------------------------------------------
  Mode / lieu                         Conditions d'affichage
  ----------------------------------- -----------------------------------
  Chez le Bénéficiaire (« chez moi »  Le Tuteur accepte les déplacements
  dans l'interface du Demandeur)      et l'adresse se trouve dans sa zone
                                      d'intervention.

  Chez le Tuteur                      Le Tuteur a déclaré ce lieu
                                      d'accueil et les conditions de
                                      disponibilité sont respectées.

  En ligne                            Le Tuteur propose ce mode et
                                      dispose d'un créneau compatible.

  Salle partenaire                    La salle est publiée et active, le
                                      Tuteur accepte d'y intervenir, et
                                      la salle comme le Tuteur sont
                                      disponibles pendant toute la
                                      séance.
  -----------------------------------------------------------------------

Une salle proche du Bénéficiaire ne doit pas être proposée
automatiquement si le Tuteur n'accepte pas d'y intervenir.

### 3.1 Lieu d'intervention et réservation de salle

**Déclarer un lieu d'intervention :** le Tuteur exprime son accord pour
enseigner dans un lieu ou une salle donnée. Cela ne bloque aucun horaire
de la salle.

**Réserver une salle pour une séance :** une demande de séance associe
une date, une heure, une durée, un Tuteur et une salle. La salle ne
devient réservée pour cette séance qu'au moment où la demande est
acceptée et où les vérifications finales réussissent.

**Location récurrente de salle :** réserver une salle chaque semaine ou
pour plusieurs heures sans élève est une fonctionnalité distincte, hors
périmètre du MVP.

## 4. Configuration des disponibilités

### 4.1 Disponibilités du Tuteur

Le Tuteur doit pouvoir définir : - les jours et plages horaires où il
accepte des séances ; - les modes de séance autorisés ; - les lieux ou
salles partenaires où il accepte d'intervenir ; - les durées de séance
proposées ; - sa zone de déplacement si les séances à domicile sont
acceptées.

Les disponibilités doivent être interprétées avec les réservations
confirmées et les marges applicables. Un calendrier vide ne signifie pas
automatiquement qu'un créneau est réservable : le mode et le lieu
doivent également être compatibles.

### 4.2 Disponibilités des salles partenaires

Chaque salle possède son propre calendrier : - jours et heures
d'ouverture ou de réservation ; - périodes indisponibles ; - capacité et
équipements ; - tarif et conditions d'utilisation ; - état de validation
et de publication.

Pour le MVP, une salle est considérée comme une ressource entière : une
seule séance peut l'occuper à la fois. La capacité en nombre de places
ne permet pas de réserver simultanément plusieurs séances individuelles
dans cette même salle. La réservation par place pour des cours
collectifs pourra être étudiée plus tard.

### 4.3 Durée des séances

**Décision retenue : plusieurs durées sont proposées par le Tuteur.**

Le Tuteur configure les durées qu'il accepte pour une offre ou un type
de séance, par exemple 1 heure ou 2 heures. Ces exemples ne sont pas des
valeurs obligatoires. Seules les durées réellement configurées et
compatibles avec les disponibilités doivent être proposées au Demandeur.

Le créneau affiché couvre toute la durée choisie. Le système ne doit pas
afficher une option si la disponibilité du Tuteur ou de la salle ne
couvre pas la totalité de la séance et les marges applicables.

### 4.4 Pas de démarrage et marges

Le pas de démarrage (par exemple toutes les 30 minutes) et les marges
entre séances sont des paramètres de conception à confirmer avant
implémentation. Ils ne sont pas imposés définitivement par cette
version.

Si un Tuteur change de lieu entre deux séances en présentiel, le système
doit tenir compte d'une marge de déplacement compatible avec les règles
retenues. Une séance précédente terminant à 15 h ne doit pas permettre
de proposer une séance à 15 h dans un lieu éloigné.

### 4.5 Préavis minimal

**Décision retenue : une demande de réservation doit être créée au moins
12 heures avant l'heure de début de la séance.**

Les créneaux qui ne respectent pas ce délai ne doivent pas être proposés
comme réservables. Le backend doit également appliquer cette règle à la
création de la demande, sans se fier uniquement à la validation du
frontend.

La règle précise à appliquer si une demande créée à temps est acceptée
moins de 12 heures avant le début de la séance devra être confirmée par
le responsable produit. Par défaut, cette spécification mesure le
préavis au moment de l'envoi de la demande.

## 5. Calcul d'un créneau réservable

Pour une séance dans une salle partenaire, toutes les conditions
suivantes doivent être réunies :

1.  Le Tuteur est approuvé, actif et son offre est réservable.
2.  Le Tuteur accepte le mode de séance et la salle sélectionnée.
3.  Le Tuteur est disponible pendant toute la durée de la séance.
4.  La salle est validée, publiée, active et disponible pendant toute la
    durée de la séance.
5.  La salle satisfait les exigences de capacité et d'équipement de la
    séance.
6.  Le préavis minimal de 12 heures est respecté à l'envoi de la
    demande.
7.  Les réservations confirmées ne se chevauchent pas avec la séance
    envisagée.
8.  Les marges avant/après et, si nécessaire, de déplacement sont
    respectées.
9.  Les règles de l'offre et du lieu permettent cette réservation.

Le calcul des créneaux doit correspondre à l'intersection des
disponibilités nécessaires, et non à la seule disponibilité du Tuteur ou
de la salle.

## 6. Parcours de réservation du Demandeur

1.  Le Demandeur recherche une matière, un niveau ou un besoin éducatif.
2.  EduLoc affiche les Tuteurs et offres compatibles.
3.  Le Demandeur consulte un profil et choisit une offre.
4.  Il choisit le Bénéficiaire, ou renseigne les informations requises
    selon le parcours de compte.
5.  Il choisit le mode ou le lieu parmi les options proposées.
6.  Si nécessaire, il sélectionne une salle partenaire parmi les salles
    compatibles.
7.  Il choisit une date et une durée.
8.  EduLoc affiche uniquement les créneaux qui respectent les règles
    connues au moment de la consultation.
9.  EduLoc affiche un récapitulatif : offre, Tuteur, Bénéficiaire, mode,
    lieu, date, heure, durée, prix connu et conditions.
10. Le Demandeur s'authentifie ou crée son compte si nécessaire, sans
    perdre les choix déjà effectués.
11. Le Demandeur envoie la demande.
12. Le backend revérifie les conditions et crée la demande en état
    `PENDING`.
13. Le Tuteur est notifié et peut accepter ou refuser.
14. En cas d'acceptation, le backend vérifie de nouveau la disponibilité
    du Tuteur et, le cas échéant, de la salle.
15. Si toutes les vérifications réussissent, la séance et la réservation
    de salle sont confirmées ensemble.
16. Le Demandeur et le Tuteur sont informés du résultat.
17. L'adresse exacte et les instructions d'accès au lieu partenaire sont
    révélées seulement après la confirmation définitive de la séance et
    de la salle.

## 7. Gestion des demandes en attente et des conflits

**Décision retenue : aucune réservation temporaire ou aucun blocage
temporaire n'est créé lorsqu'une demande passe à `PENDING`.**

Cela signifie qu'une demande en attente ne réserve pas la salle et ne
garantit pas le créneau. Plusieurs demandes en attente peuvent donc
viser le même créneau. Cette règle doit être clairement expliquée dans
l'interface afin de ne pas faire croire au Demandeur que la séance est
déjà confirmée.

### 7.1 À l'envoi de la demande

Le backend vérifie les disponibilités actuelles et les conflits connus,
puis enregistre la demande en attente. Cette vérification réduit les
demandes incompatibles mais ne garantit pas que les ressources seront
encore libres lorsque le Tuteur répondra.

### 7.2 À l'acceptation du Tuteur

Le backend doit refaire toutes les vérifications importantes dans une
opération transactionnelle : - Tuteur toujours actif et offre toujours
réservable ; - disponibilité et absence de chevauchement du Tuteur ; -
salle toujours active, publiée et disponible ; - absence de
chevauchement d'une réservation confirmée pour la salle ; -
compatibilité de la durée, du préavis applicable et des marges ; -
autorisation du Tuteur à intervenir dans la salle.

La confirmation de la séance et la réservation de la salle doivent
réussir ensemble. Le système ne doit jamais confirmer la séance si la
salle ne peut pas être réservée, ni réserver la salle si la confirmation
de la séance échoue.

La protection contre les demandes concurrentes doit être appliquée côté
backend/base de données, et non uniquement dans l'interface.

### 7.3 Si un conflit apparaît à l'acceptation

-   La demande concernée ne devient pas `CONFIRMED`.
-   Aucune réservation de salle n'est créée pour cette demande.
-   Le système conserve un état cohérent et informe le Tuteur et le
    Demandeur que le créneau n'est plus disponible.
-   Le Demandeur est invité à choisir un autre créneau ou une autre
    salle.
-   Le système ne déplace pas automatiquement la réservation vers une
    autre date ou salle sans choix explicite du Demandeur.

Le statut précis à utiliser pour une demande devenue impossible à
confirmer à cause d'un conflit doit être choisi et harmonisé avec les
enums de la V2 (par exemple un état dédié `CONFLICT` ou un état terminal
avec motif de conflit). Ne pas ajouter un enum dans Prisma sans
vérification de la spécification et du schéma existants.

### 7.4 Refus et annulation

-   Si le Tuteur refuse, la demande passe à l'état de refus prévu dans
    le modèle V2.
-   Puisqu'aucun blocage temporaire n'existe, le refus ne nécessite pas
    de libération de créneau.
-   Une réservation confirmée annulée doit libérer la disponibilité
    future de la salle et du Tuteur selon les règles d'annulation
    retenues.
-   La modification des disponibilités ne doit pas annuler
    silencieusement une réservation déjà confirmée.

## 8. Gestionnaire partenaire lieu : inscription, validation et publication

### 8.1 Principe de gestion

Une structure possède un Gestionnaire responsable et peut contenir
plusieurs salles. Le dossier de structure et chaque dossier de salle
sont liés, mais **chaque salle est soumise et validée indépendamment**.

### 8.2 Parcours d'intégration

1.  Le candidat consulte la présentation du partenariat.
2.  Il consulte les offres commerciales disponibles.
3.  Il crée un compte ou se connecte comme Gestionnaire.
4.  Il renseigne les informations de la structure.
5.  Il transmet les documents justificatifs requis.
6.  Il ajoute une ou plusieurs salles.
7.  Pour chaque salle, il renseigne les informations propres : nom,
    adresse, position géographique, capacité, équipements,
    accessibilité, horaires, tarifs, règles et photos.
8.  Il enregistre un brouillon privé.
9.  Il soumet individuellement une salle à validation.
10. L'Administrateur examine cette salle et l'approuve, demande des
    corrections ou la rejette.
11. Après validation de la salle, le Gestionnaire choisit ou active
    l'offre commerciale applicable, selon les règles commerciales
    définies.
12. La salle devient publiable uniquement si les conditions de
    validation et les conditions commerciales sont satisfaites.
13. Le Gestionnaire suit l'état de chaque salle depuis son tableau de
    bord.

Les brouillons peuvent être conservés privés avant validation. Une salle
non validée, suspendue ou dont les conditions de publication ne sont pas
satisfaites ne doit pas apparaître comme réservable au public.

### 8.3 Informations et contrôles

Les informations à recueillir peuvent inclure : - nom et type de
structure ; - identité et coordonnées du Gestionnaire ; - documents
administratifs ou preuves du droit de gérer le lieu ; - nom de la salle,
adresse et coordonnées géographiques ; - capacité et types de séances
autorisés ; - équipements et accessibilité ; - horaires et
indisponibilités ; - tarifs, règles d'utilisation et conditions
d'annulation ; - photos utiles à la compréhension du lieu.

Les contrôles de sécurité doivent être décrits précisément par EduLoc.
Un badge « vérifié » ne doit pas laisser croire à une inspection
physique si celle-ci n'a pas été réalisée. Les éléments contrôlés
doivent être identifiables. Des règles particulières sont à prévoir pour
l'accueil des mineurs.

### 8.4 Offre commerciale

Décision retenue : l'offre commerciale intervient **après validation de
la salle et avant sa publication**.

Le périmètre exact de l'offre reste à confirmer : - une souscription
couvre-t-elle une salle ou plusieurs salles d'une même structure ? -
quels sont les tarifs, durées, renouvellements et conséquences
d'expiration ? - que devient une salle déjà publiée si l'offre expire ou
est annulée ?

Ne pas coder une relation « une souscription par salle » ou « une
souscription par structure » comme décision définitive avant
clarification.

## 9. Confidentialité et adresse du lieu

-   Avant la confirmation définitive, la fiche publique peut afficher
    une zone approximative, une distance estimée, les équipements, la
    capacité, le prix et la disponibilité.
-   L'adresse exacte du lieu partenaire ne doit pas être renvoyée aux
    écrans publics ou à l'API accessible au Demandeur avant confirmation
    définitive de la séance et de la salle.
-   Après confirmation, seuls les utilisateurs autorisés liés à la
    réservation peuvent consulter l'adresse et les instructions d'accès.
-   Les contrôles doivent être appliqués côté backend, pas seulement en
    masquant l'adresse dans le frontend.
-   Les journaux, notifications et aperçus ne doivent pas exposer
    prématurément l'adresse exacte.

## 10. États fonctionnels proposés

Les valeurs ci-dessous sont des propositions de modélisation
fonctionnelle, pas une affirmation qu'elles existent déjà dans le schéma
Prisma.

### 10.1 Dossier de structure

-   `DRAFT`
-   `SUBMITTED`
-   `UNDER_REVIEW`
-   `APPROVED`
-   `NEEDS_CORRECTION`
-   `SUSPENDED`

### 10.2 Salle partenaire

-   `DRAFT`
-   `SUBMITTED`
-   `UNDER_REVIEW`
-   `APPROVED`
-   `NEEDS_CORRECTION`
-   `REJECTED`
-   `SUSPENDED`

L'approbation d'une salle ne doit pas automatiquement approuver toutes
les autres salles de la structure.

### 10.3 Offre commerciale et publication

Souscription commerciale proposée : - `NOT_SELECTED` - `PENDING` -
`ACTIVE` - `EXPIRED` - `CANCELLED`

Publication proposée : - `UNPUBLISHED` - `PUBLISHED` -
`UNPUBLISHED_BY_ADMIN`

La salle est publiable uniquement si sa validation est acquise, si les
conditions commerciales requises sont satisfaites et si elle n'est pas
suspendue.

### 10.4 Demande de séance

Le modèle V2 actuel prévoit notamment les états `PENDING`, `CONFIRMED`,
`REFUSED` et `CANCELLED`. Un état ou motif supplémentaire pour le
conflit à l'acceptation peut être nécessaire, mais doit être harmonisé
avec le modèle de données existant avant implémentation.

### 10.5 Réservation de salle

Une réservation de salle confirmée est créée uniquement au moment de la
confirmation définitive de la séance. Les états techniques exacts de la
réservation de salle restent à aligner avec les enums et relations de la
V2.

## 11. Écrans à prévoir

### Parcours public et Demandeur

1.  Présentation des lieux partenaires.
2.  Liste/carte des salles compatibles.
3.  Détail d'une salle : zone, équipements, capacité, tarif, conditions
    et disponibilités.
4.  Choix du mode de séance.
5.  Choix de la salle partenaire si ce mode est sélectionné.
6.  Choix de la date, de la durée et du créneau.
7.  Récapitulatif de réservation.
8.  Connexion/inscription sans perte des choix.
9.  Confirmation d'envoi de la demande en attente.
10. Détail de la demande et de son statut.
11. Détail de la séance confirmée, avec adresse exacte et instructions
    d'accès autorisées.

### Parcours Tuteur

1.  Configuration des modes de séance.
2.  Configuration des lieux d'intervention acceptés.
3.  Configuration des disponibilités.
4.  Configuration des durées proposées.
5.  Liste des demandes reçues.
6.  Détail d'une demande.
7.  Actions accepter/refuser.
8.  Résultat d'acceptation, y compris le cas où le créneau est devenu
    indisponible.
9.  Calendrier des séances confirmées.

### Parcours Gestionnaire partenaire lieu

1.  Présentation du partenariat.
2.  Choix/présentation des offres commerciales.
3.  Inscription/connexion Gestionnaire.
4.  Informations de la structure.
5.  Documents justificatifs.
6.  Liste des salles.
7.  Formulaire d'une salle.
8.  Position et adresse de la salle.
9.  Disponibilités et horaires.
10. Tarifs et conditions.
11. Soumission indépendante d'une salle.
12. Suivi de validation et corrections demandées.
13. Souscription commerciale après validation.
14. Tableau de bord du Gestionnaire.
15. Calendrier et réservations confirmées par salle.
16. Paramètres de structure, salle et offre commerciale.

### Parcours Administration

1.  Liste des dossiers de structures.
2.  Détail du dossier de structure.
3.  Liste des salles à examiner.
4.  Détail d'une salle et des pièces justificatives.
5.  Actions approuver, demander correction, rejeter ou suspendre.
6.  Vue des réservations et des conflits.
7.  Historique des changements de statut.

## 12. Critères d'acceptation

### Disponibilité et réservation

-   [ ] Le Demandeur ne voit que les modes de séance acceptés par le
    Tuteur.
-   [ ] Une salle partenaire n'est proposée que si elle est publiée,
    active et compatible avec le Tuteur.
-   [ ] Le Tuteur peut déclarer une salle sans que cela bloque le
    calendrier de la salle.
-   [ ] Le Demandeur peut choisir parmi plusieurs durées proposées par
    le Tuteur.
-   [ ] Le frontend et le backend appliquent un préavis minimal de 12
    heures au moment de l'envoi de la demande.
-   [ ] Aucun blocage temporaire n'est créé pour une demande `PENDING`.
-   [ ] Une demande en attente est explicitement présentée comme non
    confirmée.
-   [ ] Le backend revérifie les ressources au moment de l'acceptation.
-   [ ] Deux demandes concurrentes ne peuvent pas produire deux
    réservations confirmées qui se chevauchent pour le même Tuteur ou la
    même salle.
-   [ ] Si un conflit apparaît à l'acceptation, la séance et la salle
    restent non confirmées et les utilisateurs sont informés.
-   [ ] La séance et la réservation de salle sont confirmées ensemble ou
    aucune des deux ne l'est.
-   [ ] Une séance confirmée n'est pas annulée silencieusement par une
    modification de disponibilité.

### Validation et publication des salles

-   [ ] Le Gestionnaire peut enregistrer un brouillon privé.
-   [ ] Chaque salle peut être soumise et validée indépendamment.
-   [ ] La validation d'une salle ne valide pas automatiquement les
    autres salles.
-   [ ] Une salle non validée, suspendue ou commercialement non éligible
    n'est pas publiquement réservable.
-   [ ] La souscription commerciale se déroule après la validation et
    avant la publication de la salle.
-   [ ] Le Gestionnaire n'a pas besoin d'approuver chaque réservation
    une par une.

### Confidentialité

-   [ ] L'adresse exacte n'est pas exposée avant confirmation définitive
    de la séance et de la salle.
-   [ ] L'API vérifie les droits d'accès à l'adresse.
-   [ ] Après confirmation, l'adresse n'est accessible qu'aux personnes
    autorisées liées à la réservation.

## 13. Décisions prises et points à confirmer

### Décisions prises

-   Le Demandeur choisit le lieu pendant la réservation.
-   Les options dépendent des modes et lieux acceptés par le Tuteur.
-   Le Tuteur peut déclarer des lieux d'intervention sans réserver ou
    louer ces lieux à l'avance.
-   Le calendrier de chaque salle est géré séparément.
-   Plusieurs durées de séance sont proposées par le Tuteur.
-   Le préavis minimal est de 12 heures.
-   Aucune réservation temporaire n'est créée pendant l'état `PENDING`.
-   La disponibilité est revérifiée au moment de l'acceptation.
-   La séance et la salle sont confirmées ensemble.
-   Chaque salle partenaire est validée indépendamment.
-   L'offre commerciale intervient après validation et avant
    publication.
-   L'adresse exacte est révélée après confirmation définitive de la
    séance et de la salle.
-   Le paiement en ligne, la location récurrente sans élève et les
    réservations de blocs horaires par le Tuteur restent hors périmètre
    principal.

### Points à confirmer avant implémentation

1.  Une offre commerciale couvre-t-elle une salle ou plusieurs salles
    d'une structure ?
2.  Quels sont les prix, renouvellements, expirations et effets d'une
    offre commerciale inactive ?
3.  Quel pas de démarrage et quelles marges entre les séances seront
    appliqués ?
4.  Comment calculer la marge de déplacement entre deux lieux ?
5.  Quel état métier ou motif représenter une demande qui ne peut plus
    être acceptée à cause d'un conflit ?
6.  Le délai de 12 heures est-il vérifié uniquement lors de l'envoi de
    la demande, ou aussi au moment de l'acceptation ?
7.  Quelles règles d'annulation s'appliquent aux séances confirmées et
    aux salles ?
8.  Quelles vérifications de sécurité sont obligatoires pour chaque
    lieu, en particulier pour les séances avec des mineurs ?

## 14. Consignes d'implémentation

-   Consulter la spécification V2, les cas d'utilisation, le schéma
    Prisma et les contraintes SQL existantes avant de créer ou modifier
    des enums, tables ou relations.
-   Ne pas supposer que les états proposés dans ce document existent
    déjà.
-   Mettre la logique de disponibilité et de conflit dans le backend ;
    le frontend ne fait qu'afficher les possibilités renvoyées par
    l'API.
-   Utiliser des transactions et des contraintes adaptées pour garantir
    l'absence de double réservation confirmée.
-   Ne pas faire confiance à une vérification de disponibilité exécutée
    uniquement lors de l'affichage du calendrier.
-   Prévoir des états de chargement, d'erreur, de disponibilité vide et
    de conflit.
-   Préserver les choix du Demandeur lorsqu'une authentification est
    nécessaire.
-   Si le créneau devient indisponible, demander au Demandeur de choisir
    une autre possibilité plutôt que de modifier silencieusement sa
    demande.
-   Garder les services API découplés des écrans pour permettre le
    remplacement des données simulées par le backend réel.
-   Tester les workflows complets et les cas concurrents, pas seulement
    les écrans isolés.

------------------------------------------------------------------------

**Fin du document.**
