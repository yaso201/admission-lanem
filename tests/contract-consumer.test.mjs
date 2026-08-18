/* CONTRAT-1 — Contrat CÔTÉ CONSOMMATEUR (applicant / candidat).
   Les champs que le tunnel candidat LIT (source AUDIT-360-A3 §2.1) doivent être garantis par le
   schéma canonique (copie déclarée depuis le back). Placé en tests/ pour être pris par
   `npm test` (glob tests/*.test.mjs) sans modifier package.json. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSchema, missingFromContract } from './contract/check.mjs';

const CONSUMED = {
  'public.list_sessions': [ // admission-tunnel.js — sélection de session (#12)
    'sessions.id', 'sessions.label', 'sessions.academic_year',
    'sessions.programme.code', 'sessions.closes_on', 'sessions.selectable',
  ],
  'public.list_programmes': [ // admission-tunnel.js — catalogue (#11)
    'programmes.code', 'programmes.label', 'programmes.parcours', 'programmes.partner',
    'programmes.location', 'programmes.niveaux.level_code', 'programmes.niveaux.level_name',
  ],
};

for (const [id, consumed] of Object.entries(CONSUMED)) {
  test(`contrat consommateur applicant — ${id} : champs lus garantis`, () => {
    const schema = loadSchema(id);
    const missing = missingFromContract(schema, consumed);
    assert.deepEqual(missing, [], `champs lus mais NON garantis par le contrat : ${missing.join(', ')}`);
  });
}
