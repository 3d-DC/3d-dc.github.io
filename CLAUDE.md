# DC modulaire 3D

Démo Three.js d'un datacenter modulaire sur deux sites (`DC1`, `DC2`) reliés par fibre, avec scénarios de reprise après sinistre, construction de 1 à 5 modules par site (côte à côte ou en étage), circuits techniques animés (air, climatisation, incendie, énergie), visite à pied et inspection des baies jusqu'aux composants d'un serveur. Aucun nom de ville ni repère géographique ne doit apparaître : les sites restent `DC1` et `DC2`.

## Commandes

- `npm run dev` : serveur de développement Vite (port 5173 via `.claude/launch.json`)
- `npm run typecheck` : vérification TypeScript seule
- `npm run build` : vérification des types puis build de production dans `dist/`

## Déploiement

GitHub Pages, par l'action `.github/workflows/deploy.yml` : à chaque envoi sur `main`, elle installe, compile et publie `dist/`. Réglage unique dans le dépôt : Settings › Pages › Source : « GitHub Actions ». Dépôt : https://github.com/3d-DC/3d-dc.github.io (organisation `3d-DC`, dépôt public nommé d'après le domaine, donc servi à la racine). Adresse du site : https://3d-dc.github.io. `vite.config.ts` utilise des chemins relatifs (`base: './'`), le site fonctionne donc quel que soit le nom du dépôt.

## Technique

Three.js + Vite + TypeScript strict (`noUncheckedIndexedAccess` activé), sans framework d'interface. Pas de backend ni de stockage : tout l'état vit en mémoire. Aucun modèle 3D ni fichier audio externe : toute la géométrie est construite par le code, les textures sont dessinées sur canvas et les sons synthétisés par Web Audio.

En développement, `window.monde` et `window.son` exposent la scène et le moteur sonore dans la console (par exemple `monde.inspecter('DC1', 1, 'rack-calcul')`), et `window.avancer(s)` fait progresser l'animation de `s` secondes avec l'état réel de l'application. Ce pas-à-pas sert aux vérifications automatisées : quand l'onglet est masqué, `requestAnimationFrame` ne tourne plus.

## Arborescence

- `src/types.ts` : types partagés (`WorldState`, `SiteState` avec `modules`, `assemblage` et `disposition`, `Affichage` avec `circuit`, `etiquettes` et `reperes`, `EquipmentKind`, `Marque`, `Scenario`, `ComposantKind`, `EtatInspection`)
- `src/catalog.ts` : fiches équipements (`Record<EquipmentKind, EquipmentSpec>`, exhaustif par construction)
- `src/baies.ts` : contenu de chaque baie avec marque et modèle (`CONTENU_BAIE`), architecture interne des châssis (`ARCHITECTURE`), fiches composants (`COMPOSANTS`)
- `src/scenarios/scenarios.ts` : état initial et les six scénarios (dont « Construction modulaire ») ; chaque étape porte une `action` qui mute l'état
- `src/scenarios/lecteur.ts` : défilement des étapes ; l'état d'une étape est recalculé depuis l'état initial
- `src/scene/monde.ts` : rendu, caméra et cadrages (jamais sous le terrain : `garderAuDessusDuSol`), fibre à deux voies, trafic utilisateurs, sélection au clic, bascule vers l'inspection et la visite à pied
- `src/scene/site.ts` : un site complet (implantation, modules créés à la demande et placés selon la disposition, escalier et passerelle de l'étage, gaine électrique, groupes électrogènes, interconnexions, surfaces de marche, couche virtuelle des VM) et sa mise à jour à partir de `SiteState`
- `src/scene/conteneur.ts` : `ModuleConteneur`, avec parois à passage (`plein`, `porte`, `retire`), toit éclairé, aérorefroidisseurs et porte pivotante
- `src/scene/interieur.ts` : salle d'un module (plan cœur pour le module 1, plan extension ensuite), énergie, batteries, détecteurs, étiquettes rattachées à leur équipement, obstacles, ancres (baie réseau, tableau, baies de calcul et de stockage)
- `src/scene/circuits.ts` : circuits techniques (courants continus de `flux.ts`, pastilles d'étape, cycle de la démonstration incendie et `etatIncendie`) et leurs textes, partagés avec l'interface
- `src/scene/incendie.ts` : système de sécurité incendie complet d'un module (voir « Incendie »), avec ses voyants et lames animables (`MaterielIncendie`)
- `src/scene/exterieur.ts` : équipements extérieurs
- `src/scene/facades.ts` : façades des équipements par marque et modèle (`facadeUnite`), avec groupes de ports typés et numérotés (RJ45 FE/GE, SFP, SFP+, SFP28, QSFP28, console, gestion) relevés dans `portsUnite`, et façade assemblée d'une baie (`facadeBaie`). Le serveur GPU (R760xa) porte un liseré et un bandeau verts lumineux « SERVEUR GPU · 4× NVIDIA A100 » ; aucun câble n'est branché en façade (choix volontaire, pour la lisibilité)
- `src/scene/serveur.ts` : serveur ou équipement ouvert ; chaque pièce amovible (dissipateur, processeur, barrette, disque, ventilateur, alimentation, carte d'extension, carte A100) est une `Piece` ; son déplacement de sortie ne sert plus qu'à soulever et ranger les dissipateurs
- `src/scene/examen.ts` : modèles détaillés (processeur, dissipateur, barrette DDR5, SSD, A100, ventilateur, alimentation), avec parties de vue éclatée et légendes ; ils remplacent la pièce quand elle se présente devant la caméra
- `src/scene/promenade.ts` : visite à pied à la première personne (souris capturée par un clic, clavier par position physique, accélération et freinage, recherche latérale des ouvertures, collisions et dénivelés via `Site.surface`)
- `src/scene/environnement.ts` : ciel, sol, collines, routes, ligne électrique, esplanade des utilisateurs, emplacements de la végétation
- `src/scene/vegetation.ts` : arbres de savane en low-poly facetté (acacia à branches et plateaux de feuillage, karité à couronne ronde, baobab, arbustes), modèles fusionnés teintés par sommet puis instanciés
- `src/scene/inspection.ts` : scène séparée à trois niveaux : baie (portes, montants, bandeaux de prises, câblage arrière), serveur ouvert vu de haut ou de face, pièce présentée devant la caméra
- `src/scene/flux.ts` : courants continus (gaine translucide teintée le long du trajet, bandes lumineuses qui avancent dans le sens du flux, coudes arrondis par `traceArrondi`) : `Courants` pour les circuits, `Flux` pour les liaisons (une voie, ou deux voies dans une gaine comme la fibre, avec brèche au milieu quand elle est coupée)
- `src/scene/effets.ts`, `textures.ts`, `outils.ts` : fumée, textures, aides
- `src/audio/son.ts` : moteur sonore procédural (singleton `son`) : ambiances, sources spatialisées par site, alarme incendie, bruitages ponctuels
- `src/ui/interface.ts`, `src/style.css` : interface de simulation superposée à la scène (voir « Interface »)

## Principes

- La scène ne décide de rien : elle affiche le `WorldState` fourni à chaque image. Pour ajouter un comportement, étendre l'état puis `Site.maj` ou `Monde.maj`.
- Un objet devient cliquable par `marquer(objet, { kind, site })` ; tout nouveau `EquipmentKind` exige une fiche dans `CATALOGUE`.
- Le module est un 40 pieds double largeur (12,2 m × 4,88 m) : deux rangées de quatre baies en vis-à-vis, allée froide centrale confinée.
- Un site compte de 1 à 5 modules, accolés par leurs longues parois vers l'arrière de la dalle. En mode `cloisonne`, la paroi commune est percée d'un passage ; en mode `fusionne`, elle est retirée. Les groupes électrogènes suivent (1, 2 ou 3).
- En disposition `etage`, les modules se placent par colonnes de deux niveaux (1 et 2 sur la colonne avant, 3 et 4 derrière, 5 au sol). Un escalier à l'avant, une passerelle le long des pignons gauches et un monte-charge au bout de la passerelle desservent l'étage, toujours visibles. Les modules du haut reposent sur ceux du bas ; la vue éclatée (`Affichage.eclatee`, désactivée par défaut) les soulève, avec la passerelle, et affiche des étais.
- La marche à pied choisit, parmi les surfaces (sol et salles du bas, escalier, passerelle et salles de l'étage), celle dont la hauteur est la plus proche du sol courant, dans la limite d'une marche de 50 cm.
- Les étiquettes d'équipement ont trois modes : `aucune`, `survol` (par défaut : seulement l'équipement sous le pointeur, ou visé au centre de l'écran à pied) et `proches` ; elles apparaissent en fondu.
- Les aérorefroidisseurs du toit sont masqués en vue en coupe, sauf avec le circuit de climatisation, et quand un module est posé dessus.
- M ferme ou rouvre le volet de la barre d'outils, H masque toute l'interface ; le volet ouvert est mémorisé dans le navigateur (`localStorage`).
- Les marques (HPE, Dell, Cisco, Fortinet) sont écrites en texte simple sur les façades : aucun logo n'est reproduit.
- La visite à pied utilise les codes de touches physiques (`KeyW`, `KeyA`…) : ZQSD en AZERTY et WASD en QWERTY fonctionnent sans réglage. Un clic capture la souris (Pointer Lock) pour regarder librement ; le clic suivant sélectionne l'équipement au centre de l'écran, E ou Entrée ouvre la baie visée, ← → tournent, N coupe le son, Échap libère la souris puis, une seconde fois, termine la visite. V (ou le bouton « Vue à la première personne ici » du menu) pose le visiteur au point praticable le plus proche du centre de la vue (`Site.pointPres`), tourné comme la caméra ou vers le plus long dégagement ; V à nouveau ramène à la vue orbitale. Il n'y a volontairement pas de vue à la troisième personne ni d'avatar. Quand le pas est bloqué, la marche sonde jusqu'à 45 cm de part et d'autre pour se recentrer dans une porte ou un passage.

## Interface

Interface de simulation (HUD) superposée à la scène ; chaque élément a une place fixe et tout se masque d'un coup (touche H, ou l'œil barré de la barre d'outils ; un bouton discret « Afficher l'interface » reste alors en haut à gauche).
- En haut à gauche : barre d'outils verticale à pictogrammes (SVG tracés dans `interface.ts`, infobulles) ; chaque bouton ouvre son volet à côté (Scénarios, Construction, Visite à pied, Circuits, Points de vue, Affichage, Lumière et son, Légende), un seul à la fois. M ferme le volet ou rouvre le dernier ; le volet ouvert est mémorisé (`dc-modulaire.menu`).
- En haut à droite : télémétrie (`majSimulation`) : un bloc par site (voyant d'état, rôle, jauge de charge, VM, modules, sources d'énergie) et la fibre au milieu ; un clic y emmène la caméra. Dessous, les cartes empilées (fiche de l'équipement ou du composant, explication du circuit), réductibles et fermables.
- En bas au centre : narration des scénarios (réductible) ou, pendant l'inspection, barre d'outils (de haut, de face, dissipateurs, éclater, remettre, baie, site). En bas à gauche : consigne du moment (sous le fil d'Ariane pendant l'inspection, masquée pendant la narration).
- Inspection : fil d'Ariane en haut à gauche avec un bouton de retour ; la barre d'outils et la télémétrie disparaissent. Visite à pied : volet de la visite en haut à gauche (réductible), la télémétrie reste.
- Repères de la scène (étiquettes des sites, de la fibre, des utilisateurs) : compacts, masquables par `Affichage.reperes` (case du volet Affichage, classe `sans-reperes` sur le calque d'étiquettes).
- Style : panneaux sombres presque opaques, filets fins, coins de 6 px, valeurs et touches en police à chasse fixe, un seul accent (`--accent`), pas d'émoji. Les légendes (familles, liaisons, VM) sont dans le volet Légende.

## Mobile et tactile

`MOBILE` (`outils.ts`) détecte un écran tactile ou petit : définition plafonnée à 1,25, ombres en 2048 au lieu de 4096. En portrait, `champVertical` élargit le champ vertical pour garder la largeur de la scène (caméra orbitale, visite, inspection) ; la pièce présentée se dimensionne sur la plus petite dimension de l'écran.
- Gestes : un doigt tourne, deux doigts zooment et déplacent (OrbitControls) ; toucher = clic (tolérance de 12 px), mais la fiche n'apparaît qu'après 320 ms : sinon le tiroir de la fiche recouvrirait la scène avant le second toucher ; deux touchers rapprochés = double-clic, reconnus dans `Monde` (les navigateurs mobiles n'émettent pas toujours `dblclick`). La fiche d'un module (paroi, porte, aérorefroidisseur) propose aussi un bouton « Entrer dans le module », et celle de l'escalier « Visiter à pied ». Pièce présentée : un doigt la tourne, deux la rapprochent (pincement).
- Visite à pied au doigt : pas de capture de la souris ; glisser pour regarder (`Promenade`, événements `pointermove`), joystick en bas à gauche (`Promenade.deplacementTactile`, poussé à fond : course), boutons « Ouvrir » et « Sortir » en bas à droite ; le volet de la visite commence replié.
- Interface (écrans de 760 px et moins) : la barre d'outils devient une barre d'onglets en bas (pictogramme et libellé court), volets et fiches montent du bas en tiroirs, une fiche qui s'ouvre referme le volet, la télémétrie se compacte en haut, la narration passe au-dessus des onglets, la consigne n'apparaît que dans l'inspection. Les consignes tactiles remplacent les consignes clavier et souris. `touch-action: none` sur la scène, marges de sécurité (`env(safe-area-inset-*)`) pour les écrans à encoche.

## Flux et machines virtuelles

- Air, énergie, climatisation, gaz d'extinction, interconnexions, fibre et trafic sont des courants continus (`flux.ts`), plus des particules. L'air passe du bleu (froid) au rouge (chaud) le long de son trajet ; la fibre a deux voies dans une gaine (cyan DC1 → DC2, violet DC2 → DC1) : seule la voie de la réplication s'allume, les deux en synchrone, et une brèche s'ouvre au milieu quand elle est coupée.
- Les VM forment une couche virtuelle au-dessus de chaque site : un plateau translucide où chaque VM est une plaque au nom de son application (pleine si elle tourne, pâle si c'est une réplique), relié par des faisceaux aux baies du module 1 : cyan vers les baies de calcul (qui les exécutent), violet vers la baie de stockage (leurs disques). Le code couleur est expliqué dans la légende du menu. Le plateau monte avec la vue éclatée de l'étage et porte l'étiquette du site.

## Incendie

Système complet dans chaque module (`incendie.ts`), animé par le circuit « Incendie » sur un cycle de 30 s en six phases (`etatIncendie`), qui correspondent aux six étapes de la carte :
1. pré-alarme : détection précoce par aspiration (réseau de prélèvement au plafond de l'allée du fond, unité d'analyse au mur), l'air aspiré remonte le réseau ;
2. alarme feu : double détection sur deux boucles de détecteurs ponctuels, flashs et sirènes, report à la supervision ;
3. asservissements et temporisation : arrêt de la climatisation, clapets coupe-feu fermés, 30 s avant émission ; commandes à l'entrée (alarme manuelle, déclenchement manuel, arrêt d'urgence) ;
4. émission : trois bouteilles d'IG-541, collecteur, montée et réseau de diffusion, quatre diffuseurs ; le clapet de surpression s'ouvre ; dehors, panneau « Évacuation » puis « Gaz émis, ne pas entrer » au-dessus de la porte ;
5. extinction et maintien : 40 % de gaz, oxygène vers 12,5 % ;
6. retour à la normale : ventilation, réarmement.
La carte du circuit affiche le tableau de la centrale en direct (phase, temporisation, gaz, oxygène, asservissements, supervision). Hors démonstration, `CircuitModule.repos` remet tout en veille. Les pastilles d'étape n'apparaissent qu'en vue en coupe ou à pied.

## Double-clic

Décidé dans `main.ts` (`monde.surEntrer`) : une baie s'ouvre dans l'inspection ; un module (paroi, porte, aérorefroidisseur) lance la visite à pied directement à l'intérieur (`Site.pointInterieur`) ; l'escalier lance la visite au pied du site ; tout autre équipement affiche sa fiche et la caméra s'en approche (`Monde.cadrerSur`, toit escamoté pour un équipement de salle). Dans l'inspection, un simple clic suffit (le double-clic n'ajoute rien). À pied, le double-clic vise le centre de l'écran.

Quand on ouvre une baie pendant la visite à pied, le visiteur reste en place : au retour (« Retour au site » ou Échap), la visite reprend au même endroit et dans la même direction (`Monde.reprendre` → `Promenade.reprendre`, qui recapture la souris et ignore un Échap immédiat).

## Lumière

Réglages (`Eclairage` dans `types.ts`), appliqués par `Monde.reglerEclairage` et mémorisés dans le navigateur :
- ambiance `soleil`, `doux` ou `couvert` : intensité du soleil et de la lumière du ciel, reflets, aspect du ciel et de la brume (table `AMBIANCES` de `monde.ts`) ;
- ombres `aucune`, `douces` (flou large, moins sombres) ou `nettes` ;
- luminosité (multiplicateur d'exposition, 50 à 160 %) et lampe du visiteur (0 à 100 %, touche L à pied) ;
- adaptation : à pied, l'exposition monte en douceur sous un toit (`Site.estInterieur`) et redescend dehors.

## Son

Tout est synthétisé dans `src/audio/son.ts` (bruits blanc, rose et brun générés au démarrage, oscillateurs, filtres) ; `Monde.majSon` lui transmet à chaque image la caméra (auditeur), l'immersion (`dedans` : 1 à pied sous un toit, 0,75 devant une baie ouverte, 0 dehors) et l'état des sites, même pendant l'inspection.
- Ambiances : vent dehors ; sous un toit, l'extérieur s'assourdit (filtre passe-bas) et la ventilation de la salle monte avec la charge des serveurs.
- Sources spatialisées par site (`Site.sourcesSon`, `PannerNode`) : grondement de la salle (selon la charge, muet si le site n'est pas alimenté), groupe électrogène quand il tourne, transformateur du poste quand le réseau est présent, sirène en cas de sinistre.
- Circuit incendie : bip espacé en pré-alarme, alarme rapide pendant l'alarme et la temporisation, souffle du gaz pendant l'émission puis léger pendant le maintien.
- Bruitages : clic des boutons et de la sélection, ouverture et fermeture d'une baie, serveur tiré sur ses rails, dissipateurs soulevés, pièce qui se présente puis se range, pas (plancher technique dedans, gravier dehors ; `Promenade.surPas`, tous les 75 cm).
- Le navigateur n'autorise le son qu'après un geste : `son.demarrer()` est appelé au premier clic ou à la première touche. Volume et coupure (bouton de la barre d'outils, du volet Lumière et son, de la visite, touche N dans tous les modes) sont mémorisés dans le navigateur (`dc-modulaire.son`).
- Coupure franche : le volume retombe en 0,1 s puis le contexte audio est suspendu (`AudioContext.suspend`) ; il ne reprend qu'au rétablissement du son. Il est aussi suspendu quand l'onglet passe en arrière-plan (`visibilitychange`). Un même site ouvert dans deux onglets a deux contextes audio indépendants.

## Rendu et stabilité

- Le rendu utilise un tampon de profondeur logarithmique (`logarithmicDepthBuffer`) : la scène va de quelques centimètres à plusieurs centaines de mètres.
- La caméra orbitale ne descend jamais sous 1,2 m et son point visé reste au-dessus du terrain, à moins de 260 m du centre (`Monde.garderAuDessusDuSol`) ; même règle dans l'inspection (`Inspection.borner`).
- Deux surfaces ne doivent jamais partager exactement le même plan (sinon elles scintillent) : décaler de quelques millimètres ou agrandir légèrement la pièce qui recouvre l'autre (ossature du module, bandeaux, socles).
- Les ombres ne sont pas recalculées à chaque image : `Monde.maj` les rafraîchit quand un site signale `enMouvement`, et sinon deux fois par seconde. Un nouvel élément animé qui projette une ombre doit être signalé dans `Site.bouge`.
- `figer()` (`outils.ts`) fige la transformation des maillages immobiles d'un module ; seuls les groupes restent animables. Un maillage animé doit être ajouté après l'appel à `figer`.
- Le survol est analysé au plus 20 fois par seconde ; les étiquettes masquées sortent de la page après leur fondu.
- L'inspection a trois niveaux. Baie : glisser pour tourner autour, clic sur un équipement pour l'ouvrir. Serveur ouvert : vue de haut par défaut (capot glissé derrière le châssis), glisser pour se déplacer au-dessus, clic droit pour tourner, molette pour zoomer, boutons « Vue de haut » et « Vue de face », bouton pour soulever et ranger les dissipateurs. Pièce présentée : un clic sur une pièce la fait sortir et venir devant la caméra, en grand, sur un voile sombre (modèle détaillé de `examen.ts` quand il existe) ; on la saisit pour la tourner à 360°, la molette la rapproche, « Éclater / rassembler » montre ses parties et leurs légendes, et un clic (ou Échap) la renvoie à sa place. Présenter un processeur soulève d'abord son dissipateur. Échap remonte d'un niveau. La pièce présentée est dessinée dans une seconde passe (couche 1), par-dessus le voile.
- La baie de calcul contient deux serveurs GPU Dell R760xa à quatre cartes NVIDIA A100 (type de châssis `gpu`).
- L'inspection utilise sa propre scène, sa caméra et son calque d'étiquettes ; pendant qu'elle est active, la scène principale n'est ni mise à jour ni rendue.
- La scène ne contient volontairement aucun personnage : l'effort de détail porte sur les baies et les serveurs.
- Pour modifier ce qu'une baie contient ou ce qu'un serveur renferme, éditer `src/baies.ts` : la géométrie en découle.
