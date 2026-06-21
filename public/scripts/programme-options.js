/* programme-options.js — logique pure de mise en forme du catalogue formations
   pour le <select> de l'étape 1. Aucune dépendance DOM : entrée = tableau de
   programmes (public.list_programmes), sortie = groupes { label, options[] }.
   Chargé en <script is:inline> (global navigateur) ET importable en Node (globalThis). */
(function (root) {
  'use strict';

  /* Ordre canonique : [valeur parcours back, libellé de groupe affiché]. */
  var PARCOURS_ORDER = [
    { value: 'Prépa', label: 'Prépa' },
    { value: 'Licence', label: 'Licence' },
    { value: 'Bachelor', label: 'Bachelor' },
    { value: 'Double-Diplomation', label: 'Double-Diplôme' }
  ];
  var FALLBACK_LABEL = 'Autres';
  /* Mots retirables en tête de titre (PAS « Prépa » : noms composés propres). */
  var STRIP_WORDS = ['Licence', 'Bachelor'];

  function trimStr(v) { return (v == null ? '' : String(v)).trim(); }

  /* Titre court : retire le mot de parcours en tête si présent, sinon label entier. */
  function shortTitle(prog) {
    var label = trimStr(prog.label) || trimStr(prog.code);
    if (prog.parcours === 'Double-Diplomation') { return label; }
    for (var i = 0; i < STRIP_WORDS.length; i++) {
      var w = STRIP_WORDS[i];
      if (label.toLowerCase().indexOf(w.toLowerCase() + ' ') === 0) {
        var rest = label.slice(w.length + 1).trim();
        return rest || label;
      }
    }
    return label;
  }

  /* Nombre de lieux distincts non vides dans tout le catalogue. */
  function distinctLocationCount(programmes) {
    var seen = {};
    for (var i = 0; i < programmes.length; i++) {
      var loc = trimStr(programmes[i].location).toLowerCase();
      if (loc) { seen[loc] = true; }
    }
    return Object.keys(seen).length;
  }

  /* Texte d'une option : titre · partenaire? · lieu? · affinité? */
  function optionText(prog, showLocation) {
    var parts = [shortTitle(prog)];
    var partner = trimStr(prog.partner);
    /* Insensible à la casse : « lanem »/« LANEM » saisis côté back ne doivent pas réapparaître. */
    if (partner && partner.toLowerCase() !== 'lanem') { parts.push(partner); }
    var loc = trimStr(prog.location);
    if (showLocation && loc) { parts.push(loc); }
    if (prog.parcours === 'Double-Diplomation') {
      var aff = trimStr(prog.dd_affinity);
      if (aff) { parts.push(aff); }
    }
    return parts.join(' · ');
  }

  function groupIndex(parcours) {
    for (var i = 0; i < PARCOURS_ORDER.length; i++) {
      if (PARCOURS_ORDER[i].value === parcours) { return i; }
    }
    return PARCOURS_ORDER.length; /* fallback « Autres » */
  }

  function buildProgrammeGroups(programmes) {
    var list = Array.isArray(programmes) ? programmes : [];
    var showLocation = distinctLocationCount(list) >= 2;
    var buckets = {};
    for (var i = 0; i < list.length; i++) {
      var prog = list[i];
      var gi = groupIndex(prog.parcours);
      if (!buckets[gi]) { buckets[gi] = []; }
      buckets[gi].push({
        value: trimStr(prog.code),
        text: optionText(prog, showLocation),
        sortKey: shortTitle(prog)
      });
    }
    var groups = [];
    /* Tri NUMÉRIQUE des index de groupe (Object.keys ordonnerait « 10 » avant « 2 »). */
    var order = Object.keys(buckets).map(Number).sort(function (a, b) { return a - b; });
    for (var j = 0; j < order.length; j++) {
      var gi2 = order[j];
      var label = gi2 < PARCOURS_ORDER.length ? PARCOURS_ORDER[gi2].label : FALLBACK_LABEL;
      var opts = buckets[gi2].sort(function (a, b) {
        return a.sortKey.localeCompare(b.sortKey, 'fr', { sensitivity: 'base' });
      }).map(function (o) { return { value: o.value, text: o.text }; });
      groups.push({ label: label, options: opts });
    }
    return groups;
  }

  root.ProgrammeOptions = { buildProgrammeGroups: buildProgrammeGroups };
})(typeof globalThis !== 'undefined' ? globalThis : this);
