# Handoff — Header & Footer admission LaNEM

Package d'intégration **Astro 5** pour le header public et le pied de page de l'app `applicant`, avec branchement des **pages légales** sur le CMS Sveltia.

- **Header** : Direction B (liseré utilitaire violet + barre principale).
- **Footer riche** : Direction A (identité + contacts + adresse + légal).
- **Footer minimal** : ruban légal pour les étapes du tunnel.
- **Pages légales** : nouvelle collection CMS Markdown → route dynamique `/legal/[slug]`.

> Maquettes de référence (HTML) : `refonte/Header Admission - Refonte.html`, `refonte/Footer Admission - Refonte.html`.

---

## 1. Contenu du package

Les chemins ci-dessous sont **relatifs au monorepo** `admission/`. Déposez chaque fichier à l'emplacement indiqué.

```
apps/applicant/
├── public/
│   ├── lanem-seal.png                         ★ NEW — sceau (déposer ici)
│   └── admin/
│       └── config.yml.add-legal.yml           ★ snippet à fusionner dans config.yml
└── src/
    ├── config/
    │   └── ecole.ts                            ★ NEW — identité + contacts (source unique)
    ├── components/
    │   ├── Header.astro                        ★ NEW — Direction B
    │   ├── Footer.astro                        ★ NEW — Direction A (riche)
    │   └── FooterLegalStrip.astro              ★ NEW — ruban légal minimal
    ├── layouts/
    │   ├── TunnelLayout.astro                  ✎ MODIFIÉ — Header + prop `footer`
    │   └── LegalLayout.astro                   ★ NEW — gabarit pages légales + .prose-legal
    ├── pages/
    │   └── legal/
    │       └── [slug].astro                    ★ NEW — route dynamique
    └── content/
        ├── config.ts                           ✎ MODIFIÉ — + collection `legal`
        └── legal/                              ★ NEW — 4 textes (placeholders F10)
            ├── cgv.md
            ├── politique-de-confidentialite.md
            ├── politique-de-remboursement.md
            └── consentement-transfert-donnees.md
```

**Bilan : 11 NEW · 2 MODIFIÉS · 1 snippet.** Aucun impact sur le backend bench-admission ni sur `apps/management`.

---

## 2. Architecture & décisions

### 2.1 Déduplication header / footer
Aujourd'hui le `<header class="site-header">` (+ ses styles) est **copié dans les 11 pages**. On le remonte une fois dans les layouts :
- `TunnelLayout` rend `<Header />` puis `<slot />` puis le footer choisi.
- `LegalLayout` rend `<Header />`, la colonne de lecture, puis `<Footer />`.

→ **À faire dans chaque page** : supprimer le bloc `<header class="site-header">…</header>` **et** les règles CSS `.site-header` / `.site-header-inner` / `.brand` / `.header-help` désormais inutiles.

### 2.2 Identité = config, pas CMS (DEC-210)
Les coordonnées et l'identité LaNEM sont des **données établissement** (quasi immuables) → `src/config/ecole.ts`, consommé au build. Le CMS reste réservé au contenu éditorial. Header, Footer et FooterLegalStrip lisent tous `ecole.ts` : **aucune chaîne en dur**.

### 2.3 Deux footers selon le type de page
| Type de page | Barre d'action collante ? | Footer | Layout |
|---|---|---|---|
| Étapes du tunnel | **Oui** | `FooterLegalStrip` (`footer="strip"`) | TunnelLayout |
| Pages terminales | Non | `Footer` riche (`footer="full"`) | TunnelLayout |
| Pages légales | Non | `Footer` riche | LegalLayout |

Mapping concret :

| Page | `footer` |
|---|---|
| `index.astro` (formation) | `strip` *(défaut)* |
| `identite.astro` | `strip` |
| `bourses.astro` | `strip` |
| `pieces.astro` | `strip` |
| `recapitulatif.astro` | `strip` |
| `paiement.astro` | `strip` |
| `confirmation.astro` | `full` |
| `suivi.astro` | `full` |
| `paiement-accepte.astro` | `full` |
| `paiement-echoue.astro` | `full` |
| `paiement-sop.astro` | `full` |

`strip` étant le défaut, seules les 5 pages terminales doivent passer `footer="full"`.

### 2.4 ⚠️ Footer × barre d'action collante
Les 6 étapes du tunnel ont une `.action-bar` en `position: fixed; bottom: 0`. Un footer placé en fin de page serait **recouvert** par cette barre. D'où le `FooterLegalStrip` (sobre, peu haut) sur ces pages. Pour qu'il reste **visible** en bas de page, deux options :

- **Recommandé** — passer `.action-bar` de `fixed` à **`position: sticky; bottom: 0`** : la barre colle au bas du viewport pendant le scroll, puis se laisse dépasser par le ruban légal en fin de contenu. (Pensez alors à retirer le `padding-bottom: 140px` de réserve sur `.tunnel`/`main`.)
- **Alternative** — garder `fixed` et mettre `footer="none"` sur ces 6 pages : les liens légaux restent accessibles via les pages terminales et le footer des pages légales. Moins idéal juridiquement.

---

## 3. Branchement CMS (pages légales)

### Étape A — Collection de contenu (Astro 5)
`src/content/config.ts` ajoute une collection `legal` via le **loader `glob`** (API moderne Astro 5, Markdown) :
```ts
import { glob } from 'astro/loaders';
const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    titre: z.string(),
    date_effet: z.string().optional(),
    version: z.string().optional(),
  }),
});
export const collections = { etapes, messages, aide, legal };
```
> Les 3 collections existantes restent en `type: 'data'` (legacy, toujours supporté). À terme, vous pourrez les migrer vers `glob`/`file` pour homogénéiser.

### Étape B — Fichiers de contenu
`src/content/legal/*.md` : **le nom du fichier = le slug = la route**.
```
cgv.md                          → /legal/cgv
politique-de-confidentialite.md → /legal/politique-de-confidentialite
politique-de-remboursement.md   → /legal/politique-de-remboursement
consentement-transfert-donnees.md → /legal/consentement-transfert-donnees
```
Les 4 fichiers livrés sont des **placeholders structurés** à valider par le juridique (F10).

### Étape C — Route de rendu
`src/pages/legal/[slug].astro` génère les 4 pages en SSG (`getStaticPaths`) et rend le Markdown via `render()` (Astro 5) dans `LegalLayout`.

### Étape D — Collection Sveltia CMS
Fusionner le bloc de `public/admin/config.yml.add-legal.yml` à la fin de la liste `collections:` de `public/admin/config.yml`. Le juriste édite alors les textes en Markdown + preview ; les modifs passent par une PR sur la branche `content` (même flux que `etapes`/`messages`/`aide`).

### Style long-format
Le design system n'a pas de style « prose ». `LegalLayout.astro` embarque `.prose-legal` (en `is:global`, car le HTML vient du rendu Markdown) : titres, paragraphes, listes, citations, tableaux, liens violets — tout en tokens du DS.

---

## 4. Étapes d'intégration (checklist)

1. [ ] Copier `lanem-seal.png` dans `apps/applicant/public/`.
2. [ ] Ajouter `src/config/ecole.ts`.
3. [ ] Ajouter `src/components/Header.astro`, `Footer.astro`, `FooterLegalStrip.astro`.
4. [ ] Remplacer `src/layouts/TunnelLayout.astro` par la version fournie.
5. [ ] Ajouter `src/layouts/LegalLayout.astro`.
6. [ ] Dans **chaque page** : supprimer le `<header class="site-header">` dupliqué + ses styles ; passer `footer="full"` aux 5 pages terminales.
7. [ ] Remplacer `src/content/config.ts` (ajout collection `legal`).
8. [ ] Ajouter `src/content/legal/*.md` (4 fichiers).
9. [ ] Ajouter `src/pages/legal/[slug].astro`.
10. [ ] Fusionner le snippet dans `public/admin/config.yml`.
11. [ ] Décider du sort de `.action-bar` (sticky recommandé — §2.4).
12. [ ] `pnpm --filter @emela/applicant dev` → vérifier header, footers et `/legal/cgv`.

---

## 5. Points de personnalisation

- **Lien « Besoin d'aide ? »** : `Header.astro` pointe par défaut sur le WhatsApp de l'école (`aideHref`). Brancher vers une page d'aide / un chat si besoin (`<Header aideHref="/aide" />`).
- **CTA « Suivre mon dossier »** : `suiviHref` (défaut `/suivi`).
- **Sceau vs wordmark** : le sceau contient déjà « LaNEM » ; le wordmark à côté est volontaire (blason + logotype). Pour un rendu sceau-seul, retirer `.hdb-lockup`.
- **Année du copyright** : calculée dynamiquement (`new Date().getFullYear()`) dans les deux footers.
- **Sous-titre header** « Admissions · 2026 » : en dur dans `Header.astro` (libellé de contexte, non issu de `ecole.ts`) — à ajuster chaque rentrée.
