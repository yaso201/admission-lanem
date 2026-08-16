# LEGAL-FEDAPAY — Dossier de preuves

> Documentaire · front applicant `mandat/legal-fedapay` (base `30dccd4`). **Cas d'arrêt confirmé** :
> 3 des 4 documents nommant KkiaPay sont **générés depuis le back** (`Admission Legal Document`,
> source unique, `pull-legal.mjs` fail-closed au build) → hors périmètre (frontière NT-S). Le lot se
> réduit au front-natif : `politique-cookies.md` + `pull-legal.test.mjs`. Les 3 docs back forment
> **LEGAL-BACK** (§4 : extraits de remplacement prêts).

## 1. Recon — inventaire et source des 7 documents légaux

| Doc (`src/content/legal/`) | Route | Source | Nomme KkiaPay |
|---|---|---|---|
| `cgv.md` | `/legal/cgv` | **BACK** (`Admission Legal Document` type CGV) | **oui** |
| `politique-de-confidentialite.md` | `/legal/politique-de-confidentialite` | **BACK** (PRIVACY_POLICY) | **oui** |
| `politique-de-remboursement.md` | `/legal/politique-de-remboursement` | **BACK** (REFUND_POLICY) | non |
| `consentement-transfert-donnees.md` | `/legal/consentement-transfert-donnees` | **BACK** (DATA_TRANSFER_CONSENT) | **oui** |
| `politique-cookies.md` | `/legal/politique-cookies` | **front-natif** (git-tracké) | **oui** |
| `mentions-legales.md` | `/legal/mentions-legales` | front-natif | non |
| `donnees-personnelles.md` | `/legal/donnees-personnelles` | front-natif | non |

Les 4 back-générés sont **gitignorés** (`.gitignore` L.12-15, « Générées par pull-legal.mjs — jamais éditées ») et régénérés à chaque build via `admission.api.public.get_legal_documents`. Éditer leur `.md` est **futile** (écrasé au build) et leur source est le back → **cas d'arrêt #1**.

- **Hébergement** (recon #2) : `Contabo GmbH, Munich, Allemagne` partout — **correct** (pas d'erreur OVH ; « Cantobo » = coquille de cadrage). Aucune autre mention périmée dans les front-natifs.
- **Dates/versions** (recon #4) : frontmatter `date_effet` + `version`. Back-générés → depuis le back ; cookies (front) → actualisé ici.

## 2. Livré (front, dans le write-set)

| Fichier | Changement |
|---|---|
| `src/content/legal/politique-cookies.md` | Ligne « Module de paiement » : **`KkiaPay (Bénin)` → `FedaPay (Bénin)`** (substitution nominative ; le reste de la ligne — module chargé uniquement à l'engagement d'un paiement, `Aucun` cookie — reste exact pour FedaPay). Frontmatter : `date_effet 12→17 août 2026`, `version 1.0→1.1` (traçabilité). |
| `tests/pull-legal.test.mjs` | L.57 : attente de titre alignée sur `legal-map.mjs` — `"Conditions générales de vente"` → **`"Conditions générales de candidature en ligne"`** (le titre avait été renommé sans MàJ du test). Dernier faux-rouge applicant éliminé. |

**Diff sensible (donnée de paiement) — le seul de mon périmètre :**
```diff
- | Module de paiement | KkiaPay (Bénin) | Règlement en ligne des frais — chargé **uniquement** lorsque l’utilisateur engage un paiement | Aucun |
+ | Module de paiement | FedaPay (Bénin) | Règlement en ligne des frais — chargé **uniquement** lorsque l’utilisateur engage un paiement | Aucun |
```
Aucune clause ajoutée/supprimée ; aucun droit modifié ; diff auditable ligne à ligne.

## 3. Preuves runtime

- **`pull-legal.test.mjs` : 6/6 PASS** (avant : 5/1, l'échec était l'assertion de titre L.57). **Dernier faux-rouge de la suite applicant éliminé.**
- **Build applicant : 19 pages, aucun avertissement** (astro + pull-legal fail-closed avec `PUBLIC_API_BASE=…api-admissions…`).
- **`dist/legal/politique-cookies/index.html` : 0 occurrence « KkiaPay », 1 « FedaPay »** — mon périmètre est propre.
- KkiaPay restant dans `dist/` : `legal/cgv`, `legal/consentement-transfert-donnees`, `legal/politique-de-confidentialite` (les 3 back-générés — **LEGAL-BACK**, §4) + `scripts/admission-tunnel.js` (alias `AT.kkiapay` commenté, dette FedaPay-V1.1, hors périmètre légal).

## 4. LEGAL-BACK — extraits de remplacement exacts (livrable pour l'équipe back / NT-S)

Ces 3 mises à jour portent sur le doctype **`Admission Legal Document`** (source unique). À appliquer côté back, puis un build régénère les pages. **Identité FedaPay confirmée** (fournie par la Direction via le canal marchand) :

> **FEDAPAY SA**, capital 100 000 000 XOF, siège **Ste Rita C/1398, P/V, Quartier Tonato, 8ᵉ arrondissement, Cotonou, Bénin**, RCCM **RB/COT/19B24720**, IFU **3201910819942**, représentée par **Boris KOUMONDJI** (Directeur Général).

FEDAPAY SA est **béninoise (Cotonou)** → la qualification « **Bénin — hors champ des transferts vers un État tiers** » de la table de transferts **reste exacte** (pas de transfert hors Bénin pour l'encaissement).

### 4.1 CGV (`Admission Legal Document` type CGV)
```diff
- Les moyens de paiement acceptés sont : le **paiement électronique en ligne** (carte bancaire et
- mobile money, par l’intermédiaire du prestataire KkiaPay) et le **virement bancaire**.
+ Les moyens de paiement acceptés sont : le **paiement électronique en ligne** (carte bancaire et
+ mobile money, par l’intermédiaire du prestataire FedaPay) et le **virement bancaire**.
```
⚠️ **Lacune signalée (§6)** : le paiement en ligne est actuellement **désactivé** (DEC-334, drapeau à 0).
Le back peut, s'il le souhaite, préférer « moyens de paiement **proposés** » à « acceptés » pour rester
juste tant que le drapeau est à 0 — décision juridique, non tranchée ici.

### 4.2 Politique de confidentialité (type PRIVACY_POLICY) — table des sous-traitants
```diff
- | KkiaPay | Paiement | Bénin |
+ | FedaPay | Paiement | Bénin |
```

### 4.3 Consentement au transfert de données (type DATA_TRANSFER_CONSENT) — table des destinataires
```diff
- | KkiaPay | Cotonou | Bénin | Encaissement des frais en ligne | Montant, référence de transaction,
-   données de paiement traitées par le prestataire | Bénin — hors champ des transferts vers un État tiers |
+ | FedaPay (FEDAPAY SA) | Ste Rita, Quartier Tonato, 8ᵉ arr., Cotonou | Bénin | Encaissement des frais
+   en ligne | Montant, référence de transaction, données de paiement traitées par le prestataire |
+   Bénin — hors champ des transferts vers un État tiers |
```

## 5. Cas d'arrêt & routage

- **Cas d'arrêt #1** (contenu légal côté back) : les 3 docs ci-dessus. Non exécutable en front — régénéré au build.
- LEGAL-BACK ne part **pas maintenant** : NT-S est actif sur le back (conflit de write-set) ; à clore **avant la levée du drapeau `online_payment_enabled`**, pas avant l'ouverture de la campagne (paiement désactivé → aucun traitement de données de paiement en cours sous le mauvais nom).

## 6. Lacunes signalées (non comblées — DEC périmètre strict)

1. **CGV « acceptés » vs état du service** : online payment désactivé (drapeau 0) — le texte affirme un moyen de paiement non actif. Reformulation « proposés » possible (décision back/juridique). §4.1.
2. **Cookies du module FedaPay** : la ligne indique « Aucun » cookie. Le checkout FedaPay (`cdn.fedapay.com/checkout.js` → popup `process.fedapay.com`) ne pose vraisemblablement aucun cookie **première-partie** sur notre domaine ; **à confirmer** si l'on veut être exhaustif. Conservé « Aucun » (pas de preuve du contraire — ne pas inventer).
3. Placeholders **préexistants** dans la table de transferts (`Opérateur mail.lanem.bj — à confirmer`, `Google LLC`) : hors périmètre KkiaPay, signalés pour info.

## 7. Instructions post-fusion

1. Front applicant : Pages redéploie sur push `main`. Vérifier `/legal/politique-cookies` sert **FedaPay** ; les 3 pages back-générées resteront en **KkiaPay** jusqu'à LEGAL-BACK (attendu). Pas de bump `?v=` (pas d'asset non-hashé modifié).
2. **LEGAL-BACK** : appliquer §4 sur les `Admission Legal Document` (back), quand NT-S est fusionné + build de régénération → 0 KkiaPay dans tout `dist/legal/`.
3. Corpus : acter la substitution FedaPay dans les documents légaux (nominale + réécriture table transferts) ; consigner l'identité **FEDAPAY SA**.
