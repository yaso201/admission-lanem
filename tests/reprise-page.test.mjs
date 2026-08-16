import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsdomPkg from 'jsdom';

const { JSDOM, VirtualConsole } = jsdomPkg;

/* REPRISE-DOSSIER — test PLEINE PAGE (jsdom) de /reprise construite (dist).
   Vérité VISUELLE : les assertions portent sur le style CALCULÉ (getComputedStyle),
   jamais sur la seule propriété DOM (leçon FIX-PIECES-CONTEXTE : [hidden] écrasé par
   une classe display). Les scripts INLINE de la page ET admission-tunnel.js réel
   s'exécutent ; seul fetch est stubé (aucun serveur requis).

   REPRISE_DIST_ROOT surchargeable : pointer un dist ANTÉRIEUR au lot doit faire
   ÉCHOUER les scénarios nouveaux (RED de falsifiabilité), le dist du worktree les
   faire passer (GREEN). */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.REPRISE_DIST_ROOT || path.join(HERE, '..', 'dist');

/* jsdom 29 n'a plus ResourceLoader : les assets LOCAUX du dist (tunnel + CSS Astro)
   sont INLINÉS dans le HTML avant parse — mêmes octets que la page servie, zéro réseau.
   Les <link> distants (fonts) restent et ne sont simplement pas chargés. */
function inlineAssets(html) {
  html = html.replace(/<script src="\/scripts\/admission-tunnel\.js\?v=\d+"><\/script>/, () =>
    '<script>' +
    fs.readFileSync(path.join(DIST, 'scripts', 'admission-tunnel.js'), 'utf8') +
    '</scr' + 'ipt>');
  html = html.replace(/<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"[^>]*>/g, (m, href) =>
    '<style>' + fs.readFileSync(path.join(DIST, href.replace(/^\//, '')), 'utf8') + '</style>');
  return html;
}

const PAGE = inlineAssets(fs.readFileSync(path.join(DIST, 'reprise', 'index.html'), 'utf8'));

function tick(n = 6) {
  /* Laisse se dérouler les chaînes fetch→then→callback (microtâches + macrotâche). */
  return n === 0 ? Promise.resolve()
    : new Promise((r) => setTimeout(r, 0)).then(() => tick(n - 1));
}

/**
 * Charge la page construite. `routes` mappe le nom d'endpoint (public.xxx) vers une
 * réponse {ok,data,error} ou une fonction (body) => réponse. Toutes les requêtes sont
 * journalisées dans fetchLog. `anchor` pré-remplit l'ancrage localStorage AVANT les
 * scripts (créance rassie simulée).
 */
function loadReprise({ url = 'http://localhost/reprise/', anchor = null, routes = {} } = {}) {
  const fetchLog = [];
  const navAttempts = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (/navigation/i.test(String(e && e.message))) { navAttempts.push(String(e.message)); }
  });
  const dom = new JSDOM(PAGE, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      if (anchor) {
        window.localStorage.setItem('emela.admission.resume',
          JSON.stringify({ id: anchor.id, token: anchor.token, exp: Date.now() + 20 * 60 * 1000 }));
      }
      window.fetch = (target, opts) => {
        const endpoint = (String(target).match(/admission\.api\.(public\.[a-z_]+)/) || [])[1] || String(target);
        const body = opts && opts.body ? JSON.parse(opts.body) : null;
        fetchLog.push({ endpoint, body, url: String(target) });
        let res = routes[endpoint];
        if (typeof res === 'function') { res = res(body); }
        if (!res) { res = { ok: false, data: null, error: { code: 'NO_ROUTE', message: 'non stubé: ' + endpoint } }; }
        return Promise.resolve({ json: () => Promise.resolve({ message: res }) });
      };
    },
  });
  return { dom, window: dom.window, document: dom.window.document, fetchLog, navAttempts };
}

function visible(window, el) {
  return window.getComputedStyle(el).display !== 'none';
}

const DOSSIERS = [
  { dossier_id: '26272010003', statut: 'BRO', reprenable: true,
    programme: { code: 'LIC', label: 'Licence Info' }, session: { id: 'S1', label: '2026 LIC' } },
  { dossier_id: '26272010007', statut: 'SOU', reprenable: false,
    programme: { code: 'LIC', label: 'Licence Info' }, session: { id: 'S1', label: '2026 LIC' } },
];

const RECOVER_ROUTES = {
  'public.recover_dossier': { ok: true, data: { message: 'code envoyé' }, error: null },
  'public.verify_recovery_otp': { ok: true, data: { recovery_token: 'RTOK', expires_in_seconds: 1800, dossiers: DOSSIERS }, error: null },
};

async function driveToList(ctx) {
  const d = ctx.document;
  d.getElementById('recover-email').value = 'ama@x.bj';
  d.getElementById('btn-recover').click();
  await tick();
  const digits = Array.from(d.querySelectorAll('.recovery-otp-digit'));
  '123456'.split('').forEach((c, i) => { digits[i].value = c; });
  d.getElementById('btn-recovery-verify').click();
  await tick();
}

test('orphelin ?dossier= sans jeton : Mode B affiché, jamais l’écran OTP cul-de-sac', async () => {
  const ctx = loadReprise({ url: 'http://localhost/reprise/?dossier=26272010003', routes: RECOVER_ROUTES });
  await tick();
  assert.equal(visible(ctx.window, ctx.document.getElementById('card-recover')), true, 'Mode B doit être visible');
  assert.equal(visible(ctx.window, ctx.document.getElementById('card-otp')), false, 'Mode A doit rester caché');
});

test('liste post-OTP : bouton « Reprendre » ssi reprenable, indice ?dossier= surligné', async () => {
  const ctx = loadReprise({ url: 'http://localhost/reprise/?dossier=26272010003', routes: RECOVER_ROUTES });
  await tick();
  await driveToList(ctx);
  const d = ctx.document;
  assert.equal(visible(ctx.window, d.getElementById('recovery-results')), true, 'liste visible');
  const rows = Array.from(d.querySelectorAll('.recovery-item'));
  assert.equal(rows.length, 2);
  const claimButtons = d.querySelectorAll('.recovery-item-claim');
  assert.equal(claimButtons.length, 1, 'un seul Reprendre (le BRO), aucun sur le SOU');
  assert.match(rows[0].textContent, /26272010003/);
  assert.equal(rows[0].querySelector('.recovery-item-claim') !== null, true, 'BRO reprenable → bouton');
  assert.equal(rows[1].querySelector('.recovery-item-claim'), null, 'SOU → aucun bouton trompeur');
  assert.equal(rows[0].classList.contains('is-hinted'), true, 'indice ?dossier= surligné');
  assert.equal(rows[1].classList.contains('is-hinted'), false);
});

test('claim réussi : jeton adopté + routage tunnel engagé (get_dossier puis navigation)', async () => {
  const ctx = loadReprise({
    url: 'http://localhost/reprise/',
    routes: {
      ...RECOVER_ROUTES,
      'public.claim_recovered_dossier': { ok: true, data: { dossier_id: '26272010003', token: 'EDIT-TOK' }, error: null },
      'public.get_dossier': { ok: true, data: { dossier_id: '26272010003', statut: 'BRO', pieces: [], paiement: {} }, error: null },
    },
  });
  await tick();
  await driveToList(ctx);
  ctx.document.querySelector('.recovery-item-claim').click();
  await tick(10);
  const claimCall = ctx.fetchLog.find((c) => c.endpoint === 'public.claim_recovered_dossier');
  assert.ok(claimCall, 'POST claim émis');
  assert.deepEqual(claimCall.body, { recovery_token: 'RTOK', dossier_id: '26272010003' });
  const saved = JSON.parse(ctx.window.localStorage.getItem('emela.admission.resume'));
  assert.equal(saved.id, '26272010003');
  assert.equal(saved.token, 'EDIT-TOK');
  assert.ok(ctx.fetchLog.some((c) => c.endpoint === 'public.get_dossier'), 'routage par état engagé');
  assert.ok(ctx.navAttempts.length > 0, 'navigation tentée vers l’étape du tunnel');
});

test('claim refusé STATE_READ_ONLY : message affiché, aucune navigation', async () => {
  const ctx = loadReprise({
    url: 'http://localhost/reprise/',
    routes: {
      ...RECOVER_ROUTES,
      'public.verify_recovery_otp': {
        ok: true,
        data: { recovery_token: 'RTOK', expires_in_seconds: 1800,
          dossiers: [{ ...DOSSIERS[0], reprenable: true }] },
        error: null,
      },
      'public.claim_recovered_dossier': { ok: false, data: null,
        error: { code: 'STATE_READ_ONLY', message: "Ce dossier n'est plus modifiable en ligne. Contactez l'administration pour toute correction." } },
    },
  });
  await tick();
  await driveToList(ctx);
  ctx.document.querySelector('.recovery-item-claim').click();
  await tick(10);
  assert.match(ctx.document.getElementById('recovery-results-msg').textContent, /plus modifiable en ligne/);
  assert.equal(ctx.navAttempts.length, 0, 'aucune navigation sur refus');
  assert.equal(ctx.window.localStorage.getItem('emela.admission.resume'), null, 'rien adopté');
});

test('créance morte (lien tokenisé périmé → INVALID_DOSSIER) : bascule Mode A→B avec message actionnable', async () => {
  /* Le chemin EXACT de l'incident PROD : arrivée par lien e-mail dont le jeton a été
     tourné — adoptFromUrl adopte, sendCode part automatiquement, le back répond 403. */
  const ctx = loadReprise({
    url: 'http://localhost/reprise/?dossier=26272010003&token=VIEUX-JETON-TOURNE',
    routes: {
      'public.request_otp': { ok: false, data: null,
        error: { code: 'INVALID_DOSSIER', message: 'Identifiants de dossier invalides.' } },
    },
  });
  await tick(10);
  const d = ctx.document;
  assert.equal(visible(ctx.window, d.getElementById('card-otp')), false, 'Mode A replié');
  assert.equal(visible(ctx.window, d.getElementById('card-recover')), true, 'Mode B affiché');
  assert.match(d.getElementById('recover-msg').textContent,
    /Ce lien n'est plus valide\. Indiquez votre adresse e-mail pour retrouver vos dossiers\./,
    'message actionnable exact');
  assert.equal(ctx.window.localStorage.getItem('emela.admission.resume'), null, 'ancrage purgé');
});

test('consultation NON régressée : détail SOU lisible, sans bouton Reprendre', async () => {
  const ctx = loadReprise({
    url: 'http://localhost/reprise/',
    routes: {
      ...RECOVER_ROUTES,
      'public.get_recovered_dossier': { ok: true, data: {
        dossier_id: '26272010007', statut: 'SOU', reprenable: false,
        identite: { prenom: 'Ama', nom: 'K', email: 'ama@x.bj' },
        programme: { code: 'LIC', label: 'Licence Info' }, session: { id: 'S1', label: '2026 LIC' },
        pieces: [{ code: 'cni', label: 'CNI', statut: 'deposee' }],
      }, error: null },
    },
  });
  await tick();
  await driveToList(ctx);
  const d = ctx.document;
  Array.from(d.querySelectorAll('.recovery-item-open'))
    .find((b) => /26272010007/.test(b.textContent)).click();
  await tick(10);
  assert.equal(visible(ctx.window, d.getElementById('recovery-detail')), true, 'détail visible');
  assert.match(d.getElementById('recovery-detail-title').textContent, /26272010007/);
  assert.match(d.getElementById('recovery-detail-body').textContent, /Ama/);
  assert.equal(d.getElementById('recovery-detail-claim'), null, 'lecture seule : pas de bouton');
  d.getElementById('recovery-back').click();
  assert.equal(visible(ctx.window, d.getElementById('recovery-results')), true, 'retour à la liste');
});
