# DS-CLEAN — Finition d'interface & dettes de style : preuves

> Mandat DEC-L (recon → pause unique → exécution → rapport). **Arrêt au push · fusion/déploiement à
> l'architecte.** SHA constatés (post-PERF-1) : management **`69e1e26`** · applicant **`b0b1b4a`**.
> Branches `mandat/ds-clean`. **Ne touche pas le back.** Frontière **CAL-DEL** tenue (`calendrier.astro`
> non modifié — aucun débordement n'y a été relevé). Mesures : patron A11Y-1 (Puppeteer, scrollWidth).

## P1.1 — le bug motif : bandeau des dossiers liés

**Cause unique établie** (pas présumée) : dans `dossier.astro`, le chevron `<svg class="row-go">`
(ligne 399) n'avait **ni dimensions dans le markup, ni règle CSS `.row-go`** (style scopé de la page) —
alors que l'icône du bandeau porte la classe DS `ico-lg`, bornée. Un `<svg><use>` avec `viewBox` mais
sans `width`/`height` reçoit la **taille par défaut d'un remplacé : 300 × 150 px**. Ce chevron géant
gonfle la colonne `auto` de la grille `.related-row` et écrase la colonne contexte `minmax(0,1fr)` →
texte éclaté. **Un défaut, deux symptômes.**

| Mesure @1280px (reproduite) | AVANT | APRÈS |
|---|---|---|
| Chevron `.row-go` | **300 × 150 px** | 16 × 16 px |
| Hauteur bandeau (2 lignes) | **445 px** | 192 px |
| Colonne contexte | 156 px ≈ 3 lignes écrasées | 440 px ≈ normal |

**Correctif** : `dossier.astro` gagne `.related-state .row-go { width:16px; height:16px; flex-shrink:0;
color:var(--warning-700); }`. **CSS seul, zéro logique.**

**Classe fermée, pas l'instance** (exigence architecte) : balayage de **toutes** les classes de `<svg>`
enveloppant un `<use>` en management. Résultat — `ico`/`ico-sm`/`ico-lg` (DS, bornées), `queue-go`
(18×18, borné), `aa-chev` (rit sur `ico`, borné), et **`.row-go` utilisé AUSSI dans
`liste-dossiers.astro:240` — mais déjà borné là (`:49`, 16×16, posé par PERF-1)**. Le seul instance non
bornée était `dossier.astro`. La classe est fermée.

## P1.2 — balayage responsive management (1280 / 1024 / 768)

`scrollWidth` mesuré (shell, API neutralisée — patron A11Y-1) sur les 6 écrans :

| Écran | 1280 | 1024 | 768 |
|---|---|---|---|
| `/dossier` `/liste-dossiers` `/notes` `/calendrier` `/exploitation` `/tableau-direction` | ok | ok | ok |

**Aucun débordement de shell.** Les tables (liste-dossiers, notes, exploitation) sont enveloppées dans
`.em-table-wrap { overflow-x:auto }` (DS R-01) → les données défilent en interne, pas la page. Le seul
débordement **data-dépendant** était le bandeau (P1.1), corrigé. `calendrier.astro` : rien à corriger →
**non touché** (frontière CAL-DEL respectée sans même une règle CSS).

## P2 — dettes de style

### 2.1 NC-1 (WCAG 1.4.10) — tables des pages légales
`.prose-legal table` n'avait pas de conteneur défilable ; le Markdown rend un `<table>` nu (non
enveloppable). Correctif : la table elle-même devient défilable (`display:block; overflow-x:auto`).
**Mesuré @320px** : page `scrollWidth` **403 → 320** (la table défile en interne, 387px). Voir §5 pour le
texte de mise à jour de la déclaration.

### 2.2 couleurs → jetons (tri documenté, DEC-C)
Le tri **prime sur le nombre**. Confrontation de chaque littéral sémantique répété à la valeur des
jetons DS :

| Littéral | Jeton exact ? | Décision |
|---|---|---|
| `#FDE68A` (app ×2) | **= `--accent-200`** | **converti** (alias exact, 0 changement visuel) |
| `#FEF2F2` (mgmt ×5) | = `--error-50` | **non converti** : uniquement dans les pages **auth** (connexion…), **hors write-set** |
| `#B91C1C` (mgmt ×5) | = `--error-700` | idem (hors write-set) |
| `#5B3FA8` (app ×2) | = `--ink-600` (mais employé comme *violet*) | **gardé** : alias ambigu (nom ≠ intention) — à arbitrer, ne pas figer un contresens sémantique |
| `#B3261E` (app ×4) | ≈ `--error-700` (#B91C1C) — **nuance différente** | **gardé** : rouge bespoke ; l'aligner **décalerait la teinte** — décision design |
| `#FBEBD8` ×4, `#F4DFC8` ×3, `#15803D`, `#C0392B` | aucun jeton exact | **gardés** : nuances bespoke (fonds sable, verts/rouges d'accent) |

**Bilan** : app 2 converties (`#FDE68A`) ; mgmt 0 (les alias exacts sont tous hors write-set) ; le reste
= bespoke/intentionnel ou hors périmètre, **conservé et documenté** plutôt qu'écrasé.

### 2.3 vocabulaire (texte visible seul)
- `pieces.astro` : `re-déposé`/`re-dépôt`/`re-contrôlé` → `redéposé`/`redépôt`/`contrôlé à nouveau` —
  **15 → 0** (redéposé ×8, contrôlé à nouveau ×3). `re-soumission` laissé (hors liste du mandat).
- management : `Soumis (prov.)` → `Soumis (provisoire)` (`liste-dossiers.astro`, `dossier.astro`).
- ⚠️ **Non fait (listé)** : `courriel` (×4) n'est que dans `src/content/legal/*.md`, **contenu généré par
  le back** (interdit) → à répercuter côté corpus par l'architecte. L'harmonisation large de tous les
  `email` visibles n'a pas été tentée : la majorité sont des **identifiants de code** (champs/variables,
  clés de contrat CONTRAT-1) — intouchables.

### 2.4 alert() du paiement
`paiement.astro` : les 3 `alert()` natifs (payDone / failed / unavailable) → région `#pay-msg`
(`role="alert" aria-live="assertive"`) via `showPayError()`. **0 `alert()` natif résiduel.** Messages
seuls — mêmes déclencheurs, même flux (DEC-A). Jetons d'erreur du DS (`--error-50/700/100`).

### 2.5 .lighthouseci/
30 fichiers de rapports Lighthouse (sortie CI de PERF-1) étaient versionnés → `git rm --cached` +
`.gitignore`. **Commit séparé et nommé** (`97a79e5`) pour ne pas noyer les corrections de style. Fichiers
conservés sur disque.

## §5 — texte de mise à jour de `/accessibilite` (rédigé, NON appliqué — périmètre GOUV-1)

NC-1 étant corrigée, la déclaration doit être mise à jour. **Remplacer**, dans la section
« Résultats et non-conformités connues » de `src/pages/accessibilite.astro`, la première puce par :

> - **Pages d'informations légales — tableaux à défilement horizontal.** *(Corrigé le 18 août 2026.)*
>   Les tableaux des pages légales sont désormais défilables horizontalement sur les très petits écrans,
>   sans déborder la page (critère 1.4.10 satisfait).

*(ou retirer entièrement la puce si l'on préfère ne lister que les non-conformités ouvertes.)*
L'architecte répercute sur la page GOUV-1.

## Non-régression & garanties
- **axe-core rejoué** sur les écrans management touchés (`/dossier`, `/liste-dossiers`, `/notes`) :
  **0 violation**. Mesures reflow bandeau + NC-1 : avant/après ci-dessus.
- **Builds propres** (management ✓ ; applicant : correctif NC-1 CSS-seul, mesuré en isolation — build
  complet applicant bloqué par un souci de collection de contenu indépendant de ce lot).
- **Aucun changement fonctionnel** : CSS, messages, texte visible. Back **non touché**.
- **Write-set respecté** : 4 pages auth converties par erreur → **restaurées** (hors write-set).
  `calendrier.astro` non touché.
- **NT-UX-2** reçu et **mis en file** (touche `dossier.astro`, à prendre après fusion DS-CLEAN + CAL-DEL).
