# Rapport de mesure du matching sémantique (lot 7)

Généré le 2026-10-14 par `npm run matching:eval`.

## Conditions

- Modèle d'embedding : `hf.co/unsloth/embeddinggemma-2-GGUF:UD-Q4_K_XL` (dimension 768), Ollama réel ; préfixes `title: … | text: …` / `task: search result | query: …`.
- Jeu d'évaluation : 29 tuteurs fictifs (119 chunks), **41 demandes** annotées à la main (fichier `eval/dataset.ts`).
- Éligibilité : filtre SQL hiérarchique (rang strictement supérieur, E5/E8) ; violations constatées : **0**.
- Coefficients : corroboration 0.02 (fenêtre 0.1), bonus matière 0.03, bonus note 0.02 (a priori 3.5 sur 5 avis), filtre relatif 0.15.
- Pertinence graduée : 2 = très pertinent, 1 = pertinent ; gain nDCG = 2^rel − 1.

## Résultats avec les coefficients actuels

| | recall@10 | nDCG@10 | demandes |
|---|---|---|---|
| **Ensemble** | **0.992** | **0.975** | 41 |
| mathématiques | 0.967 | 0.970 | 10 |
| informatique | 1.000 | 0.985 | 12 |
| sémantique-sans-mots-communs | 1.000 | 0.868 | 4 |
| économie-gestion-droit | 1.000 | 1.000 | 10 |
| sciences-langues | 1.000 | 1.000 | 5 |

## Sensibilité aux coefficients (mêmes similarités, classements recalculés)

| Configuration | recall@10 | nDCG@10 |
|---|---|---|
| Coefficients actuels (spec §6.4) | 0.992 | 0.975 |
| Sans bonus (matière et note) | 0.992 | 0.975 |
| Sans corroboration | 0.992 | 0.978 |
| bestSim seul | 0.992 | 0.978 |
| Sans filtre de pertinence relatif | 0.992 | 0.975 |
| Filtre relatif 0,10 | 0.992 | 0.975 |
| Filtre relatif 0,20 | 0.992 | 0.975 |
| Filtre relatif 0,25 | 0.992 | 0.975 |
| Filtre relatif 0,30 | 0.992 | 0.975 |

## Distribution de la meilleure similarité (aide au choix d'un éventuel seuil absolu)

| | min | 10 % | médiane | 90 % | max | effectif |
|---|---|---|---|---|---|---|
| Tuteurs pertinents (annotés) | 0.654 | 0.726 | 0.796 | 0.841 | 0.877 | 66 |
| Tuteurs éligibles non pertinents | 0.576 | 0.621 | 0.660 | 0.700 | 0.789 | 1065 |

## Détail par demande

| Demande | Niveau | Groupe | recall@10 | nDCG@10 | Top 3 renvoyé | Pertinents |
|---|---|---|---|---|---|---|
| Q01 | Licence 1 | mathématiques | 1.000 | 1.000 | T01, T02, T24 | T01:2 |
| Q02 | Licence 2 | mathématiques | 1.000 | 1.000 | T02, T24, T23 | T02:2 |
| Q03 | Licence 2 | mathématiques | 0.667 | 0.879 | T03, T23, T15 | T03:2, T23:1, T12:1 |
| Q04 | Licence 3 | mathématiques | 1.000 | 0.945 | T04, T02, T24 | T04:2, T25:1 |
| Q05 | Licence 3 | mathématiques | 1.000 | 1.000 | T03, T23, T15 | T03:2, T23:1 |
| Q06 | Licence 1 | mathématiques | 1.000 | 1.000 | T01, T02, T24 | T01:2 |
| Q07 | Licence 3 | mathématiques | 1.000 | 1.000 | T24, T02, T25 | T24:2 |
| Q08 | Licence 2 | mathématiques | 1.000 | 1.000 | T01, T02, T10 | T01:2 |
| Q09 | Licence 3 | mathématiques | 1.000 | 0.933 | T23, T15, T16 | T23:2, T03:1 |
| Q10 | Licence 3 | mathématiques | 1.000 | 0.945 | T25, T24, T12 | T25:2, T04:1 |
| Q11 | Licence 2 | informatique | 1.000 | 1.000 | T07, T13, T14 | T07:2 |
| Q12 | Licence 3 | informatique | 1.000 | 1.000 | T07, T13, T11 | T07:2 |
| Q13 | Master 1 | informatique | 1.000 | 1.000 | T08, T29, T09 | T08:2, T29:2 |
| Q14 | Licence 2 | informatique | 1.000 | 1.000 | T10, T01, T13 | T10:2 |
| Q15 | Licence 3 | informatique | 1.000 | 1.000 | T09, T13, T14 | T09:2, T13:1 |
| Q16 | Licence 1 | informatique | 1.000 | 1.000 | T28, T13, T09 | T28:2, T09:1, T13:1 |
| Q17 | Licence 2 | informatique | 1.000 | 1.000 | T11, T29, T14 | T11:2, T29:1 |
| Q18 | Master 1 | informatique | 1.000 | 1.000 | T12, T10, T25 | T12:2 |
| Q19 | Licence 3 | informatique | 1.000 | 1.000 | T14, T11, T13 | T14:2 |
| Q20 | Licence 2 | informatique | 1.000 | 1.000 | T13, T09, T28 | T13:2, T09:1 |
| Q39 | Licence 1 | informatique | 1.000 | 0.821 | T28, T10, T09 | T10:2, T28:1, T09:1 |
| Q40 | Licence 3 | informatique | 1.000 | 1.000 | T29, T08, T11 | T08:2, T29:2, T11:1 |
| Q21 | Licence 3 | sémantique-sans-mots-communs | 1.000 | 0.918 | T07, T29, T22 | T07:2, T09:1 |
| Q22 | Licence 3 | sémantique-sans-mots-communs | 1.000 | 0.918 | T09, T22, T13 | T09:2, T07:1 |
| Q23 | Licence 2 | sémantique-sans-mots-communs | 1.000 | 0.672 | T28, T09, T07 | T07:1, T09:1, T10:1 |
| Q41 | Licence 3 | sémantique-sans-mots-communs | 1.000 | 0.964 | T04, T02, T25 | T04:2, T25:1 |
| Q24 | Licence 2 | économie-gestion-droit | 1.000 | 1.000 | T15, T16, T23 | T15:2 |
| Q25 | Licence 1 | économie-gestion-droit | 1.000 | 1.000 | T16, T15, T23 | T16:2 |
| Q26 | Licence 3 | économie-gestion-droit | 1.000 | 1.000 | T17, T15, T19 | T17:2 |
| Q27 | Licence 1 | économie-gestion-droit | 1.000 | 1.000 | T18, T17, T16 | T18:2 |
| Q28 | Licence 3 | économie-gestion-droit | 1.000 | 1.000 | T19, T20, T18 | T19:2, T20:1 |
| Q29 | Licence 2 | économie-gestion-droit | 1.000 | 1.000 | T20, T19, T16 | T20:2, T19:1 |
| Q30 | Licence 2 | économie-gestion-droit | 1.000 | 1.000 | T21, T16, T15 | T21:2 |
| Q31 | Licence 3 | économie-gestion-droit | 1.000 | 1.000 | T22, T13, T14 | T22:2 |
| Q32 | Master 1 | économie-gestion-droit | 1.000 | 1.000 | T16, T15, T23 | T16:2 |
| Q33 | Licence 3 | économie-gestion-droit | 1.000 | 1.000 | T15, T16, T23 | T15:2, T16:1 |
| Q34 | Licence 2 | sciences-langues | 1.000 | 1.000 | T05, T15, T16 | T05:2 |
| Q35 | Licence 3 | sciences-langues | 1.000 | 1.000 | T06, T01, T02 | T06:2 |
| Q36 | Licence 1 | sciences-langues | 1.000 | 1.000 | T27, T14, T03 | T27:2 |
| Q37 | Licence 2 | sciences-langues | 1.000 | 1.000 | T26 | T26:2 |
| Q38 | Master 2 | sciences-langues | 1.000 | 1.000 | T04, T25, T02 | T04:2, T25:1 |

## Pertinents non retrouvés dans le top 10

- **Q03** (Licence 2) « Lois de probabilité discrètes, espérance et variance, loi binomiale : … » : T12 (pertinence 1, rang 17, sim 0.654)

## Lecture

- Observation : avec les coefficients actuels, les manqués sont des tuteurs de pertinence 1 écartés par le filtre relatif (0.15) ; la configuration au meilleur recall du tableau est « Coefficients actuels (spec §6.4) » (recall 0.992, nDCG 0.975). Aucun coefficient n'est modifié ici : c'est une décision de calibrage pour l'équipe.
- Ces valeurs servent de **référence** : toute modification des coefficients ou du modèle doit être comparée à ce rapport.
- Le jeu est volontairement petit et propre (tuteurs fictifs, textes soignés) : il mesure la mécanique, pas la qualité en production. Recalibrer ensuite avec `MatchingSearch` (clics, réservations).
- Aucun seuil absolu n'est retenu : voir la distribution ci-dessus ; le filtre relatif reste la règle tant que le recouvrement entre pertinents et non pertinents n'est pas levé.
