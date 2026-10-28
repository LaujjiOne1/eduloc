# Traductions (i18n)

Langues actuelles : **français** (langue de référence), **anglais** et **malagasy**.
Les textes malagasy ont été rédigés sans relecture par un locuteur natif : à faire valider avant publication.
Bibliothèque : `i18next` + `react-i18next`. Langue initiale = celle de l'appareil (`expo-localization`), puis le choix de
l'utilisateur (sélecteur dans l'accueil, la connexion et le compte), mémorisé dans `AsyncStorage`.

## Ajouter une langue (ex. l'espagnol `es`)

1. Copier `locales/en/` vers `locales/es/` et traduire les valeurs des fichiers `.json` (ne pas toucher aux clés ni aux
   variables `{{...}}`). Les pluriels s'écrivent `clé_one` / `clé_other` (ajouter les formes que la langue exige).
2. Créer `locales/es/index.ts` en copiant `locales/en/index.ts` (renommer `en` en `es`).
3. Ajouter **une ligne** dans `registry.ts` :
   `{ code: "es", label: "Español", intlLocale: "es-ES", translation: es }` (+ l'import en haut).
4. Déclarer la langue au système dans `app.json` (`supportedLocales` du plugin `expo-localization`) et créer
   `locales/es.json` (textes d'autorisation iOS) si besoin.
5. `npm run i18n:check` et `npx tsc --noEmit` : la compilation échoue si une clé du français manque.

Le sélecteur de langue, la détection de l'appareil, les dates (`Intl`) et l'en-tête `Accept-Language` suivent
automatiquement le registre.

## Utiliser une traduction

- **Dans un composant** : `const { t } = useTranslation();` puis `t("search.level.whatIsTheStudyLevel")`.
- **Hors composant** (service, hook, formateur) : `import { t } from "@/i18n"`.
- **Constante de module** (libellés d'un `Record`, d'une liste d'options) : ne jamais écrire `label: t("…")`, qui serait
  évalué une seule fois au chargement. Utiliser un accesseur : `get label() { return t("…"); }`.
- **Pluriels** : `t("common.slotCount", { count })` avec `slotCount_one` et `slotCount_other` dans les JSON.
- **Dates / jours / mois** : `@/i18n/dates` (`weekdayNames()`, `monthNames()`) et `currentIntlLocale()` pour `Intl`.
- Une phrase = une clé (ne pas concaténer des morceaux traduits : l'ordre des mots change d'une langue à l'autre).
- Ne traduisez jamais une valeur utilisée dans une comparaison ou envoyée au serveur (`category === "Lycée"`, identifiants).

## Organisation

`locales/<langue>/<groupe>.json`, le groupe étant le dossier de l'écran ou du composant (`search`, `booking`, `ui`,
`tutorDashboard`…) et `common` pour les textes partagés. Au changement de langue, le contenu des écrans est remonté
(`LanguageBoundary` dans `app/_layout.tsx`) : les libellés calculés au chargement des données sont recalculés.

## Limites connues

- Les **données du catalogue** renvoyées par l'API (niveaux, matières, séries, mentions, noms de tuteurs, motifs de refus,
  textes de notifications serveur) restent dans la langue du serveur. Le client envoie `Accept-Language`, mais le backend
  ne le traite pas encore.
- `lib/experience-warnings.ts` filtre des avertissements d'import de CV par mots français (`manquant`, `non précis`).
