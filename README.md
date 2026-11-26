# Contrôle — Deux régimes totalitaires

Application web pédagogique en français pour des élèves de troisième : comparer l'URSS de Staline et l'Allemagne nazie, vérifier un tableau de synthèse, puis construire une carte mentale sourcée.

**Site en ligne :** https://louskyfly.github.io/enquete-regimes-totalitaires/

> **Version contrôle** : les indices, les synthèses de dossier et les corrections automatiques sont masqués côté élèves. Les réponses du binôme (questions, mécanismes, tri, carte, conclusion) sont exportées dans le PDF et peuvent être **envoyées au professeur**, qui les corrige dans l'onglet **Correction** du même site. Pour revenir à la version d'entraînement, passer `CONTROL_MODE` à `false` dans `content.js`.

## Ce que fait l'application

L'activité est calibrée pour **une heure, en binôme**. Le parcours suit sept étapes :

1. **Briefing** : mission, objectifs, avertissement sur les contenus difficiles.
2. **Enquête** : quatre dossiers documentaires courts, en français, avec trois questions d'observation et de contextualisation chacun.
3. **Mécanismes** : six affirmations à attribuer à l'URSS, à l'Allemagne nazie ou aux deux.
4. **Comparer** : douze éléments à trier entre « points communs », « URSS », « Allemagne nazie » et « à vérifier / à nuancer » (dont des images de propagande).
5. **Carte** : canevas déplaçable et zoomable, nœuds, liens, notes, sources, annuler/rétablir. La carte se crée uniquement à partir du tri, puis se modifie librement.
6. **Vérifier** : critères de réussite, conclusion comparative, aperçu et export PDF, envoi au professeur.
7. **Correction** (espace professeur) : ouverture des copies reçues, réponses, barème, saisie des points, correction sous chaque question, total sur 20 et export des notes.

En version contrôle, les étapes 2 à 4 ne donnent ni piste, ni synthèse, ni correction immédiate. Les réponses sont enregistrées puis reprises dans l'export PDF et dans la copie envoyée au professeur.

La progression est enregistrée automatiquement dans le navigateur (IndexedDB, avec repli sur `localStorage`). Aucun compte n'est nécessaire. Une sauvegarde JSON peut être téléchargée et réimportée.

### Identité du binôme

En haut à droite, le binôme renseigne sa classe et les prénoms/noms de **deux élèves**. L'export PDF reprend les deux noms et la classe. Le bouton d'export, comme l'envoi au professeur, reste bloqué tant que l'identité, les questions, les mécanismes, le tri, la carte et la conclusion ne sont pas complets.

## Envoi au professeur et correction

Aucun serveur, aucun compte. La remise passe par un **lien de correction** que le binôme copie et transmet (ENT, messagerie, QR code).

1. Dans l'étape 6, le binôme clique sur **Envoyer au professeur** une fois le dossier complet.
2. Une fenêtre affiche un **lien** contenant toute la copie (compressée et encodée dans l'adresse) et un **code** de secours, plus un fichier JSON téléchargeable. Le lien fait environ 2 000 caractères : c'est prévu pour être copié-collé, pas pour être retapé.
3. Le professeur ouvre le lien, ou colle le lien/le code dans l'onglet **Correction**.
4. La copie s'affiche : réponses du binôme, **barème** à côté de chaque question, **case de points** et **correction rédigée** sous chaque question.
5. Les points sont enregistrés automatiquement sur l'appareil du professeur ; le total sur 20 se met à jour en direct.
6. **Exporter les notes** produit un fichier CSV (classe, binôme, points par item, total) ouvrable dans un tableur.

Le barème totalise 20 points : 12 questions × 0,5 = 6 pts, 6 mécanismes × 0,5 = 3 pts, 12 éléments de tri × 0,25 = 3 pts, carte mentale 4 pts, conclusion 4 pts. Les corrections sont définies dans `content.js` (`points` et `correction` sur chaque question, bloc `EVALUATION`).

Les copies reçues et les notes restent dans le navigateur du professeur. Il est conseillé d'exporter le CSV en fin de séance.

## Les quatre dossiers

| Dossier | Sujet | Sources principales |
|---|---|---|
| 1 | Le stalinisme en actes | Romain Ducoulombier, « Qu'est-ce que le stalinisme ? », EHNE ; Alexandre Sumpf, « 1937-1938 : la Grande Terreur en URSS », EHNE |
| 2 | Comment Hitler détruit la République | Paul Bernard-Nouraud, « Le Reichstag », Histoire par l'image, 2024 ; GHDI, décret du 28 février 1933 et loi des pleins pouvoirs |
| 3 | La race inscrite dans la loi | United States Holocaust Memorial Museum, « Les lois de Nuremberg » |
| 4 | Deux mises en scène de la puissance | Alexandre Sumpf, « Duel architectural à l'Exposition universelle de Paris de 1937 », Histoire par l'image, 2019 |

Les dossiers sont des **synthèses courtes**, pas des recueils de citations. Les textes du GHDI, en allemand et en anglais, sont reformulés en français. Les références complètes et les URL figurent dans l'application (panneau « Sources des quatre dossiers ») et dans l'export PDF.

### Images fournies

Les trois montages du dossier `studio` servent de **décor** : le montage en deux camps est utilisé en filigrane très léger sur le fond, et les deux portraits apparaissent comme des photos d'archives dans le briefing. Ils ne servent pas de documents d'enquête et ne sont pas reproduits dans l'export PDF.

Deux fichiers du dossier `studio` ne sont pas utilisés : `croix-gammees.gif` (croix gammée isolée) et `faucille et marteau.png` (symbole soviétique isolé). Un symbole isolé, sans document à analyser, relèverait d'une esthétique de propagande ou d'un symbole haineux décoratif, ce que la consigne visuelle exclut.

Le tableau de synthèse d'origine n'est pas reproduit dans le dépôt : il n'a pas été fourni dans la session de travail. Les quatre dossiers permettent de le vérifier et de corriger ses formulations trop simples (Hitler « élu », régimes « identiques », nazisme « socialiste », Staline au pouvoir « en 1924 »).

## Lancer l'application en local

L'application est statique, sans build. Les modules JavaScript nécessitent un petit serveur local (ouvrir `index.html` directement avec `file://` ne fonctionne pas dans la plupart des navigateurs).

Avec Python :

```bash
python -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

Avec Node.js :

```bash
npx serve . -l 4173
```

Puis ouvrir <http://localhost:4173>.

## Déploiement GitHub Pages

Le site est publié depuis la branche `main`, à la racine du dépôt. Pour republier après une modification :

```bash
git add .
git commit -m "Mise à jour"
git push
```

GitHub Pages reconstruit automatiquement le site.

## Structure

```text
index.html      structure des sept étapes et des dialogues
styles.css      base visuelle, responsive, styles d'impression
theme.css       thème « dossier d'archives » (pochettes, boîte à outils, filigrane)
correction.css  espace professeur : copies reçues, barème, saisie des points
content.js      contenus historiques, questions, barème, corrections, glossaire, bibliographie
app.js          logique du parcours, identité du binôme, sauvegarde, export, remise, correction
map.js          canevas de carte mentale et rendu spatial imprimable
storage.js      IndexedDB avec repli localStorage
assets/images/  images d'ambiance fournies par l'enseignant
```

Le contenu historique est séparé de l'interface : pour corriger un texte, une date ou une source, modifier `content.js` en priorité.

## Sauvegarde et export

- **Sauvegarde automatique** : étape atteinte, réponses, tri, carte, réglages, conclusion.
- **Reprise** : au retour, l'application propose de reprendre ou de recommencer.
- **Sauvegarde de secours** : fichier JSON téléchargeable et réimportable.
- **Export PDF** : aperçu, puis impression du navigateur avec « Enregistrer au format PDF ». Le document contient le titre, **les noms des deux élèves et la classe**, les réponses aux questions, les choix de mécanismes, le tri, la carte **dans la disposition créée par le binôme sur une page paysage**, le détail des nœuds avec leurs sources, la conclusion et la bibliographie. L'export est bloqué tant que l'identité du binôme, les questions, les mécanismes, le tri, la carte et la conclusion ne sont pas complets.
- **Envoi au professeur** : lien de correction et code de secours (voir plus haut), en plus du PDF si l'établissement préfère le papier.

Les données restent sur l'appareil. Elles peuvent être perdues si le navigateur ou les données du site sont effacés, ou si l'élève change d'appareil. Le cache local ne garantit pas une conservation permanente.

## Limites connues

- **Pas de compte ni de synchronisation** : la sauvegarde est locale, et les copies reçues par le professeur restent dans **son** navigateur. Elles ne sont pas centralisées : il faut exporter le CSV et, si besoin, garder les liens reçus.
- **Remise par lien** : le lien de correction contient les réponses encodées. Il est long ; certaines messageries le coupent. Le code de secours et le fichier JSON permettent de contourner ce problème. Aucune copie ne peut être envoyée directement dans une boîte sans action de l'élève.
- **Pas de verrouillage des notes** : l'élève peut modifier sa copie localement, mais la copie transmise est figée au moment de l'envoi.
- **PDF via l'impression du navigateur** : le rendu dépend du navigateur (Chrome, Edge, Firefox). L'aperçu est là pour vérifier avant impression.
- **Sources secondaires** : EHNE, Histoire par l'image et USHMM sont des analyses d'historiens ; les décrets et lois sont des textes primaires. L'application ne remplace pas un manuel ni une validation par l'enseignant.
- **Langues** : les dossiers sont en français ; les textes originaux du GHDI sont en allemand et en anglais, et sont reformulés.
- **Images** : les trois montages fournis servent de décor (filigrane et photos d'archives) ; ils ne sont pas reproduits dans l'export PDF. Les droits des images fournies ne sont pas vérifiés : elles sont publiées ici à la demande de l'enseignant. Il faut vérifier leur provenance avant une diffusion publique large.
- **Accessibilité** : navigation clavier conservée, contrastes, catégories signalées par couleur + symbole + libellé, vue liste alternative au canevas. Les conseils de raccourcis clavier ont été retirés de l'interface pour privilégier la tablette. Le canevas spatial reste difficile à utiliser avec un lecteur d'écran ; la vue liste est prévue pour cela.

## Droits

- Le code de cette application est publié sous licence MIT (voir `LICENSE`).
- Les textes pédagogiques originaux (synthèses, questions, consignes) sont proposés sous licence CC BY-SA 4.0.
- Les documents sources restent soumis aux conditions de leurs institutions respectives : EHNE (CC BY 4.0), Histoire par l'image (© RMN-Grand Palais et ayants droit), USHMM, GHDI. Les images ne sont pas reproduites dans l'application.

## Vérification des liens

Les liens ont été testés le 26 novembre 2026. Deux réserves : la vidéo Lumni associée à la Grande Terreur est géo-bloquée hors de France ; la Digithèque MJP (Constitution soviétique de 1936) n'est pas utilisée dans le parcours final, pour éviter les problèmes de certificat et de densité.
