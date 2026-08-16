import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsdomPkg from 'jsdom';

const { JSDOM, VirtualConsole } = jsdomPkg;

/* DEC-337 — confort OTP INTÉGRÉ, pleine page /reprise construite (Mode B, OTP de
   consultation) : la saisie passe par de VRAIS événements input (pas d'assignation
   directe), et le COMPTAGE des appels serveur prouve le one-shot et le ré-armement. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.REPRISE_DIST_ROOT || path.join(HERE, '..', 'dist');

function inlineAssets(html) {
  html = html.replace(/<script src="\/scripts\/(admission-tunnel|otp-digits)\.js(\?v=\d+)?"><\/script>/g,
    (m, base) => '<script>' +
      fs.readFileSync(path.join(DIST, 'scripts', base + '.js'), 'utf8') + '</scr' + 'ipt>');
  html = html.replace(/<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"[^>]*>/g, (m, href) =>
    '<style>' + fs.readFileSync(path.join(DIST, href.replace(/^\//, '')), 'utf8') + '</style>');
  return html;
}

const PAGE = inlineAssets(fs.readFileSync(path.join(DIST, 'reprise', 'index.html'), 'utf8'));

function tick(n = 6) {
  return n === 0 ? Promise.resolve()
    : new Promise((r) => setTimeout(r, 0)).then(() => tick(n - 1));
}

function loadReprise(routes) {
  const fetchLog = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(PAGE, {
    url: 'http://localhost/reprise/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = (target, opts) => {
        const endpoint = (String(target).match(/admission\.api\.(public\.[a-z_]+)/) || [])[1] || '';
        fetchLog.push(endpoint);
        let res = routes[endpoint];
        if (typeof res === 'function') { res = res(); }
        if (!res) { res = { ok: false, data: null, error: { code: 'NO_ROUTE', message: endpoint } }; }
        return Promise.resolve({ json: () => Promise.resolve({ message: res }) });
      };
    },
  });
  return { dom, window: dom.window, document: dom.window.document, fetchLog };
}

function typeCode(window, inputs, code) {
  code.split('').forEach((c, i) => {
    inputs[i].value = c;
    inputs[i].dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

async function openOtpBlock(ctx) {
  ctx.document.getElementById('recover-email').value = 'ama@x.bj';
  ctx.document.getElementById('btn-recover').click();
  await tick();
}

const RECOVER_OK = { ok: true, data: { message: 'code envoyé' }, error: null };

test('6ᵉ caractère saisi (vrais événements) : la vérification part AUTOMATIQUEMENT, UNE fois', async () => {
  const ctx = loadReprise({
    'public.recover_dossier': RECOVER_OK,
    'public.verify_recovery_otp': { ok: true, data: { recovery_token: 'R', expires_in_seconds: 1800, dossiers: [] }, error: null },
  });
  await tick();
  await openOtpBlock(ctx);
  const inputs = Array.from(ctx.document.querySelectorAll('.recovery-otp-digit'));
  typeCode(ctx.window, inputs, '123456');
  await tick(8);
  const calls = ctx.fetchLog.filter((e) => e === 'public.verify_recovery_otp');
  assert.equal(calls.length, 1, 'exactement UN appel de vérification (auto)');
});

test('code REFUSÉ : cases vidées, focus 1ʳᵉ, compteur décrémenté UNE fois — puis ré-armé', async () => {
  let attempt = 0;
  const ctx = loadReprise({
    'public.recover_dossier': RECOVER_OK,
    'public.verify_recovery_otp': () => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, data: null, error: { code: 'RECOVERY_OTP_INVALID', message: 'Code invalide ou expiré.' } }
        : { ok: true, data: { recovery_token: 'R', expires_in_seconds: 1800, dossiers: [] }, error: null };
    },
  });
  await tick();
  await openOtpBlock(ctx);
  const inputs = Array.from(ctx.document.querySelectorAll('.recovery-otp-digit'));
  typeCode(ctx.window, inputs, '111111');           // 1ʳᵉ saisie → tir auto → REFUS
  await tick(8);
  assert.equal(ctx.fetchLog.filter((e) => e === 'public.verify_recovery_otp').length, 1,
    'un seul appel consommé par la 1ʳᵉ saisie');
  assert.equal(inputs.every((i) => i.value === ''), true, 'cases vidées après refus');
  assert.equal(ctx.document.activeElement, inputs[0], 'focus revenu sur la 1ʳᵉ case');
  typeCode(ctx.window, inputs, '222222');           // NOUVELLE saisie → ré-armé → 2ᵉ appel
  await tick(8);
  assert.equal(ctx.fetchLog.filter((e) => e === 'public.verify_recovery_otp').length, 2,
    'ré-armement : la nouvelle saisie déclenche exactement un 2ᵉ appel');
});

test('Entrée valide depuis n’importe quelle case ; collage réparti puis validé', async () => {
  const ctx = loadReprise({
    'public.recover_dossier': RECOVER_OK,
    'public.verify_recovery_otp': { ok: true, data: { recovery_token: 'R', expires_in_seconds: 1800, dossiers: [] }, error: null },
  });
  await tick();
  await openOtpBlock(ctx);
  const w = ctx.window;
  const inputs = Array.from(ctx.document.querySelectorAll('.recovery-otp-digit'));
  /* collage d'un code complet → réparti + validé automatiquement */
  const evt = new w.Event('paste', { bubbles: true, cancelable: true });
  evt.clipboardData = { getData: () => '654321' };
  inputs[0].dispatchEvent(evt);
  await tick(8);
  assert.equal(inputs.map((i) => i.value).join(''), '654321', 'code réparti dans les cases');
  assert.equal(ctx.fetchLog.filter((e) => e === 'public.verify_recovery_otp').length, 1, 'collage → un appel');
  /* Entrée depuis la 4ᵉ case (geste explicite, même désarmé) → 2ᵉ appel */
  inputs[3].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick(8);
  assert.equal(ctx.fetchLog.filter((e) => e === 'public.verify_recovery_otp').length, 2, 'Entrée → appel explicite');
});
