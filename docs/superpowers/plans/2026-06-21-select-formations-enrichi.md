# Affichage enrichi du select des formations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le `<select>` plat des formations (étape 1 du tunnel) par une liste groupée par parcours, triée alphabétiquement, au texte enrichi, avec une taille de police responsive.

**Architecture:** La logique pure (groupement / tri / format de ligne) est isolée dans un module sans DOM `public/scripts/programme-options.js`, testable via le test runner natif de Node. `index.astro` ne garde que le glue DOM (construction `<optgroup>`/`<option>` en `textContent`) + une règle CSS responsive scopée. Aucun changement back-end.

**Tech Stack:** Astro 5 (page `.astro` + `<script is:inline>`), JS ES5 (cohérent avec `admission-tunnel.js`), `node --test` (built-in, zéro dépendance).

## Global Constraints

- **`<select>` natif uniquement** — texte brut, pas de badge/logo/couleur par ligne.
- **Plancher 16px sur mobile** (`--text-base`) pour ne pas déclencher le zoom auto iOS au focus.
- **Construction DOM par `textContent` exclusivement** — jamais d'`innerHTML` (pattern XSS-safe existant).
- **Aucune requête réseau supplémentaire** — on n'exploite que les champs déjà renvoyés par `public.list_programmes` (`code`, `label`, `parcours`, `partner`, `location`, `dd_affinity`).
- **Aucun changement** de `vendor/design-system/`, du back, ni du flux (auto-sélection 1ʳᵉ option, `loadSessions`, `syncRecap`, `#prog-choice`, encart frais inchangés).
- **Ordre canonique des parcours :** Prépa → Licence → Bachelor → Double-Diplomation (libellé de groupe affiché : « Double-Diplôme ») ; parcours inconnu → groupe « Autres » en dernier.
- **Strip du titre :** retirer en tête uniquement `Licence`/`Bachelor` (PAS `Prépa` — noms composés propres, conforme au mockup validé) ; les double-diplômes gardent leur libellé composite intact ; fallback = label intégral si le résultat est vide.

---

### Task 1 : Module pur `programme-options.js` + tests

**Files:**
- Create: `public/scripts/programme-options.js`
- Test: `tests/programme-options.test.mjs`
- Modify: `package.json` (ajout du script `test`)

**Interfaces:**
- Produces: global `window.ProgrammeOptions.buildProgrammeGroups(programmes)` (aussi `globalThis.ProgrammeOptions` côté Node).
  - **Entrée :** `programmes` = tableau d'objets `{ code, label, parcours, partner, location, dd_affinity }`.
  - **Sortie :** `Array<{ label: string, options: Array<{ value: string, text: string }> }>` — groupes dans l'ordre canonique (groupes vides omis), options triées alphabétiquement (fr, accents/casse ignorés).

- [ ] **Step 1 : Écrire le fichier de test (qui échoue)**

Create `tests/programme-options.test.mjs` :

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../public/scripts/programme-options.js';

const build = globalThis.ProgrammeOptions.buildProgrammeGroups;

const SAMPLE = [
  { code: 'LIC-INFO', label: 'Licence Informatique', parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' },
  { code: 'LIC-GC',   label: 'Licence Génie Civil',  parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' },
  { code: 'PREPA',    label: 'Prépa Intégrée',       parcours: 'Prépa',   partner: '', location: 'Cotonou', dd_affinity: '' },
  { code: 'BACH-DATA',label: 'Bachelor Data & IA',   parcours: 'Bachelor',partner: 'ESIIA', location: 'Cotonou', dd_affinity: '' },
  { code: 'DD-1',     label: 'Licence Info + Bachelor Data', parcours: 'Double-Diplomation', partner: 'ESIIA', location: 'Cotonou', dd_affinity: 'Recommandé' }
];

test('groupes dans l’ordre canonique, vides omis', () => {
  const g = build(SAMPLE);
  assert.deepEqual(g.map(x => x.label), ['Prépa', 'Licence', 'Bachelor', 'Double-Diplôme']);
});

test('tri alphabétique intra-groupe (accents/casse ignorés)', () => {
  const licence = build(SAMPLE).find(x => x.label === 'Licence');
  assert.deepEqual(licence.options.map(o => o.text), ['Génie Civil', 'Informatique']);
});

test('strip du titre : Licence/Bachelor retirés, Prépa conservé', () => {
  const g = build(SAMPLE);
  assert.equal(g.find(x => x.label === 'Prépa').options[0].text, 'Prépa Intégrée');
  assert.equal(g.find(x => x.label === 'Licence').options[0].text, 'Génie Civil');
});

test('partenaire affiché seulement si ≠ LaNEM / non vide', () => {
  const bach = build(SAMPLE).find(x => x.label === 'Bachelor').options[0];
  assert.equal(bach.text, 'Data & IA · ESIIA');
  const lic = build(SAMPLE).find(x => x.label === 'Licence').options[0];
  assert.ok(!lic.text.includes('LaNEM'));
});

test('lieu masqué si un seul lieu distinct, affiché si ≥ 2', () => {
  const mono = build(SAMPLE).find(x => x.label === 'Licence').options[0];
  assert.equal(mono.text, 'Génie Civil');
  const multi = build(SAMPLE.concat([
    { code: 'LIC-X', label: 'Licence Droit', parcours: 'Licence', partner: '', location: 'Porto-Novo', dd_affinity: '' }
  ]));
  const droit = multi.find(x => x.label === 'Licence').options.find(o => o.value === 'LIC-X');
  assert.equal(droit.text, 'Droit · Porto-Novo');
});

test('affinité seulement pour les double-diplômes, libellé composite intact', () => {
  const dd = build(SAMPLE).find(x => x.label === 'Double-Diplôme').options[0];
  assert.equal(dd.text, 'Licence Info + Bachelor Data · ESIIA · Recommandé');
});

test('parcours inconnu → groupe « Autres » en dernier', () => {
  const g = build(SAMPLE.concat([
    { code: 'X', label: 'Mastère Spécialisé', parcours: 'MS', partner: '', location: 'Cotonou', dd_affinity: '' }
  ]));
  assert.equal(g[g.length - 1].label, 'Autres');
});

test('entrée vide → []', () => {
  assert.deepEqual(build([]), []);
  assert.deepEqual(build(undefined), []);
});

test('label manquant → fallback sur le code', () => {
  const g = build([{ code: 'ZZ', label: '', parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' }]);
  assert.equal(g[0].options[0].text, 'ZZ');
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `cd admission/apps/applicant && node --test tests/programme-options.test.mjs`
Expected : FAIL — `Cannot read properties of undefined (reading 'buildProgrammeGroups')` (le module n'existe pas encore).

- [ ] **Step 3 : Écrire le module**

Create `public/scripts/programme-options.js` :

```js
/* programme-options.js — logique pure de mise en forme du catalogue formations
   pour le <select> de l'étape 1. Aucune dépendance DOM : entrée = tableau de
   programmes (public.list_programmes), sortie = groupes { label, options[] }.
   Chargé en <script is:inline> (global navigateur) ET importable en Node (globalThis). */
(function (root) {
  'use strict';

  /* Ordre canonique : [valeur parcours back, libellé de groupe affiché]. */
  var PARCOURS_ORDER = [
    { value: 'Prépa', label: 'Prépa' },
    { value: 'Licence', label: 'Licence' },
    { value: 'Bachelor', label: 'Bachelor' },
    { value: 'Double-Diplomation', label: 'Double-Diplôme' }
  ];
  var FALLBACK_LABEL = 'Autres';
  /* Mots retirables en tête de titre (PAS « Prépa » : noms composés propres). */
  var STRIP_WORDS = ['Licence', 'Bachelor'];

  function trimStr(v) { return (v == null ? '' : String(v)).trim(); }

  /* Titre court : retire le mot de parcours en tête si présent, sinon label entier. */
  function shortTitle(prog) {
    var label = trimStr(prog.label) || trimStr(prog.code);
    if (prog.parcours === 'Double-Diplomation') { return label; }
    for (var i = 0; i < STRIP_WORDS.length; i++) {
      var w = STRIP_WORDS[i];
      if (label.toLowerCase().indexOf(w.toLowerCase() + ' ') === 0) {
        var rest = label.slice(w.length + 1).trim();
        return rest || label;
      }
    }
    return label;
  }

  /* Nombre de lieux distincts non vides dans tout le catalogue. */
  function distinctLocationCount(programmes) {
    var seen = {};
    for (var i = 0; i < programmes.length; i++) {
      var loc = trimStr(programmes[i].location).toLowerCase();
      if (loc) { seen[loc] = true; }
    }
    return Object.keys(seen).length;
  }

  /* Texte d'une option : titre · partenaire? · lieu? · affinité? */
  function optionText(prog, showLocation) {
    var parts = [shortTitle(prog)];
    var partner = trimStr(prog.partner);
    if (partner && partner !== 'LaNEM') { parts.push(partner); }
    var loc = trimStr(prog.location);
    if (showLocation && loc) { parts.push(loc); }
    if (prog.parcours === 'Double-Diplomation') {
      var aff = trimStr(prog.dd_affinity);
      if (aff) { parts.push(aff); }
    }
    return parts.join(' · ');
  }

  function groupIndex(parcours) {
    for (var i = 0; i < PARCOURS_ORDER.length; i++) {
      if (PARCOURS_ORDER[i].value === parcours) { return i; }
    }
    return PARCOURS_ORDER.length; /* fallback « Autres » */
  }

  function buildProgrammeGroups(programmes) {
    var list = Array.isArray(programmes) ? programmes : [];
    var showLocation = distinctLocationCount(list) >= 2;
    var buckets = {};
    for (var i = 0; i < list.length; i++) {
      var prog = list[i];
      var gi = groupIndex(prog.parcours);
      if (!buckets[gi]) { buckets[gi] = []; }
      buckets[gi].push({
        value: trimStr(prog.code),
        text: optionText(prog, showLocation),
        sortKey: shortTitle(prog)
      });
    }
    var groups = [];
    var order = Object.keys(buckets).map(Number).sort(function (a, b) { return a - b; });
    for (var j = 0; j < order.length; j++) {
      var gi2 = order[j];
      var label = gi2 < PARCOURS_ORDER.length ? PARCOURS_ORDER[gi2].label : FALLBACK_LABEL;
      var opts = buckets[gi2].sort(function (a, b) {
        return a.sortKey.localeCompare(b.sortKey, 'fr', { sensitivity: 'base' });
      }).map(function (o) { return { value: o.value, text: o.text }; });
      groups.push({ label: label, options: opts });
    }
    return groups;
  }

  root.ProgrammeOptions = { buildProgrammeGroups: buildProgrammeGroups };
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run : `cd admission/apps/applicant && node --test tests/programme-options.test.mjs`
Expected : PASS — 9 tests OK, 0 fail.

- [ ] **Step 5 : Ajouter le script `test` au package.json**

Modify `package.json` — dans `"scripts"`, ajouter après `"astro": "astro"` :

```json
    "astro": "astro",
    "test": "node --test tests/*.test.mjs"
```

> Note Node 25 : passer un répertoire à `node --test` l'interprète comme un module ; on cible donc le glob `tests/*.test.mjs`.

- [ ] **Step 6 : Vérifier via le script npm**

Run : `cd admission/apps/applicant && npm test`
Expected : PASS — 9 tests.

- [ ] **Step 7 : Commit**

```bash
git add public/scripts/programme-options.js tests/programme-options.test.mjs package.json
git commit -m "feat(applicant): logique pure groupement/format du catalogue formations + tests"
```

---

### Task 2 : Intégration dans `index.astro` (glue DOM + CSS responsive)

**Files:**
- Modify: `src/pages/index.astro` (include script, `parcoursLabel`, boucle de construction des options, bloc `<style>`)

**Interfaces:**
- Consumes: `window.ProgrammeOptions.buildProgrammeGroups` (Task 1) ; `progByCode`, `sel`, `loadSessions`, `syncRecap` (existants dans l'IIFE de la page).

- [ ] **Step 1 : Inclure le module avant le script inline**

Modify `src/pages/index.astro` — après la ligne `<script is:inline src="/scripts/admission-tunnel.js"></script>` (~ligne 282), ajouter :

```html
<script is:inline src="/scripts/admission-tunnel.js"></script>
<script is:inline src="/scripts/programme-options.js"></script>
```

- [ ] **Step 2 : Réécrire `parcoursLabel()` pour lire le catalogue (plus de parsing du textContent)**

Modify `src/pages/index.astro` — remplacer la fonction `parcoursLabel` (~lignes 329-332) :

```js
  function parcoursLabel(){
    var pr = progByCode[sel.value];
    return pr ? (pr.label || '') : '';
  }
```

- [ ] **Step 3 : Remplacer la boucle de construction des options par le rendu groupé**

Modify `src/pages/index.astro` — remplacer le bloc `AT.api.listProgrammes(function (res) { ... });` (~lignes 493-513) par :

```js
  AT.api.listProgrammes(function (res) {
    var progs = (res.ok && res.data && res.data.programmes) || [];
    sel.textContent = '';
    if (!progs.length) {
      var o = document.createElement('option');
      o.value = ''; o.textContent = 'Aucun programme ouvert actuellement';
      sel.appendChild(o);
      syncRecap();
      return;
    }
    progs.forEach(function (pr) { progByCode[pr.code] = pr; });
    var groups = window.ProgrammeOptions.buildProgrammeGroups(progs);
    var first = true;
    groups.forEach(function (g) {
      var og = document.createElement('optgroup');
      og.label = g.label;
      g.options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.text;
        if (first) { o.selected = true; first = false; }
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    loadSessions();
  });
```

(la ligne `syncRecap();` qui suit ce bloc reste inchangée.)

- [ ] **Step 4 : Ajouter la taille de police responsive scopée**

Modify `src/pages/index.astro` — dans le bloc `<style>`, après la règle `.prog-choice { ... }` (~ligne 67), ajouter :

```css
  #programme { font-size: var(--text-base); }
  @media (min-width: 768px) { #programme { font-size: var(--text-md); } }
```

- [ ] **Step 5 : Vérifier que le build passe**

Run : `cd admission/apps/applicant && npm run build`
Expected : build Astro OK, aucune erreur. Puis valider le markup statique :
Run : `npx html-validate dist/index.html`
Expected : 0 error (le select reste valide ; les options sont injectées au runtime).

- [ ] **Step 6 : Smoke test manuel (runtime DOM)**

Run : `cd admission/apps/applicant && npm run dev` puis ouvrir `http://localhost:4321/`.
Vérifier sur le `<select>` « Programme souhaité » :
- [ ] options regroupées par parcours dans l'ordre Prépa → Licence → Bachelor → Double-Diplôme ;
- [ ] tri alphabétique dans chaque groupe ;
- [ ] « LaNEM » absent des lignes ; partenaire (ex. ESIIA) présent quand applicable ;
- [ ] lieu affiché uniquement si le catalogue a ≥ 2 lieux ;
- [ ] affinité présente seulement sur les double-diplômes ;
- [ ] 1ʳᵉ formation auto-sélectionnée, sessions chargées, récap (`sess-prog`, action bar) et encart frais corrects ;
- [ ] à ≥ 768px le champ est à 17px, en dessous à 16px (pas de zoom iOS au focus).

- [ ] **Step 7 : Re-vérifier que les tests unitaires restent verts**

Run : `cd admission/apps/applicant && npm test`
Expected : PASS — 9 tests.

- [ ] **Step 8 : Commit**

```bash
git add src/pages/index.astro
git commit -m "feat(applicant): select formations groupé/trié/enrichi + taille responsive (étape 1)"
```

---

## Notes d'exécution

- **Données de test :** les tests Node n'utilisent que des fixtures en mémoire (aucun seed sur le site dev) — rien à purger.
- **Pas de commit du spec/plan automatique :** demander à l'utilisateur avant de committer les docs `docs/superpowers/`.
