import assert from 'node:assert/strict';
import { test, before, beforeEach } from 'node:test';

/* REPRISE-DOSSIER (DEC-333) — AT.api.claimRecoveredDossier : émission du jeton
   d'édition mono-dossier après OTP identité. Même harness que admission-tunnel.test.mjs
   (globals navigateur mockés avant l'import de l'IIFE). Vérifie le CONTRAT :
   - POST public.claim_recovered_dossier avec {recovery_token, dossier_id} ;
   - succès → jeton ADOPTÉ dans l'ancrage local (même patron que verify_otp) ;
   - échec → ancrage INTACT (pas d'adoption d'un refus). */

let AT;
const _store = new Map();
let _fetchCalls = [];
let _nextResponse = null;

before(async () => {
  globalThis.window = {};
  globalThis.document = { querySelector: () => null };
  globalThis.history = { replaceState: () => {} };
  globalThis.location = { search: '', pathname: '/reprise' };
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => { _store.set(k, String(v)); },
    removeItem: (k) => { _store.delete(k); },
    clear: () => { _store.clear(); },
  };
  globalThis.fetch = (url, opts) => {
    _fetchCalls.push({ url, opts });
    return Promise.resolve({ json: () => Promise.resolve(_nextResponse) });
  };
  await import('../public/scripts/admission-tunnel.js');
  AT = globalThis.window.AdmissionTunnel;
});

beforeEach(() => { _store.clear(); _fetchCalls = []; _nextResponse = null; });

test('claimRecoveredDossier existe dans le namespace api', () => {
  assert.equal(typeof AT.api.claimRecoveredDossier, 'function');
});

test('claim : POST au bon endpoint avec recovery_token + dossier_id', async () => {
  _nextResponse = { ok: true, data: { dossier_id: '26272010003', token: 'EDIT-TOK-1' }, error: null };
  await new Promise((resolve) => {
    AT.api.claimRecoveredDossier('RECOV-TOK', '26272010003', resolve);
  });
  assert.equal(_fetchCalls.length, 1);
  assert.match(_fetchCalls[0].url, /public\.claim_recovered_dossier$/);
  const body = JSON.parse(_fetchCalls[0].opts.body);
  assert.deepEqual(body, { recovery_token: 'RECOV-TOK', dossier_id: '26272010003' });
});

test('claim réussi : le jeton d’édition est ADOPTÉ dans l’ancrage local', async () => {
  _nextResponse = { ok: true, data: { dossier_id: '26272010003', token: 'EDIT-TOK-2' }, error: null };
  const res = await new Promise((resolve) => {
    AT.api.claimRecoveredDossier('RECOV-TOK', '26272010003', resolve);
  });
  assert.equal(res.ok, true);
  assert.equal(AT.getDossierId(), '26272010003');
  assert.equal(AT.getDossierToken(), 'EDIT-TOK-2');
});

test('claim refusé (STATE_READ_ONLY) : ancrage INTACT, erreur relayée', async () => {
  _nextResponse = { ok: false, data: null, error: { code: 'STATE_READ_ONLY', message: 'Plus modifiable.' } };
  const res = await new Promise((resolve) => {
    AT.api.claimRecoveredDossier('RECOV-TOK', '26272010009', resolve);
  });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'STATE_READ_ONLY');
  assert.equal(AT.getDossierId(), '');       // rien n'a été adopté
  assert.equal(AT.getDossierToken(), '');
});
