# GOUV-1 — Déclaration d'accessibilité & gouvernance : dossier de preuves

> Mandat DEC-L (recon → pause unique → exécution → rapport). Worktree applicant `mandat/gouv-1`
> depuis la **tête PROD `3cd2bc1`**. **Arrêt au push.** Frontière **PERF-1** tenue : aucune
> configuration Lighthouse, ni le tunnel, ni `admission-tunnel.js`. **Aucun changement fonctionnel.**
> Source : `AUDIT-360-A5-UX.md §7` — « 0 déclaration / 0 taux public ».

## Arbitrages appliqués (5 verdicts architecte)

1. **Profondeur** — base outillée + **arbre d'accessibilité** (proxy lecteur d'écran) ; restitution AT
   humaine et états post-OTP **déclarés non testés**. La **limite « mode shell »** (API neutralisée)
   figure dans le relevé **et** la déclaration.
2. **Périmètre candidat seul** — le back-office (interne, authentifié) est nommé « non audité à ce jour ».
3. **Contact** = `bonjour@lanem.bj` (boîte réelle et active). Pas d'adresse `accessibilite@` fictive.
4. **Angle juridique** — **engagement volontaire** WCAG 2.1 AA (pas de conformité réglementaire : le
   Bénin n'a pas d'équivalent RGAA opposable) ; **APDP, loi n° 2017-20** citée pour le volet données.
5. **Route** `/accessibilite` ; lien posé dans **les deux** composants de pied de page.

## Volet 1 — Audit par échantillon

Voir **`GOUV-1-RELEVE-AUDIT.md`** (le livrable central). Synthèse : **12 écrans candidat**, **axe-core
4.13 = 0 violation**, **arbre d'accessibilité = 0 contrôle interactif sans nom**, **reflow 320 px** et
**zoom texte 200 %** conformes sur le tunnel. **Une non-conformité relevée (NC-1)** : tables des pages
légales débordant sous ~380 px (WCAG 1.4.10) — cause racine mesurée, correction proposée, **déclarée
publiquement** (non corrigée : hors périmètre d'un lot « ajoute une page », et frontière PERF-1).

## Volet 2 — La déclaration

- **Page** `src/pages/accessibilite.astro` (gabarit `LegalLayout`, **hors** collection `legal` dérivée
  du back). **Conformité partielle, AUCUN taux** (DEC-A). Sections : engagement volontaire · état ·
  périmètre audité · **ce qui n'a pas été audité** (aussi visible que le reste) · outils · résultats &
  non-conformités connues (NC-1 + échéance) · contact `bonjour@lanem.bj` · voies de recours (APDP).
- **Lien pied de page** — `ecole.ts` gagne `a11yLink` (source unique, aucune chaîne en dur) ; rendu dans
  `Footer.astro` (pages terminales/légales) **et** `FooterLegalStrip.astro` (étapes du tunnel).
- **La déclaration incarne ce qu'elle déclare** : auditée elle-même — axe 0, 19 contrôles tous nommés,
  reflow 320 + zoom 200 conformes, `h1` unique. Construite **sans tableau large** (listes).
- **Build applicant propre** (`Complete!`), `/accessibilite/index.html` généré, lien présent dans les
  deux variantes de pied de page. Aucun fichier de code métier ni de tunnel touché.

### Note pour l'utilisateur
Si une adresse dédiée (`accessibilite@lanem.bj`) est créée et **réellement relevée** plus tard,
préviens-moi : on bascule le contact dans la déclaration.

## Volet 3 — Registre (BONUS) : deux politiques **proposées, non appliquées**

> Documentaire. L'architecte arbitre ; rien n'est écrit dans le code ni le corpus par ce lot.

### Proposition A — Rétention des 3 journaux (notes · sessions · transferts)

**Constat** : trois journaux d'audit tracent les actes métier (saisie/validation des notes, cycle de
vie des sessions, transferts institutionnels). Ils portent une valeur probatoire (équité et
traçabilité du processus) **mais référencent des données personnelles de candidats**, et **aucune
politique de rétention n'est définie** → accumulation indéfinie, en tension avec la minimisation
(APDP, loi n° 2017-20).

**Proposition (défauts à arbitrer)** :
- **Rétention active** en base opérationnelle = **durée du cycle d'admission + 1 an** (fenêtre de
  contestation / recours). Le journal reste pleinement consultable.
- **Archivage anonymisé** ensuite : remplacer les identifiants candidats par un pseudonyme, **conserver
  l'acte + l'horodatage + le rôle de l'auteur** (traçabilité statistique et preuve d'équité) pendant
  **5 ans** — cohérent avec la rétention OHADA déjà appliquée ailleurs dans le système.
- **Purge** au-delà.
- **Mécanisme** : étendre la passe de rétention planifiée existante (OTP / anonymisation) à ces trois
  journaux. **Non implémenté ici.**
- **À arbitrer par l'architecte** : les durées exactes (aspect juridique), et si les trois journaux
  partagent la même politique ou en diffèrent (le journal des notes a peut-être une valeur probatoire
  plus longue — contentieux sur un résultat de concours).

### Proposition B — Migration du compte de sauvegarde Drive vers un Workspace `@lanem.bj`

**Constat** (issu de RESILIENCE-1A) : les sauvegardes hors-site chiffrées sont déposées sur Google
Drive sous **`admissionlanem.2026@gmail.com`** — un **compte Gmail grand public**, non institutionnel,
hébergeant (chiffrées) des données personnelles de candidats. Gouvernance faible : propriété
personnelle, pas de contrôle d'administration institutionnel, risque de continuité (départ, compromission).

**Proposition** :
- Créer un compte **Google Workspace sous le domaine `@lanem.bj`** (ex. `sauvegardes@lanem.bj`),
  administré par l'institution.
- **Re-cibler** le remote rclone `[gdrive]` vers ce compte. La couche `[gcrypt]` (chiffrement
  contenu + noms) est **inchangée** : la clé crypt reste la même (empreinte identique), **aucune
  re-chiffrement** — c'est un simple changement de backend de stockage.
- Étapes : créer l'utilisateur Workspace → OAuth client dédié (le projet Google Cloud `lanem-backup`
  existe déjà, RESILIENCE-1A) → `rclone config` du nouveau `[gdrive]`, `[gcrypt]` préservé →
  re-synchroniser → vérifier le round-trip de déchiffrement → retirer le compte grand public.
- **Non implémenté ici** (changement d'infra serveur, territoire RESILIENCE-1A). **À arbitrer.**

## Garanties de frontière

- **PERF-1** : aucune configuration Lighthouse touchée ; aucun fichier partagé (eux = config, moi =
  contenu/pages). `admission-tunnel.js` et le tunnel non touchés.
- **Aucun changement fonctionnel** : ce lot **ajoute** une page + un lien + des documents. Aucun
  comportement modifié (DEC-E).
- **Corpus** : les deux politiques du Volet 3 sont **proposées, jamais appliquées**.
- **Write-set** : `accessibilite.astro` (neuf), `ecole.ts` + `Footer.astro` + `FooterLegalStrip.astro`
  (lien), `docs/GOUV-1-*.md`. Rien d'autre.

## Fichiers modifiés

| Fichier | Nature |
|---|---|
| `src/pages/accessibilite.astro` | **neuf** — la déclaration |
| `src/config/ecole.ts` | `+ a11yLink` (source unique du lien) |
| `src/components/Footer.astro` | lien accessibilité (pied riche) |
| `src/components/FooterLegalStrip.astro` | lien accessibilité (pied tunnel) |
| `docs/GOUV-1-PREUVES.md`, `docs/GOUV-1-RELEVE-AUDIT.md` | dossier + relevé |
