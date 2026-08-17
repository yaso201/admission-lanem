import assert from 'node:assert/strict';
import { test, before, beforeEach } from 'node:test';

/* A3-FIX E-04 — _handleTokenExpired ne doit annoncer « un nouveau code a été envoyé »
   (OTP_RESENT) QUE si request_otp a réellement réussi. En cas d'échec (réseau, 403,
   429, {ok:false}), il doit remonter une erreur ACTIONNABLE (OTP_RESEND_FAILED), pas
   un mensonge. Déclenché quand un appel du tunnel reçoit TOKEN_EXPIRED. */

let AT;
const store = new Map();
let otpResponse;      // réponse contrôlée du 2e fetch (request_otp)

before(async () => {
  globalThis.window = {};
  globalThis.document = { querySelector: () => null };
  globalThis.history = { replaceState: () => {} };
  globalThis.location = { search: '', pathname: '/reprise' };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  globalThis.fetch = (url) => {
    if (String(url).includes('request_otp')) {
      // 2e fetch : renvoie la réponse contrôlée, ou rejette si otpResponse==='NETWORK'
      if (otpResponse === 'NETWORK') return Promise.reject(new Error('down'));
      return Promise.resolve({ json: () => Promise.resolve(otpResponse) });
    }
    // 1er fetch : déclenche TOKEN_EXPIRED
    return Promise.resolve({ json: () => Promise.resolve({ message: { ok: false, data: null, error: { code: 'TOKEN_EXPIRED' } } }) });
  };
  await import('../public/scripts/admission-tunnel.js');
  AT = globalThis.window.AdmissionTunnel;
});

beforeEach(() => {
  store.clear();
  // ancrage requis par _handleTokenExpired (getDossierId/getDossierToken)
  store.set('emela.admission.resume', JSON.stringify({ id: '26272010003', token: 'T', exp: Date.now() + 20 * 60 * 1000 }));
});

function callDossier() {
  // getDossier déclenche fetch #1 (TOKEN_EXPIRED) → _handleTokenExpired → fetch #2 (request_otp)
  return new Promise((resolve) => AT.api.getDossier(resolve));
}

test('request_otp RÉUSSIT → OTP_RESENT (annonce d’envoi légitime)', async () => {
  otpResponse = { message: { ok: true, data: { delivery: { email: 'sent' } }, error: null } };
  const res = await callDossier();
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'OTP_RESENT');
  assert.match(res.error.message, /nouveau code/);
});

test('request_otp ÉCHOUE {ok:false} → PAS OTP_RESENT, message actionnable', async () => {
  otpResponse = { message: { ok: false, data: null, error: { code: 'INVALID_DOSSIER', message: 'Identifiants de dossier invalides.' } } };
  const res = await callDossier();
  assert.equal(res.ok, false);
  assert.notEqual(res.error.code, 'OTP_RESENT', 'ne doit PAS annoncer un envoi qui a échoué');
  assert.equal(res.error.code, 'OTP_RESEND_FAILED');
  assert.doesNotMatch(res.error.message, /nouveau code vous a été envoyé/, 'pas de mensonge d’envoi');
});

test('request_otp injoignable (réseau) → PAS OTP_RESENT, message actionnable', async () => {
  otpResponse = 'NETWORK';
  const res = await callDossier();
  assert.equal(res.ok, false);
  assert.notEqual(res.error.code, 'OTP_RESENT');
  assert.equal(res.error.code, 'OTP_RESEND_FAILED');
  assert.match(res.error.message, /r[ée]essayez|connexion|injoignable/i);
});
