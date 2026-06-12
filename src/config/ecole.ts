/**
 * emela · Admission — Constantes établissement (LaNEM)
 * -----------------------------------------------------
 * Données INSTITUTIONNELLES (identité + coordonnées de l'école).
 * Ce ne sont PAS du contenu éditorial CMS (séparation DEC-210) :
 * elles ne changent quasiment jamais et sont consommées au build.
 *
 * Source unique : Header, Footer, FooterLegalStrip et les pages
 * terminales lisent ici — aucune chaîne en dur ailleurs.
 */

export const ecole = {
  identity: {
    name: 'LaNEM',
    fullName: 'LaNEM — La Nouvelle École des Métiers',
    subtitle: "Université privée d'informatique et du numérique",
    slogan: 'Oser, Innover, Bâtir !',
  },
  contact: {
    email: 'bonjour@lanem.bj',
    admissionsEmail: 'admissions@lanem.bj',
    phone: '+229 01 54 54 50 54',
    phoneHref: 'tel:+2290154545054',
    whatsapp: 'https://wa.me/2290154545054',
    address:
      "Quartier Menontin, Rue de l'A.B.S.S.A, non loin de Canal 3 Bénin. Cotonou, BÉNIN.",
    addressShort: 'Cotonou · Bénin',
    mapHref: 'https://maps.app.goo.gl/NNEV5sor2Bd6JazUA',
  },
  /** Liens légaux — slug = nom de fichier de la collection `legal` (sans .md). */
  legalLinks: [
    { slug: 'cgv', label: 'Conditions générales de vente' },
    { slug: 'politique-de-confidentialite', label: 'Politique de confidentialité' },
    { slug: 'politique-de-remboursement', label: 'Politique de remboursement' },
    { slug: 'consentement-transfert-donnees', label: 'Consentement au transfert de données' },
  ],
} as const;

export type Ecole = typeof ecole;
