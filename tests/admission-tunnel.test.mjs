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

test('snapshot identité : aller-retour JSON', () => {
  _store.clear();
  AT.saveIdentiteSnapshot({ prenom: 'Koffi', nom: 'D', email: 'k@x.bj', tel: '+22990', niveau: 'L1', datebac: '2024-07' });
  const s = AT.getIdentiteSnapshot();
  assert.equal(s.prenom, 'Koffi');
  assert.equal(s.email, 'k@x.bj');
  assert.equal(s.niveau, 'L1');
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
