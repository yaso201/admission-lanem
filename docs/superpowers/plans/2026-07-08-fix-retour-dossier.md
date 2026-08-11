# FIX-RETOUR-DOSSIER — Résolveur d'étape state-aware — Implementation Plan (PC1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger les 7 incohérences de retour candidat par un résolveur d'étape unique conscient de l'état (statut + paiement + pièces), en généralisant le pattern in-place déjà sain (ACO, fee2 ACC).

**Architecture :** Une seule fonction pure `resolveStep(dossier)` ajoutée à `admission-tunnel.js` devient la source unique de la question « où envoyer le candidat ». Elle est consommée par `routeByStatus` (reprise), le bouton BRO de /suivi, le CTA « continuer » de /pieces, et les gardes d'arrivée de /recapitulatif et /paiement. Un geste terminal INC in-place est ajouté sur /pieces. Côté back, le mail INC (et, sous réserve d'arbitrage, les rappels J4/J6) réutilise la tokenisation existante du récap SOU pour ouvrir le dossier sur un appareil vierge.

**Tech Stack :** Astro (pages `.astro`, `<script>` inline vanilla JS ES5-style), `admission-tunnel.js` (IIFE `window.AdmissionTunnel`), tests front `node --test tests/*.test.mjs`, back Frappe/Python, tests back `unittest` + `patch`.

## Global Constraints

- **Ne JAMAIS toucher la garde argent.** Le 409 `ALREADY_PAID` (public.py:1661/1934) et `PAYMENT_FORBIDDEN_STATES` restent strictement inchangés. Ce lot est UX/parcours ; l'argent est déjà protégé.
- **Source unique (GR6) :** après ce lot, aucune page ne décide seule avec `requisesManquantes()` en isolation. Toute décision de navigation passe par `resolveStep`. `requisesManquantes` reste un helper interne appelé *par* `resolveStep`.
- **Ne pas régresser les 2 patterns sains :** ACO diplôme (suivi.astro:403-406) et fee2 ACC (suivi.astro:482-496) restent inchangés dans leur comportement.
- **Réutiliser la tokenisation existante** (staff.py:1007-1015, pattern récap SOU : `_generate_token()` + `_hash()` + `token_expires_at = add_days(now, TOKEN_TTL_DAYS)` + `otp_verified = 0`). Aucun nouveau mécanisme de token.
- **Contrat serializer inchangé :** `_serialize_dossier` expose déjà tout le nécessaire (`statut`, `paiement.frais1/frais2.statut` ∈ {`confirmed`,`pending`,`rejected`,`en_attente`}, `pieces[].requise/.statut/.statut_reel`). On ne l'étend pas.
- **0 dépendance ajoutée.** `resolveStep` = quelques lignes de logique pure.
- **Style :** JS des `.astro` = style existant (var, callbacks, pas d'ES modules) ; `AT = window.AdmissionTunnel` déjà aliasé dans chaque page.

---

## Décision d'arbitrage à confirmer au gate PC1 (correctif #7)

Le mail INC (#5) doit être tokenisé — **ferme, aucune réserve** : c'est aujourd'hui le seul message pour un dossier INC et il pointe `/suivi` sans token → « aucun dossier » sur appareil vierge.

Les **rappels J4/J6 (#7)** posent une **tension réelle** : le rappel suit le **récap SOU qui est DÉJÀ tokenisé** (staff.py:1007) et sa copie dit explicitement « *le lien reçu dans notre précédent e-mail reste valide* » (notifications.py:249). Tokeniser le rappel impose de **faire tourner un nouveau token à chaque rappel**, ce qui **invalide le lien du récap** que le rappel demande justement de réutiliser, et rend la copie fausse. La friction « appareil vierge » de #7 est déjà couverte par le token du récap ; elle ne mord que si le candidat a supprimé le récap mais gardé le rappel.

**Recommandation :** fixer #5 (tokeniser INC), **garder #7 générique** (retirer #7 du lot) — c'est le repli explicitement prévu par le mandat. Task 7 ci-dessous est spécifiée **au cas où** l'architecte tranche « tokeniser #7 » ; par défaut (recommandation), **Task 7 n'est pas exécutée**.

---

## File Structure

| Fichier | Responsabilité | Nature du changement |
|---|---|---|
| `public/scripts/admission-tunnel.js` | `resolveStep(dossier)` (NEW) + export | ajout fonction pure + export |
| `tests/admission-tunnel.test.mjs` | tests unitaires `resolveStep` | ajout cas |
| `src/pages/reprise.astro` | `routeByStatus` via `resolveStep` | remplacement branchement |
| `src/pages/suivi.astro` | bouton BRO « Reprendre » via `resolveStep` | 1 ligne |
| `src/pages/pieces.astro` | CTA BRO via `resolveStep` ; geste INC in-place | render statut-aware |
| `src/pages/recapitulatif.astro` | garde d'arrivée via `resolveStep` | remplacement garde |
| `src/pages/paiement.astro` | garde d'arrivée via `resolveStep` | remplacement garde |
| `admission/api/staff.py` (back) | `request_complement` : rotation token avant notif | +5 lignes |
| `admission/api/notifications.py` (back) | `send_incompletude_notification(…, token=None)` | +1 param, CTA |
| `admission/tests/test_completude.py` (back) | tokenisation INC | ajout cas |
| *(conditionnel #7)* `notifications.py` `send_pieces_reminders` + `send_pieces_reminder_notification` | tokenisation rappels | conditionnel arbitrage |

---

## Task 1 : `resolveStep(dossier)` — source unique state-aware (front, TDD)

**Files:**
- Modify: `public/scripts/admission-tunnel.js` (ajout après `requisesManquantes`, ~ligne 600 ; export dans l'objet `AdmissionTunnel` ~ligne 631)
- Test: `tests/admission-tunnel.test.mjs`

**Interfaces:**
- Consumes: `requisesManquantes(pieces)` (existant, admission-tunnel.js:598)
- Produces: `AT.resolveStep(dossier) -> string` ∈ `{'/pieces','/recapitulatif','/suivi'}`. **Ne renvoie JAMAIS `/paiement`** (le paiement est un sous-pas du récapitulatif, gardé par la case attestation). Entrée = objet `dossier` sérialisé (`_serialize_dossier`) : lit `dossier.statut`, `dossier.paiement.frais1.statut`, `dossier.pieces`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter dans `tests/admission-tunnel.test.mjs` (après les tests existants) :

```javascript
// ── FIX-RETOUR-DOSSIER : resolveStep (source unique state-aware) ────────────────
function dossier(over) {
  return Object.assign({
    statut: 'BRO',
    pieces: [{ code: 'cni', requise: true, statut: 'deposee' }],
    paiement: { frais1: { statut: 'en_attente' }, frais2: null },
  }, over || {});
}

test('resolveStep : BRO + pièce requise manquante → /pieces', () => {
  assert.equal(AT.resolveStep(dossier({
    pieces: [{ code: 'cni', requise: true, statut: 'manquante' }],
  })), '/pieces');
});

test('resolveStep : BRO + pièces OK + frais1 non réglé → /recapitulatif', () => {
  assert.equal(AT.resolveStep(dossier()), '/recapitulatif');
});

test('resolveStep : frais1 CONFIRMÉ → /suivi (jamais le tunnel de paiement)', () => {
  assert.equal(AT.resolveStep(dossier({
    paiement: { frais1: { statut: 'confirmed' }, frais2: null },
  })), '/suivi');
});

test('resolveStep : INC (dossier hors BRO) → /suivi', () => {
  assert.equal(AT.resolveStep(dossier({
    statut: 'INC',
    paiement: { frais1: { statut: 'confirmed' }, frais2: null },
  })), '/suivi');
});

test('resolveStep : SOU → /suivi', () => {
  assert.equal(AT.resolveStep(dossier({ statut: 'SOU' })), '/suivi');
});

test('resolveStep : dossier vide / null → /suivi (fail-safe, jamais le paiement)', () => {
  assert.equal(AT.resolveStep(null), '/suivi');
  assert.equal(AT.resolveStep({}), '/suivi');
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `cd /Users/yaovisoglo/Documents/SI-LaNEM/admission/fronts/apps/applicant && node --test tests/admission-tunnel.test.mjs`
Expected: FAIL — `AT.resolveStep is not a function`.

- [ ] **Step 3 : Implémenter `resolveStep`**

Dans `admission-tunnel.js`, juste après `requisesManquantes` (ligne 600) :

```javascript
  /* FIX-RETOUR-DOSSIER — RÉSOLVEUR D'ÉTAPE : source UNIQUE de « où envoyer le candidat »,
     consciente de l'état (statut + paiement frais1 + pièces). Remplace les décisions dispersées
     qui ignoraient le paiement (cause du symptôme « pièce complémentaire → page de paiement déjà
     réglée »). Ne renvoie JAMAIS /paiement : le paiement est un sous-pas de /recapitulatif (gardé
     par la case attestation). Fail-safe = /suivi (jamais le tunnel de paiement) sur entrée vide. */
  function _fee1Confirmed(d) {
    return !!(d && d.paiement && d.paiement.frais1 && d.paiement.frais1.statut === 'confirmed');
  }
  function resolveStep(d) {
    d = d || {};
    /* Payé (frais 1 confirmé) OU dossier au-delà du brouillon → espace de suivi, jamais le paiement. */
    if (_fee1Confirmed(d)) { return '/suivi'; }
    if (d.statut !== 'BRO') { return '/suivi'; }
    /* Brouillon : pièces requises manquantes → dépôt ; sinon récapitulatif (→ paiement via son CTA). */
    if (requisesManquantes(d.pieces).length) { return '/pieces'; }
    return '/recapitulatif';
  }
```

Dans l'objet `global.AdmissionTunnel` (après `requisesManquantes: requisesManquantes,` ligne 631) :

```javascript
    resolveStep: resolveStep,
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `cd /Users/yaovisoglo/Documents/SI-LaNEM/admission/fronts/apps/applicant && node --test tests/admission-tunnel.test.mjs`
Expected: PASS (tous, y compris les tests palier 1/3 préexistants — non-régression).

- [ ] **Step 5 : Commit**

```bash
git add public/scripts/admission-tunnel.js tests/admission-tunnel.test.mjs
git commit -m "feat(retour-dossier): resolveStep — résolveur d'étape state-aware (source unique)"
```

---

## Task 2 : Consommation `resolveStep` dans reprise + suivi (front)

**Files:**
- Modify: `src/pages/reprise.astro:166-178` (`routeByStatus`)
- Modify: `src/pages/suivi.astro:685` (bouton BRO)

**Interfaces:**
- Consumes: `AT.resolveStep(dossier)` (Task 1)

- [ ] **Step 1 : reprise.astro — `routeByStatus` via resolveStep**

Remplacer (reprise.astro:166-178) :

```javascript
  function routeByStatus() {
    AT.api.getDossier(function (res) {
      if (!res.ok) { AT.navigateTo('/suivi'); return; }
      var statut = res.data.statut;
      if (statut === 'BRO') {
        var pending = (res.data.pieces || []).some(function (p) { return p.requise && p.statut !== 'deposee'; });
        window.location.href = pending ? '/pieces' : '/recapitulatif';
      } else {
        window.location.href = '/suivi';
      }
    });
  }
```

par :

```javascript
  function routeByStatus() {
    AT.api.getDossier(function (res) {
      /* FIX-RETOUR-DOSSIER : source unique resolveStep (statut + paiement + pièces).
         Sur échec, repli /suivi (jamais le tunnel de paiement). */
      window.location.href = res.ok ? AT.resolveStep(res.data) : '/suivi';
    });
  }
```

- [ ] **Step 2 : suivi.astro — bouton BRO « Reprendre » via resolveStep**

Remplacer (suivi.astro:685) `go.href = '/pieces';` par :

```javascript
      go.href = AT.resolveStep(d);   /* FIX-RETOUR-DOSSIER : fin du hop /pieces systématique (BRO pièces OK → /recapitulatif) */
```

- [ ] **Step 3 : Build vert**

Run: `cd /Users/yaovisoglo/Documents/SI-LaNEM/admission/fronts/apps/applicant && npm run build`
Expected: build OK (aucune erreur Astro).

- [ ] **Step 4 : Commit**

```bash
git add src/pages/reprise.astro src/pages/suivi.astro
git commit -m "feat(retour-dossier): reprise + suivi consomment resolveStep"
```

---

## Task 3 : Gardes d'arrivée /recapitulatif et /paiement via resolveStep (front)

**Files:**
- Modify: `src/pages/recapitulatif.astro:316-318`
- Modify: `src/pages/paiement.astro:342-346`

**Interfaces:**
- Consumes: `AT.resolveStep(dossier)` (Task 1). Règle : `/paiement` étant le sous-pas de `/recapitulatif`, un candidat légitime sur l'une ou l'autre a `resolveStep(d) === '/recapitulatif'`. Toute autre valeur (`/pieces` = pièces manquantes ; `/suivi` = payé ou hors BRO) → redirection.

- [ ] **Step 1 : recapitulatif.astro — garde via resolveStep**

Remplacer (recapitulatif.astro:317-318) :

```javascript
    /* Lot 3b — garde d'étape : pièces requises incomplètes → retour à /pieces (le back 3a fait foi). */
    if (AT.requisesManquantes(d.pieces).length) { AT.navigateTo('/pieces'); return; }
```

par :

```javascript
    /* FIX-RETOUR-DOSSIER — garde d'étape UNIQUE (resolveStep) : pièces manquantes → /pieces,
       dossier payé/hors BRO → /suivi (défense en profondeur : attrape aussi l'arrivée par URL
       directe/historique). Le récapitulatif n'est légitime que si resolveStep === /recapitulatif. */
    if (AT.resolveStep(d) !== '/recapitulatif') { AT.navigateTo(AT.resolveStep(d)); return; }
```

- [ ] **Step 2 : paiement.astro — garde via resolveStep**

Remplacer (paiement.astro:342-346) :

```javascript
  AT.api.getDossier(function (gres) {
    var gd = (gres.ok && gres.data) || {};
    if (AT.requisesManquantes(gd.pieces).length) { AT.navigateTo('/pieces'); return; }
    bootPaiement();
  });
```

par :

```javascript
  AT.api.getDossier(function (gres) {
    var gd = (gres.ok && gres.data) || {};
    /* FIX-RETOUR-DOSSIER — garde d'étape UNIQUE (resolveStep) : un payeur légitime a
       resolveStep === '/recapitulatif' (BRO, pièces OK, frais1 non confirmé). Sinon : pièces
       manquantes → /pieces, ou dossier PAYÉ/hors BRO → /suivi (défense en profondeur URL directe
       & historique — le back 409 ALREADY_PAID reste le garant argent, inchangé). */
    if (AT.resolveStep(gd) !== '/recapitulatif') { AT.navigateTo(AT.resolveStep(gd)); return; }
    bootPaiement();
  });
```

- [ ] **Step 3 : Build vert**

Run: `cd /Users/yaovisoglo/Documents/SI-LaNEM/admission/fronts/apps/applicant && npm run build`
Expected: build OK.

- [ ] **Step 4 : Commit**

```bash
git add src/pages/recapitulatif.astro src/pages/paiement.astro
git commit -m "feat(retour-dossier): gardes /recapitulatif + /paiement via resolveStep (défense en profondeur payé)"
```

---

## Task 4 : /pieces — CTA BRO via resolveStep + geste terminal INC in-place (front)

**Files:**
- Modify: `src/pages/pieces.astro` (stockage du dossier : ~ligne 668-676 ; `nextBtn.onclick` : ligne 591 ; `renderResubmit` : lignes 599-619 ; handler resubmit : lignes 620-638)

**Interfaces:**
- Consumes: `AT.resolveStep(dossier)` (Task 1), `AT.api.resubmitComplement(cb)` (existant, admission-tunnel.js:296 — INC→SOU), `AT.api.candidateResubmit(cb)` (existant — SOU no-op).
- Contexte : `pieces.astro` charge le dossier dans `getDossier` (ligne 662) et fixe `dossierStatut` (ligne 670). On stocke le dossier complet pour que `resolveStep` voie `paiement`.

- [ ] **Step 1 : Stocker le dossier complet au chargement**

Ajouter une variable module (près de `dossierStatut`, ligne 279) :

```javascript
  var dossier = null;         // FIX-RETOUR-DOSSIER : dossier complet pour resolveStep (paiement inclus)
```

Dans le callback `getDossier` (après `dossierStatut = d.statut || '';`, ligne 670) ajouter :

```javascript
    dossier = d;
```

- [ ] **Step 2 : nextBtn (BRO) → resolveStep ; masqué hors BRO**

Remplacer (pieces.astro:587-592) :

```javascript
    } else {
      gateText.textContent = 'Toutes les pièces obligatoires sont envoyées';
      nextBtn.removeAttribute('disabled');
      nextBtn.setAttribute('aria-disabled', 'false');
      nextBtn.onclick = function () { AT.navigateTo('/recapitulatif'); };
    }
```

par :

```javascript
    } else {
      gateText.textContent = 'Toutes les pièces obligatoires sont envoyées';
      nextBtn.removeAttribute('disabled');
      nextBtn.setAttribute('aria-disabled', 'false');
      /* FIX-RETOUR-DOSSIER : cible calculée (BRO → /recapitulatif ; jamais /paiement pour un payé). */
      nextBtn.onclick = function () { AT.navigateTo(AT.resolveStep(dossier)); };
    }
    /* FIX-RETOUR-DOSSIER : le CTA « continuer vers le récapitulatif » n'a de sens qu'en BRO.
       En INC/SOU, le geste terminal est le bloc de re-soumission (renderResubmit), pas le tunnel. */
    if (dossierStatut !== 'BRO') {
      nextBtn.hidden = true;
    } else {
      nextBtn.hidden = false;
    }
```

- [ ] **Step 3 : renderResubmit — visible en INC (geste terminal) ET SOU**

Remplacer `renderResubmit` (pieces.astro:599-619) :

```javascript
  function renderResubmit() {
    var box = document.getElementById('resubmit-box');
    if (!box) { return; }
    if (dossierStatut !== 'SOU') { box.hidden = true; return; }
    box.hidden = false;
    var btn = document.getElementById('resubmit-btn');
    var gate = document.getElementById('resubmit-gate');
    if (resubmitDone) {
      btn.setAttribute('disabled', ''); btn.setAttribute('aria-disabled', 'true');
      gate.textContent = '';
      return;
    }
    var rejetees = pieces.filter(function (p) { return etatReel(p) === 'rejected'; }).length;
    if (rejetees > 0) {
      btn.setAttribute('disabled', ''); btn.setAttribute('aria-disabled', 'true');
      gate.textContent = 'Re-déposez d’abord les pièces rejetées (' + rejetees + ' restante' + (rejetees > 1 ? 's' : '') + ').';
    } else {
      btn.removeAttribute('disabled'); btn.setAttribute('aria-disabled', 'false');
      gate.textContent = '';
    }
  }
```

par :

```javascript
  function renderResubmit() {
    var box = document.getElementById('resubmit-box');
    if (!box) { return; }
    /* FIX-RETOUR-DOSSIER : geste terminal in-place pour INC (re-soumission INC→SOU) ET SOU
       (signalement, dossier reste SOU). Avant, SOU seulement → l'INC n'avait aucun geste sur
       /pieces et repartait dans le tunnel de paiement. */
    if (dossierStatut !== 'INC' && dossierStatut !== 'SOU') { box.hidden = true; return; }
    box.hidden = false;
    var btn = document.getElementById('resubmit-btn');
    var gate = document.getElementById('resubmit-gate');
    /* Libellé selon le geste : INC = re-soumettre (repart en étude) ; SOU = signaler le re-dépôt. */
    btn.textContent = dossierStatut === 'INC' ? 'Re-soumettre mon dossier' : 'J’ai re-déposé mes pièces';
    if (resubmitDone) {
      btn.setAttribute('disabled', ''); btn.setAttribute('aria-disabled', 'true');
      gate.textContent = '';
      return;
    }
    var rejetees = pieces.filter(function (p) { return etatReel(p) === 'rejected'; }).length;
    var manquantes = pieces.filter(function (p) { return p.requise && etatReel(p) === 'missing'; }).length;
    if (rejetees > 0 || manquantes > 0) {
      btn.setAttribute('disabled', ''); btn.setAttribute('aria-disabled', 'true');
      var reste = rejetees + manquantes;
      gate.textContent = 'Déposez d’abord les pièces à corriger ou à fournir (' + reste + ' restante' + (reste > 1 ? 's' : '') + ').';
    } else {
      btn.removeAttribute('disabled'); btn.setAttribute('aria-disabled', 'false');
      gate.textContent = '';
    }
  }
```

- [ ] **Step 4 : handler resubmit — endpoint selon statut (INC→resubmitComplement→/suivi)**

Remplacer le handler (pieces.astro:620-638) :

```javascript
  document.getElementById('resubmit-btn').addEventListener('click', function () {
    var btn = this;
    var msg = document.getElementById('resubmit-msg');
    btn.setAttribute('disabled', '');                       // garde double-clic
    msg.hidden = false; msg.classList.remove('is-error'); msg.textContent = 'Envoi…';
    AT.api.candidateResubmit(function (res) {
      if (res.ok) {
        resubmitDone = true;
        msg.textContent = 'Merci — votre dossier sera re-contrôlé par le service des admissions, sans frais supplémentaires.';
        renderResubmit();
      } else if (res.error && res.error.code === 'OTP_RESENT') {
        AT.navigateTo('/reprise');
      } else {
        btn.removeAttribute('disabled');
        msg.classList.add('is-error');
        msg.textContent = (res.error && res.error.message) || 'Signalement impossible. Réessayez.';
      }
    });
  });
```

par :

```javascript
  document.getElementById('resubmit-btn').addEventListener('click', function () {
    var btn = this;
    var msg = document.getElementById('resubmit-msg');
    btn.setAttribute('disabled', '');                       // garde double-clic
    msg.hidden = false; msg.classList.remove('is-error'); msg.textContent = 'Envoi…';
    /* FIX-RETOUR-DOSSIER : INC → resubmit_complement (INC→SOU, repart en étude) puis retour au
       suivi (pattern in-place ACO/fee2, JAMAIS le tunnel de paiement). SOU → candidate_resubmit
       (le dossier reste SOU, signalement sur place). */
    if (dossierStatut === 'INC') {
      AT.api.resubmitComplement(function (res) {
        if (res.ok) {
          AT.navigateTo('/suivi');
        } else if (res.error && res.error.code === 'OTP_RESENT') {
          AT.navigateTo('/reprise');
        } else {
          btn.removeAttribute('disabled');
          msg.classList.add('is-error');
          msg.textContent = (res.error && res.error.message) || 'Re-soumission impossible. Réessayez.';
        }
      });
      return;
    }
    AT.api.candidateResubmit(function (res) {
      if (res.ok) {
        resubmitDone = true;
        msg.textContent = 'Merci — votre dossier sera re-contrôlé par le service des admissions, sans frais supplémentaires.';
        renderResubmit();
      } else if (res.error && res.error.code === 'OTP_RESENT') {
        AT.navigateTo('/reprise');
      } else {
        btn.removeAttribute('disabled');
        msg.classList.add('is-error');
        msg.textContent = (res.error && res.error.message) || 'Signalement impossible. Réessayez.';
      }
    });
  });
```

> **Note d'intégration** : le libellé du bouton `resubmit-btn` est désormais posé par `renderResubmit` (Step 3). Vérifier dans le markup (pieces.astro ~ligne 230-260, bloc `#resubmit-box`) que le texte statique du bouton n'entre pas en conflit — si un libellé « J'ai re-déposé… » est codé en dur dans le HTML, il est écrasé par `btn.textContent` au render (comportement voulu). Ne pas ajouter de nouveau nœud DOM.

- [ ] **Step 5 : Build vert**

Run: `cd /Users/yaovisoglo/Documents/SI-LaNEM/admission/fronts/apps/applicant && npm run build`
Expected: build OK.

- [ ] **Step 6 : Commit**

```bash
git add src/pages/pieces.astro
git commit -m "feat(retour-dossier): /pieces — CTA BRO via resolveStep + geste terminal INC in-place"
```

---

## Task 5 : Back — mail INC tokenisé (#5)

**Files:**
- Modify: `admission/api/notifications.py:181-201` (`send_incompletude_notification`)
- Modify: `admission/api/staff.py:158-187` (`request_complement`)

**Interfaces:**
- Consumes: `_portal_link(applicant, token=…)` (email_template.py:59), `_generate_token()`, `_hash()`, `add_days`, `now_datetime`, `TOKEN_TTL_DAYS` (tous déjà importés dans staff.py — cf. `notify_pieces_recap` staff.py:1007).
- Produces: `send_incompletude_notification(applicant, motif, token=None)` — signature **rétro-compatible** (token optionnel ; sans token → `/suivi` comme avant).

- [ ] **Step 1 : Test back qui échoue — tokenisation INC**

Ajouter dans `admission/tests/test_completude.py` (classe testant `request_complement`, cf. lignes 30-45 pour le patron `patch`) :

```python
    def test_request_complement_rotates_token_and_passes_it(self):
        """FIX-RETOUR-DOSSIER #5 : request_complement fait TOURNER le token et le transmet à la
        notification (mail INC → lien /reprise tokenisé, ouvrable sur appareil vierge)."""
        ok = patch(f"{STAFF}._ok", side_effect=lambda d=None: {"ok": True, "data": d})
        err = patch(f"{STAFF}._error", side_effect=lambda c, m, s=400: {"ok": False, "error": {"code": c}})
        with patch(f"{STAFF}.frappe") as mf, ok, err, \
             patch(f"{STAFF}.send_incompletude_notification") as notify:
            app = _mk_applicant("CAN-2026-00001", status="SOU")   # helper existant du module
            mf.db.exists.return_value = True
            mf.get_doc.return_value = app
            from admission.api.staff import request_complement
            request_complement(dossier_id="CAN-2026-00001", motif="Relevé manquant")
            # token rotaté : hash posé, otp re-exigé
            self.assertTrue(app.dossier_token_hash)
            self.assertEqual(app.otp_verified, 0)
            # le token clair est transmis à la notif (kwarg token=)
            self.assertIn("token", notify.call_args.kwargs)
            self.assertTrue(notify.call_args.kwargs["token"])

    def test_send_incompletude_tokenised_link(self):
        """Le CTA du mail INC pointe /reprise?dossier=…&token=… quand un token est fourni."""
        with patch("admission.api.notifications.frappe"), \
             patch("admission.api.notifications._portal_base", return_value="http://portal"):
            from admission.api.notifications import send_incompletude_notification, _portal_link
            app = _mk_applicant("CAN-2026-00001", status="INC")
            url = _portal_link(app, token="TOK123")
            self.assertIn("/reprise?dossier=CAN-2026-00001&token=TOK123", url)
```

> Adapter `_mk_applicant`/`STAFF` aux helpers réellement présents dans `test_completude.py` (lignes 15-25) : réutiliser le builder de mock d'applicant existant, ne pas en créer un neuf.

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd /Users/yaovisoglo/Documents/SI-LaNEM/admission/bench && ./env/bin/python -m pytest apps/admission/admission/tests/test_completude.py -k "token" -x`
(à défaut de pytest : `bench --site admission-dev.localhost run-tests --app admission --module admission.tests.test_completude`)
Expected: FAIL — `send_incompletude_notification` n'est pas appelé avec `token=` / token non rotaté.

- [ ] **Step 3 : notifications.py — ajouter le paramètre token**

Modifier la signature et le CTA de `send_incompletude_notification` (notifications.py:181, 192) :

```python
def send_incompletude_notification(applicant, motif, token=None):
```
et remplacer la ligne CTA (notifications.py:192) :
```python
        cta={"label": "Reprendre ma candidature", "url": _portal_link(applicant)},
```
par :
```python
        # FIX-RETOUR-DOSSIER #5 : CTA tokenisé → /reprise actionnable sur appareil vierge (comme le
        # récap SOU). Sans token (autres appelants) → /suivi générique, comportement inchangé.
        cta={"label": "Reprendre ma candidature", "url": _portal_link(applicant, token=token)},
```

- [ ] **Step 4 : staff.py — rotation du token dans request_complement**

Remplacer (staff.py:182-186) :

```python
    applicant.motif_incompletude = str(motif).strip()
    applicant.status = "INC"
    applicant.save(ignore_permissions=True)
    send_incompletude_notification(applicant, applicant.motif_incompletude)  # non-bloquant
```

par :

```python
    applicant.motif_incompletude = str(motif).strip()
    applicant.status = "INC"
    # FIX-RETOUR-DOSSIER #5 : rotation du token (pattern récap SOU, cf. notify_pieces_recap) →
    # le mail INC porte un lien /reprise tokenisé (ouvrable sur appareil vierge). Le clair n'est
    # jamais persisté ; l'OTP reste re-exigé à l'arrivée (double barrière). 1 seul save.
    tok = _generate_token()
    applicant.dossier_token_hash = _hash(tok)
    applicant.token_expires_at = add_days(now_datetime(), TOKEN_TTL_DAYS)
    applicant.otp_verified = 0
    applicant.save(ignore_permissions=True)
    send_incompletude_notification(applicant, applicant.motif_incompletude, token=tok)  # non-bloquant
```

- [ ] **Step 5 : Lancer les tests, vérifier le succès + non-régression complétude**

Run: `cd /Users/yaovisoglo/Documents/SI-LaNEM/admission/bench && bench --site admission-dev.localhost run-tests --app admission --module admission.tests.test_completude --skip-test-records`
Expected: PASS (nouveaux + existants). Purger les données de test créées.

- [ ] **Step 6 : Commit**

```bash
git add admission/api/notifications.py admission/api/staff.py admission/tests/test_completude.py
git commit -m "feat(retour-dossier): mail INC tokenisé (/reprise actionnable sur appareil vierge)"
```

---

## Task 6 : Vérification recette (bundle live) + design audit — GATE

**Files:** aucun (vérification). Front servi en bundle réel + back recette.

- [ ] **Step 1 : Build + servir le bundle réel**

Run: `cd /Users/yaovisoglo/Documents/SI-LaNEM/admission/fronts/apps/applicant && npm run build && npm run preview`
(ou le harness de preview du repo). Vérifier `AT.resolveStep` présent dans le bundle servi.

- [ ] **Step 2 : GR1 — symptôme.** Dossier INC (frais1 confirmé) → ouvrir le mail INC (lien tokenisé) → /reprise → OTP → **atterrit /suivi** → carte INC → aller /pieces → uploader la pièce complémentaire → cliquer « Re-soumettre mon dossier » → **atterrit /suivi** (jamais /paiement). Capturer.

- [ ] **Step 3 : GR2 — candidat payé.** Sur ce même dossier (fee1 confirmé), forcer l'URL **directe** `/paiement` → **redirigé /suivi**. Idem `/recapitulatif` → /suivi. Capturer.

- [ ] **Step 4 : GR3 — geste INC visible.** En INC, /pieces affiche le bouton « Re-soumettre mon dossier » (bloc resubmit visible, plus SOU-only). Capturer.

- [ ] **Step 5 : GR4 — lien tokenisé.** Mail INC ouvert sur un **appareil/navigateur vierge** (localStorage vide) → le lien ouvre le dossier (plus « aucun dossier sur cet appareil »). Capturer.

- [ ] **Step 6 : GR5 — non-régression patterns sains.** ACO diplôme (upload → reload /suivi) et fee2 ACC (paiement → poll INS → reload) inchangés. Capturer.

- [ ] **Step 7 : GR6 — source unique + argent.** Vérifier qu'aucune page n'appelle plus `requisesManquantes()` en isolation pour naviguer (grep : seules les gardes via `resolveStep`). Vérifier le 409 `ALREADY_PAID` back intact (`git diff` public.py = ∅ sur la garde argent).

Run: `grep -rn "requisesManquantes\|resolveStep\|navigateTo('/paiement')\|navigateTo('/recapitulatif')" src/pages/`
Expected: navigation = `resolveStep` uniquement ; `requisesManquantes` ne pilote plus de redirect.

- [ ] **Step 8 : GR7 — build + design audit + non-régression tests.**

Run: `npm run build` (vert) ; `node --test tests/*.test.mjs` (vert) ; `frontend-design-audit` sur pieces/paiement/recapitulatif/reprise/suivi (corriger high+). Back : suite `test_completude` verte, données de test purgées.

- [ ] **Step 9 : Rapport final + GATE** (voir section Rapport).

---

## Task 7 (CONDITIONNEL — arbitrage #7) : rappels J4/J6 tokenisés

> **N'exécuter QUE si l'architecte confirme « tokeniser #7 »** au gate PC1. Par défaut (recommandation ci-dessus), **sauter cette task** et retirer #7 du lot.

**Files:**
- Modify: `admission/api/notifications.py:241-260` (`send_pieces_reminder_notification` : +param token, copie) et `:288-306` (`send_pieces_reminders` : rotation par rappel).

- [ ] **Step 1** : ajouter `token=None` à `send_pieces_reminder_notification`, CTA `_portal_link(applicant, token=token)`, et **réécrire la copie** (supprimer « le lien reçu dans notre précédent e-mail reste valide » — le nouveau lien devient l'actionnable).
- [ ] **Step 2** : dans `send_pieces_reminders`, avant chaque `send_pieces_reminder_notification`, roter un token (`_generate_token`/`_hash`/`token_expires_at`/`otp_verified=0` via `frappe.db.set_value`, `update_modified=False`, **sans toucher `pieces_recap_sent_at`** — l'ancre J4/J6 doit rester stable) et le passer.
- [ ] **Step 3** : test back (mirroir Task 5) : le rappel J4 et J6 rotent le token et le passent ; `pieces_recap_sent_at` inchangé.
- [ ] **Step 4** : commit `feat(retour-dossier): rappels J4/J6 tokenisés (#7, arbitrage architecte)`.

---

## Rapport final (Task 6 Step 9)

Rendre un rapport : chaque GR1-GR7 coché avec preuve bundle-live (captures), `git diff` back sur la garde argent = ∅, décision #7 tranchée, données de test purgées, baseline intacte. Puis GATE.

---

## Self-Review (fait)

**1. Spec coverage :** #1 (resolveStep) → Task 1+2+3+4 ; #2/#3 (garde fee1-confirmed) → Task 3 ; #4 (geste INC in-place) → Task 4 ; #5 (mail INC tokenisé) → Task 5 ; #6 (hop /suivi BRO) → Task 2 ; #7 (rappels) → Task 7 conditionnel. Tous les GR1-GR7 mappés à Task 6. ✓
**2. Placeholder scan :** aucun TODO/TBD ; tout code montré en entier. ✓ (seule dépendance « à adapter » explicite : helpers de mock de `test_completude.py`, signalée.)
**3. Type consistency :** `resolveStep(d) -> '/pieces'|'/recapitulatif'|'/suivi'` cohérent Task 1→4 ; `send_incompletude_notification(applicant, motif, token=None)` cohérent Task 5. Garde /paiement et /recapitulatif comparent à `'/recapitulatif'` (jamais `/paiement`, que resolveStep ne renvoie pas). ✓
