# UPLOAD-DND — Glisser-déposer des pièces (candidat desktop) — Preuves

**Mandat :** ajouter le glisser-déposer au téléversement des pièces (`/pieces`), **additif** au sélecteur, sans rien coûter au mobile. Protocole : recon courte → une pause → exécution → rapport, *arrêt au push*.
**Branche :** `mandat/upload-dnd` sur l'applicant, tête PROD **`d7c26a6`** (DS-CLEAN §5).

| Autorisé (write-set) | Touché ? |
|---|---|
| `src/pages/pieces.astro` (script DnD + CSS `.is-dragover`/`.up-note` + garde document) | ✅ **seul fichier modifié** |
| `admission-tunnel.js` | ❌ **intact** → aucun bump `?v=` (reste `?v=7`) |
| Tout fichier back | ❌ aucun |

**CONTRAT-2** : aucune branche applicant `contrat-2` sur le remote ; mon write-set est `pieces.astro` seul → disjonction confirmée.

---

## 1. Recon — le meilleur des cas
- **Le chemin de téléversement est unique** : `fileInput` → `startUpload(code, file)` (validation client : ext ∈ pdf/jpg/jpeg/png, taille ≤ 5 Mo) → `AT.api.uploadPieceFile` (XHR multipart, progression, reprise `LS_KEY`). Le DnD **entre par `startUpload`** → hérite validation + progression + reprise, **aucun second chemin** (DEC-C).
- **La zone existe déjà** : `dropZone(p)` rend un `label.em-file-drop`, sur les états `missing` et `rejected`.
- **`admission-tunnel.js` non nécessaire** : tout tient dans `pieces.astro` → **pas de bump**.
- **Pièce déjà déposée** : état `deposee` = bouton « Remplacer » (geste délibéré), `verified` = figé — **pas de zone visible, donc pas de DnD** (DEC-B exige une zone claire ; un fichier lâché par inadvertance ne doit pas écraser un document validé). Cohérent : DnD là où il y a une vraie zone.

## 2. Correctif (`pieces.astro` seul)
- **DnD additif** sur `.em-file-drop` : `dragover` (preventDefault + `dropEffect='copy'` + `.is-dragover`), `dragleave` (retire la classe, garde d'`relatedTarget` anti-flicker), `drop` (preventDefault + `startUpload(code, files[0])`). Sélecteur + lien « parcourez » **conservés** (DEC-A).
- **`.is-dragover`** (DEC-B) : jetons DS (`--violet`, `--violet-soft`, anneau interne `box-shadow inset`), un cran plus marqué que `:hover`.
- **Multi-fichiers** (DEC-D) : `files.length > 1` → `files[0]` + note « Plusieurs fichiers déposés — seul le premier a été pris. » portée dans `live[code]`, rendue dans le bloc `role=status aria-live=polite` → **annoncée aux lecteurs d'écran**.
- **Mauvais type/taille** (DEC-E) : aucun code neuf — `startUpload` pose déjà le message **dans la zone**, avant l'envoi.
- **Garde document** (DEC-G) : `document` capture `dragover`/`drop` et `preventDefault` **hors** `.em-file-drop` → un fichier lâché à côté n'ouvre pas le navigateur.
- **Mobile** (DEC-F) : **aucun handler `touch*`** ; les événements drag sont pointeur-seuls → nul effet au toucher ; le chemin tap→sélecteur→`startUpload` est intact.

## 3. Check-list de sortie — 9 points prouvés (jsdom pleine page + axe-core)
| # | Cas | Preuve jsdom |
|---|---|---|
| **1** | glisser un fichier → téléversé comme par le sélecteur | `drop(zone, cni.pdf)` → `uploadPieceFile('cni.pdf')` appelé (même chemin) |
| **2** | le bouton « Choisir un fichier » marche à l'identique | `change` du sélecteur → `uploadPieceFile('selfie.jpg')` appelé |
| **3** | navigation clavier intacte, `axe-core` **0 violation** sur `/pieces` | `axe.run(wcag2a+aa)` → **0 violation** |
| **4** | retour visuel au survol, jetons DS | `dragover` → `.is-dragover` ajouté (+ `preventDefault`) ; `dragleave` → retiré |
| **5** | plusieurs fichiers → premier pris, signalé | `drop([a,b])` → un seul envoi (`a.pdf`) + `.up-note` « seul le premier » en `aria-live` |
| **6** | mauvais type/trop gros → message dans la zone, **avant** envoi | `drop(x.exe)` → « PDF, JPG ou PNG » + **0 envoi** ; `drop(6 Mo)` → « 5 Mo » + **0 envoi** |
| **7** | fichier lâché hors zone → le navigateur n'ouvre pas | `drop` sur `document.body` → `defaultPrevented = true` |
| **8** | mobile inchangé | sélecteur (`change`) appelle toujours `startUpload` ; **aucun `addEventListener('touch…')`** dans le lot |
| **9** | `?v=` non bumpé (tunnel intact) · build propre · aucun back | `admission-tunnel.js` non modifié ; `astro build` **20 pages Complete** ; write-set = `pieces.astro` seul |

## 4. Rendu de la zone — 3 états (capture jsdom, livrable §7)
```html
── REPOS ──
<label class="em-file-drop">
  <input type="file" accept=".pdf,.jpg,.jpeg,.png">
  <span class="em-file-drop-icon">↑</span>
  <span class="em-file-drop-title">Prenez une photo ou <span class="lnk">parcourez vos fichiers</span></span>
  <span class="em-file-drop-hint">CNI, passeport ou CIP · PDF, JPG ou PNG · 5 Mo max</span>
</label>

── SURVOL (fichier au-dessus) ──
class="em-file-drop is-dragover"   (bordure --violet · fond --violet-soft · anneau interne)

── ERREUR (mauvais type, AVANT envoi) ──
<div class="uperror" role="alert">
  <span class="uperror-title">L'envoi a échoué.</span>
  <span class="uperror-text">Format non accepté — envoyez un PDF, JPG ou PNG.</span>
  <button>Choisir un autre fichier</button>   ← le sélecteur reste (DEC-A)
</div>
```

## 5. Arrêt au push
Conformément au protocole : arrêt au push de `mandat/upload-dnd`. Fusion et déploiement (Cloudflare Pages, push main→build) appartiennent à l'architecte. **Aucun back, aucune migration, aucun bump `?v=`.**
