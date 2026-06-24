/* ============================================================
   emela · Admission — modèle de classification du Bac (DEC-214)
   ------------------------------------------------------------
   Source unique partagée par Identité (calcul) et Pièces
   (liste conditionnelle). Référence : SPEC-ADMISSION-
   CLASSIFICATION-BAC. Aucune décision automatique sur la levée
   de condition (INV-HUMAN) — gérée côté management.
   ============================================================ */
(function (global) {
  'use strict';

  // Paramètres saisis par la Direction chaque année (le calendrier béninois varie).
  var CONFIG = {
    anneeEnCours: 2026,
    // Date de publication des résultats du Bac — seuil entre « en attente » et « de l'année ».
    publicationResultats: '2026-07-13',
    // Date de référence (« aujourd'hui ») — fixée pour la maquette.
    aujourdhui: '2026-06-07'
  };

  // Les trois profils. Les libellés de pièces sont la STRUCTURE validée ;
  // les intitulés exacts restent à affiner avec la Direction des Études (SPEC §8).
  // ids ALIGNES sur les codes back (PIECES_BY_BAC_PROFILE) — sinon subByCode[p.code] ne resout pas
  // les hints (D-FRONT-PIECES-12). Pieces UNIVERSELLES : tous profils, REQUISES.
  var PIECES_UNIVERSELLES = [
    { id: 'identite', nom: "Pièce d'identité (CNI, passeport ou CIP)", sub: 'CNI, passeport ou CIP · PDF, JPG ou PNG · 5 Mo max', requis: true },
    { id: 'photo', nom: "Photo d'identité", sub: 'Photo récente · JPG ou PNG · 5 Mo max', requis: true },
    { id: 'cv', nom: 'Curriculum Vitae', sub: 'PDF · 5 Mo max', requis: true },
    { id: 'motivation', nom: 'Lettre de motivation', sub: 'PDF · 5 Mo max', requis: true }
  ];
  // Pieces academiques PARTAGEES par bac_attente ET bac_annee (meme liste — diplome/releve optionnels).
  var PIECES_ATTENTE_ANNEE = [
    { id: 'releves_terminale', nom: 'Relevés de notes de Terminale', sub: '2 derniers trimestres · PDF, JPG ou PNG · 5 Mo max', requis: true },
    { id: 'attestation_scolarite', nom: 'Attestation de scolarité', sub: 'Terminale en cours · PDF, JPG ou PNG · 5 Mo max', requis: true },
    { id: 'diplome_bac', nom: 'Diplôme du baccalauréat', sub: 'Optionnel à ce stade · PDF, JPG ou PNG · 5 Mo max', requis: false },
    { id: 'releve_bac', nom: 'Relevé de notes du Bac', sub: 'Optionnel à ce stade · PDF, JPG ou PNG · 5 Mo max', requis: false }
  ];

  var PROFILS = {
    anterieur: {
      id: 'anterieur',
      label: 'Bac antérieur',
      court: 'Antérieur',
      resume: "Vous avez obtenu votre baccalauréat lors d'une année précédente.",
      conditionnel: false,
      consequence: 'Candidature normale. Vous fournissez votre diplôme et votre relevé du Bac.',
      pieces: [
        { id: 'diplome_bac', nom: 'Diplôme du baccalauréat', sub: 'PDF, JPG ou PNG · 5 Mo max', requis: true },
        { id: 'releve_bac', nom: 'Relevé de notes du Bac', sub: 'PDF, JPG ou PNG · 5 Mo max', requis: true },
        { id: 'justificatifs_post_bac', nom: 'Justificatifs des années post-bac', sub: 'Fusionner en un seul fichier si plusieurs années à justifier · PDF · 5 Mo max', requis: true }
      ]
    },
    annee: {
      id: 'annee',
      label: "Bac de l'année",
      court: "De l'année",
      resume: "Vous avez passé le Bac cette année et les résultats sont publiés.",
      conditionnel: false,
      consequence: 'Candidature normale. Votre relevé de la session en cours suffit (le diplôme n’est pas encore édité).',
      pieces: PIECES_ATTENTE_ANNEE
    },
    attente: {
      id: 'attente',
      label: 'Bac en attente',
      court: 'En attente',
      resume: "Vous passez le Bac cette année et les résultats ne sont pas encore publiés.",
      conditionnel: true,
      consequence: "Candidature sous réserve d’obtention du Bac (admission conditionnelle, ACO). Vous candidatez avec vos relevés de Terminale ; le diplôme sera fourni plus tard via le complément de dossier.",
      pieces: PIECES_ATTENTE_ANNEE
    }
  };

  function yearOf(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}$/.test(String(dateStr))) return parseInt(dateStr, 10);
    var d = new Date(dateStr);
    return isNaN(d) ? null : d.getFullYear();
  }

  /**
   * Calcule le profil à partir de l'année du Bac et de l'état de publication.
   * @param {string|number} dateBac  date (ISO) ou année du Bac
   * @param {boolean} [resultatsPublies]  override ; sinon déduit de aujourd'hui vs publication
   */
  function classer(dateBac, resultatsPublies) {
    var an = yearOf(dateBac);
    if (an == null) return null;
    if (an < CONFIG.anneeEnCours) return PROFILS.anterieur;
    if (an > CONFIG.anneeEnCours) return PROFILS.attente; // session future → pas encore de résultats
    // an === année en cours
    var publies = (typeof resultatsPublies === 'boolean')
      ? resultatsPublies
      : (new Date(CONFIG.aujourdhui) >= new Date(CONFIG.publicationResultats));
    return publies ? PROFILS.annee : PROFILS.attente;
  }

  /** Liste de pièces complète (universelles + spécifiques) pour un profil — universelles d'abord
   *  (meme ordre que le back PIECES_BY_BAC_PROFILE). */
  function piecesPour(profil) {
    if (!profil) return [];
    return PIECES_UNIVERSELLES.concat(profil.pieces);
  }

  var STORE_KEY = 'emela.admission.profil';

  function save(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }

  global.AdmissionProfil = {
    CONFIG: CONFIG,
    PROFILS: PROFILS,
    classer: classer,
    piecesPour: piecesPour,
    yearOf: yearOf,
    save: save,
    load: load
  };
})(window);
