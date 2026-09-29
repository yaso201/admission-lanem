import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* COMPLÉTUDE DES STATUTS — /suivi traduit un code de workflow en libellé lisible.
   Le repli est `STATUS[d.statut] || { label: d.statut, step: 0 }` : un code non mappé
   s'affiche donc BRUT au candidat, sans message et avec la timeline remise à zéro.
   C'est ce qui est arrivé à ABS (absent au concours), oublié du mapping alors que le
   back le déclare — trou invisible tant qu'aucun candidat n'était absent.
   Ce test verrouille la correspondance : tout état du workflow doit être traduit. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.SUIVI_DIST_ROOT || path.join(HERE, '..', 'dist');
const PAGE = fs.readFileSync(path.join(DIST, 'suivi', 'index.html'), 'utf8');

/* Les 14 états déclarés par le workflow back (create_admission_workflow.py). */
const ETATS_WORKFLOW = [
  'BRO', 'SOP', 'SOU', 'ETU', 'INC', 'ADM', 'ATT',
  'ACO', 'ACC', 'REF', 'REJ', 'DES', 'INS', 'ABS',
];

test('chaque état du workflow a un libellé dans /suivi', () => {
  const manquants = ETATS_WORKFLOW.filter(
    (code) => !new RegExp(`\\b${code}\\s*:\\s*\\{\\s*label\\s*:`).test(PAGE),
  );
  assert.deepEqual(manquants, [],
    `états sans libellé (le candidat verrait le code brut) : ${manquants.join(', ')}`);
});

test('chaque état du workflow a un message explicatif dans /suivi', () => {
  const bloc = PAGE.slice(PAGE.indexOf('STEP_NOTE'));
  const manquants = ETATS_WORKFLOW.filter(
    (code) => !new RegExp(`\\b${code}\\s*:\\s*['"\`]`).test(bloc),
  );
  assert.deepEqual(manquants, [],
    `états sans message (ligne de temps muette) : ${manquants.join(', ')}`);
});

test('ABS est traduit et non affiché en code brut (régression du 29/09)', () => {
  assert.match(PAGE, /ABS\s*:\s*\{\s*label\s*:\s*['"]Absent/,
    'ABS doit porter un libellé lisible');
  assert.doesNotMatch(PAGE, /label:\s*['"]ABS['"]/,
    'le code brut ne doit jamais servir de libellé');
});
