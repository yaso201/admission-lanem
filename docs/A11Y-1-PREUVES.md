# A11Y-1 — Dossier de preuves (accessibilité)

> Mandat DEC-L. Deux worktrees, branche `mandat/a11y-1` : front applicant `admission-lanem`
> @ **acfa39d** · front management `lanem-admission-management` @ **a603644**. **Arrêt au push**.
> Source : AUDIT-360-A5-UX.md note D. Frontière OBS-1 tenue : `dossier.astro` non touché ;
> `ui.js` modifié **uniquement** sur la construction des labels (emModal), pas les toasts/erreurs.

## Méthode (DEC-E : prouver par mesure, avant/après)

Puppeteer (chrome-headless 152) + **axe-core 4.11.4**, tags WCAG 2.0/2.1/2.2 A+AA, viewports **390 et
320 px**, appels API bloqués (mesure du shell) — reproduit l'audit (reflow 360/330 identiques).

## Bilan mesuré AVANT → APRÈS

| Écran | reflow @320 | axe (ids) |
|---|---|---|
| `/` (index) | **360 → 320** | `color-contrast` → **0** |
| `/pieces` | **330 → 320** | 0 → 0 |
| `/reprise` | 320 → 320 | 0 → 0 |
| `/bourses` | 320 → 320 | `color-contrast` → **0** |
| `/paiement` | 320 → 320 | 0 → 0 |

- **UX-01** (e-mail reprise) : `#recover-email` labels associés **0 → 1** (« Adresse e-mail », label
  **visible**, DEC-B). Carte masquée par défaut → révélée pour la mesure.
- **UX-02 / UX-03** (reflow 320 px) : `.action-bar-inner` se replie (`flex-wrap`) → le CTA passe pleine
  largeur sous la puce/le retour au lieu de déborder. `scrollWidth` : 360→320 et 330→320, **mesuré**.
- **UX-04** (CTA désactivé) : `aria-disabled` **null → "true"** ; contraste **2,56:1 → 17,93:1**
  (≥4,5). Cause : le DS applique `.em-btn[aria-disabled]{opacity:.5}` qui délavait le contraste ;
  remplacé par un **jeton de fond** (sable pâle ≠ or actif) + `opacity:1` (DEC-F, pas de couleur littérale).

## Widgets ARIA (opérabilité clavier — patron WAI-ARIA APG)

| Widget | Preuve |
|---|---|
| **UX-05a** onglets bourses | **runtime ✓** : `ArrowRight` déplace focus+sélection (`aria-selected` bascule) ; **roving tabindex** (actif 0 / inactif -1) ; `aria-controls`/`aria-labelledby` posés. |
| **UX-05c** modale bourses | **runtime ✓** : focusables présents (piège opérable comme `emModal`), `Escape` ferme ; focus initial→modale et **restauration au déclencheur** ajoutés (miroir `emModal`). |
| **UX-05b** radios paiement | **vérifié dans le dist** : `role=radio ... tabindex="-1"` (roving) + JS `setAttribute('tabindex', on?'0':'-1')` et flèches `Arrow*` (patron APG). Non rejouable en runtime : `/paiement` redirige sans session/API (gardes de tunnel) — **même code que les onglets, prouvés en runtime**. |

## Modales staff (management) — DEC-C

`emModal` (`ui.js`) génère désormais un `id` unique par champ et l'associe au label (`for`). **jsdom,
les 4 types prouvés** :
```
✓ text     : label[for=emf-1] → INPUT     "Champ texte"
✓ textarea : label[for=emf-2] → TEXTAREA  "Zone texte"
✓ select   : label[for=emf-3] → SELECT    "Liste"
✓ file     : label[for=emf-4] → INPUT     "Fichier"
✓ checkbox-list : fieldset/legend (groupe, pas de for)
```
Une correction, tous les consommateurs. Le piège + la restauration de focus d'`emModal` étaient
**déjà présents** — non retouchés.

## UX-06 — CONFORME par mesure (DEC-D), aucune correction

Contacts d'en-tête mesurés à 375 px : cibles **14×14 px**, centres à **34 px** d'écart. Cercles de
**24 px** (rayon 12) centrés sur chaque cible : **[306,330]** et **[340,364]** → **ne s'intersectent
pas** (34 > 24). **Exception d'espacement WCAG 2.5.8 satisfaite** → `Header.astro` **non modifié**.

## Trouvaille hors des 7 items d'origine (documentée comme telle)

La baseline axe a surfacé un **échec de contraste** sur `/bourses` `.r-empty` (**1,02:1**) : la classe
sert deux contextes — panneau `#cats` **clair** (texte blanc invisible) et panneau reçu `.receipt`
**sombre**. Corrigé par jeton : `.r-empty` = `--text-secondary` (contexte clair) + `.receipt .r-empty`
= blanc-alpha (contexte sombre). Ce n'est **pas un 8ᵉ item** — c'est une trouvaille de la mesure mandatée.

## CAL-13 — versionnement d'`ui.js` posé

`ui.js` était chargé **sans `?v=`** (dette signalée par NT-UX). Comme je le modifie, je pose **`?v=1`**
sur `Layout.astro` et `BareLayout.astro`. Vérifié servi : `dossier`, `liste-dossiers`, `reglages` =
`ui.js?v=1` ; aucun `ui.js` sans version résiduel.
⚠️ **Coordination OBS-1** (qui modifie aussi `ui.js`, régions différentes) : une seule version sert
les deux ; celui qui fusionne en premier apporte `?v=1`, le second rebase. **Vérifier après déploiement
que `ui.js?v=1` est servi.**

## Aucun changement fonctionnel (DEC-A)

Reflow = CSS de repli ; labels/aria = attributs ; widgets = clavier **ajouté** (clic/sélection
inchangés) ; CTA désactivé = même état, rendu accessible. `admission-tunnel.js` et `dossier.astro`
non touchés. Builds applicant + management **propres**.
