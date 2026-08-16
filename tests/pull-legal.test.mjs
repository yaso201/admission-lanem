import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pullLegal } from '../scripts/pull-legal.mjs';
import { LEGAL_MAP } from '../scripts/legal-map.mjs';

/* pull-legal.mjs — dérivation build-time des textes légaux depuis le back
   (source unique). On teste la LOGIQUE avec un fetch injecté (zéro bench) :
   génération des 4 .md mappés + manifeste, et surtout le FAIL-CLOSED (jamais
   de page légale obsolète/vide qui parte). Contrat back = enveloppe Frappe
   { message: { ok, data: { documents: { <type_lower>: {type,version,content_text,content_hash,effective_date} } } } }. */

function envelope(documents) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { message: { ok: true, data: { documents }, error: null } };
    },
  };
}

/** documents back complets (les 4 types signés + un intrus non mappé). */
function fullDocuments() {
  return {
    cgv: { type: 'CGV', version: 'V1', content_text: 'Texte CGV depuis le back.', content_hash: 'h_cgv', effective_date: '2026-09-01' },
    privacy_policy: { type: 'PRIVACY_POLICY', version: 'V2', content_text: 'Texte confidentialité back.', content_hash: 'h_priv', effective_date: '2026-09-01' },
    refund_policy: { type: 'REFUND_POLICY', version: 'V3', content_text: 'Texte remboursement back.', content_hash: 'h_ref', effective_date: '2026-09-01' },
    data_transfer_consent: { type: 'DATA_TRANSFER_CONSENT', version: 'V4', content_text: 'Texte transfert back.', content_hash: 'h_tra', effective_date: '2026-09-01' },
    simulation_disclaimer: { type: 'SIMULATION_DISCLAIMER', version: 'V9', content_text: 'inline — pas une page', content_hash: 'h_sim', effective_date: '2026-09-01' },
  };
}

async function tmpWorkspace() {
  const root = await mkdtemp(join(tmpdir(), 'legal-'));
  const contentDir = join(root, 'content', 'legal');
  const manifestPath = join(root, 'public', 'legal-manifest.json');
  await mkdir(contentDir, { recursive: true });
  await mkdir(join(root, 'public'), { recursive: true });
  return { root, contentDir, manifestPath };
}

test('génère les 4 .md dérivés (contenu + version du back) + le manifeste', async () => {
  const { contentDir, manifestPath } = await tmpWorkspace();
  const fetchImpl = async () => envelope(fullDocuments());

  const res = await pullLegal({ apiBase: 'https://api.example', contentDir, manifestPath, map: LEGAL_MAP, fetchImpl });

  // 4 fichiers générés, un par type signé.
  assert.equal(res.files.length, 4);
  const cgv = await readFile(join(contentDir, 'cgv.md'), 'utf8');
  assert.match(cgv, /Texte CGV depuis le back\./);   // corps = content_text back
  assert.match(cgv, /version: "V1"/);                 // version = back
  assert.match(cgv, /titre: "Conditions générales de candidature en ligne"/); // titre = carte présentation (legal-map.mjs)

  // le type non mappé (SIMULATION_DISCLAIMER) ne génère PAS de page
  const entries = await readdir(contentDir);
  assert.equal(entries.includes('simulation-disclaimer.md'), false);

  // manifeste = hash compilés, clé = TYPE back, tri déterministe
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), ['CGV', 'DATA_TRANSFER_CONSENT', 'PRIVACY_POLICY', 'REFUND_POLICY']);
  assert.deepEqual(manifest.CGV, { version: 'V1', content_hash: 'h_cgv' });
});

test('FAIL-CLOSED : PUBLIC_API_BASE manquant ⇒ lève (jamais de mauvais textes)', async () => {
  const { contentDir, manifestPath } = await tmpWorkspace();
  await assert.rejects(
    () => pullLegal({ apiBase: '', contentDir, manifestPath, map: LEGAL_MAP, fetchImpl: async () => envelope(fullDocuments()) }),
    /PUBLIC_API_BASE requis/,
  );
});

test('FAIL-CLOSED : HTTP ≠ 200 ⇒ lève', async () => {
  const { contentDir, manifestPath } = await tmpWorkspace();
  const fetchImpl = async () => ({ ok: false, status: 503, async json() { return {}; } });
  await assert.rejects(
    () => pullLegal({ apiBase: 'https://api.example', contentDir, manifestPath, map: LEGAL_MAP, fetchImpl }),
    /HTTP 503/,
  );
});

test('FAIL-CLOSED : un document_type signé absent ⇒ lève', async () => {
  const { contentDir, manifestPath } = await tmpWorkspace();
  const docs = fullDocuments();
  delete docs.refund_policy;
  await assert.rejects(
    () => pullLegal({ apiBase: 'https://api.example', contentDir, manifestPath, map: LEGAL_MAP, fetchImpl: async () => envelope(docs) }),
    /REFUND_POLICY/,
  );
});

test('FAIL-CLOSED : content_text vide ⇒ lève', async () => {
  const { contentDir, manifestPath } = await tmpWorkspace();
  const docs = fullDocuments();
  docs.cgv.content_text = '   ';
  await assert.rejects(
    () => pullLegal({ apiBase: 'https://api.example', contentDir, manifestPath, map: LEGAL_MAP, fetchImpl: async () => envelope(docs) }),
    /content_text vide pour CGV/,
  );
});

test('FAIL-CLOSED : purge les .md générés AVANT d’échouer (aucune page obsolète ne survit)', async () => {
  const { contentDir, manifestPath } = await tmpWorkspace();
  // page obsolète pré-existante (build précédent) qu'un back en panne ne doit pas laisser vivre
  await writeFile(join(contentDir, 'cgv.md'), '---\ntitre: "vieux"\n---\nANCIEN TEXTE OBSOLÈTE\n', 'utf8');
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(
    () => pullLegal({ apiBase: 'https://api.example', contentDir, manifestPath, map: LEGAL_MAP, fetchImpl }),
    /injoignable/,
  );
  // le .md obsolète a été supprimé → aucune page légale périmée ne peut partir
  await assert.rejects(() => readFile(join(contentDir, 'cgv.md'), 'utf8'), /ENOENT/);
});
