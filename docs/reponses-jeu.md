# Réponses pour l'Atelier Figurine — projet Cosmos Colonies

Réponses tirées du code du jeu (`cosmos-colonies.html`, dossiers `art/` et `models/`) au 22 novembre 2026. « Inconnu » = absent du projet ; une valeur par défaut est alors proposée.

## 1. Moteur et plateforme

| # | Question | Réponse | Valeur par défaut proposée |
|---|---|---|---|
| 1 | Moteur et version | Aucun moteur de jeu : page web unique en HTML/JavaScript, 3D faite avec three.js r128 (WebGL). | — |
| 2 | Plateformes | Navigateur de téléphone, écran en portrait (maquette à 390 px de large). Dépôt GitHub prévu pour la mise en ligne. | Web mobile d'abord ; PC navigateur en bonus. |
| 3 | Format d'import 3D | GLB/glTF en entrée. Le jeu ne lit pas le GLB directement : un script le convertit en JSON compressé + texture WebP (`models/<nom>.json` et `models/<nom>-tex.webp`). | GLB avec UV et une texture de couleur intégrée. |

## 2. Style visuel

| # | Question | Réponse | Valeur par défaut proposée |
|---|---|---|---|
| 4 | Style | Science-fiction « réaliste stylisé » de jeu mobile, très détaillé. Références : cartes des personnages (`art/*-card.webp`), planches de bâtiments par monde (`art/bat/<monde>/`), vaisseaux 3D (`models/ship-*`). | Rester sur ce style ; éviter le low-poly. |
| 5 | Vue de jeu | Colonie : vue de 3/4 plongeante, bâtiments petits (environ 80 à 100 px à l'écran). Visionneuses 3D (bâtiment, vaisseau, personnage) : plein écran, on tourne autour de l'objet. | Détail lisible de près en visionneuse, silhouette claire de loin. |
| 6 | Palette | Une palette par monde : Terre blanc/gris/doré, Lune gris régolithe et doré, Mars rouge sombre et noir… Interface bleu nuit, cyan et ambre. | Reprendre les couleurs de la planche 2D de chaque bâtiment. |

## 3. Budgets techniques

| # | Question | Réponse | Valeur par défaut proposée |
|---|---|---|---|
| 7 | Triangles maximum | Pas de limite écrite. Modèles actuels après réduction : vaisseaux 90 000 à 210 000 triangles, personnages 3D 130 000 à 260 000, QG lunaire (Atelier) 50 000. | Bâtiment ≤ 30 000, personnage ≤ 50 000, vaisseau ≤ 80 000 (chargement mobile). |
| 8 | Texture et matériaux | Une seule texture de couleur 2048 × 2048 en WebP par modèle ; matériau standard avec rugosité fixe, pas de PBR complet. Le QG lunaire utilise des couleurs portées par les sommets, sans texture. | Bâtiments 1024 px, vaisseaux et personnages 2048 px ; couleur seule (UV + texture plutôt que couleurs par sommet). |
| 9 | Niveaux de détail (LOD) | Aucun. | Un seul niveau, le modèle allégé. |
| 10 | Échelle, unités, origine | Pas d'unité réelle : le jeu recadre chaque modèle au chargement. Vaisseaux : longueur sur l'axe X, centrés, moteurs vers +X. Bâtiments : base posée à Y = 0, emprise ramenée à un rayon de 1. | Origine au centre de la base (aux pieds), Y vers le haut, face avant vers +Z, pas de socle. |

## 4. Personnages

| # | Question | Réponse | Valeur par défaut proposée |
|---|---|---|---|
| 11 | Nombre, animation | Environ 76 personnages en cartes 2D (dont 19 de l'événement Nyxara). 4 ont un modèle 3D (Léa, K-7, Oréa, Azur). Aucun n'est animé : la 3D sert de vitrine qui tourne. | Pas d'animation pour l'instant. |
| 12 | Squelette, pose | Aucun squelette. | Pose en A acceptée, pas de rig. |
| 13 | Parties séparées | Non, chaque personnage est un seul bloc. | Un seul bloc ; arme fusionnée au corps. |

## 5. Bâtiments et décors

| # | Question | Réponse | Valeur par défaut proposée |
|---|---|---|---|
| 14 | Nombre, taille, distance | 9 types de bâtiments × 20 mondes = 180 modèles à terme (chaque monde a son design). 15 parcelles par colonie. Vus petits sur la colonie, en grand dans la visionneuse 3D. Priorité : Terre, Lune et Mars. | Commencer par les 27 bâtiments de Terre, Lune et Mars. |
| 15 | Modulaire ou bloc | Un seul bloc par bâtiment, et une image par niveau d'apparence. | Un seul bloc, volumes pleins et compacts. |
| 16 | Collisions, intérieurs | Ni intérieur, ni collision : on touche la parcelle, pas le modèle. | Aucun. |

## 6. Production

| # | Question | Réponse | Valeur par défaut proposée |
|---|---|---|---|
| 17 | Génération en jeu ou hors ligne | Hors ligne uniquement : le jeu charge des fichiers déjà préparés. | Outil de développement, pas d'appel IA dans le jeu. |
| 18 | Budget et licence IA 3D | Inconnu. Services déjà utilisés : Meshy et Tripo (texte → 3D et image → 3D). | Formule payante avec usage commercial inclus, à vérifier pour chaque service avant une sortie publique. |
| 19 | PC avec carte graphique | Inconnu. | Ne pas en dépendre : services en ligne, ou génération par Claude dans le cloud. |
| 20 | Rangement et nommage | `models/<nom>.json` + `models/<nom>-tex.webp` ; vaisseaux `models/ship-<monde>` ; bâtiments `models/bat/<monde>-<type>.json` (ex. `lune-qg`). Types : qg, ext0, ext1, depot, comptoir, caserne, labo, chantier, usine. | GLB source nommé `<monde>-<type>.glb` (ex. `mars-caserne.glb`) ; Claude fait la conversion. |

## Conclusion pour l'Atelier

La sortie la plus utile pour le jeu est un GLB texturé avec UV (une texture de couleur, 1024 à 2048 px), sans socle, d'environ 30 000 triangles pour un bâtiment, orienté Y vers le haut avec l'origine au centre de la base. Les LOD, le format FBX et les squelettes ne servent pas pour l'instant.
