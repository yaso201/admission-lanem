import assert from 'node:assert/strict';
import { test, before } from 'node:test';

/* PAY-IDEM (faille 16) — la clé d'idempotence est STABLE PAR INTENTION.
   Identité d'intention = dossier_id : feeType : channel : amount. Un réessai (même identité)
   rejoue la MÊME clé ; toute variation de l'identité (canal, montant, dossier) donne une clé
   neuve ; la clé SURVIT à un rechargement (localStorage) ; namespace `emela.admission.payintent`
   STRICTEMENT distinct de l'ancrage de reprise `emela.admission.resume`.
   Le tunnel est une IIFE liée à `window` : on mocke les globals AVANT l'import, on capture le
   corps de chaque requête (`fetch`) → la clé envoyée. La construction du corps est SYNCHRONE
   (avant le fetch), donc la capture ne nécessite pas d'await. */

let AT;
const _store = new Map();
let _bodies = [];

before(async () => {
  globalThis.window = {};
  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ appendChild() {}, click() {}, remove() {} }),
    body: { appendChild() {} },
  };
  globalThis.history = { replaceState: () => {} };
  globalThis.location = { search: '', pathname: '/paiement' };
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => { _store.set(k, String(v)); },
    removeItem: (k) => { _store.delete(k); },
    clear: () => { _store.clear(); },
  };
  globalThis.fetch = async (url, options) => {
    _bodies.push({ url, body: JSON.parse(options.body) });
    return { json: async () => ({ message: { ok: true, data: { statut: 'SOP' } } }) };
  };
  await import('../public/scripts/admission-tunnel.js');
  AT = globalThis.window.AdmissionTunnel;
});

function withNow(ms, fn) { const real = Date.now; Date.now = () => ms; try { return fn(); } finally { Date.now = real; } }

/* frais 1 : saveDossier au même instant → resume toujours frais ; capture la clé (synchrone). */
function payAt(ms, mode, opts, id) {
  _bodies = [];
  withNow(ms, () => {
    AT.saveDossier(id || 'CAN-PAY-1', 'TOK');
    AT._real.processPayment(mode, () => {}, opts || {});
  });
  return _bodies[_bodies.length - 1].body.idempotency_key;
}

/* frais 2 : realEnrollmentPay(channel, opts, cb). */
function enrollAt(ms, channel, opts, id) {
  _bodies = [];
  withNow(ms, () => {
    AT.saveDossier(id || 'CAN-PAY-1', 'TOK');
    AT.api.enrollmentPay(channel, opts || {}, () => {});
  });
  return _bodies[_bodies.length - 1].body.idempotency_key;
}

const MIN = 60 * 1000;

// ── 1. Réessai de la même intention → MÊME clé ────────────────────────────────
test('frais 1 en ligne : deux tentatives de la même intention → même clé', () => {
  _store.clear();
  const k1 = payAt(1000, 'success');
  const k2 = payAt(3000, 'success');   // réessai après « timeout » (2 s plus tard)
  assert.equal(k1, k2, 'un réessai de la même intention doit rejouer la même clé');
});

test('frais 2 en ligne : réessai même canal + même acompte → même clé', () => {
  _store.clear();
  const k1 = enrollAt(1000, 'online', { acompte: 5000 });
  const k2 = enrollAt(3000, 'online', { acompte: 5000 });
  assert.equal(k1, k2);
});

// ── 2. Nouvelle intention → clé NEUVE (Q4 canal, Q5 montant) ───────────────────
test('frais 1 : changement de canal (en ligne → virement) = nouvelle intention', () => {
  _store.clear();
  const online = payAt(1000, 'success');
  const bank = payAt(1000, 'sop');
  assert.notEqual(online, bank, 'un canal différent est une nouvelle intention (Q4)');
});

test('frais 2 : changement de montant (acompte) = clé neuve', () => {
  _store.clear();
  const a = enrollAt(1000, 'online', { acompte: 5000 });
  const b = enrollAt(1000, 'online', { acompte: 10000 });
  assert.notEqual(a, b, 'un montant différent est une nouvelle intention (Q5)');
});

test('dossier différent = clé neuve', () => {
  _store.clear();
  const d1 = payAt(1000, 'success', {}, 'CAN-A');
  const d2 = payAt(1000, 'success', {}, 'CAN-B');
  assert.notEqual(d1, d2);
});

// ── 3. Rechargement de page → la clé SURVIT (localStorage) ─────────────────────
test('la clé est mémorisée en localStorage et relue à l’identique (survit au rechargement)', () => {
  _store.clear();
  const k1 = payAt(1000, 'success');
  const raw = _store.get('emela.admission.payintent');
  assert.ok(raw && raw.includes(k1), 'la clé doit être persistée dans emela.admission.payintent');
  const k2 = payAt(9999, 'success');   // « rechargement » : relecture du store
  assert.equal(k1, k2);
});

// ── 4. VIGILANCE : namespace payintent STRICTEMENT distinct de resume ──────────
test('emela.admission.payintent ne déborde jamais sur emela.admission.resume', () => {
  _store.clear();
  const k = payAt(1000, 'success');
  const resume = _store.get('emela.admission.resume');
  const payintent = _store.get('emela.admission.payintent');
  assert.ok(resume, 'l’ancrage de reprise doit exister');
  assert.ok(payintent, 'le store d’intention doit exister');
  assert.notEqual(resume, payintent, 'les deux stores sont distincts');
  assert.ok(!resume.includes(k), 'la clé de paiement ne doit PAS polluer l’ancrage de reprise');
  assert.ok(!payintent.includes('TOK'), 'le token de reprise ne doit PAS entrer dans le store d’intention');
  // le parcours de reprise reste intact
  withNow(1000, () => assert.equal(AT.getDossierId(), 'CAN-PAY-1'));
});

// ── 5. Expiration bornée (miroir RESUME_WINDOW_MS = 30 min) ────────────────────
test('la clé expire après 30 min (fenêtre bornée, fixe depuis la génération)', () => {
  _store.clear();
  const k0 = payAt(0, 'success');
  const k29 = payAt(29 * MIN, 'success');     // encore dans la fenêtre → même clé
  assert.equal(k0, k29, 'à 29 min la clé est encore valide');
  const k31 = payAt(31 * MIN, 'success');     // fenêtre dépassée → clé neuve
  assert.notEqual(k0, k31, 'à 31 min l’intention a expiré → nouvelle clé');
});

// ── 6. Purge sur succès définitif (pollDossierStatus confirme) ─────────────────
test('la confirmation (pollDossierStatus → statut attendu) purge les intentions du dossier', async () => {
  _store.clear();
  // temps RÉEL de bout en bout : pollDossierStatus lit getDossierId() hors withNow → l'ancrage
  // de reprise doit être valide au même « maintenant » que la génération de la clé.
  AT.saveDossier('CAN-PAY-1', 'TOK');
  _bodies = [];
  AT._real.processPayment('success', () => {}, {});
  const k1 = _bodies[_bodies.length - 1].body.idempotency_key;
  assert.ok(_store.get('emela.admission.payintent').includes(k1));
  // le serveur confirme : get_dossier renvoie le statut attendu → pollDossierStatus purge
  globalThis.fetch = async () => ({ json: async () => ({ message: { ok: true, data: { statut: 'SOU' } } }) });
  await new Promise((resolve) => AT.payment.pollDossierStatus(['SOU'], () => resolve(), 1));
  const raw = _store.get('emela.admission.payintent');
  assert.ok(!raw || !raw.includes(k1), 'la confirmation doit purger l’intention (résultat opposable)');
  // restaurer le fetch capture pour les tests suivants
  globalThis.fetch = async (url, options) => {
    _bodies.push({ url, body: JSON.parse(options.body) });
    return { json: async () => ({ message: { ok: true, data: { statut: 'SOP' } } }) };
  };
});
