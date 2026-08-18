/* CONTRAT-1 — vérif de contrat côté CONSOMMATEUR (JS), miroir de admission/contracts/consumer.py.
   Le MÊME JSON Schema sert le back (Python) et le front (JS). Les schémas ici sont une COPIE
   DÉCLARÉE du canonique back `admission/contracts/schemas/` ; la garantie que le back sert bien
   ces champs est portée par le test back de conformité (test_contract_back.py). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export function loadSchema(id) {
  return JSON.parse(readFileSync(join(HERE, 'schemas', id + '.json'), 'utf8'));
}

/** Le chemin `a.b.c` que le front LIT existe-t-il dans le data-schéma ? (E-02 : `data.total` → false) */
export function pathInSchema(dataSchema, dotted) {
  let node = dataSchema;
  for (const part of dotted.split('.')) {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'array' && node.items) node = node.items; // hop transparent dans un tableau
    const props = node.properties || {};
    if (!(part in props)) return false;
    node = props[part];
  }
  return true;
}

/** Tous les champs consommés par le front sont-ils garantis par le contrat ? Renvoie les manquants. */
export function missingFromContract(dataSchema, consumedPaths) {
  return consumedPaths.filter((p) => !pathInSchema(dataSchema, p));
}
