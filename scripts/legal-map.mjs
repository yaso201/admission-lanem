/**
 * legal-map.mjs — Carte de PRÉSENTATION des pages légales dérivées du back.
 * -----------------------------------------------------------------------
 * [LEGAL-SOURCE-UNIQUE] Le back (`Admission Legal Document`) est la source
 * unique des TEXTES juridiques. Ce fichier ne contient AUCUN texte juridique :
 * seulement le routage/présentation front (slug d'URL ↔ document_type back ↔
 * titre affiché), stable et non signé.
 *
 * Seuls les 4 document_type RÉELLEMENT SIGNÉS par le candidat (hash copié dans
 * Admission Consent Record.version_hash) sont dérivés ici — ce sont les seuls
 * à exister en double (front+back) et donc les seuls exposés à la divergence.
 * `mentions-legales` et `donnees-personnelles` restent front-only (non signés,
 * sans jumeau back) — cf. plan 2026-08-11-legal-source-unique.md (décision A1).
 * `SIMULATION_DISCLAIMER` n'est pas une page (affiché inline via get_frais).
 */
export const LEGAL_MAP = [
  { slug: 'cgv', documentType: 'CGV', titre: 'Conditions générales de candidature en ligne' },
  { slug: 'politique-de-confidentialite', documentType: 'PRIVACY_POLICY', titre: 'Politique de confidentialité' },
  { slug: 'politique-de-remboursement', documentType: 'REFUND_POLICY', titre: 'Politique de remboursement et droit de rétractation' },
  { slug: 'consentement-transfert-donnees', documentType: 'DATA_TRANSFER_CONSENT', titre: 'Transferts de données vers des États tiers' },
];
