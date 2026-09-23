import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsdomPkg from 'jsdom';

const { JSDOM, VirtualConsole } = jsdomPkg;

/* Gate du récapitulatif : le bouton « Passer au paiement » est un ÉTAT DÉRIVÉ de la case
   d'attestation. Les navigateurs RESTAURENT les cases (retour arrière, bfcache, rechargement)
   SANS émettre `change` — la case apparaît alors cochée pendant que le bouton reste grisé,
   sans aucune issue pour le candidat (constat 26273020002, dossier complet et payable).
   Ces tests verrouillent la resynchronisation par `pageshow`. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.RECAP_DIST_ROOT || path.join(HERE, '..', 'dist');

function inlineAssets(html) {
  return html.replace(/<script src="\/scripts\/(admission-tunnel|admission-profil|otp-digits)\.js(\?v=\d+)?"><\/script>/g,
    (m, base) => '<script>' +
      fs.readFileSync(path.join(DIST, 'scripts', base + '.js'), 'utf8') + '</scr' + 'ipt>');
}

const PAGE = inlineAssets(fs.readFileSync(path.join(DIST, 'recapitulatif', 'index.html'), 'utf8'));

function tick(n = 8) {
  return n === 0 ? Promise.resolve()
    : new Promise((r) => setTimeout(r, 0)).then(() => tick(n - 1));
}

/* Dossier PAYABLE : BRO + pièces requises déposées + frais 1 non réglé → resolveStep
   renvoie bien /recapitulatif (sinon la page redirige et le test ne teste rien). */
const DOSSIER = {
  ok: true, error: null,
  data: {
    dossier_id: '26273020002', statut: 'BRO',
    identite: { prenom: 'Julius', nom: 'VIANOU' },
    programme: { code: 'BACH-CPI', label: 'Bachelor CPI' },
    session: { id: 'SES-BACH-CPI-2026', label: '2026' },
    pieces: [{ code: 'identite', label: 'Pièce', requise: true, statut: 'deposee' }],
    paiement: { frais1: { montant_xof: 40000, statut: 'en_attente' }, frais2: null },
    promo_locale: { entered_code: null, snapshot: null },
  },
};

function loadRecap() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  return new JSDOM(PAGE, {
    url: 'http://localhost/recapitulatif/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.localStorage.setItem('emela.admission.resume',
        JSON.stringify({ id: '26273020002', token: 'TOK', exp: Date.now() + 20 * 60 * 1000 }));
      window.fetch = (target) => {
        const endpoint = (String(target).match(/admission\.api\.(public\.[a-z_]+)/) || [])[1] || '';
        const routes = {
          'public.get_dossier': DOSSIER,
          'public.get_frais': { ok: true, error: null, data: { frais1: { montant_xof: 40000 } } },
        };
        const res = routes[endpoint] || { ok: false, data: null, error: { code: 'NO_ROUTE' } };
        return Promise.resolve({ json: () => Promise.resolve({ message: res }) });
      };
    },
  });
}

test('case NON cochée : bouton de paiement désactivé (href retiré, aria-disabled)', async () => {
  const dom = loadRecap();
  await tick(10);
  const cta = dom.window.document.getElementById('cta-recap');
  assert.equal(cta.hasAttribute('href'), false, 'aucun href : non focusable au clavier');
  assert.equal(cta.getAttribute('aria-disabled'), 'true');
});

test('case cochée par l’utilisateur (événement change) : bouton actif', async () => {
  const dom = loadRecap();
  await tick(10);
  const d = dom.window.document;
  const attest = d.getElementById('attest-check');
  attest.checked = true;
  attest.dispatchEvent(new dom.window.Event('change'));
  const cta = d.getElementById('cta-recap');
  assert.equal(cta.hasAttribute('href'), true, 'href posé → bouton actionnable');
  assert.equal(cta.getAttribute('aria-disabled'), null);
});

test('case RESTAURÉE sans événement : pageshow resynchronise (régression 26273020002)', async () => {
  const dom = loadRecap();
  await tick(10);
  const w = dom.window, d = w.document;
  const attest = d.getElementById('attest-check');
  const cta = d.getElementById('cta-recap');

  /* Ce que fait le navigateur au retour arrière : il coche la case, sans rien émettre. */
  attest.checked = true;
  assert.equal(cta.hasAttribute('href'), false,
    'sans resynchronisation, le bouton reste grisé alors que la case est cochée — le bug');

  w.dispatchEvent(new w.Event('pageshow'));
  assert.equal(cta.hasAttribute('href'), true, 'pageshow recalcule l’état dérivé → bouton actif');
});

test('décochage restauré : pageshow referme la gate (pas de faux positif)', async () => {
  const dom = loadRecap();
  await tick(10);
  const w = dom.window, d = w.document;
  const attest = d.getElementById('attest-check');
  const cta = d.getElementById('cta-recap');
  attest.checked = true;
  w.dispatchEvent(new w.Event('pageshow'));
  assert.equal(cta.hasAttribute('href'), true);

  attest.checked = false;                      // restauration inverse
  w.dispatchEvent(new w.Event('pageshow'));
  assert.equal(cta.hasAttribute('href'), false, 'la resynchronisation joue dans les deux sens');
});
