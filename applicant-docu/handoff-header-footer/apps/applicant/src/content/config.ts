/**
 * emela · Admission — Content Collections (Astro 5)
 * ---------------------------------------------------
 * Collections de contenu éditorial, alignées 1:1 avec Sveltia CMS.
 * Séparation DEC-210 : ici = contenu éditorial uniquement.
 * Les données métier (frais, programmes, bourses) sont dans data-imports/.
 * Les données établissement (identité/contact) sont dans src/config/ecole.ts.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Lede blocks des étapes du tunnel (eyebrow, titre, description, points). */
const etapes = defineCollection({
  type: 'data',
  schema: z.object({
    eyebrow: z.string(),
    titre: z.string(),
    description: z.string(),
    points: z.array(
      z.object({
        icon: z.string(),
        titre: z.string(),
        detail: z.string(),
      }),
    ),
  }),
});

/** Messages de résultat (succès paiement, échec, SOP, confirmation). */
const messages = defineCollection({
  type: 'data',
  schema: z.object({
    titre: z.string(),
    corps: z.string(),
    variante: z.enum(['succes', 'echec', 'sop', 'info', 'confirmation']),
  }),
});

/** Messages d'aide, réassurance, bannières (OTP, ACO, FAQ). */
const aide = defineCollection({
  type: 'data',
  schema: z.object({
    contexte: z.string(),
    texte: z.string(),
    titre: z.string().optional(),
  }),
});

/**
 * Pages légales (CGV, confidentialité, remboursement, consentement).
 * Markdown long-format → loader `glob` (API moderne Astro 5).
 * Le slug de la page = nom du fichier (ex. cgv.md → /legal/cgv).
 */
const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    titre: z.string(),
    date_effet: z.string().optional(), // ex. "1er septembre 2026"
    version: z.string().optional(), // ex. "V1.0"
  }),
});

export const collections = { etapes, messages, aide, legal };
