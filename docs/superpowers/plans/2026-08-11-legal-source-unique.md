# PC1 — [LEGAL-SOURCE-UNIQUE] Le back devient la source unique des textes juridiques (front dérivé au build)

**Statut :** PC1 (recon + plan) → **PAUSE unique** avant exec.
**Cible :** front applicant (`admission/fronts/apps/applicant`) + back `admission`.
**Cadre :** back = source unique ; front dérive **au build** (option B) ; runtime paiement/reçu intouché.
**Émis par :** Architecte LaNEM · **Rédigé par :** agent LEGAL-SOURCE-UNIQUE le 2026-08-11.

---

## 0. Verdict de faisabilité (le point n°1 du mandat)

**Faisable, et la tuyauterie existe déjà.** Le back expose **aujourd'hui** l'endpoint public
qui sert exactement ce dont le build a besoin :

- `admission.api.public.get_legal_documents(types=None)` — `@frappe.whitelist(allow_guest=True, methods=["GET"])`
  (`admission/api/public.py:1088`). Retourne pour chaque `document_type` actif :
  `{ type, version, content_text, content_hash }` (`_get_active_legal_texts`, `admission/api/legal.py:121`).
- C'est **le même endpoint** que la page paiement consomme déjà au runtime pour
  `REFUND_POLICY` (`admission-tunnel.js:432`, `paiement.astro:383`) → donc **public,
  éprouvé, joignable sur Internet** depuis n'importe quel exécuteur de build (CF Pages, CI ou local).

**Contrainte Cloudflare Pages :** le build tire les textes via un simple `GET` HTTPS sur
`${PUBLIC_API_BASE}/api/method/admission.api.public.get_legal_documents`. `PUBLIC_API_BASE`
encode déjà l'environnement cible du front (recette/prod) et pilote le fetch **runtime** ;
on le réutilise pour le fetch **build**. → build recette tire recette, build prod tire prod.
**Si l'API n'est pas joignable au build → le build échoue (exit non-zéro), zéro page vide, zéro fallback.**

L'app applicant est un **site statique SSG** (Astro sans adaptateur, `astro.config.mjs` vide ;
déployée en assets-only comme `management/wrangler.jsonc`). Donc : **aucun fetch runtime ajouté**
sur les 6 pages ; elles restent 100 % statiques (3G-friendly). ✓

---

## 1. Correspondance page ↔ document_type (établie sur preuve)

Back = **5** `document_type` (seed `after_migrate`, `legal.py:175`) :
`CGV · PRIVACY_POLICY · REFUND_POLICY · DATA_TRANSFER_CONSENT · SIMULATION_DISCLAIMER`.
Front = **6** pages `.md` dans `src/content/legal/`.
Consentements réellement **signés** par le candidat (hash copié dans `Admission Consent Record.version_hash`) :
`CONSENT_TYPE_TO_DOCUMENT_TYPE` (`legal.py:24`) → **CGV, PRIVACY_POLICY, REFUND_POLICY, DATA_TRANSFER_CONSENT**.

| Page front (`.md`) | `titre` (présentation) | Signée (hash) ? | `document_type` back | Décision PC1 |
|---|---|:--:|---|---|
| `cgv.md` | Conditions générales de vente | ✅ CGV | **CGV** | **Dérivée du back** |
| `politique-de-confidentialite.md` | Politique de confidentialité | ✅ DATA_PROCESSING | **PRIVACY_POLICY** | **Dérivée du back** |
| `politique-de-remboursement.md` | Politique de remboursement | ✅ REFUND_ACK | **REFUND_POLICY** | **Dérivée du back** |
| `consentement-transfert-donnees.md` | Consentement au transfert de données | ✅ DATA_TRANSFER | **DATA_TRANSFER_CONSENT** | **Dérivée du back** |
| `donnees-personnelles.md` | Mes données personnelles | ❌ (info : droits/exercice) | *(aucun)* | **Front-only, documenté** (défaut) — *ou* créer un type back (voir §7) |
| `mentions-legales.md` | Mentions légales | ❌ (info : éditeur/hébergeur) | *(aucun)* | **Front-only, documenté** (défaut) — *ou* créer un type back (voir §7) |
| *(pas de page — inline)* | Disclaimer simulation | — | SIMULATION_DISCLAIMER | **Déjà back-sourcé** au runtime (`get_frais.simulation_disclaimer`) — hors périmètre |

**Le problème du mandat (« lit le front, signe le back ») n'existe QUE sur les 4 pages signées**,
seules à exister en double (front stub *et* back). Les 2 pages purement informatives n'ont
**pas de jumeau back** → aucune divergence possible aujourd'hui. Voir §7 pour l'arbitrage.

---

## 2. Mécanisme de dérivation retenu (build-time, option B)

**Approche A — script de pré-build qui génère le contenu, Astro rend comme aujourd'hui** *(recommandée)*.

1. **`scripts/pull-legal.mjs`** (Node, zéro dépendance) exécuté **avant** `astro build` :
   `"build": "node scripts/pull-legal.mjs && astro build"` (idem `dev`). Chaînage explicite
   (ne dépend pas des hooks pre/post pnpm).
2. Le script fait `GET ${PUBLIC_API_BASE}/api/method/admission.api.public.get_legal_documents`
   et lit l'enveloppe Frappe `body.message.data.documents` (contrat `_ok`, `public.py:52`).
3. Pour **chacun des 4** `document_type` mappés, il **écrit un `.md` généré** directement dans
   `src/content/legal/<slug>.md`, avec frontmatter :
   - `titre` ← **carte de présentation front** (`scripts/legal-map.mjs` : slug ↔ document_type ↔ titre — *ce n'est pas du texte juridique*) ;
   - `version` ← **back** (`version`) ;
   - `date_effet` ← **back** (`effective_date`, formaté) ;
   - `source_hash` ← **back** (`content_hash`) ;
   - **corps = `content_text` du back** (rendu Markdown par le pipeline Astro existant).
4. Les **4 `.md` dérivés deviennent des artefacts générés, git-ignorés** (`git rm --cached` +
   `.gitignore`). → **plus aucun texte juridique dupliqué à la main dans le repo** (GL1).
   Les 2 `.md` informatifs (mentions/données) restent **committés** (source = front, documenté).
5. Le pipeline Astro est **inchangé** : collection `legal` (glob `**/*.md`), `[slug].astro`,
   `LegalLayout` — qui **affiche déjà `version`** (`LegalLayout.astro:57`) → **GL4 acquis**.

> *Pourquoi A et pas un loader Astro 5 custom (approche B) :* A est plus robuste et **prouvable
> pas-à-pas** (les fichiers générés sont inspectables), échoue proprement, et **coexiste**
> naturellement avec les 2 pages front-only committées (un seul loader glob). Le loader custom
> rendrait le Markdown-depuis-string fragile et mêlerait mal committé + dérivé dans une seule collection.

---

## 3. Garde-fou anti-divergence (le risque de l'option B)

Trois verrous, aucun fallback silencieux :

- **V1 — Build fail-closed.** `pull-legal.mjs` sort **non-zéro** si : API injoignable, HTTP ≠ 200,
  enveloppe `ok:false`, un `document_type` requis **absent**, ou `content_text` **vide**. Il
  **supprime d'abord** les 4 `.md` générés puis n'écrit que si **les 4** sont récupérés et non
  vides → jamais de page légale obsolète/vide ne part (GL3). `astro build` n'est jamais atteint en cas d'échec.
- **V2 — Manifeste de cohérence + sonde OBS-2.** Le build émet
  `public/legal-manifest.json` (git-ignoré) = `{ <TYPE>: { version, content_hash } }` — **les
  hash réellement compilés** dans le front. Servi statiquement à `/(legal-manifest.json)`.
  La sonde **réutilise OBS-2** (`admission.api.alerting.send_daily_digest`, `alerting.py:195`) :
  elle `GET ${candidate_portal_url}/legal-manifest.json` (clé de config déjà critique, `health.py`),
  compare aux hash back actifs (`_get_active_legal_texts_meta`, `legal.py:139`) et, en cas
  d'écart, **ajoute une ligne « Textes légaux : DIVERGENCE … » au digest quotidien + `send_high_alert`**
  (Telegram). → la divergence, aujourd'hui **silencieuse**, devient **détectée et signalée sous 24 h** (GL3).
  *(Option complémentaire : exposer une méthode publique `legal_coherence` lecture-seule pour un check CI/à la demande — à trancher §7.)*
- **V3 — Version visible.** Déjà rendue par `LegalLayout` ; alimentée par la `version` back (GL4).

**Idempotence (GL7) :** même contenu back → mêmes `.md` générés → même HTML + même manifeste.
Aucun horodatage n'entre dans le contenu ni le manifeste (le manifeste ne porte que `version`+`content_hash`).

---

## 4. WRITE-SET figé

| Cible | Fichier(s) | Action |
|---|---|---|
| Script build | `admission/fronts/apps/applicant/scripts/pull-legal.mjs` **(nouveau)** | ✅ fetch + génération + fail-closed + manifeste |
| Carte présentation | `admission/fronts/apps/applicant/scripts/legal-map.mjs` **(nouveau)** | ✅ slug ↔ document_type ↔ titre (0 texte juridique) |
| Build/dev chaînés | `admission/fronts/apps/applicant/package.json` | ✅ `build`/`dev` = `node scripts/pull-legal.mjs && astro …` |
| Génération git-ignorée | `admission/fronts/apps/applicant/.gitignore` + `git rm --cached` des 4 `.md` | ✅ dé-commit des 4 stubs signés + ignore `legal-manifest.json` |
| Sonde cohérence | `admission/bench/apps/admission/admission/api/alerting.py` (digest OBS-2) + helper `admission/api/legal.py` | ✅ compare manifeste front ↔ hash back, alerte |
| **Consentement** (gates, `Admission Consent Record`, `_record_consent`, fail-closed 503) | — | ❌ **intouché** |
| **Runtime** paiement/reçu (`get_frais`, `get_legal_documents` runtime, `receipt.py`, `paiement.astro`) | — | ❌ **intouché** |
| Doctype `Admission Legal Document` | — | ❌ intouché *(sauf si §7-B retenu : +2 options Select)* |
| Les 2 pages front-only | `mentions-legales.md`, `donnees-personnelles.md` | ❌ committées, documentées front-only |
| **Contenu juridique** (les textes) | — | ❌ **hors périmètre** — stubs conservés tels quels |
| tout le reste | — | ❌ STOP + demande |

---

## 5. Plan de test (exec → gate, recette, bundle réel)

- **T1/GL1** : après build, `git status` → aucun `.md` juridique dérivé committé ; les 6 pages
  affichent le contenu **du back** (navigateur réel sur le bundle recette).
- **T2/GL2 — preuve d'unification** : éditer `content_text` d'un `Admission Legal Document` via
  **Desk** (0 déploiement back) → rebuild → la page front **reflète** le changement (nouveau texte + nouveau `version`/hash). **La preuve du lot.**
- **T3/GL3 — fail-closed** : `PUBLIC_API_BASE` cassé / doc désactivé → **build échoue** (exit≠0),
  aucune page vide générée.
- **T4/GL3 — sonde** : back modifié **sans** rebuild → `legal-manifest.json` diverge des hash back
  → le digest OBS-2 signale « DIVERGENCE » + `send_high_alert` (prouvé via `bench execute` du digest).
- **T5/GL4** : chaque page affiche « Version … » = version back.
- **T6/GL5 — consentement non régressé** : `create_dossier` (CGV+PRIVACY 503), paiement frais1/2
  (REFUND/ DATA_TRANSFER 503), `Admission Consent Record` (hash+IP+UA+ts), reçu PDF — suite back verte, inchangés.
- **T7/GL6 — 3G** : diff bundle → 0 fetch runtime ajouté sur les 6 pages, poids JS inchangé.
- **T8/GL7** : build vert ; non-régression front (tests `node --test`) ; baseline ; **0 texte juridique rédigé** (stubs back conservés).

---

## 6. Critères de gate (rappel mandat)

GL1 dérivé du back · GL2 preuve d'unification (Desk+rebuild) · GL3 pas de divergence silencieuse
(build fail + sonde) · GL4 version affichée · GL5 consentement intact · GL6 3G statique ·
GL7 build vert / baseline / 0 contenu rédigé.

---

## 7. Décisions à trancher au PAUSE (arbitrage architecte)

**D-A — Sort des 2 pages sans jumeau back (`mentions-legales`, `donnees-personnelles`).**
- **Option A1 (recommandée) — Front-only documenté.** Ne pas les dériver : elles n'ont pas de
  jumeau back, ne sont **pas signées**, donc **aucune divergence** ne les menace. Source unique = front,
  explicitée par un bandeau de commentaire. **YAGNI** : le lot reste focalisé sur le vrai problème
  (les 4 textes signés en double). Coût : 0 changement back.
- **Option A2 — Créer 2 `document_type` back** (`MENTIONS_LEGALES`, `DATA_PERSONAL_RIGHTS`) : +2 options
  Select au doctype + 2 seeds + migration, puis les 6 pages 100 % back-sourcées et « un seul lieu
  d'édition (Desk) ». Coût : petite modif doctype + migration ; bénéfice surtout futur (surface d'édition unique).

**D-B — Placement de la sonde de cohérence.**
- **Option B1 (recommandée) — Digest OBS-2** (`send_daily_digest`) qui fetch `legal-manifest.json`
  et alerte. Réutilise l'alerting déjà câblé ; détection ≤ 24 h. Colle au mandat (« réutiliser health/digest OBS-2 »).
- **Option B2 — + endpoint public `legal_coherence`** lecture-seule (pour un check CI/à la demande),
  en plus de B1.

*Recommandation d'ensemble : **A1 + B1** (focalisé, YAGNI, colle au mandat). Prêt à basculer en A2/B2 sur ta décision.*

---

*Après validation de ce PC1 : un seul pass exec + test + rapport → gate. Branche → preuve recette (navigateur réel) → merge.*
