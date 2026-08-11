/**
 * pull-legal.mjs — [LEGAL-SOURCE-UNIQUE] Dérivation build-time des textes légaux.
 * -----------------------------------------------------------------------------
 * Le back (`Admission Legal Document`) est la SOURCE UNIQUE. Au build (avant
 * `astro build`), ce script tire les textes actifs via l'endpoint public
 * `admission.api.public.get_legal_documents` (le même que le runtime paiement),
 * puis GÉNÈRE les 4 pages légales signées dans src/content/legal/ + un manifeste
 * de cohérence. Les pages restent 100 % statiques (3G) : aucun fetch runtime.
 *
 * FAIL-CLOSED (le garde-fou de l'option build-time) :
 *   - PUBLIC_API_BASE requis (pas de défaut localhost : un build prod sans env
 *     correct ÉCHOUE au lieu d'afficher les mauvais textes) ;
 *   - HTTP ≠ 200, enveloppe ok=false, type requis absent, ou content_text vide
 *     ⇒ on LÈVE (exit ≠ 0) et `astro build` n'est jamais atteint ;
 *   - les .md générés sont SUPPRIMÉS d'abord : jamais de page obsolète/vide qui parte.
 *
 * Idempotent : même contenu back ⇒ mêmes .md + même manifeste (aucun horodatage).
 */
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT = '/api/method/admission.api.public.get_legal_documents';

/** Échappe une chaîne pour un scalaire YAML double-quoté. */
function yamlStr(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** Formate une date ISO (YYYY-MM-DD) en français long, déterministe (UTC). */
function formatFrDate(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Construit le Markdown généré (frontmatter conforme au schéma collection `legal`). */
function renderMd({ titre, version, effectiveDate, contentText }) {
  const fm = ['---', `titre: ${yamlStr(titre)}`];
  const dateEffet = formatFrDate(effectiveDate);
  if (dateEffet) fm.push(`date_effet: ${yamlStr(dateEffet)}`);
  if (version) fm.push(`version: ${yamlStr(version)}`);
  fm.push('---', '');
  // Bandeau : page dérivée du back (traçabilité + rappel « ne pas éditer ici »).
  fm.push('<!-- GÉNÉRÉ depuis Admission Legal Document (back = source unique). Ne pas éditer à la main. -->', '');
  return fm.join('\n') + (contentText || '').trim() + '\n';
}

/**
 * Tire les textes légaux du back et génère les pages + le manifeste.
 * @returns {{ manifest: object, files: string[] }}
 * @throws en cas d'échec (fail-closed) — l'appelant DOIT propager (exit ≠ 0).
 */
export async function pullLegal({ apiBase, contentDir, manifestPath, map, fetchImpl = globalThis.fetch }) {
  if (!apiBase) {
    throw new Error('[pull-legal] PUBLIC_API_BASE requis (aucun défaut) — build interrompu pour ne pas figer de mauvais textes.');
  }

  // 1) Purge d'abord les .md générés : un échec ne laisse JAMAIS de page obsolète.
  const targets = map.map((e) => ({ ...e, file: join(contentDir, `${e.slug}.md`) }));
  for (const t of targets) {
    try { await unlink(t.file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }

  // 2) Fetch back (endpoint public, éprouvé runtime).
  const url = apiBase.replace(/\/$/, '') + ENDPOINT;
  let resp;
  try {
    resp = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch (e) {
    throw new Error(`[pull-legal] back injoignable au build (${url}) : ${e.message}`);
  }
  if (!resp.ok) {
    throw new Error(`[pull-legal] HTTP ${resp.status} sur ${url} — textes légaux irrécupérables.`);
  }
  const body = await resp.json();
  const payload = (body && body.message) || body;
  if (!payload || payload.ok !== true || !payload.data || !payload.data.documents) {
    throw new Error('[pull-legal] enveloppe inattendue (ok/data/documents manquants) — build interrompu.');
  }
  const documents = payload.data.documents;

  // 3) Génère chaque page mappée — chaque manquant/vide LÈVE (fail-closed).
  const manifest = {};
  const written = [];
  await mkdir(contentDir, { recursive: true });
  for (const t of targets) {
    const doc = documents[t.documentType.toLowerCase()]
      || Object.values(documents).find((d) => d && d.type === t.documentType);
    if (!doc) {
      throw new Error(`[pull-legal] document_type actif absent côté back : ${t.documentType} — build interrompu.`);
    }
    if (!doc.content_text || !String(doc.content_text).trim()) {
      throw new Error(`[pull-legal] content_text vide pour ${t.documentType} — build interrompu.`);
    }
    if (!doc.content_hash) {
      throw new Error(`[pull-legal] content_hash absent pour ${t.documentType} — build interrompu.`);
    }
    const md = renderMd({ titre: t.titre, version: doc.version, effectiveDate: doc.effective_date, contentText: doc.content_text });
    await writeFile(t.file, md, 'utf8');
    written.push(t.slug);
    manifest[t.documentType] = { version: doc.version || '', content_hash: doc.content_hash };
  }

  // 4) Manifeste de cohérence (clés triées → déterministe) pour la sonde OBS-2.
  const sorted = {};
  for (const k of Object.keys(manifest).sort()) sorted[k] = manifest[k];
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

  return { manifest: sorted, files: written };
}

// ---- CLI : lancé par `npm run build`/`dev` avant Astro. --------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const appRoot = join(here, '..');
  const { LEGAL_MAP } = await import('./legal-map.mjs');
  try {
    const res = await pullLegal({
      apiBase: process.env.PUBLIC_API_BASE || '',
      contentDir: join(appRoot, 'src', 'content', 'legal'),
      manifestPath: join(appRoot, 'public', 'legal-manifest.json'),
      map: LEGAL_MAP,
    });
    console.log(`[pull-legal] OK — ${res.files.length} pages dérivées du back : ${res.files.join(', ')}`);
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  }
}
