# CONTEXTE — PROJET EDULOC V2

Tu développes le frontend de **EduLoc V2**, une application de mise en relation éducative.

Je vais te fournir progressivement les différentes parties du frontend à développer.

Pour chaque tâche, tu dois implémenter **uniquement la partie demandée**, tout en respectant strictement :

1. la spécification fonctionnelle V2 ;
2. le workflow utilisateur défini ;
3. les écrans fournis ;
4. la structure HTML/design que je vais te donner ;
5. l'architecture frontend existante ;
6. la préparation à l'intégration future avec le backend.

La priorité absolue est :

> **CONFORMITÉ AU WORKFLOW ET À LA SPÉCIFICATION AVANT L'AMÉLIORATION VISUELLE.**

Ne modifie pas le fonctionnement métier défini dans la spécification simplement parce qu'une autre approche te paraît plus pratique.

---

# 1. RÈGLE ABSOLUE : RESPECTER LE HTML FOURNI

Je vais te fournir les fichiers HTML/design correspondant à la partie à développer.

Ces fichiers constituent la **référence visuelle et structurelle**.

Tu dois :

* conserver la structure HTML autant que possible ;
* respecter la hiérarchie des éléments ;
* respecter les sections présentes ;
* respecter les composants visuels ;
* respecter les textes et libellés fournis lorsqu'ils correspondent à la spécification ;
* respecter les interactions prévues ;
* reproduire fidèlement le layout ;
* adapter proprement le HTML à l'architecture React existante.

Ne transforme pas arbitrairement le design en une autre interface.

Ne remplace pas une structure complexe par une interface simplifiée uniquement parce qu'elle est plus facile à coder.

Si une adaptation technique est nécessaire pour React, fais-la **sans changer le résultat fonctionnel ou visuel attendu**.

---

# 2. TRAVAILLER PAR PARTIE

La tâche actuelle est :

[JE VAIS FOURNIR ICI LA PARTIE DU BACKLOG À DÉVELOPPER]

Tu dois te concentrer sur cette partie uniquement.

Avant de coder :

1. identifie les écrans concernés ;
2. identifie leur place dans le workflow ;
3. identifie les données nécessaires ;
4. identifie les actions utilisateur ;
5. identifie les états possibles ;
6. identifie les API nécessaires ;
7. vérifie les dépendances avec les autres parties.

Ne développe pas spontanément des fonctionnalités hors périmètre.

Si une dépendance est nécessaire pour que la partie actuelle fonctionne, implémente uniquement le minimum nécessaire pour cette dépendance.

---

# 3. WORKFLOW AVANT UI

Pour chaque écran, vérifie :

```text
Écran précédent
      ↓
Action utilisateur
      ↓
Écran actuel
      ↓
Action utilisateur
      ↓
Écran suivant
```

Le frontend doit respecter exactement le workflow défini.

Ne crée pas de navigation fictive qui contourne une étape métier.

Ne permet pas à l'utilisateur d'effectuer une action qui devrait être impossible selon le workflow.

Les guards, conditions d'affichage et états doivent être respectés.

---

# 4. NE PAS SE LIMITER AUX ÉTATS "NORMAL"

Pour chaque écran et chaque interaction, implémente tous les états nécessaires.

Au minimum, réfléchis systématiquement aux états suivants :

### Chargement

```text
loading
```

Pendant une récupération de données :

* afficher un état de chargement adapté ;
* désactiver les actions qui ne peuvent pas être exécutées pendant le chargement ;
* empêcher les doubles soumissions ;
* afficher éventuellement un skeleton lorsque le design le prévoit.

### Bouton en cours d'action

Lorsqu'un utilisateur clique sur une action :

```text
idle
→ loading
→ success / error
```

Pendant `loading` :

* bouton désactivé ;
* empêcher un deuxième clic ;
* conserver un feedback visuel ;
* afficher un indicateur approprié si prévu par le design.

Exemple :

```text
Réserver
```

devient temporairement :

```text
Réservation...
```

ou l'équivalent prévu par le design.

### État désactivé

Tous les boutons doivent correctement gérer :

* disabled ;
* conditions empêchant l'action ;
* données manquantes ;
* permissions insuffisantes ;
* opération déjà en cours.

Ne laisse jamais un bouton actif si son action ne peut pas être exécutée.

### Erreur

Prévoir les erreurs :

* API ;
* validation formulaire ;
* réseau ;
* données inexistantes ;
* conflit métier ;
* permissions ;
* session expirée.

L'utilisateur doit comprendre ce qui s'est passé et, lorsque c'est possible, pouvoir réessayer.

### Succès

Après une opération réussie :

* mettre à jour l'interface ;
* afficher le feedback nécessaire ;
* effectuer la navigation prévue par le workflow ;
* éviter les doublons.

### État vide

Prévoir les situations :

```text
aucun résultat
aucun rendez-vous
aucun bénéficiaire
aucune disponibilité
aucune conversation
etc.
```

Ne jamais laisser simplement une zone blanche.

### État hors ligne / réseau

Lorsque pertinent :

* afficher une erreur compréhensible ;
* permettre de réessayer ;
* ne pas perdre inutilement les données déjà saisies.

---

# 5. FORMULAIRES

Pour chaque formulaire, gérer :

* valeur initiale ;
* saisie ;
* validation ;
* champs obligatoires ;
* champs optionnels ;
* erreurs ;
* état loading ;
* bouton disabled ;
* soumission ;
* succès ;
* erreur ;
* conservation des données lorsque nécessaire.

Ne pas attendre le backend pour créer la logique de validation frontend de base.

Mais attention :

> **La validation frontend ne remplace jamais la validation backend.**

Le backend restera l'autorité finale.

---

# 6. API SERVICE : OBLIGATOIRE LORSQU'UNE DONNÉE MÉTIER EST NÉCESSAIRE

C'est une règle importante du projet.

Même si le backend n'est pas encore développé, **tu dois prévoir et écrire l'API Service nécessaire à l'intégration future.**

Architecture souhaitée :

```text
UI
 ↓
Component / Page
 ↓
Hook / Feature logic
 ↓
API Service
 ↓
Backend API
```

Évite :

```text
Component
 ↓
fetch() directement partout
```

Les appels API doivent être centralisés dans les services appropriés.

Par exemple :

```text
services/
├── auth.service.ts
├── tutor.service.ts
├── beneficiary.service.ts
├── offer.service.ts
├── availability.service.ts
├── booking.service.ts
├── session.service.ts
├── notification.service.ts
└── ...
```

Utilise les noms correspondant réellement au projet existant.

---

# 7. SI LE BACKEND N'EXISTE PAS ENCORE

Ne bloque pas le développement frontend.

Crée une abstraction propre permettant de travailler avec :

```text
Mock / données temporaires
        ↓
API Service
        ↓
Future API réelle
```

Le composant ne doit pas dépendre directement des données mockées.

Par exemple :

```text
Page
 ↓
Hook
 ↓
TutorService.getTutors()
 ↓
Mock maintenant
 ↓
API réelle plus tard
```

Ainsi, lors du développement backend, nous pourrons remplacer l'implémentation sans refaire les écrans.

---

# 8. CONSERVER LE CONTRAT AVEC LE FUTUR BACKEND

Lorsque tu crées un API Service, définis clairement :

* endpoint attendu ;
* méthode HTTP ;
* paramètres ;
* body ;
* réponse attendue ;
* erreurs possibles ;
* types TypeScript ;
* authentification nécessaire ;
* permissions nécessaires.

Exemple conceptuel :

```typescript
bookingService.createBooking(data)
```

avec un type correspondant à la spécification V2.

Ne crée pas des noms ou structures arbitraires qui risquent de contredire le modèle métier.

Si une information nécessaire n'est pas encore définie dans la spécification, **signale-la au lieu de l'inventer silencieusement.**

---

# 9. TYPESCRIPT / TYPES

Les données métier importantes doivent être typées.

Évite autant que possible :

```typescript
any
```

Utilise des types/interfaces/enums cohérents avec le domaine.

Par exemple :

```typescript
BookingStatus
TutorStatus
Availability
Beneficiary
Tutor
Offer
```

Les types frontend doivent pouvoir évoluer facilement lorsque les DTO backend seront branchés.

---

# 10. GESTION DES PERMISSIONS

Respecte les rôles et les permissions définis dans la spécification.

Un utilisateur ne doit pas voir ou exécuter une action simplement parce que le bouton existe dans le frontend.

Exemple :

```text
Demandeur
→ actions Demandeur

Tuteur
→ actions Tuteur

Administrateur
→ actions Admin
```

Le frontend masque/désactive les actions appropriées pour l'expérience utilisateur.

Mais rappelle-toi :

> **La sécurité réelle sera toujours assurée côté backend.**

---

# 11. NE PAS INVENTER DE LOGIQUE MÉTIER

Ne transforme pas une hypothèse en règle métier.

Si la spécification dit :

```text
PENDING
→ acceptation par le Tuteur
→ CONFIRMED
```

respecte cette logique.

Ne décide pas spontanément que :

```text
PENDING
→ CONFIRMED automatiquement
```

Même si cela semble techniquement plus simple.

En cas d'ambiguïté :

1. respecte la spécification existante ;
2. vérifie le contexte du projet ;
3. si réellement impossible à déterminer, signale le point.

---

# 12. NE PAS OUBLIER LES TRANSITIONS D'ÉTAT

Pour les fonctionnalités comportant des statuts, implémente explicitement les états autorisés.

Par exemple :

```text
PENDING
   ↓
CONFIRMED
   ↓
IN_PROGRESS
   ↓
COMPLETED
```

et les branches prévues :

```text
PENDING → REFUSED
PENDING → CANCELLED
CONFIRMED → CANCELLED
```

Le frontend doit afficher l'action appropriée selon l'état actuel.

Ne montre pas :

```text
[Accepter]
[Refuser]
```

si la réservation est déjà `CONFIRMED`.

---

# 13. ROUTING

Lorsque la partie développée nécessite de nouvelles routes :

* créer les routes nécessaires ;
* respecter la structure existante ;
* ajouter les guards nécessaires ;
* gérer les accès non autorisés ;
* gérer les routes inexistantes ;
* préserver les paramètres nécessaires au workflow.

Une navigation ne doit jamais faire perdre les données importantes déjà saisies.

---

# 14. RESPONSIVE

Le design fourni doit être adapté correctement aux tailles d'écran nécessaires au projet.

Priorité :

1. mobile ;
2. desktop ;
3. autres tailles si nécessaire.

Mais :

> **Ne change pas le workflow pour adapter le responsive.**

Adapte la présentation, pas la logique métier.

---

# 15. QUALITÉ DU CODE

Le code doit être :

* modulaire ;
* lisible ;
* maintenable ;
* typé ;
* réutilisable ;
* cohérent avec l'architecture existante.

Évite les gros composants contenant toute la logique.

Sépare autant que possible :

```text
UI
Business / feature logic
API Service
Types
Utilities
```

Ne crée pas inutilement une nouvelle architecture si le projet possède déjà une structure cohérente.

---

# 16. NE PAS FAIRE DE REFACTORING HORS PÉRIMÈTRE

Ne profite pas de la tâche pour réécrire tout le projet.

Si tu rencontres du code existant problématique :

* corrige uniquement ce qui bloque la fonctionnalité actuelle ;
* conserve le reste ;
* signale les améliorations possibles séparément.

La priorité actuelle est :

> **faire fonctionner le workflow V2.**

---

# 17. AVANT DE TERMINER LA TÂCHE

Effectue une vérification du parcours complet.

Vérifie notamment :

### UI

* tous les écrans demandés existent ;
* le HTML/design fourni est respecté ;
* les transitions fonctionnent ;
* les boutons correspondent aux actions prévues.

### États

* loading ;
* disabled ;
* success ;
* error ;
* empty ;
* validation ;
* réseau lorsque nécessaire.

### Workflow

* aucune étape obligatoire n'est contournée ;
* aucune étape supplémentaire inutile n'est introduite ;
* les données nécessaires sont transmises à l'étape suivante.

### API

* les API Services nécessaires existent ;
* les composants les utilisent correctement ;
* les données sont typées ;
* les appels sont centralisés ;
* l'intégration future avec le backend est possible.

### Code

* pas de `fetch()` dispersés inutilement ;
* pas de `any` inutile ;
* pas de données mockées directement dans les composants ;
* pas de logique métier critique uniquement côté UI.

---

# 18. LIVRABLE ATTENDU

À la fin de la tâche, fournis un résumé clair de :

### A. Écrans développés

```text
- ...
- ...
- ...
```

### B. Workflow couvert

```text
Étape 1
 ↓
Étape 2
 ↓
Étape 3
```

### C. API Services créés ou préparés

```text
- ...
- ...
- ...
```

Pour chacun :

```text
Service
Méthode
Endpoint prévu
Utilisation
```

### D. États gérés

```text
Loading
Disabled
Error
Success
Empty
Validation
...
```

### E. Points dépendant du backend

Liste précisément ce qui devra être connecté lorsque le backend V2 sera disponible.

### F. Points volontairement non développés

Liste ce qui est hors périmètre de la tâche actuelle.

---

# RÈGLE FINALE

Pour chaque partie développée, raisonne toujours selon cette chaîne :

```text
SPÉCIFICATION
      ↓
WORKFLOW
      ↓
ÉCRANS
      ↓
INTERACTIONS
      ↓
ÉTATS
      ↓
API SERVICE
      ↓
FUTUR BACKEND
```

**Ne saute aucune de ces étapes.**

Le frontend doit être développé comme une véritable interface prête à être intégrée au backend, et non comme une simple maquette interactive.

La priorité actuelle reste :

> **1. conformité à la spécification**
>
> **2. conformité au workflow**
>
> **3. préparation correcte de l'intégration backend**
>
> **4. gestion complète des états**
>
> **5. qualité du code**
>
> **6. améliorations visuelles et fonctionnelles plus tard**

# Utilise ces stacks :

Expo
React native
typescript
expo router
nativewind / tailwind CSS
framer-motion
zustand
AsyncStorage