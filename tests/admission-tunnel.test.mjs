import assert from 'node:assert/strict';
import { test, before } from 'node:test';

/* admission-tunnel.js est une IIFE liée à `window` qui lit `document`, `location`,
   `localStorage`, `history` (globals navigateur). On les mocke AVANT l'import dynamique,
   puis on lit window.AdmissionTunnel. Couvre : durabilité bornée (palier 1) + capture/
   purge de l'OTP du lien (palier 3-modifié). */

let AT;
const _store = new Map();
let _lastReplaceUrl = null;

before(async () => {
  globalThis.window = {};
  globalThis.document = { querySelector: () => null };
  globalThis.history = { replaceState: (_s, _t, url) => { _lastReplaceUrl = url; } };
  globalThis.location = { search: '', pathname: '/reprise' };
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => { _store.set(k, String(v)); },
    removeItem: (k) => { _store.delete(k); },
    clear: () => { _store.clear(); },
  };
  await import('../public/scripts/admission-tunnel.js');
  AT = globalThis.window.AdmissionTunnel;
});

function withNow(ms, fn) {
  const real = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = real; }
}

// ── Palier 1 : durabilité bornée (localStorage + fenêtre 30 min) ────────────────

test('saveDossier/getDossier : persiste id+token (localStorage)', () => {
  _store.clear();
  withNow(1000, () => AT.saveDossier('CAN-2026-1', 'TOK-1'));
  withNow(1000, () => {
    assert.equal(AT.getDossierId(), 'CAN-2026-1');
    assert.equal(AT.getDossierToken(), 'TOK-1');
  });
});

test('fenêtre de reprise : valide à 29 min, expirée à 31 min', () => {
  _store.clear();
  withNow(0, () => AT.saveDossier('CAN-2026-2', 'TOK-2'));
  withNow(29 * 60 * 1000, () => assert.equal(AT.getDossierId(), 'CAN-2026-2'));   // encore valide
  withNow(31 * 60 * 1000, () => assert.equal(AT.getDossierId(), ''));             // expirée → purgée
  // purge effective : relecture immédiate vide
  withNow(31 * 60 * 1000, () => assert.equal(AT.getDossierToken(), ''));
});

test('clearDossier : purge resume + snapshot', () => {
  _store.clear();
  withNow(1000, () => AT.saveDossier('CAN-3', 'TOK-3'));
  AT.saveIdentiteSnapshot({ prenom: 'Ama', email: 'a@x.bj' });
  AT.clearDossier();
  withNow(1000, () => assert.equal(AT.getDossierId(), ''));
  assert.equal(AT.getIdentiteSnapshot(), null);
});

test('snapshot identité : aller-retour JSON avec date de naissance', () => {
  _store.clear();
  AT.saveIdentiteSnapshot({ prenom: 'Koffi', nom: 'D', email: 'k@x.bj', tel: '+22990', dateNaissance: '2000-01-02', niveau: 'L1', datebac: '2024-07' });
  const s = AT.getIdentiteSnapshot();
  assert.equal(s.prenom, 'Koffi');
  assert.equal(s.email, 'k@x.bj');
  assert.equal(s.dateNaissance, '2000-01-02');
  assert.equal(s.niveau, 'L1');
});

// ── DEC-323 : jeton de consultation opaque, jamais ancré localement ───────────

test('verifyRecoveryOtp appelle le nouvel endpoint sans toucher à l’ancrage dossier', async () => {
  _store.clear();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { json: async () => ({ message: { ok: true, data: { recovery_token: 'OPAQUE', dossiers: [] } } }) };
  };
  const response = await new Promise(resolve => AT.api.verifyRecoveryOtp('ama@x.bj', '123456', resolve));
  assert.equal(response.ok, true);
  assert.match(request.url, /public\.verify_recovery_otp$/);
  assert.deepEqual(JSON.parse(request.options.body), { email: 'ama@x.bj', otp: '123456' });
  assert.equal(AT.getDossierId(), '');
  assert.equal(AT.getDossierToken(), '');
});

test('getRecoveredDossier transmet seulement jeton opaque + dossier autorisé', async () => {
  let requestUrl;
  globalThis.fetch = async url => {
    requestUrl = url;
    return { json: async () => ({ message: { ok: true, data: { dossier_id: 'CAN-2' } } }) };
  };
  const response = await new Promise(resolve => AT.api.getRecoveredDossier('OPAQUE 30m', 'CAN-2', resolve));
  assert.equal(response.data.dossier_id, 'CAN-2');
  assert.match(requestUrl, /public\.get_recovered_dossier\?/);
  assert.match(requestUrl, /recovery_token=OPAQUE%2030m/);
  assert.match(requestUrl, /dossier_id=CAN-2/);
});

// ── Palier 3-modifié : capture + purge de l'OTP du lien ─────────────────────────

test('adoptFromUrl : ancre id+token et capte l’OTP du lien', () => {
  _store.clear();
  globalThis.location = { search: '?dossier=CAN-9&token=TOK-9&otp=123456', pathname: '/reprise' };
  const adopted = withNow(1000, () => AT.adoptFromUrl());
  assert.equal(adopted, true);
  withNow(1000, () => assert.equal(AT.getDossierId(), 'CAN-9'));
  assert.equal(AT.consumeAdoptedOtp(), '123456');
});

test('consumeAdoptedOtp : usage unique (null au 2e appel)', () => {
  _store.clear();
  globalThis.location = { search: '?dossier=CAN-10&token=TOK-10&otp=654321', pathname: '/reprise' };
  withNow(1000, () => AT.adoptFromUrl());
  assert.equal(AT.consumeAdoptedOtp(), '654321');
  assert.equal(AT.consumeAdoptedOtp(), null);
});

test('adoptFromUrl : token ET otp retirés de l’URL (anti-fuite)', () => {
  _store.clear();
  _lastReplaceUrl = null;
  globalThis.location = { search: '?dossier=CAN-11&token=TOK-11&otp=111222&keep=x', pathname: '/reprise' };
  withNow(1000, () => AT.adoptFromUrl());
  assert.ok(_lastReplaceUrl !== null, 'replaceState doit être appelé');
  assert.ok(!/token=/.test(_lastReplaceUrl), 'le token ne doit pas rester dans l’URL');
  assert.ok(!/otp=/.test(_lastReplaceUrl), 'l’OTP ne doit pas rester dans l’URL');
  assert.ok(/dossier=CAN-11/.test(_lastReplaceUrl), 'le dossier reste dans l’URL');
  assert.ok(/keep=x/.test(_lastReplaceUrl), 'les autres params sont préservés');
});

test('adoptFromUrl : sans otp → consumeAdoptedOtp null', () => {
  _store.clear();
  globalThis.location = { search: '?dossier=CAN-12&token=TOK-12', pathname: '/reprise' };
  withNow(1000, () => AT.adoptFromUrl());
  assert.equal(AT.consumeAdoptedOtp(), null);
});

test('adoptFromUrl : sans dossier/token → false', () => {
  _store.clear();
  globalThis.location = { search: '?foo=bar', pathname: '/reprise' };
  assert.equal(withNow(1000, () => AT.adoptFromUrl()), false);
});

// ── FIX-RETOUR-DOSSIER : resolveStep (source unique state-aware) ────────────────
// Le résolveur ne renvoie JAMAIS /paiement (sous-pas de /recapitulatif, gardé par
// la case attestation). Critères : frais1 confirmé D'ABORD, puis statut, puis pièces.

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
