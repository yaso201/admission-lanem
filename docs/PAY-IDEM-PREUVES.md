# PAY-IDEM (faille 16) — idempotence CLIENT des paiements : preuves

> Mandat DEC-L. **Arrêt au push · fusion/déploiement à l'architecte.** SHA constatés : back
> **`e1c7aed`** (INCHANGÉ — DEC-D) · applicant **`aaa173a`** · management **`7ca1dd7`**. Branches
> `mandat/pay-idem`. **La dernière des 20 failles de l'audit 360.** Baseline **1189/0/0**.

## La faille et le correctif

Trois chemins régénéraient leur clé d'idempotence à **chaque** tentative ; un quatrième (initiation
staff) n'en envoyait aucune. Deux clics après un timeout → **deux transactions FedaPay** pour une même
intention, dont une orpheline (réconciliation salissante — jamais un double débit, le serveur garantit
déjà l'unicité de la confirmation, cf. `test_idempotence_replay`). Correctif **100 % CLIENT** : la clé
est **stable par intention**. Le serveur consomme déjà la clé (DEC-C/D) — **aucun changement back**.

## L'identité d'une intention (le cœur du lot)

```
dossier_id : feeType : channel : amount
```

La clé est **générée une fois par identité**, **mémorisée**, **rejouée à l'identique** sur un réessai
ou un rechargement, et **renouvelée** dès que l'identité change. Ce tuple répond *déclarativement* aux
deux questions d'arbitrage — aucune machine à états :

| Événement | Identité | Effet |
|---|---|---|
| Deux clics / timeout / rechargement | inchangée | **même clé** (dédup FedaPay) |
| Changement de canal (en ligne → virement, **Q4**) | `channel` change | **clé neuve** (nouvelle intention) |
| Changement de montant (acompte, bourse, **Q5**) | `amount` change | **clé neuve** |
| Autre dossier | `dossier_id` change | **clé neuve** |

**Fin d'intention** : purge sur **succès définitif** (`pollDossierStatus` atteint le statut attendu =
résultat opposable → `_clearPayIntents(dossier)`) ; sinon **expiration bornée** couvre l'échec et
l'abandon (indétectables de façon fiable côté client). Fenêtre = `RESUME_WINDOW_MS` (**30 min, mirée** :
aucune 2ᵉ constante de durée introduite dans le tunnel).

## Où la clé est mémorisée (DEC-B) — et la vigilance namespace

| Front | Stockage | Namespace | Survit au rechargement | Survit à une nouvelle intention |
|---|---|---|---|---|
| Applicant | `localStorage` | **`emela.admission.payintent`** | ✅ | ❌ (identité + expiration) |
| Management | `sessionStorage` | **`emela.staff.payintent`** | ✅ (page staff) | ❌ |

**Vigilance tenue et PROUVÉE** : `emela.admission.payintent` est **strictement distinct** de l'ancrage
de reprise `emela.admission.resume`. Test `emela.admission.payintent ne déborde jamais sur
emela.admission.resume` : les deux stores coexistent, la clé de paiement ne pollue pas l'ancrage,
le token de reprise n'entre pas dans le store d'intention, et `getDossierId()` reste intact. **Le
parcours de reprise (récemment réparé) n'est pas touché.**

## Captures de payload — les quatre chemins (artefact réel)

```
── APPLICANT (tunnel) : réessai de la MÊME intention → MÊME clé ──
frais 1 en ligne  clic#1 : pay-uuid-9h0bwa
frais 1 en ligne  clic#2 : pay-uuid-9h0bwa          (identique)
frais 1 virement  clic#1 : pay-uuid-48tppt          (canal ≠ → clé ≠)
frais 2 (acompte 5000) #1: pay-uuid-drvkvv
frais 2 (acompte 5000) #2: pay-uuid-drvkvv          (identique)
frais 2 (acompte 9000)   : pay-uuid-x3aj28          (montant ≠ → clé ≠)

── MANAGEMENT (initiation staff) : la clé EST envoyée, stable au réessai ──
initiation staff clic#1 : pay-uuid-dr61l2
initiation staff clic#2 : pay-uuid-dr61l2           (identique)
```

## Portée : les quatre chemins (dont hors-ligne)

Stabilisés : frais 1 **en ligne** (`submit_payment_online`), frais 1 **virement**
(`declare_payment_offline`), frais 2 **tous canaux** (`submit_enrollment_payment_online` /
`declare_enrollment_payment_offline`), **initiation staff** (`initiate_online_payment`). Le double débit
FedaPay est propre à l'en-ligne, mais le **doublon d'enregistrement hors-ligne** (double-clic « Déclarer
virement » → deux paiements en attente sur un même frais) est réel — et le hors-ligne est *la seule voie
active en production* tant que `online_payment_enabled=0`.

## Non-régression & preuves

- **Applicant** : `pay-idem.test.mjs` **9/9** (réessai→même clé · canal→neuve · montant→neuve · dossier→
  neuve · rechargement→survie · namespace distinct · expiration 30 min · purge sur confirmation) ;
  **suite front 75/0** (build inclus).
- **Management** : `pay-idem-staff.test.mjs` **6/6** (clé envoyée · réessai→même · feeType/montant/dossier→
  neuve · survie sessionStorage + expiration) ; **suite front 13/0**.
- **Idempotence serveur intacte** : `test_idempotence_replay` **OK** sur le code déployé (`e1c7aed`).
- **Builds propres** (applicant + management) ; `dist/` embarque `admission-tunnel.js?v=8`.
- **CAL-13** : `?v=7 → ?v=8` sur les **11 pages** (bourses, confirmation, identite, index,
  paiement-accepte, paiement-sop, paiement, pieces, recapitulatif, reprise, suivi).
- **Write-set tenu** : applicant `admission-tunnel.js` (région paiement) + 11 `?v=` + test ; management
  `api.js` (initiation seule) + test ; **aucun fichier back**, `ui.js`/pages intacts.

---

# PROCÉDURE DE TEST RÉEL — à exécuter par l'architecte / l'utilisateur

> **But** : prouver en PRODUCTION qu'un double-clic sur « Payer en ligne » ne crée **qu'une seule**
> transaction FedaPay. Exécutable **sans avoir suivi ce lot**. Argent réel, montant **< 5 000 F**
> (FedaPay les accepte même sur compte non validé). Le paiement en ligne est **fermé** par défaut
> (`online_payment_enabled=0`) ; on l'ouvre le temps du test, **on le referme à la fin**.

### A. Avant (préparer)
- [ ] **A1.** Se connecter en SSH au serveur back PROD : `frappe@169.58.164.137`, `~/bench-admission`.
- [ ] **A2.** Noter l'état actuel du drapeau (pour restaurer) :
      `bench --site <site> get-config online_payment_enabled` → attendu `0` (ou absent). **Le noter.**
- [ ] **A3.** Identifier **un** dossier de test réel prêt à payer les frais 1 (état `BRO`, pièces
      requises déposées) — ou en créer un via le tunnel candidat. Noter son `dossier_id`.
- [ ] **A4.** Confirmer côté FedaPay (tableau de bord marchand) le **nombre de transactions actuel**
      pour ce dossier = **0** (référence de départ).

### B. Ouvrir le paiement en ligne (le drapeau)
- [ ] **B1.** `bench --site <site> set-config online_payment_enabled 1`
- [ ] **B2.** `bench restart`
- [ ] **B3.** Vérifier : `get_frais` renvoie `online_payment_enabled: true` (ou l'écran candidat
      propose « Payer en ligne »). ⚠️ **À cet instant le paiement en ligne est ouvert pour TOUT LE
      MONDE** — le test doit être bref.

### C. Le test d'idempotence (le geste qui prouve)
- [ ] **C1.** Sur le dossier de test, ouvrir `/paiement`, choisir **Payer en ligne**.
- [ ] **C2.** **Double-cliquer** / relancer après un (faux) timeout — deux tentatives rapprochées de la
      **même** intention.
- [ ] **C3.** Régler le montant réel (**< 5 000 F**) une fois dans le checkout FedaPay.
- [ ] **C4.** **Observer** — critère de succès :
      - tableau de bord FedaPay = **UNE seule** transaction créée pour ce dossier (pas deux) ;
      - le dossier passe à `SOU` (frais 1 confirmé) **une seule fois** ;
      - dans le stockage du navigateur, `emela.admission.payintent` contient **une** entrée pour
        l'intention, purgée après confirmation.
- [ ] **C5.** (Optionnel, contre-preuve) rechargement de page entre les deux clics → la transaction
      reste unique (la clé a survécu).

### D. REFERMER — l'étape qu'on oublie
- [ ] **D1.** `bench --site <site> set-config online_payment_enabled 0`   *(ou la valeur notée en A2 :
      si A2 montrait « absent », retirer la clé — `bench --site <site> set-config online_payment_enabled ""`
      n'est pas équivalent : préférer restaurer `0`, l'état PROD explicite).*
- [ ] **D2.** `bench restart`
- [ ] **D3.** **Vérifier la fermeture** : `get_frais` renvoie `online_payment_enabled: false` et l'écran
      candidat ne propose plus « Payer en ligne ». **Ne pas quitter avant d'avoir confirmé D3.**
- [ ] **D4.** Rapprocher côté FedaPay : la transaction de test (< 5 000 F) est bien **unique** ;
      la rembourser / annuler selon la politique interne.
- [ ] **D5.** Nettoyer le dossier de test si créé pour l'occasion.

### Résultat attendu
Un double-clic → **une** transaction FedaPay. Si **deux** apparaissent, l'idempotence client a échoué :
capturer les deux `idempotency_key` envoyés (onglet Réseau) et rouvrir le lot.
