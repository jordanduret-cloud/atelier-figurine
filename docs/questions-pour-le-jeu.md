# Questions à poser à Claude (projet du jeu vidéo)

Contexte : l'outil « Atelier Figurine » (ce dépôt) transforme une planche multi-vues d'un personnage ou d'un bâtiment, générée par IA, en modèle 3D (aujourd'hui STL/GLB, couleurs portées par les sommets, silhouettes seules). Pour le jeu, il faut adapter la sortie.

Consigne à Claude : réponds à partir du projet du jeu (code, dossiers, configuration). Si une information n'y est pas, écris « inconnu » au lieu de deviner, et propose une valeur par défaut raisonnable.

## 1. Moteur et plateforme
1. Quel moteur de jeu (Unity, Godot, Unreal, autre) et quelle version ?
2. Quelles plateformes visées (PC, mobile, web, console) ?
3. Quel format d'import 3D est le plus simple pour ce moteur (glTF/GLB, FBX, OBJ) ?

## 2. Style visuel
4. Style : low-poly stylisé, cartoon, réaliste ? Existe-t-il des images de référence dans le projet ?
5. Vue de jeu (dessus, 3/4 isométrique, troisième personne, première personne) ? Cela décide du niveau de détail utile.
6. Palette de couleurs ou charte graphique à respecter ?

## 3. Budgets techniques
7. Nombre maximal de triangles par personnage, par bâtiment, par décor ?
8. Taille de texture maximale (512, 1024, 2048 px) et matériaux attendus (couleur seule ou PBR) ?
9. Faut-il des niveaux de détail (LOD) ?
10. Échelle et unités (1 unité = 1 m ?), hauteur type d'un personnage, position du point d'origine (aux pieds ?).

## 4. Personnages
11. Combien de personnages, et lesquels sont animés ?
12. Quel squelette ou système d'animation (humanoïde standard, Mixamo, rig maison) ? La pose en A convient-elle ?
13. Faut-il séparer les parties (tête, armes, équipements interchangeables) ?

## 5. Bâtiments et décors
14. Combien de bâtiments, de quelle taille, et visibles de quelle distance ?
15. Éléments modulaires (murs, toits, portes) ou bâtiments en un seul bloc ?
16. Collisions et intérieurs : faut-il un intérieur accessible ? Quelle forme de collision ?

## 6. Production
17. Le jeu doit-il produire ces modèles à la volée (en jeu) ou seulement pendant le développement (outil hors ligne) ?
18. Quel budget et quelles contraintes pour des services d'IA 3D en ligne (coût par modèle, licence d'usage commercial obligatoire) ?
19. Y a-t-il un ordinateur avec une carte graphique puissante pour lancer un modèle 3D open source en local ?
20. Où ranger les modèles produits dans le projet (dossier, nom des fichiers, convention de nommage) ?

## À rendre
Un court tableau « question → réponse (ou inconnu) → valeur par défaut proposée », à placer dans `docs/reponses-jeu.md`. Avec ces réponses, la prochaine étape de l'Atelier sera choisie : sortie texturée avec UV, LOD, export glTF/FBX, ou appel à un générateur 3D par IA.
