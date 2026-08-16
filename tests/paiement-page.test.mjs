import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsdomPkg from 'jsdom';

const { JSDOM, VirtualConsole } = jsdomPkg;

/* OUVERTURE-SOP (DEC-334/335) — page /paiement construite, PLEINE PAGE (jsdom, style
   CALCULÉ). Le serveur décide (get_frais.online_payment_enabled), le front rend :
   - fermé : chemin en ligne RETIRÉ (pas grisé), message DEC-335 verbatim, SOP au centre ;
   - ouvert : chemin en ligne présent, message absent — comportement historique. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.PAIEMENT_DIST_ROOT || path.join(HERE, '..', 'dist');

function inlineAssets(html) {
  html = html.replace(/<script src="\/scripts\/(admission-tunnel|admission-profil|otp-digits)\.js(\?v=\d+)?"><\/script>/g,
    (m, base) => '<script>' +
      fs.readFileSync(path.join(DIST, 'scripts', base + '.js'), 'utf8') + '</scr' + 'ipt>');
  html = html.replace(/<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"[^>]*>/g, (m, href) =>
    '<style>' + fs.readFileSync(path.join(DIST, href.replace(/^\//, '')), 'utf8') + '</style>');
  return html;
}

const PAGE = inlineAssets(fs.readFileSync(path.join(DIST, 'paiement', 'index.html'), 'utf8'));

function tick(n = 6) {
  return n === 0 ? Promise.resolve()
    : new Promise((r) => setTimeout(r, 0)).then(() => tick(n - 1));
}

const DOSSIER_OK = {
  ok: true, error: null,
  data: { dossier_id: '26272010003', statut: 'BRO',
          pieces: [{ requise: true, statut: 'deposee' }],
          paiement: { frais1: { statut: 'pending' } } },
};

function frais(onlineEnabled) {
  return { ok: true, error: null, data: {
    frais1: { montant_xof: 25000, devise: 'XOF', fee_type: 'application' },
    rib: { banque: 'BOA', titulaire: 'LaNEM', iban: 'BJ00 0000', bic: 'BOABJ' },
    online_payment_enabled: onlineEnabled,
  } };
}

function loadPaiement(routes) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(PAGE, {
    url: 'http://localhost/paiement/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.localStorage.setItem('emela.admission.resume',
        JSON.stringify({ id: '26272010003', token: 'TOK', exp: Date.now() + 20 * 60 * 1000 }));
      window.fetch = (target) => {
        const endpoint = (String(target).match(/admission\.api\.(public\.[a-z_]+)/) || [])[1] || '';
        const res = routes[endpoint] ||
          { ok: false, data: null, error: { code: 'NO_ROUTE', message: 'non stubé: ' + endpoint } };
        return Promise.resolve({ json: () => Promise.resolve({ message: res }) });
      };
    },
  });
  return dom;
}

function visible(window, el) {
  return window.getComputedStyle(el).display !== 'none';
}

test('drapeau FERMÉ : chemin en ligne RETIRÉ, message DEC-335 verbatim, SOP au centre', async () => {
  const dom = loadPaiement({
    'public.get_dossier': DOSSIER_OK,
    'public.get_frais': frais(false),
    'public.get_legal_documents': { ok: true, data: { documents: {} }, error: null },
  });
  await tick(10);
  const w = dom.window, d = w.document;
  assert.equal(visible(w, d.querySelector('.pay-path[data-path="online"]')), false, 'chemin en ligne retiré');
  assert.equal(visible(w, d.getElementById('panel-online')), false, 'panneau en ligne retiré');
  const deferred = d.getElementById('pay-deferred');
  assert.equal(visible(w, deferred), true, 'message DEC-335 affiché');
  assert.match(deferred.textContent, /Paiement des frais de candidature/);
  assert.match(deferred.textContent, /par espèces ou virement bancaire/);
  assert.match(deferred.textContent, /votre dossier sera validé dès confirmation par nos services/);
  assert.match(deferred.textContent, /Le paiement par mobile money sera disponible prochainement\./);
  assert.equal(visible(w, d.querySelector('.pay-path[data-path="sop"]')), true, 'chemin SOP visible');
  assert.equal(d.getElementById('panel-sop').classList.contains('is-active'), true, 'panneau SOP actif');
  assert.match(d.getElementById('pay-cta').textContent, /Enregistrer en soumission provisoire/);
});

test('drapeau OUVERT : comportement historique — en ligne présent, message absent', async () => {
  const dom = loadPaiement({
    'public.get_dossier': DOSSIER_OK,
    'public.get_frais': frais(true),
    'public.get_legal_documents': { ok: true, data: { documents: {} }, error: null },
  });
  await tick(10);
  const w = dom.window, d = w.document;
  assert.equal(visible(w, d.querySelector('.pay-path[data-path="online"]')), true, 'chemin en ligne présent');
  assert.equal(visible(w, d.getElementById('pay-deferred')), false, 'message absent');
  assert.equal(d.getElementById('panel-online').classList.contains('is-active'), true, 'en ligne par défaut');
});

test('clé ABSENTE (back antérieur) : compatibilité = ouvert', async () => {
  const f = frais(true);
  delete f.data.online_payment_enabled;
  const dom = loadPaiement({
    'public.get_dossier': DOSSIER_OK,
    'public.get_frais': f,
    'public.get_legal_documents': { ok: true, data: { documents: {} }, error: null },
  });
  await tick(10);
  const w = dom.window, d = w.document;
  assert.equal(visible(w, d.querySelector('.pay-path[data-path="online"]')), true);
  assert.equal(visible(w, d.getElementById('pay-deferred')), false);
});
