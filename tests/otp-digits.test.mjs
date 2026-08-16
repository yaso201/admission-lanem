import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsdomPkg from 'jsdom';

const { JSDOM } = jsdomPkg;

/* DEC-337 — otp-digits.js : UNE implémentation du confort OTP, trois consommateurs
   (identité ×1, reprise ×2). Contrat prouvé par COMPTAGE D'APPELS :
   - auto-avance + backspace + collage réparti ;
   - validation AUTOMATIQUE au 6ᵉ caractère, UNE SEULE FOIS par saisie complète
     (une correction ne relance pas d'appel → le compteur des 5 tentatives ne brûle
     jamais en silence) ;
   - Entrée valide depuis n'importe quelle case (geste EXPLICITE, toujours permis) ;
   - reset() : vide les cases, focus 1ʳᵉ, RÉ-ARME l'automatique (nouvelle saisie). */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'public', 'scripts', 'otp-digits.js');

let window, digits, calls, ctl;

function type(i, value) {
  digits[i].value = value;
  digits[i].dispatchEvent(new window.Event('input', { bubbles: true }));
}

function typeCode(code) {
  code.split('').forEach((c, i) => type(i, c));
}

beforeEach(() => {
  const dom = new JSDOM(
    '<body>' + '<input class="otp-digit" maxlength="1" />'.repeat(6) + '</body>',
    { runScripts: 'dangerously', url: 'http://localhost/' },
  );
  window = dom.window;
  const script = window.document.createElement('script');
  script.textContent = fs.readFileSync(SRC, 'utf8');
  window.document.body.appendChild(script);
  digits = Array.from(window.document.querySelectorAll('.otp-digit'));
  calls = [];
  ctl = window.OtpDigits.wire(digits, { submit: (code) => calls.push(code) });
});

test('auto-avance : saisir un chiffre déplace le focus à la case suivante', () => {
  digits[0].focus();
  type(0, '4');
  assert.equal(window.document.activeElement, digits[1]);
  assert.equal(digits[0].classList.contains('is-filled'), true);
});

test('backspace sur case vide : recule et efface la précédente', () => {
  type(0, '4'); type(1, '2');
  digits[2].focus();
  digits[2].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
  assert.equal(window.document.activeElement, digits[1]);
  assert.equal(digits[1].value, '');
});

test('6ᵉ caractère : validation AUTOMATIQUE, exactement UN appel', () => {
  typeCode('123456');
  assert.deepEqual(calls, ['123456']);
});

test('one-shot : une correction après le tir ne relance PAS d’appel', () => {
  typeCode('123456');
  assert.equal(calls.length, 1);
  type(5, '');           // correction : efface le dernier…
  type(5, '9');          // …retape → saisie de nouveau complète
  assert.equal(calls.length, 1, 'le compteur serveur ne doit pas brûler en silence');
});

test('reset() : cases vidées, focus 1ʳᵉ, automatique RÉ-ARMÉ (nouvelle saisie → nouvel appel)', () => {
  typeCode('111111');
  assert.equal(calls.length, 1);
  ctl.reset();
  assert.equal(digits.every((d) => d.value === ''), true);
  assert.equal(window.document.activeElement, digits[0]);
  typeCode('222222');
  assert.deepEqual(calls, ['111111', '222222']);
});

test('Entrée : valide depuis n’importe quelle case, même désarmé (geste explicite)', () => {
  typeCode('123456');          // tir automatique (désarme)
  assert.equal(calls.length, 1);
  digits[3].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.deepEqual(calls, ['123456', '123456']);   // Entrée = explicite, toujours permis
});

test('collage : un code à 6 chiffres est réparti dans les cases PUIS validé (un appel)', () => {
  const evt = new window.Event('paste', { bubbles: true, cancelable: true });
  evt.clipboardData = { getData: () => ' 65-43 21 ' };   // bruit toléré, chiffres extraits
  digits[0].dispatchEvent(evt);
  assert.equal(digits.map((d) => d.value).join(''), '654321');
  assert.deepEqual(calls, ['654321']);
});

test('collage partiel (3 chiffres) : réparti sans validation', () => {
  const evt = new window.Event('paste', { bubbles: true, cancelable: true });
  evt.clipboardData = { getData: () => '987' };
  digits[0].dispatchEvent(evt);
  assert.equal(digits.map((d) => d.value).join(''), '987');
  assert.equal(calls.length, 0);
});

test('non-chiffres filtrés à la saisie', () => {
  type(0, 'a');
  assert.equal(digits[0].value, '');
  assert.equal(calls.length, 0);
});
