# Diagrammes du chapitre 5 (code PlantUML)

Chaque fichier `.puml` produit un diagramme du chapitre 5. Pour les rendre : extension VS Code « PlantUML » (Alt+D) ou le site plantuml.com, puis exporter en PNG et insérer l'image à l'emplacement jaune du document Word.

| Fichier | Diagramme | Section du chapitre |
|---|---|---|
| `01_cas_utilisation.puml` | Cas d'utilisation global | 5.2 Identification des acteurs |
| `02_modele_domaine.puml` | Modèle du domaine | 5.7 |
| `03_classes_sprint1.puml` | Classes, sprint 1 (comptes, bénéficiaires, catalogue) | 5.8 |
| `04_classes_sprint2.puml` | Classes, sprint 2 (candidature, profil, offres) | 5.8 |
| `05_classes_sprint3.puml` | Classes, sprint 3 (disponibilités, lieux, recherche) | 5.8 |
| `06_classes_sprint4.puml` | Classes, sprint 4 (réservation, séance) | 5.8 |
| `11_etats_reservation.puml` | États d'une réservation (complète le sprint 4) | 5.8 |
| `07_classes_sprint5.puml` | Classes, sprint 5 (matching sémantique, import de CV) | 5.8 |
| `08_classes_sprint6.puml` | Classes, sprint 6 (lieux partenaires, prix, avis) | 5.8 |
| `09_classes_sprint7.puml` | Classes, sprint 7 (communication, notifications, administration) | 5.8 |
| `10_classes_globale.puml` | Classes de conception globale (1/2 : comptes, catalogue, tuteur, matching) | 5.9 |
| `10b_classes_globale_suite.puml` | Classes de conception globale (2/2 : réservation, lieux partenaires, communication) | 5.9 |
| `12_paquetage.puml` | Paquetage | 5.10 |
| `13_deploiement.puml` | Déploiement | 5.11 |

Les noms de classes, d'attributs et de méthodes sont ceux du code (`prisma/schema.prisma` et services NestJS). Si un diagramme est trop large, ajouter `skinparam dpi 150` ou retirer `skinparam linetype ortho` dans `10_classes_globale.puml` et `10b_classes_globale_suite.puml`.
