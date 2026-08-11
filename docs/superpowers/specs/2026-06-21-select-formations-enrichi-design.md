# Affichage enrichi de la liste des formations — Étape 1 du tunnel

**Date :** 2026-06-21
**App :** `admission/apps/applicant` (Astro)
**Fichier cible :** `src/pages/index.astro`
**Statut :** Design validé — à planifier

---

## 1. Contexte & problème

À l'étape 1 (« Votre formation ») du tunnel de candidature, le choix de la
formation se fait via un `<select id="programme">` natif. Aujourd'hui chaque
option est construite par une boucle plate (`index.astro` ~ lignes 493-513) :

```js
o.textContent = pr.label + ' — ' + (pr.partner || 'LaNEM') + (pr.dd_affinity ? ' · ' + pr.dd_affinity : '');
```

Le rendu est minimaliste : liste plate, parcours noyé, partenaire « LaNEM »
répété sur chaque ligne, données utiles sous-exploitées. On veut un affichage
plus lisible **sans changer la nature « liste déroulante »** ni le flux du tunnel.

## 2. Objectif

Enrichir le rendu du `<select>` natif des formations :
- **regrouper** les formations par parcours (`<optgroup>`),
- **alléger et clarifier** le texte de chaque ligne,
- **adapter la taille de texte du champ selon la taille d'écran**.

## 3. Non-objectifs (hors périmètre)

- Pas de dropdown custom / composant listbox ARIA (on reste sur `<select>` natif).
- Pas de cartes sélectionnables ni de page catalogue navigable.
- Aucune extension du schéma back (pas de description marketing, image, durée,
  langue, capacité, modalité — ces champs n'existent pas dans le modèle).
- Pas de frais dans les lignes du select (frais inconnus au moment de lister,
  dépendants de la session ; déjà affichés dans l'encart « frais de candidature »).
- Aucun changement de flux : auto-sélection 1ʳᵉ option, ligne récap
  `#prog-choice`, `loadSessions()`, `syncRecap` restent identiques.

## 4. Contraintes

- **`<select>` natif = texte brut.** Pas de badge coloré, logo, multi-ligne ni
  couleur par ligne. Le seul levier de contenu est le `textContent` de chaque
  `<option>` et le `label` de chaque `<optgroup>`.
- **Plancher iOS 16px.** `.em-select` est volontairement à `--text-base` (16px)
  pour supprimer le zoom auto iOS au focus. La taille mobile ne descend jamais
  sous 16px.
- **Popup non stylable finement.** La liste ouverte hérite de la police du champ
  sur la plupart des navigateurs desktop ; sur mobile elle est rendue par le
  picker natif de l'OS (non contrôlable — comportement attendu).
- **Données disponibles** via `public.list_programmes` (aucune requête en plus) :
  `code`, `label`, `parcours` (Prépa/Licence/Bachelor/Double-Diplomation),
  `partner` (sigle, vide = LaNEM), `partner_name`, `location`, `dd_affinity`
  (Recommandé/Possible), `niveaux[]`, `dd_component_1/2`.

## 5. Design

### 5.1 Regroupement par parcours (`<optgroup>`)

Les options sont réparties en `<optgroup label="…">` dans l'**ordre canonique** :

1. Prépa
2. Licence
3. Bachelor
4. Double-Diplôme

Règles :
- Un groupe **sans formation est omis**.
- Un parcours inconnu/absent tombe dans un groupe **« Autres »** placé en dernier.
- Le `label` d'`<optgroup>` est posé en `textContent` (jamais d'`innerHTML`).

### 5.2 Tri intra-groupe

Tri **alphabétique** par titre affiché, insensible à la casse et aux accents :
`localeCompare(b, 'fr', { sensitivity: 'base' })`.

### 5.3 Format d'une ligne

`titre court` suivi de suffixes conditionnels joints par ` · ` :

| Élément | Règle |
|---|---|
| **Titre court** | On retire du `label` le mot de parcours en tête s'il y figure (« Licence Informatique » → « Informatique » sous le groupe Licence), insensible à la casse. Sinon `label` intégral. Les double-diplômes conservent leur libellé composite **intact**. |
| **Partenaire** | Affiché **seulement si `partner` non vide et ≠ « LaNEM »** (ex. `ESIIA`). LaNEM jamais répété (implicite). |
| **Lieu** | Affiché **seulement si le catalogue contient ≥ 2 lieux distincts** (calculé côté client au chargement). Sinon omis (évite « · Cotonou » répété = bruit). |
| **Affinité** | `dd_affinity` (Recommandé/Possible) affiché **uniquement** pour les double-diplômes (`parcours === 'Double-Diplomation'` et `dd_affinity` non vide). |

Exemple de rendu (catalogue mono-lieu) :

```
▾ Programme souhaité
 Prépa
    Prépa Intégrée
 Licence
    Génie Civil
    Informatique
 Bachelor
    Data & IA · ESIIA
 Double-Diplôme
    Licence Info + Bachelor Data · ESIIA · Recommandé
```

### 5.4 Taille de texte responsive

Override **scopé à `#programme`** dans le bloc `<style>` de `index.astro`
(n'altère pas le composant partagé `.em-select`) :

- **Par défaut (mobile)** : `font-size: var(--text-base)` (16px) — plancher iOS.
- **À partir de `--bp-md` (≥768px)** : `font-size: var(--text-md)` (17px) pour le
  confort de lecture ; cette taille est héritée par la liste ouverte sur desktop.

Le breakpoint réutilise la convention existante de la page (`@media (min-width: 768px)`).
Aucune modification du fichier `vendor/design-system/src/components.css`.

### 5.5 États & garde-fous (inchangés)

- Placeholder de chargement « Chargement des programmes… ».
- Catalogue vide → option unique « Aucun programme ouvert actuellement ».
- **Auto-sélection de la 1ʳᵉ option** (1ʳᵉ formation du 1ᵉʳ groupe non vide dans
  l'ordre canonique) puis `loadSessions()` — comportement actuel préservé.
- Construction **DOM par `textContent`** uniquement (conforme au pattern XSS-safe
  existant ; aucun `innerHTML`).
- `#prog-choice` (`updateChoiceLabel`) et `syncRecap` inchangés.

### 5.6 Cas limites & fallbacks

- `parcours` manquant → groupe « Autres » (dernier).
- `label` manquant → ligne vide évitée : fallback sur `code`.
- Titre court vide après strip (label == mot de parcours seul) → garder `label` intégral.
- Catalogue à une seule formation → un seul `<optgroup>` à une option, auto-sélectionnée.
- Tous mêmes lieux → aucun suffixe lieu (cf. 5.3).

## 6. Fichiers touchés

- `src/pages/index.astro`
  - bloc JS de construction des options (~ lignes 493-513) : groupement,
    tri, format de ligne, calcul « ≥ 2 lieux distincts », helper « titre court ».
  - bloc `<style>` : règle responsive scopée `#programme`.
- **Aucun autre fichier** (pas de back, pas de design-system, pas d'API client).

## 7. Critères d'acceptation

1. Les options sont regroupées par parcours dans l'ordre Prépa → Licence →
   Bachelor → Double-Diplôme ; les groupes vides n'apparaissent pas.
2. Dans chaque groupe, les formations sont triées alphabétiquement (accents/casse
   ignorés).
3. « LaNEM » n'apparaît plus dans les lignes ; un partenaire ≠ LaNEM (ex. ESIIA)
   apparaît.
4. Le lieu n'apparaît que si le catalogue a ≥ 2 lieux distincts.
5. L'affinité n'apparaît que sur les double-diplômes.
6. Sur ≥ 768px le champ est à 17px ; sur mobile il reste à 16px (pas de zoom iOS).
7. Auto-sélection de la 1ʳᵉ formation, chargement des sessions, ligne récap et
   encart frais fonctionnent comme avant.
8. Aucune injection HTML : tout est posé en `textContent`.

## 8. Risques

- **Strip du titre** trop agressif si un `label` ne suit pas la convention
  « <Parcours> <Nom> » → mitigé par le fallback (label intégral si le strip vide
  ou n'enlève rien d'utile).
- **Hétérogénéité navigateur** sur le rendu de l'`<optgroup>` et l'héritage de
  police du popup → acceptable : la sémantique de groupe et le texte enrichi
  restent corrects partout ; seul l'aspect visuel du popup varie (limite connue
  du `<select>` natif, assumée).
