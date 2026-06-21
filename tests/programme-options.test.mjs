import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../public/scripts/programme-options.js';

const build = globalThis.ProgrammeOptions.buildProgrammeGroups;

const SAMPLE = [
  { code: 'LIC-INFO', label: 'Licence Informatique', parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' },
  { code: 'LIC-GC',   label: 'Licence Génie Civil',  parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' },
  { code: 'PREPA',    label: 'Prépa Intégrée',       parcours: 'Prépa',   partner: '', location: 'Cotonou', dd_affinity: '' },
  { code: 'BACH-DATA',label: 'Bachelor Data & IA',   parcours: 'Bachelor',partner: 'ESIIA', location: 'Cotonou', dd_affinity: '' },
  { code: 'DD-1',     label: 'Licence Info + Bachelor Data', parcours: 'Double-Diplomation', partner: 'ESIIA', location: 'Cotonou', dd_affinity: 'Recommandé' }
];

test('groupes dans l’ordre canonique, vides omis', () => {
  const g = build(SAMPLE);
  assert.deepEqual(g.map(x => x.label), ['Prépa', 'Licence', 'Bachelor', 'Double-Diplôme']);
});

test('tri alphabétique intra-groupe (accents/casse ignorés)', () => {
  const licence = build(SAMPLE).find(x => x.label === 'Licence');
  assert.deepEqual(licence.options.map(o => o.text), ['Génie Civil', 'Informatique']);
});

test('strip du titre : Licence/Bachelor retirés, Prépa conservé', () => {
  const g = build(SAMPLE);
  assert.equal(g.find(x => x.label === 'Prépa').options[0].text, 'Prépa Intégrée');
  assert.equal(g.find(x => x.label === 'Licence').options[0].text, 'Génie Civil');
});

test('partenaire affiché seulement si ≠ LaNEM / non vide', () => {
  const bach = build(SAMPLE).find(x => x.label === 'Bachelor').options[0];
  assert.equal(bach.text, 'Data & IA · ESIIA');
  const lic = build(SAMPLE).find(x => x.label === 'Licence').options[0];
  assert.ok(!lic.text.includes('LaNEM'));
});

test('lieu masqué si un seul lieu distinct, affiché si ≥ 2', () => {
  const mono = build(SAMPLE).find(x => x.label === 'Licence').options[0];
  assert.equal(mono.text, 'Génie Civil');
  const multi = build(SAMPLE.concat([
    { code: 'LIC-X', label: 'Licence Droit', parcours: 'Licence', partner: '', location: 'Porto-Novo', dd_affinity: '' }
  ]));
  const droit = multi.find(x => x.label === 'Licence').options.find(o => o.value === 'LIC-X');
  assert.equal(droit.text, 'Droit · Porto-Novo');
});

test('affinité seulement pour les double-diplômes, libellé composite intact', () => {
  const dd = build(SAMPLE).find(x => x.label === 'Double-Diplôme').options[0];
  assert.equal(dd.text, 'Licence Info + Bachelor Data · ESIIA · Recommandé');
});

test('parcours inconnu → groupe « Autres » en dernier', () => {
  const g = build(SAMPLE.concat([
    { code: 'X', label: 'Mastère Spécialisé', parcours: 'MS', partner: '', location: 'Cotonou', dd_affinity: '' }
  ]));
  assert.equal(g[g.length - 1].label, 'Autres');
});

test('entrée vide / null / undefined → []', () => {
  assert.deepEqual(build([]), []);
  assert.deepEqual(build(undefined), []);
  assert.deepEqual(build(null), []);
});

test('label manquant → fallback sur le code', () => {
  const g = build([{ code: 'ZZ', label: '', parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' }]);
  assert.equal(g[0].options[0].text, 'ZZ');
});

test('partenaire « LaNEM » littéral masqué (insensible à la casse)', () => {
  const lic = build([
    { code: 'A', label: 'Licence Droit',   parcours: 'Licence', partner: 'LaNEM', location: 'Cotonou', dd_affinity: '' },
    { code: 'B', label: 'Licence Gestion', parcours: 'Licence', partner: 'lanem', location: 'Cotonou', dd_affinity: '' }
  ]).find(x => x.label === 'Licence');
  assert.ok(lic.options.every(o => !/lanem/i.test(o.text)), 'aucune ligne ne doit contenir LaNEM');
});

test('titre == mot de parcours seul → label conservé (fallback strip vide)', () => {
  const g = build([{ code: 'X', label: 'Licence', parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' }]);
  assert.equal(g[0].options[0].text, 'Licence');
});

test('tri insensible aux accents (Écologie avant Informatique)', () => {
  const lic = build([
    { code: 'I', label: 'Licence Informatique', parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' },
    { code: 'E', label: 'Licence Écologie',      parcours: 'Licence', partner: '', location: 'Cotonou', dd_affinity: '' }
  ]).find(x => x.label === 'Licence');
  assert.deepEqual(lic.options.map(o => o.text), ['Écologie', 'Informatique']);
});

test('plusieurs parcours inconnus → un seul groupe « Autres »', () => {
  const g = build([
    { code: 'A', label: 'Mastère Spécialisé', parcours: 'MS',  partner: '', location: 'Cotonou', dd_affinity: '' },
    { code: 'B', label: 'MBA Executive',       parcours: 'MBA', partner: '', location: 'Cotonou', dd_affinity: '' }
  ]);
  const autres = g.filter(x => x.label === 'Autres');
  assert.equal(autres.length, 1);
  assert.equal(autres[0].options.length, 2);
});
