/* ============================================================
   emela · Admission — OtpDigits (DEC-337, OUVERTURE-SOP)
   ------------------------------------------------------------
   UNE implémentation du confort de saisie OTP, TROIS consommateurs :
   /identite (vérification e-mail) · /reprise Mode A (OTP dossier) ·
   /reprise Mode B (OTP de consultation d'identité).

   Contrat :
   - auto-avance, backspace (recule + efface), filtrage non-chiffres ;
   - collage d'un code : chiffres extraits, répartis, puis VALIDÉ si complet ;
   - Entrée valide depuis n'importe quelle case (geste EXPLICITE, toujours permis) ;
   - validation AUTOMATIQUE au 6ᵉ caractère — UNE SEULE FOIS par saisie complète :
     armée à l'initialisation, désarmée après le tir, RÉ-ARMÉE uniquement par
     reset(). Une correction après le tir ne relance JAMAIS d'appel serveur :
     le compteur des 5 tentatives ne peut pas brûler en silence (garde-fou DEC-337).
   - reset() = vider les cases + focus 1ʳᵉ + ré-armer : à appeler sur CODE REFUSÉ.

   Usage :
     var ctl = OtpDigits.wire(inputs, { submit: function (code) { … } });
     …sur refus serveur : ctl.reset();
   ============================================================ */
(function (global) {
  'use strict';

  function wire(inputs, opts) {
    var digits = Array.prototype.slice.call(inputs || []);
    var submit = (opts && opts.submit) || function () {};
    var armed = true;   /* one-shot : ré-armé UNIQUEMENT par reset() */

    function code() {
      return digits.map(function (d) { return d.value; }).join('');
    }
    function complete() {
      return digits.every(function (d) { return !!d.value; });
    }
    function paintFilled() {
      digits.forEach(function (d) { d.classList.toggle('is-filled', !!d.value); });
    }
    function fireIfArmed() {
      if (armed && complete()) {
        armed = false;
        submit(code());
      }
    }
    function reset() {
      digits.forEach(function (d) {
        d.value = '';
        d.classList.remove('is-filled');
        d.classList.remove('is-cursor');
      });
      armed = true;
      if (digits[0]) { digits[0].focus(); }
    }

    digits.forEach(function (el, i) {
      el.addEventListener('input', function () {
        el.value = el.value.replace(/[^0-9]/g, '').slice(0, 1);
        if (el.value && i < digits.length - 1) { digits[i + 1].focus(); }
        paintFilled();
        /* is-cursor : indicateur visuel de la case active (CSS optionnelle par page). */
        digits.forEach(function (d) { d.classList.remove('is-cursor'); });
        var active = el.ownerDocument.activeElement;
        if (active && active.classList && active.classList.contains(el.className.split(' ')[0])) {
          active.classList.add('is-cursor');
        }
        fireIfArmed();
      });

      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit(code());   /* explicite : toujours permis, même désarmé */
          return;
        }
        if (e.key === 'Backspace' && !el.value && i > 0) {
          e.preventDefault();
          digits[i - 1].value = '';
          digits[i - 1].classList.remove('is-filled');
          digits[i - 1].focus();
        }
      });

      el.addEventListener('focus', function () {
        digits.forEach(function (d) { d.classList.remove('is-cursor'); });
        el.classList.add('is-cursor');
      });

      el.addEventListener('paste', function (e) {
        var text = ((e.clipboardData || global.clipboardData || {}).getData
          ? (e.clipboardData || global.clipboardData).getData('text') : '') || '';
        var nums = text.replace(/[^0-9]/g, '').slice(0, digits.length);
        if (!nums.length) { return; }
        e.preventDefault();
        digits.forEach(function (d, j) { d.value = nums[j] || ''; });
        paintFilled();
        var next = Math.min(nums.length, digits.length - 1);
        digits[next].focus();
        fireIfArmed();      /* code complet collé → validé (un seul tir) */
      });
    });

    return { reset: reset, code: code };
  }

  global.OtpDigits = { wire: wire };
})(window);
