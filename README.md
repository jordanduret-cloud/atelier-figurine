# Atelier Figurine

Transforme une planche multi-vues (4, 8 ou 12 angles) d'un personnage ou d'un bâtiment en modèle 3D coloré posé sur un socle, avec aperçu interactif et export STL + GLB (dans un .zip).

La page est autonome (un seul fichier HTML, aucune dépendance serveur) : `dist/atelier-figurine.html`.

## Utilisation
```
npm run build      # génère dist/atelier-figurine.html
npm test           # tests du moteur sur une planche synthétique (Node)
```

## Structure
- `src/engine.js` : moteur (détourage, découpe des vues, alignement, enveloppe visuelle multi-angles, maillage Surface Nets, couleurs, export STL/GLB/ZIP). Fonctionne dans le navigateur et dans Node.
- `src/template.html` : interface (français), aperçu three.js, générateur de prompts pour l'image.
- `tests/` : scripts de validation (maillage fermé, IoU contre un modèle de référence, robustesse : ordre inversé, décalages, fonds bruités…).
- `tools/render.py` : rendu de contrôle des maillages.

## Convention des vues
Mode 4 vues : gauche, face, droite, dos (rôles réglables).
Modes 8 et 12 vues : azimut 360°·k/N, 0° = face, puis rotation vers la gauche du personnage. Angles réglables par vue.

## Limites connues
Le volume vient uniquement des silhouettes : les creux (bouche, cour intérieure, porche) sont comblés, la profondeur des membres est estimée. Les couleurs sont portées par les sommets (pas de textures UV).

## Feuille de route (usage jeu vidéo)
1. Tester des générateurs image-vers-3D par IA (Tripo, Meshy, Rodin, Hunyuan3D, TRELLIS…) avec les mêmes planches ; vérifier qualité, entrées multi-vues, licence commerciale.
2. Faire de cet outil l'étape de préparation : détourage, découpe, contrôle de cohérence, prompts.
3. Sortie adaptée aux moteurs de jeu : texture UV cuite, maillage simplifié + LOD, export glTF/FBX, pivot aux pieds, échelle.
4. Personnages : rig automatique (pose en A), bâtiments : éléments modulaires.


## Export jeu (Cosmos Colonies)

Depuis les réponses du jeu (`docs/reponses-jeu.md`), la page propose un export dédié :

- GLB 2.0 **texturé** (UV + une texture couleur 1024 px bâtiment / 2048 px personnage), sans socle ;
- maillage allégé automatiquement vers la cible : bâtiment 30 000, personnage 50 000, vaisseau 80 000 triangles ;
- repère : Y vers le haut, pieds à Y = 0, centre de l'emprise en X = Z = 0, face avant vers +Z, hauteur 1 (le jeu recadre) ;
- nom `<monde>-<type>.glb` (ex. `mars-caserne.glb`), livré dans un .zip ;
- 4 vues : angles déduits des rôles (face 0°, gauche 90°, dos 180°, droite 270°).

Code : `reconstructGame`, `buildAtlasMesh`, `exportGLBTextured` dans `src/engine.js`. Tests : `tests/test9.js` (moteur), `tests/ui-game.js` (navigateur).
Limites : les toits et faces horizontales sont de simples aplats de couleur ; pas de LOD, FBX ni squelette (inutiles pour l'instant).

## Appli installable (GitHub Pages)

`node build.js` produit aussi `site/` (PWA : manifeste, icônes, service worker, three.js embarqué). Le workflow `.github/workflows/pages.yml` la publie à chaque envoi sur `main` ; réglage unique : Settings → Pages → Source : « GitHub Actions ». Adresse : https://jordanduret-cloud.github.io/atelier-figurine/. Hors artifact, le téléchargement passe par un lien classique.
