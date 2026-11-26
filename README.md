# Enquête sur deux régimes totalitaires

Application web pédagogique en français pour des élèves de troisième : comparer l'URSS de Staline et l'Allemagne nazie, vérifier un tableau de synthèse, puis construire une carte mentale sourcée.

**Site en ligne :** https://louskyfly.github.io/enquete-regimes-totalitaires/

## Ce que fait l'application

Le parcours suit six étapes :

1. **Briefing** : mission, objectifs, avertissement sur les contenus difficiles.
2. **Enquête** : quatre dossiers documentaires courts, en français, avec questions d'observation et de contextualisation.
3. **Mécanismes** : neuf affirmations à attribuer à l'URSS, à l'Allemagne nazie ou aux deux.
4. **Comparer** : quatorze éléments à trier entre « points communs », « URSS », « Allemagne nazie » et « à vérifier / à nuancer ».
5. **Carte** : canevas déplaçable et zoomable, nœuds, liens, notes, sources, modèles, annuler/rétablir.
6. **Vérifier** : checklist, conclusion comparative, aperçu et export PDF.

La progression est enregistrée automatiquement dans le navigateur (IndexedDB, avec repli sur `localStorage`). Aucun compte n'est nécessaire. Une sauvegarde JSON peut être téléchargée et réimportée.

## Les quatre dossiers

| Dossier | Sujet | Sources principales |
|---|---|---|
| 1 | Le stalinisme en actes | Romain Ducoulombier, « Qu'est-ce que le stalinisme ? », EHNE ; Alexandre Sumpf, « 1937-1938 : la Grande Terreur en URSS », EHNE |
| 2 | Comment Hitler détruit la République | Paul Bernard-Nouraud, « Le Reichstag », Histoire par l'image, 2024 ; GHDI, décret du 28 février 1933 et loi des pleins pouvoirs |
| 3 | La race inscrite dans la loi | United States Holocaust Memorial Museum, « Les lois de Nuremberg » |
| 4 | Deux mises en scène de la puissance | Alexandre Sumpf, « Duel architectural à l'Exposition universelle de Paris de 1937 », Histoire par l'image, 2019 |

Les dossiers sont des **synthèses courtes**, pas des recueils de citations. Les textes du GHDI, en allemand et en anglais, sont reformulés en français. Les références complètes et les URL figurent dans l'application (panneau « Sources des quatre dossiers ») et dans l'export PDF.

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
index.html      structure des six étapes et des dialogues
styles.css      identité visuelle, responsive, styles d'impression
content.js      contenus historiques, questions, glossaire, bibliographie
app.js          logique du parcours, sauvegarde, export
map.js          canevas de carte mentale et rendu imprimable
storage.js      IndexedDB avec repli localStorage
```

Le contenu historique est séparé de l'interface : pour corriger un texte, une date ou une source, modifier `content.js` en priorité.

## Sauvegarde et export

- **Sauvegarde automatique** : étape atteinte, réponses, tri, carte, réglages, conclusion.
- **Reprise** : au retour, l'application propose de reprendre ou de recommencer.
- **Sauvegarde de secours** : fichier JSON téléchargeable et réimportable.
- **Export PDF** : aperçu, puis impression du navigateur avec « Enregistrer au format PDF ». Le document contient le titre, le nom de l'élève, la carte, le détail des nœuds avec leurs sources, la conclusion et la bibliographie.

Les données restent sur l'appareil. Elles peuvent être perdues si le navigateur ou les données du site sont effacés, ou si l'élève change d'appareil. Le cache local ne garantit pas une conservation permanente.

## Limites connues

- **Pas de compte ni de synchronisation** : la sauvegarde est locale.
- **PDF via l'impression du navigateur** : le rendu dépend du navigateur (Chrome, Edge, Firefox). L'aperçu est là pour vérifier avant impression.
- **Sources secondaires** : EHNE, Histoire par l'image et USHMM sont des analyses d'historiens ; les décrets et lois sont des textes primaires. L'application ne remplace pas un manuel ni une validation par l'enseignant.
- **Langues** : les dossiers sont en français ; les textes originaux du GHDI sont en allemand et en anglais, et sont reformulés.
- **Images** : aucune image d'archive n'est intégrée, pour des raisons de droits et pour éviter les images choquantes. Les documents sont accessibles par leurs pages d'origine.
- **Accessibilité** : navigation clavier, contrastes, catégories signalées par couleur + symbole + libellé, vue liste alternative au canevas. Le canevas spatial reste difficile à utiliser avec un lecteur d'écran ; la vue liste est prévue pour cela.

## Droits

- Le code de cette application est publié sous licence MIT (voir `LICENSE`).
- Les textes pédagogiques originaux (synthèses, questions, consignes) sont proposés sous licence CC BY-SA 4.0.
- Les documents sources restent soumis aux conditions de leurs institutions respectives : EHNE (CC BY 4.0), Histoire par l'image (© RMN-Grand Palais et ayants droit), USHMM, GHDI. Les images ne sont pas reproduites dans l'application.

## Vérification des liens

Les liens ont été testés le 26 novembre 2026. Deux réserves : la vidéo Lumni associée à la Grande Terreur est géo-bloquée hors de France ; la Digithèque MJP (Constitution soviétique de 1936) n'est pas utilisée dans le parcours final, pour éviter les problèmes de certificat et de densité.
