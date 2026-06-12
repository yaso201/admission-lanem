/**
 * emela · Admission — Content Collections (Astro 5)
 * ---------------------------------------------------
 * Collections de contenu editorial, alignees 1:1 avec Sveltia CMS.
 * Separation DEC-210 : ici = contenu editorial uniquement.
 * Les donnees metier (frais, programmes, bourses) sont dans data-imports/.
 * Les donnees etablissement (identite/contact) sont dans src/config/ecole.ts.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Lede blocks des etapes du tunnel (eyebrow, titre, description, points). */
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

/** Messages de resultat (succes paiement, echec, SOP, confirmation). */
const messages = defineCollection({
  type: 'data',
  schema: z.object({
    titre: z.string(),
    corps: z.string(),
    variante: z.enum(['succes', 'echec', 'sop', 'info', 'confirmation']),
  }),
});

/** Messages d'aide, reassurance, bannieres (OTP, ACO, FAQ). */
const aide = defineCollection({
  type: 'data',
  schema: z.object({
    contexte: z.string(),
    texte: z.string(),
    titre: z.string().optional(),
  }),
});

/**
 * Pages legales (CGV, confidentialite, remboursement, consentement).
 * Markdown long-format -> loader `glob` (API moderne Astro 5).
 * Le slug de la page = nom du fichier (ex. cgv.md -> /legal/cgv).
 */
const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    titre: z.string(),
    date_effet: z.string().optional(),
    version: z.string().optional(),
  }),
});

export const collections = { etapes, messages, aide, legal };
