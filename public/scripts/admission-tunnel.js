/* ============================================================
   emela · Admission — Tunnel : contexte + navigation + API
   ------------------------------------------------------------
   FLAG USE_REAL_API :
     false → mocks locaux, tunnel autonome.
     true  → appels fetch() au back Frappe (DEC-217).
   Les mocks sont CONSERVÉS comme fallback (réversible).

   LOT-A3 :
     - ADM-DEBT-13 : namespace public AT.api.* (les appels sont réels).
     - ADM-DEBT-40 : verify_otp fait TOURNER le token côté back —
       le nouveau token est adopté ici ; TOKEN_EXPIRED → re-demande
       d'OTP automatique (request_otp tolère un token expiré).
     - ADM-DEBT-48 : getFrais / getLegalDocuments — les MONTANTS et
       textes légaux viennent du back (zéro montant en dur au front).

   ANCRAGE ID+TOKEN (convergence-2) :
     Après create_dossier réel, dossier_id + token sont stockés
     en sessionStorage. Les appels suivants les lisent et les envoient.

   Format réponse (contrat DEC-217) : { ok, data, error }.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- Configuration ---------- */

  /** Basculer sur les vrais appels API. */
  var USE_REAL_API = true;

  /** URL de base du back Frappe admission.
   *  Configurable : lire window.ADMISSION_API_BASE si défini. */
  var API_BASE = global.ADMISSION_API_BASE || 'http://admission-dev.localhost:8010';

  /** Préfixe des endpoints Frappe whitelisted. */
  var API_PREFIX = '/api/method/admission.api.';

  /* ---------- Contexte candidat (query params) ---------- */
  /* NON TOUCHÉ — propagation d'état inchangée. */

  /** Lit les query params courants comme objet. */
  function readCtx() {
    var p = new URLSearchParams(location.search);
    return {
      parcours: p.get('parcours') || '',
      session:  p.get('session')  || '',
      bourse:   p.get('bourse')   || '',
      bourses:  p.get('bourses')  || '',
      profil:   p.get('profil')   || ''
    };
  }

  /** Construit une URL avec le contexte transmis. */
  function buildUrl(path, extra) {
    var ctx = readCtx();
    if (extra) { for (var k in extra) { ctx[k] = extra[k]; } }
    var parts = [];
    for (var k in ctx) { if (ctx[k]) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(ctx[k])); }
    return path + (parts.length ? '?' + parts.join('&') : '');
  }

  /** Navigue vers une page en transmettant le contexte. */
  function navigateTo(path, extra) {
    window.location.href = buildUrl(path, extra);
  }

  /* ---------- Ancrage ID + TOKEN (sessionStorage) ---------- */

  var SS_ID = 'emela.admission.dossier_id';
  var SS_TOKEN = 'emela.admission.token';

  function saveDossier(id, token) {
    try { sessionStorage.setItem(SS_ID, id); sessionStorage.setItem(SS_TOKEN, token); } catch (e) {}
  }
  function getDossierId() {
    try { return sessionStorage.getItem(SS_ID) || ''; } catch (e) { return ''; }
  }
  function getDossierToken() {
    try { return sessionStorage.getItem(SS_TOKEN) || ''; } catch (e) { return ''; }
  }
  function clearDossier() {
    try { sessionStorage.removeItem(SS_ID); sessionStorage.removeItem(SS_TOKEN); } catch (e) {}
  }

  /* ---------- Appels HTTP réels (actifs si USE_REAL_API) ---------- */

  function _apiUrl(endpoint) {
    return API_BASE + API_PREFIX + endpoint;
  }

  /* ADM-DEBT-40 : TOKEN_EXPIRED (403) — le token de dossier a expiré (7 j glissants).
     request_otp TOLÈRE un token expiré (renouvellement) : on redemande un OTP
     automatiquement, puis on remonte OTP_RESENT à la page. La page qui sait afficher
     une saisie d'OTP peut s'abonner via AT.onTokenExpired. */
  function _handleTokenExpired(payload, cb) {
    var hook = global.AdmissionTunnel && global.AdmissionTunnel.onTokenExpired;
    fetch(_apiUrl('public.request_otp'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ dossier_id: getDossierId(), token: getDossierToken() })
    }).catch(function () {}).finally(function () {
      if (typeof hook === 'function') { hook(payload); }
      cb({ ok: false, data: null, error: {
        code: 'OTP_RESENT',
        message: 'Votre lien a expiré. Un nouveau code vous a été envoyé : saisissez-le pour reprendre.'
      } });
    });
  }

  function _dispatch(payload, cb) {
    if (payload && payload.error && payload.error.code === 'TOKEN_EXPIRED') {
      _handleTokenExpired(payload, cb);
      return;
    }
    cb(payload);
  }

  function _post(endpoint, body, cb) {
    fetch(_apiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      /* Frappe enveloppe dans { message: {...} } — déballer si nécessaire. */
      var payload = json.message || json;
      _dispatch(payload, cb);
    })
    .catch(function (err) {
      cb({ ok: false, data: null, error: { code: 'NETWORK_ERROR', message: err.message || 'Back injoignable.' } });
    });
  }

  function _get(endpoint, params, cb) {
    var qs = [];
    for (var k in params) { if (params[k]) qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); }
    var url = _apiUrl(endpoint) + (qs.length ? '?' + qs.join('&') : '');
    fetch(url, { headers: { 'Accept': 'application/json' } })
    .then(function (res) { return res.json(); })
    .then(function (json) {
      var payload = json.message || json;
      _dispatch(payload, cb);
    })
    .catch(function (err) {
      cb({ ok: false, data: null, error: { code: 'NETWORK_ERROR', message: err.message || 'Back injoignable.' } });
    });
  }

  /* ---- Fonctions réelles (même signature que les mocks) ---- */

  /** Clé d'idempotence (UUID si dispo — un retry réseau ne crée pas 2 dossiers). */
  function _idemKey(prefix) {
    var id = (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID()
      : Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    return prefix + '-' + id;
  }

  /* LOT F (F1) : payload COMPLET — identité réelle, niveau, consentements, bourses.
     Le back refuse sans level_code ni consents (CONSENT_REQUIRED/LEVEL_REQUIRED). */
  function realCreateDossier(payload, cb) {
    _post('public.create_dossier', {
      session: payload.session,
      level_code: payload.level_code,
      identite: payload.identite || {},
      consent_data_processing: payload.consent_data_processing ? 1 : 0,
      consent_cgv: payload.consent_cgv ? 1 : 0,
      bourses_demandees: payload.bourses_demandees || [],
      idempotency_key: payload.idempotency_key || _idemKey('front')
    }, function (res) {
      /* Ancrage : stocker id+token en sessionStorage dès la création. */
      if (res.ok && res.data) {
        saveDossier(res.data.dossier_id, res.data.token);
      }
      cb(res);
    });
  }

  /* LOT F (F2) : demande d'envoi du code OTP (livré par E-MAIL — A0.1). */
  function realRequestOtp(cb) {
    _post('public.request_otp', {
      dossier_id: getDossierId(),
      token: getDossierToken()
    }, cb);
  }

  /* LOT F : dossier complet sérialisé (identité, pièces, bourses, paiement, statut). */
  function realGetDossier(cb) {
    _get('public.get_dossier', {
      dossier_id: getDossierId(),
      token: getDossierToken()
    }, cb);
  }

  /* LOT F (F1) : (re)classification bac côté back — met à jour les pièces du dossier. */
  function realClassifyBac(bacDate, cb) {
    _post('public.classify_bac', {
      bac_date: bacDate,
      dossier_id: getDossierId(),
      token: getDossierToken()
    }, cb);
  }

  /* LOT F (F3/A0.4) : upload BINAIRE direct (multipart). XHR pour la progression. */
  function realUploadPieceFile(pieceCode, file, cb, onProgress) {
    var fd = new FormData();
    fd.append('dossier_id', getDossierId());
    fd.append('token', getDossierToken());
    fd.append('piece_code', pieceCode);
    fd.append('file', file, file.name);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', _apiUrl('public.upload_piece_file'));
    xhr.setRequestHeader('Accept', 'application/json');
    if (xhr.upload && typeof onProgress === 'function') {
      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) { onProgress(Math.round((e.loaded / e.total) * 100)); }
      });
    }
    xhr.onload = function () {
      var payload;
      try { payload = JSON.parse(xhr.responseText); } catch (e) { payload = null; }
      payload = (payload && (payload.message || payload)) ||
        { ok: false, data: null, error: { code: 'UPLOAD_FAILED', message: 'Réponse illisible du serveur.' } };
      _dispatch(payload, cb);
    };
    xhr.onerror = function () {
      cb({ ok: false, data: null, error: { code: 'NETWORK_ERROR', message: 'Back injoignable.' } });
    };
    xhr.send(fd);
  }

  /* LOT F (F6) : re-soumission après correction (INC→SOU). */
  function realResubmitComplement(cb) {
    _post('public.resubmit_complement', {
      dossier_id: getDossierId(),
      token: getDossierToken()
    }, cb);
  }

  /* LOT F (F4) : « retrouver mon dossier » — réponse UNIFORME côté back (anti-énumération). */
  function realRecoverDossier(email, cb) {
    _post('public.recover_dossier', { email: email }, cb);
  }

  /* LOT G (G2/DAT-1) : droit à l'effacement — IRRÉVERSIBLE, token + OTP + confirm exigés. */
  function realRequestDataDeletion(cb) {
    _post('public.request_data_deletion', {
      dossier_id: getDossierId(),
      token: getDossierToken(),
      confirm: 'true'
    }, cb);
  }

  /* LOT F (F7) : paiement des frais d'inscription (frais 2) depuis ACC.
     channel ∈ {online, bank, cash} ; opts = { acompte, consentRefund, consentTransfer }. */
  function realEnrollmentPay(channel, opts, cb) {
    opts = opts || {};
    var base = {
      dossier_id: getDossierId(), token: getDossierToken(),
      acompte_xof: opts.acompte || 0,
      consent_refund: opts.consentRefund ? 1 : 0,
      consent_data_transfer: opts.consentTransfer ? 1 : 0,
      idempotency_key: _idemKey('enroll')
    };
    if (channel === 'online') {
      _post('public.submit_enrollment_payment_online', base, cb);
    } else {
      base.mode = channel === 'cash' ? 'cash' : 'bank';
      _post('public.declare_enrollment_payment_offline', base, cb);
    }
  }

  /* LOT F (F4) : adoption du lien tokenisé des mails (/reprise?dossier=&token=). */
  function adoptFromUrl() {
    var p = new URLSearchParams(location.search);
    var id = p.get('dossier'), tok = p.get('token');
    if (id && tok) {
      saveDossier(id, tok);
      /* Le token ne doit PAS rester dans l'historique navigateur. */
      p.delete('token');
      var qs = p.toString();
      try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (e) {}
      return true;
    }
    return false;
  }

  function realVerifyOtp(channel, code, cb) {
    _post('public.verify_otp', {
      dossier_id: getDossierId(),
      token: getDossierToken(),
      email_otp: channel === 'email' ? code : '',
      phone_otp: channel === 'phone' ? code : ''
    }, function (res) {
      /* ADM-DEBT-40 : le back TOURNE le token à la vérification (SEC) — l'ADOPTER,
         sinon tous les appels suivants partent avec l'ancien token invalide. */
      if (res.ok && res.data && res.data.token) {
        saveDossier(res.data.dossier_id || getDossierId(), res.data.token);
      }
      cb(res);
    });
  }

  function realGetPieces(profilId, cb) {
    _get('public.get_dossier', {
      dossier_id: getDossierId(),
      token: getDossierToken()
    }, function (res) {
      if (res.ok && res.data) {
        cb({ ok: true, data: { profil: res.data.profil_bac, pieces: res.data.pieces }, error: null });
      } else {
        cb(res);
      }
    });
  }

  function realProcessPayment(mode, cb, opts) {
    var id = getDossierId();
    var tok = getDossierToken();
    opts = opts || {};
    if (mode === 'sop') {
      _post('public.declare_payment_offline', {
        dossier_id: id, token: tok,
        mode: 'Bank',
        consent_refund: opts.consentRefund ? 1 : 0,
        idempotency_key: 'pay-' + Date.now()
      }, cb);
    } else if (mode === 'success') {
      _post('public.submit_payment_online', {
        dossier_id: id, token: tok,
        consent_refund: opts.consentRefund ? 1 : 0,
        idempotency_key: 'pay-' + Date.now()
      }, cb);
    } else {
      cb({ ok: false, data: null, error: { code: 'PAYMENT_FAILED', message: 'Transaction refusée.' } });
    }
  }

  /* ---- ADM-DEBT-48 : référentiels frais + légal (montants = BACK uniquement) ---- */

  var _fraisCache = {};

  /** get_frais : montants réels du catalogue (frais1/frais2, scolarité annuelle,
   *  bourses éligibles, promotions actives, plafond, disclaimer versionné). */
  function getFrais(params, cb) {
    var key = JSON.stringify(params || {});
    if (_fraisCache[key]) { cb(_fraisCache[key]); return; }
    _get('public.get_frais', params || {}, function (res) {
      if (res.ok) { _fraisCache[key] = res; }
      cb(res);
    });
  }

  /** get_legal_documents : textes légaux actifs (version + hash + contenu). */
  function getLegalDocuments(types, cb) {
    _get('public.get_legal_documents', types ? { types: types } : {}, cb);
  }

  /** list_sessions : sessions d'admission ouvertes (publique). */
  function listSessions(programme, cb) {
    _get('public.list_sessions', programme ? { programme: programme } : {}, cb);
  }

  /** list_programmes : programmes + niveaux d'entrée (publique, LOT F — level_code requis). */
  function listProgrammes(cb) {
    _get('public.list_programmes', {}, cb);
  }

  /** Formatage AFFICHAGE d'un montant XOF renvoyé par le back (aucun calcul). */
  function fmtXOF(n) {
    if (n === null || n === undefined || n === '') { return '—'; }
    return Number(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
  }

  /* ---------- Mocks (conservés, actifs si USE_REAL_API=false) ---------- */

  var MOCK_DOSSIER = 'CAN-2026-MOCK';
  var MOCK_DELAY = 300;

  function mockResponse(data) {
    return { ok: true, data: data, error: null };
  }
  function mockError(code, message) {
    return { ok: false, data: null, error: { code: code, message: message } };
  }

  function mockCreateDossier(payload, cb) {
    setTimeout(function () {
      cb(mockResponse({
        dossier_id: MOCK_DOSSIER,
        session: payload && payload.session,
        statut: 'BRO',
        token: 'mock-token-' + Date.now()
      }));
    }, MOCK_DELAY);
  }

  function mockVerifyOtp(channel, code, cb) {
    setTimeout(function () {
      if (code && code.length === 6 && /^\d+$/.test(code)) {
        cb(mockResponse({ channel: channel, verified: true }));
      } else {
        cb(mockError('INVALID_OTP', 'Code invalide ou incomplet.'));
      }
    }, MOCK_DELAY);
  }

  function mockGetPieces(profilId, cb) {
    var AP = global.AdmissionProfil;
    var profil = AP && AP.PROFILS[profilId] ? AP.PROFILS[profilId] : null;
    setTimeout(function () {
      if (profil) {
        cb(mockResponse({ profil: profilId, pieces: AP.piecesPour(profil) }));
      } else {
        cb(mockError('UNKNOWN_PROFIL', 'Profil bac inconnu.'));
      }
    }, MOCK_DELAY);
  }

  function mockProcessPayment(mode, cb) {
    setTimeout(function () {
      if (mode === 'success') {
        cb(mockResponse({
          transaction_id: 'KKP-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
          currency: 'XOF',
          status: 'confirmed',
          dossier_statut: 'SOU'
        }));
      } else if (mode === 'sop') {
        cb(mockResponse({
          dossier_statut: 'SOP',
          message: 'Soumission provisoire enregistrée.'
        }));
      } else {
        cb(mockError('PAYMENT_FAILED', 'Transaction refusée ou annulée.'));
      }
    }, MOCK_DELAY);
  }

  /* ---------- Sélecteur mock / réel ---------- */

  function createDossier(payload, cb) {
    return USE_REAL_API ? realCreateDossier(payload, cb) : mockCreateDossier(payload, cb);
  }
  function verifyOtp(channel, code, cb) {
    return USE_REAL_API ? realVerifyOtp(channel, code, cb) : mockVerifyOtp(channel, code, cb);
  }
  function getPieces(profilId, cb) {
    return USE_REAL_API ? realGetPieces(profilId, cb) : mockGetPieces(profilId, cb);
  }
  function processPayment(mode, cb, opts) {
    return USE_REAL_API ? realProcessPayment(mode, cb, opts) : mockProcessPayment(mode, cb);
  }

  /* ---------- LOT KKIAPAY : widget réel + attente de confirmation webhook ---------- */

  var KKIAPAY_CDN = 'https://cdn.kkiapay.me/k.js';
  var _kkLoaded = null;

  function _loadKkiapay(cb) {
    if (window.openKkiapayWidget) { cb(true); return; }
    if (_kkLoaded) { _kkLoaded.push(cb); return; }
    _kkLoaded = [cb];
    var sc = document.createElement('script');
    sc.src = KKIAPAY_CDN;
    sc.onload = function () { _kkLoaded.forEach(function (f) { f(true); }); _kkLoaded = null; };
    sc.onerror = function () { _kkLoaded.forEach(function (f) { f(false); }); _kkLoaded = null; };
    document.body.appendChild(sc);
  }

  /** Ouvre le widget KkiaPay depuis un descriptor serveur (prepare_online_payment).
   *  handlers: { success: fn(transactionId), failed: fn(err), unavailable: fn() }.
   *  Le listener succès du widget n'est PAS la confirmation : le webhook (re-vérifié
   *  serveur) fait foi — enchaîner sur pollDossier. Jamais de clé privée ici. */
  function launchKkiapay(desc, handlers) {
    handlers = handlers || {};
    if (!desc || !desc.public_key) { (handlers.unavailable || function () {})(); return; }
    _loadKkiapay(function (ok) {
      if (!ok) { (handlers.unavailable || function () {})(); return; }
      try {
        if (window.addSuccessListener) {
          window.addSuccessListener(function (resp) {
            (handlers.success || function () {})(resp && resp.transactionId);
          });
        }
        if (window.addFailedListener) {
          window.addFailedListener(function (err) { (handlers.failed || function () {})(err); });
        }
        window.openKkiapayWidget({
          amount: desc.amount_xof,
          key: desc.public_key,
          sandbox: !!desc.sandbox,
          data: desc.data || '',
          position: 'center'
        });
      } catch (e) { (handlers.unavailable || function () {})(); }
    });
  }

  /** Attend la confirmation WEBHOOK : poll get_dossier jusqu'à ce que le statut entre
   *  dans `expect` (frais 1 → SOU, frais 2 → INS). cb(true) confirmé, cb(false) timeout
   *  (file webhook lente : le suivi reste la source d'information). */
  function pollDossierStatus(expect, cb, tries) {
    tries = tries == null ? 40 : tries;  /* 40 × 3 s = 2 min */
    realGetDossier(function (res) {
      var st = res.ok && res.data && res.data.status;
      if (st && expect.indexOf(st) !== -1) { cb(true); return; }
      if (tries <= 0) { cb(false); return; }
      setTimeout(function () { pollDossierStatus(expect, cb, tries - 1); }, 3000);
    });
  }

  /* ---------- Export ---------- */

  global.AdmissionTunnel = {
    readCtx: readCtx,
    buildUrl: buildUrl,
    navigateTo: navigateTo,
    /* ADM-DEBT-13 : API unifiée — les appels sont RÉELS (le flag USE_REAL_API
       décide du fallback mock). L'ancien namespace trompeur « mock » est supprimé (ADM-DEBT-13). */
    api: {
      createDossier: createDossier,
      requestOtp: realRequestOtp,
      verifyOtp: verifyOtp,
      getPieces: getPieces,
      getDossier: realGetDossier,
      classifyBac: realClassifyBac,
      uploadPieceFile: realUploadPieceFile,
      resubmitComplement: realResubmitComplement,
      recoverDossier: realRecoverDossier,
      requestDataDeletion: realRequestDataDeletion,
      enrollmentPay: realEnrollmentPay,
      processPayment: processPayment,
      getFrais: getFrais,
      getLegalDocuments: getLegalDocuments,
      listSessions: listSessions,
      listProgrammes: listProgrammes
    },
    adoptFromUrl: adoptFromUrl,
    fmtXOF: fmtXOF,
    /* LOT KKIAPAY : widget + attente webhook (paiement.astro frais 1, suivi.astro frais 2). */
    kkiapay: { launch: launchKkiapay, pollDossierStatus: pollDossierStatus },
    /* Hook optionnel : une page avec UI de saisie OTP peut intercepter TOKEN_EXPIRED. */
    onTokenExpired: null,
    /* Accès direct si besoin (debug, tests) */
    _real: {
      createDossier: realCreateDossier,
      verifyOtp: realVerifyOtp,
      getPieces: realGetPieces,
      processPayment: realProcessPayment
    },
    /* Ancrage dossier (sessionStorage) */
    saveDossier: saveDossier,
    getDossierId: getDossierId,
    getDossierToken: getDossierToken,
    clearDossier: clearDossier,
    _config: {
      USE_REAL_API: USE_REAL_API,
      API_BASE: API_BASE
    }
  };

})(window);
