# GOUV-1 — Relevé d'audit d'accessibilité par échantillon

> **Le livrable central.** C'est lui qui fonde la déclaration `/accessibilite` et qu'on relira si
> quelqu'un conteste. Périmètre : **front candidat** (`admissions.lanem.bj`). SHA audité : **`3cd2bc1`**
> (tête PROD, contenu identique au worktree `mandat/gouv-1`). Date : **18 août 2026**.
>
> ⚠️ **Restriction de méthode (mode shell)** — comme l'audit A11Y-1, la mesure est faite **appels API
> neutralisés** : on mesure le *shell* rendu, pas les états produits par des réponses serveur. Deux
> écrans (`/recapitulatif`, `/paiement`) redirigent alors vers `/reprise` faute de session — ils ne
> sont couverts **qu'en mode shell**. C'est une **restriction de périmètre**, pas un détail.

## Outils

- **axe-core 4.13.0** (Chromium headless via Puppeteer), jeux de règles `wcag2a, wcag2aa, wcag21a,
  wcag21aa, wcag22aa`.
- **Arbre d'accessibilité** du navigateur (`page.accessibility.snapshot`, source CDP) : nom
  accessible + rôle de **chaque** contrôle interactif. C'est la donnée exacte qu'un lecteur d'écran
  restitue — proxy **reproductible** de « ce que dirait VoiceOver », **sans** substituer un test humain.
- **Recomposition** viewport 320 px (critère 1.4.10) et **agrandissement texte 200 %** (`font-size:200%`
  sur la racine, critère 1.4.4) : détection de débordement horizontal (`scrollWidth > clientWidth`).
- Harnais : `scratchpad/gouv1-audit.mjs` (+ `gouv1-overflow.mjs` pour la cause racine NC-1).

## Écrans couverts (12 rendus)

Accueil `/` · Identité `/identite` · Pièces `/pieces` · Bourses `/bourses` · Paiement-soumission
`/paiement-sop` · Paiement accepté `/paiement-accepte` · Paiement échoué `/paiement-echoue` ·
Confirmation `/confirmation` · Reprise `/reprise` · Suivi `/suivi` · Mentions légales · Politique de
confidentialité. — *En mode shell (redirigés) :* `/recapitulatif`, `/paiement`.

## Relevé par critère

| Critère WCAG | Méthode | Écrans | Verdict | Preuve |
|---|---|---|---|---|
| **1.1.1** Contenu non textuel | axe `image-alt`, `svg-img-alt` | 12 | ✅ Conforme | 0 violation ; icônes SVG décoratives `aria-hidden` |
| **1.3.1** Information & relations | axe `label`, `list`, `table*` ; arbre a11y | 12 | ✅ Conforme | 0 violation ; tables légales sémantiques `thead/th/tbody` |
| **1.4.3** Contraste minimum | axe `color-contrast` | 12 | ✅ Conforme | 0 violation (les 3 défauts A11Y-1 corrigés tiennent) |
| — gradients (axe s'abstient) | inspection `background-image` | 12 | ➖ Sans objet | **aucun** élément à texte sur fond gradient détecté |
| **1.4.4** Agrandissement texte 200 % | racine `font-size:200%`, débordement | 12 | ⚠️ Partiel | tunnel **ok** ; `/legal/mentions-legales` **déborde** (→ NC-1) |
| **1.4.10** Recomposition (reflow) 320 px | viewport 320, débordement | 12 | ⚠️ Partiel | tunnel candidat **ok** ; **pages légales débordent** (→ NC-1) |
| **3.3.1 / 3.3.2** Étiquettes de champs | axe `label` ; arbre a11y `textbox` nommés | 12 | ✅ Conforme | 0 violation ; tous les champs ont un nom accessible |
| **4.1.2** Nom, rôle, valeur | **arbre d'accessibilité** — tous contrôles | 12 | ✅ Conforme | **0 contrôle interactif sans nom** (≈250 contrôles cumulés) |

### Hérité d'A11Y-1 (mesuré là-bas, **non rejoué** ici — signalé comme tel)

| Critère | Source | Verdict A11Y-1 |
|---|---|---|
| **2.1.1** Clavier (onglets bourses, radios paiement, modale) | A11Y-1-PREUVES §Widgets ARIA | ✅ runtime : roving tabindex, flèches, `Escape` |
| Piège + restauration de focus (modales) | A11Y-1 | ✅ déjà présent |

### Non testé — aussi visible que le testé

| Point | Statut | Raison |
|---|---|---|
| **Restitution par lecteur d'écran réel** (VoiceOver/NVDA, utilisateur) | ❌ Non testé | proxy « arbre d'accessibilité » utilisé ; pas d'écoute humaine |
| **États après authentification / OTP** (contenus dynamiques) | ❌ Non testé | mesure en **mode shell** (API neutralisée) |
| **2.4.7** Focus visible | ❌ Non testé dans cette passe | non mesuré par ce harnais (audit source note « focus/clavier solides ») |
| **Espace de gestion (back-office staff)** | ❌ Non audité | **périmètre distinct** (interne, authentifié) — arbitrage DEC-B |
| Audit **complet** WCAG / RGAA (tous critères, revue manuelle) | ❌ Non réalisé | fonde le choix **« conformité partielle, sans taux »** (DEC-A) |

## Non-conformité relevée — NC-1

**Pages d'informations légales — tableaux à défilement horizontal (WCAG 1.4.10).**
Cause racine mesurée (`gouv1-overflow.mjs`, viewport 320 px) :

- `/legal/mentions-legales` : `<table>` sous-traitants, largeur **398 px** > 320, `overflow-x: visible`.
- `/legal/politique-de-confidentialite` : `<table>` durées de conservation, **363 px** > 320.

Le style `.prose-legal table` (dans `LegalLayout.astro`) ne place aucun conteneur défilable autour
des tables. **Correction proposée** (hors périmètre GOUV-1 — un lot « ajoute une page », ne corrige
pas ; frontière PERF-1 aussi) : envelopper les tables du contenu long-format dans un conteneur
`overflow-x:auto` (ou `display:block;overflow-x:auto` sur `.prose-legal table`). **Échéance** :
prochaine itération d'accessibilité. Déclaré publiquement dans `/accessibilite`.

## Vérification de la page de déclaration elle-même

`/accessibilite` a été audité avec le même harnais (elle doit incarner ce qu'elle déclare) :
**axe = 0**, **19 contrôles interactifs, 0 sans nom**, **reflow 320 ok**, **zoom 200 % ok**, un seul
`h1`, hiérarchie de titres sans saut. Construite **sans tableau large** (listes) — reflow-propre par
construction.
