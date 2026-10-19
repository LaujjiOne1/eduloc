# Données de test du matching universitaire

Généré par `npm run db:seed:matching`. Les 29 tuteurs ci-dessous sont **approuvés, visibles, au niveau académique validé** ;
mot de passe de tous les comptes : `Demo12345!`. Demandeur de démo : `demo@eduloc.mg` (même mot de passe).

## Règle à connaître

Un tuteur n'apparaît que si le **niveau validé** de son profil est **strictement supérieur** au niveau de la demande 
(Licence 2 → tuteurs de Licence 3, Master 1, Master 2, Doctorat ; Master 2 → Doctorat uniquement) **et** s'il a déclaré ce niveau 
pour au moins une matière. Les tuteurs « Licence 3 » (étudiants) ne servent que les demandes de Licence 1 et 2.

## Tuteurs

| Clé | Nom | Compte | Niveau validé | Diplôme | Matières |
|---|---|---|---|---|---|
| T01 | Haja Andrianina | t01@matching.eduloc.mg | Master 2 | Master Mathématiques fondamentales | Algèbre linéaire, Algèbre abstraite |
| T02 | Voahangy Ratsimbazafy | t02@matching.eduloc.mg | Doctorat | Doctorat en analyse fonctionnelle | Analyse réelle |
| T03 | Tahiry Rakotoarison | t03@matching.eduloc.mg | Master 2 | Master Statistique et probabilités | Probabilités et statistiques |
| T04 | Fanja Razafindrakoto | t04@matching.eduloc.mg | Doctorat | Doctorat en traitement du signal | Traitement du signal |
| T05 | Mamy Rasolonjatovo | t05@matching.eduloc.mg | Master 2 | Master Physique de l’énergie | Thermodynamique |
| T06 | Lalaina Rabemananjara | t06@matching.eduloc.mg | Doctorat | Doctorat en chimie organique | Chimie organique |
| T07 | Toky Randrianasolo | t07@matching.eduloc.mg | Master 2 | Master MIAGE | Bases de données |
| T08 | Hasina Rakotomalala | t08@matching.eduloc.mg | Master 2 | Master Informatique parcours Sécurité des systèmes | Cryptographie |
| T09 | Ny Aina Rajaonarison | t09@matching.eduloc.mg | Master 2 | Diplôme d’ingénieur logiciel | Programmation |
| T10 | Faniry Andriamihaja | t10@matching.eduloc.mg | Doctorat | Doctorat en informatique | Algorithmique avancée |
| T11 | Njaka Ravelomanana | t11@matching.eduloc.mg | Master 1 | Master Informatique parcours Réseaux | Réseaux informatiques |
| T12 | Mihaja Rasoanaivo | t12@matching.eduloc.mg | Master 2 | Master Data Science | Apprentissage automatique |
| T13 | Rivo Andrianjafy | t13@matching.eduloc.mg | Master 1 | Master Informatique parcours Génie logiciel | Programmation |
| T14 | Santatra Ramaroson | t14@matching.eduloc.mg | Master 1 | Master Informatique parcours Systèmes | Systèmes d’exploitation |
| T15 | Lova Ranaivoson | t15@matching.eduloc.mg | Doctorat | Doctorat en sciences économiques | Macroéconomie |
| T16 | Soa Rakotonirina | t16@matching.eduloc.mg | Master 2 | Master Économie théorique | Microéconomie |
| T17 | Fidy Rabenja | t17@matching.eduloc.mg | Master 2 | Master Finance de marché | Finance d’entreprise |
| T18 | Nirina Raharimanana | t18@matching.eduloc.mg | Master 1 | Master Comptabilité Contrôle Audit | Comptabilité |
| T19 | Tsiory Razanamahefa | t19@matching.eduloc.mg | Master 2 | Master Droit des affaires | Droit des affaires |
| T20 | Miora Andriamanalina | t20@matching.eduloc.mg | Doctorat | Doctorat en droit privé | Droit civil |
| T21 | Zo Rasamoelina | t21@matching.eduloc.mg | Master 1 | Master Marketing et vente | Marketing |
| T22 | Hanta Rakotovao | t22@matching.eduloc.mg | Master 2 | Master Management de projet | Gestion de projet |
| T23 | Joel Randrianarivelo | t23@matching.eduloc.mg | Doctorat | Doctorat en économie quantitative | Économétrie, Probabilités et statistiques |
| T24 | Eric Rajoelina | t24@matching.eduloc.mg | Master 2 | Master Mathématiques appliquées | Analyse numérique |
| T25 | Andry Ratovoson | t25@matching.eduloc.mg | Doctorat | Doctorat en automatique | Automatique |
| T26 | Sarah Rakotoson | t26@matching.eduloc.mg | Master 1 | Master Études anglophones | Anglais |
| T27 | Mirana Ramanantsoa | t27@matching.eduloc.mg | Master 2 | Master Biologie moléculaire | Biologie cellulaire et génétique |
| T28 | Kanto Randria | t28@matching.eduloc.mg | Licence 3 | Licence en informatique (en cours, L3) | Programmation |
| T29 | Ando Rasolofoniaina (expert pro) | t29@matching.eduloc.mg | Doctorat | Diplôme d’ingénieur en cybersécurité (expert professionnel) | Cryptographie, Réseaux informatiques |

## Scénarios à essayer

Connectez-vous avec `demo@eduloc.mg`, choisissez le **niveau**, la **matière** (ou une matière proche), saisissez le **besoin** tel quel,
puis vérifiez que les tuteurs attendus ressortent en premier (« très pertinent » d'abord). Sans mots communs : Q04, Q21, Q22, Q23, Q41.

| # | Niveau | Matière | Besoin à saisir | Attendus (très pertinents → pertinents) |
|---|---|---|---|---|
| Q01 | Licence 1 | Algèbre linéaire | Je dois comprendre la diagonalisation de matrices et savoir calculer les valeurs propres et les vecteurs propres. | **Haja Andrianina** |
| Q02 | Licence 2 | Analyse 2 | Intégrales impropres, séries numériques et critères de convergence : je n’arrive pas à savoir quel critère appliquer. | **Voahangy Ratsimbazafy** |
| Q03 | Licence 2 | Probabilités et statistiques | Lois de probabilité discrètes, espérance et variance, loi binomiale : j’ai besoin de beaucoup d’exercices. | **Tahiry Rakotoarison**, Joel Randrianarivelo, Mihaja Rasoanaivo |
| Q04 | Licence 3 | Traitement du signal | Je galère avec les transformées de Fourier et l’analyse de signaux avant mon examen. | **Fanja Razafindrakoto**, Andry Ratovoson |
| Q05 | Licence 3 | Probabilités et statistiques | Estimation ponctuelle, intervalles de confiance et tests d’hypothèses sur un échantillon. | **Tahiry Rakotoarison**, Joel Randrianarivelo |
| Q06 | Licence 1 | Algèbre linéaire | Espaces vectoriels, bases, dimension et applications linéaires : je veux revoir tout le cours. | **Haja Andrianina** |
| Q07 | Licence 3 | Équations différentielles | Résolution numérique d’équations différentielles ordinaires : méthodes d’Euler et de Runge-Kutta en Python. | **Eric Rajoelina** |
| Q08 | Licence 2 | Algèbre abstraite | Groupes, sous-groupes et homomorphismes : comment démontrer qu’une application est un morphisme ? | **Haja Andrianina** |
| Q09 | Licence 3 | Économétrie | Régression linéaire multiple, moindres carrés ordinaires et interprétation des coefficients. | **Joel Randrianarivelo**, Tahiry Rakotoarison |
| Q10 | Licence 3 | Automatique | Transformée de Laplace, fonction de transfert et stabilité d’un système asservi. | **Andry Ratovoson**, Fanja Razafindrakoto |
| Q11 | Licence 2 | Bases de données | Normalisation d’une base en formes normales, requêtes SQL et jointures. | **Toky Randrianasolo** |
| Q12 | Licence 3 | Bases de données | Modélisation avec MERISE, passage au modèle relationnel et requêtes SQL avancées. | **Toky Randrianasolo** |
| Q13 | Master 1 | Cryptographie | Cryptographie asymétrique : fonctionnement de RSA et gestion des clés pour mon projet. | **Hasina Rakotomalala**, **Ando Rasolofoniaina** |
| Q14 | Licence 2 | Algorithmique avancée | Complexité algorithmique et graphes : parcours en largeur, en profondeur et algorithme de Dijkstra. | **Faniry Andriamihaja** |
| Q15 | Licence 3 | Programmation | Programmation orientée objet en Java, héritage et diagrammes de classes UML. | **Ny Aina Rajaonarison**, Rivo Andrianjafy |
| Q16 | Licence 1 | Programmation | Initiation à Python : boucles, fonctions et listes, je pars de zéro. | **Kanto Randria**, Ny Aina Rajaonarison, Rivo Andrianjafy |
| Q17 | Licence 2 | Réseaux | Adressage IP, calcul de sous-réseaux et principes du routage. | **Njaka Ravelomanana**, Ando Rasolofoniaina |
| Q18 | Master 1 | Machine learning | Apprentissage automatique : classification supervisée et réseaux de neurones sur un jeu de données. | **Mihaja Rasoanaivo** |
| Q19 | Licence 3 | Systèmes d’exploitation | Processus, threads, gestion de la mémoire et commandes sous Linux. | **Santatra Ramaroson** |
| Q20 | Licence 2 | Programmation | Développer une application web avec React et une API REST. | **Rivo Andrianjafy**, Ny Aina Rajaonarison |
| Q39 | Licence 1 | Informatique | Je suis perdu en première année d’informatique : besoin de méthode et de bases en algorithmique. | **Faniry Andriamihaja**, Kanto Randria, Ny Aina Rajaonarison |
| Q40 | Licence 3 | Sécurité informatique | Sécurité des systèmes d’information et protocoles cryptographiques utilisés sur Internet. | **Hasina Rakotomalala**, **Ando Rasolofoniaina**, Njaka Ravelomanana |
| Q21 | Licence 3 | Informatique de gestion | Je prépare un Master MIAGE et je cherche un tuteur au parcours proche, sur les systèmes d’information. | **Toky Randrianasolo**, Ny Aina Rajaonarison |
| Q22 | Licence 3 | Génie logiciel | Je vise un diplôme d’ingénieur logiciel : conception, tests et architecture d’une application. | **Ny Aina Rajaonarison**, Toky Randrianasolo |
| Q23 | Licence 2 | Informatique | Je suis en Master Informatique l’an prochain : j’ai besoin de revoir programmation et bases de données. | Toky Randrianasolo, Ny Aina Rajaonarison, Faniry Andriamihaja |
| Q41 | Licence 3 | Mathématiques | Les transformées de Fourier me bloquent : spectres, fréquences et filtrage d’un signal. | **Fanja Razafindrakoto**, Andry Ratovoson |
| Q24 | Licence 2 | Macroéconomie | Modèle IS-LM, politique monétaire et lien avec l’inflation. | **Lova Ranaivoson** |
| Q25 | Licence 1 | Microéconomie | Théorie du consommateur : utilité, contrainte budgétaire et courbes d’indifférence. | **Soa Rakotonirina** |
| Q26 | Licence 3 | Finance | Calcul de la VAN, valorisation d’une action et portefeuille efficient (MEDAF). | **Fidy Rabenja** |
| Q27 | Licence 1 | Comptabilité | Comprendre le bilan, le compte de résultat et les écritures comptables. | **Nirina Raharimanana** |
| Q28 | Licence 3 | Droit des affaires | Sociétés commerciales et responsabilité des dirigeants en cas de faillite. | **Tsiory Razanamahefa**, Miora Andriamanalina |
| Q29 | Licence 2 | Droit civil | Responsabilité civile et régime des obligations : faute, préjudice et lien de causalité. | **Miora Andriamanalina**, Tsiory Razanamahefa |
| Q30 | Licence 2 | Marketing | Étude de marché, segmentation et mix marketing pour lancer un produit. | **Zo Rasamoelina** |
| Q31 | Licence 3 | Gestion de projet | Planification d’un projet, diagramme de Gantt, chemin critique et méthode Agile. | **Hanta Rakotovao** |
| Q32 | Master 1 | Microéconomie | Théorie des jeux : équilibre de Nash, jeux répétés et stratégies dominantes. | **Soa Rakotonirina** |
| Q33 | Licence 3 | Macroéconomie | Croissance économique et modèle de Solow : accumulation du capital et état stationnaire. | **Lova Ranaivoson**, Soa Rakotonirina |
| Q34 | Licence 2 | Thermodynamique | Premier et second principe, entropie et cycle de Carnot. | **Mamy Rasolonjatovo** |
| Q35 | Licence 3 | Chimie organique | Mécanismes de substitution nucléophile et interprétation d’un spectre RMN. | **Lalaina Rabemananjara** |
| Q36 | Licence 1 | Biologie | Génétique mendélienne, croisements et biologie cellulaire : méthode pour les exercices. | **Mirana Ramanantsoa** |
| Q37 | Licence 2 | Anglais | Rédiger un article scientifique en anglais et préparer le TOEFL. | **Sarah Rakotoson** |
| Q38 | Master 2 | Traitement du signal | Analyse spectrale avancée et filtrage numérique pour mon mémoire. | **Fanja Razafindrakoto**, Andry Ratovoson |

## Contre-épreuves (le niveau prime sur la pertinence)

- Niveau **Master 2**, besoin « droit des affaires, sociétés commerciales » : seuls les docteurs et l'expert sont éligibles. Le tuteur de droit des affaires (Master, niveau M2) ne doit **pas** apparaître, car il n'est pas de rang supérieur ; c'est le docteur en droit privé qui ressort.
- Niveau **Formation pro** (hors échelle) : aucun tuteur éligible, quelle que soit la matière.
- Avant l'indexation (Ollama arrêté ou API éteinte) : la recherche universitaire répond `503 MATCHING_UNAVAILABLE`.
