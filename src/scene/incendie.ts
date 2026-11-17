import * as THREE from 'three';
import { CONTENEUR, PLANCHER } from './conteneur';
import { traceArrondi } from './flux';
import { boite, cylindre, materiau, panneau, toile } from './outils';

/**
 * Système de sécurité incendie d'un module, au complet (repère du module) :
 * - détection : détection précoce par aspiration (réseau de prélèvement au plafond, unité d'analyse)
 *   et détecteurs ponctuels répartis sur deux boucles (double détection avant extinction) ;
 * - centrale ECS/CMSI avec ses voyants (sous tension, feu, extinction, dérangement) ;
 * - commandes près de la porte : déclencheur manuel d'alarme, déclenchement manuel de l'extinction, arrêt d'urgence ;
 * - signalisation : flashs et sirènes intérieurs, panneau extérieur « Évacuation » et « Gaz émis, ne pas entrer » ;
 * - extinction : bouteilles de gaz inerte avec têtes de déclenchement, manomètres et collecteur, montée et réseau
 *   de diffusion, diffuseurs ; clapet de surpression qui protège les parois pendant l'émission ;
 * - extincteurs portatifs au CO2 près de l'entrée.
 * Les éléments animés (voyants, lames du clapet) sont exposés dans `MaterielIncendie`.
 */

export interface MaterielIncendie {
  /** Voyants des détecteurs ponctuels, une matière par boucle. */
  readonly boucleA: THREE.MeshStandardMaterial;
  readonly boucleB: THREE.MeshStandardMaterial;
  /** Voyant de l'unité de détection par aspiration. */
  readonly aspiration: THREE.MeshStandardMaterial;
  /** Voyants de la centrale. */
  readonly sousTension: THREE.MeshStandardMaterial;
  readonly feu: THREE.MeshStandardMaterial;
  readonly extinction: THREE.MeshStandardMaterial;
  /** Flashs des sirènes, intérieur et extérieur. */
  readonly flashs: THREE.MeshStandardMaterial;
  /** Panneau lumineux extérieur : évacuation, puis gaz émis. */
  readonly evacuation: THREE.MeshStandardMaterial;
  readonly gazEmis: THREE.MeshStandardMaterial;
  /** Lames du clapet de surpression (pivots animables). */
  readonly lames: readonly THREE.Group[];
}

export interface ReperesIncendie {
  /** Réseau de prélèvement, de son extrémité jusqu'à l'unité d'analyse (sens de l'air aspiré). */
  readonly aspiration: readonly THREE.Vector3[];
  readonly uniteAspiration: THREE.Vector3;
  readonly centrale: THREE.Vector3;
  readonly commandes: THREE.Vector3;
  readonly clapet: THREE.Vector3;
  /** Sortie du collecteur des bouteilles. */
  readonly collecteur: THREE.Vector3;
  readonly diffuseurs: readonly THREE.Vector3[];
  /** Hauteur et profondeur du réseau de diffusion. */
  readonly yReseau: number;
  readonly zReseau: number;
}

/** Voyant éteint ou allumé selon l'intensité de sa matière émissive. */
function voyant(couleur: number, intensite = 0.05): THREE.MeshStandardMaterial {
  return materiau(0x111111, { emissive: couleur, intensite });
}

/** Conduite tubulaire à coudes arrondis. */
function conduite(points: readonly THREE.Vector3[], rayon: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(traceArrondi(points, rayon * 3), Math.max(16, points.length * 16), rayon, 10, false), mat);
  mesh.castShadow = true;
  return mesh;
}

/** Texte lumineux sur fond sombre : la même image sert de couleur et d'émission. */
function texteLumineux(lignes: readonly string[], couleur: string, largeur = 512, hauteur = 128): THREE.MeshStandardMaterial {
  const texture = toile(largeur, hauteur, (ctx) => {
    ctx.fillStyle = '#140808';
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.strokeStyle = '#3a1a1a';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, largeur - 6, hauteur - 6);
    ctx.fillStyle = couleur;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pas = hauteur / (lignes.length + 1);
    lignes.forEach((ligne, i) => {
      ctx.font = `${i === 0 ? 800 : 600} ${Math.round(pas * (i === 0 ? 0.62 : 0.5))}px "Segoe UI", Arial, sans-serif`;
      ctx.fillText(ligne, largeur / 2, pas * (i + 1));
    });
  });
  return new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.08, roughness: 0.4 });
}

export function construireIncendie(zFond: number): { groupe: THREE.Group; materiel: MaterielIncendie; reperes: ReperesIncendie } {
  const groupe = new THREE.Group();
  const H = CONTENEUR.H;
  const xPignon = -CONTENEUR.L / 2 + CONTENEUR.E;
  const zAvant = CONTENEUR.P / 2 - CONTENEUR.E;
  const rouge = materiau(0xd32f2f, { rugosite: 0.35, metal: 0.4 });
  const chrome = materiau(0xc9ced4, { metal: 0.9, rugosite: 0.25 });
  const noir = materiau(0x1a1c1f, { rugosite: 0.6 });
  const blanc = materiau(0xf1f3f5, { rugosite: 0.5 });
  const gris = materiau(0xd5d9de, { rugosite: 0.5, metal: 0.2 });

  /* ---------- Extinction : bouteilles, collecteur, réseau, diffuseurs ---------- */

  const zBouteilles = zFond + 0.3;
  const etiquetteBouteille = new THREE.MeshStandardMaterial({
    map: toile(128, 192, (ctx) => {
      ctx.fillStyle = '#f4f4f2';
      ctx.fillRect(0, 0, 128, 192);
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(0, 0, 128, 34);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 22px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('IG-541', 64, 25);
      ctx.fillStyle = '#1f2328';
      ctx.font = '600 15px "Segoe UI", Arial';
      ctx.fillText('Gaz inerte', 64, 62);
      ctx.fillText('N₂ · Ar · CO₂', 64, 86);
      ctx.fillText('300 bar', 64, 112);
      ctx.font = '500 12px "Segoe UI", Arial';
      ctx.fillText('80 L · 2024', 64, 160);
    }),
    roughness: 0.6,
  });
  const xBouteilles = [-5.65, -5.25, -4.85] as const;
  for (const x of xBouteilles) {
    groupe.add(cylindre(0.17, 1.5, rouge, x, PLANCHER, zBouteilles));
    // Ogive, robinet, tête de déclenchement électrique et manomètre.
    const ogive = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), rouge);
    ogive.position.set(x, PLANCHER + 1.5, zBouteilles);
    groupe.add(ogive);
    groupe.add(cylindre(0.045, 0.14, chrome, x, PLANCHER + 1.66, zBouteilles));
    groupe.add(boite(0.09, 0.07, 0.07, noir, x, PLANCHER + 1.73, zBouteilles));
    const mano = cylindre(0.035, 0.015, blanc, x + 0.07, PLANCHER + 1.7, zBouteilles + 0.05, 14);
    mano.rotation.x = Math.PI / 2;
    groupe.add(mano);
    // Flexible vers le collecteur.
    groupe.add(cylindre(0.018, 0.14, noir, x, PLANCHER + 1.8, zBouteilles));
    groupe.add(panneau(0.18, 0.27, etiquetteBouteille, x, PLANCHER + 1.0, zBouteilles + 0.172));
    // Sangle de fixation au mur.
    groupe.add(boite(0.36, 0.04, 0.02, noir, x, PLANCHER + 1.1, zBouteilles - 0.18));
  }
  const yCollecteur = PLANCHER + 1.98;
  const collecteur = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 12), rouge);
  collecteur.rotation.z = Math.PI / 2;
  collecteur.position.set(-5.25, yCollecteur, zBouteilles);
  groupe.add(collecteur);

  // Montée, traversée de la salle et réseau de diffusion au-dessus de l'allée chaude avant.
  const yReseau = 2.66;
  const zReseau = 1.95;
  const xMontee = -5.25;
  groupe.add(
    conduite(
      [
        new THREE.Vector3(xMontee, yCollecteur, zBouteilles),
        new THREE.Vector3(xMontee, yReseau, zBouteilles),
        new THREE.Vector3(xMontee, yReseau, zReseau),
        new THREE.Vector3(5.1, yReseau, zReseau),
      ],
      0.05,
      rouge,
    ),
  );
  const diffuseurs = [-3.8, -1.4, 1.0, 3.4].map((x) => new THREE.Vector3(x, 2.56, zReseau));
  for (const d of diffuseurs) {
    groupe.add(cylindre(0.02, 0.06, rouge, d.x, 2.6, d.z, 10));
    groupe.add(cylindre(0.07, 0.06, chrome, d.x, 2.54, d.z, 14));
  }

  /* ---------- Clapet de surpression (paroi avant, en hauteur) ---------- */

  const xClapet = 4.2;
  const yClapet = 2.2;
  const zClapet = zAvant - 0.03;
  const cadre = materiau(0x8a929c, { metal: 0.6, rugosite: 0.4 });
  groupe.add(boite(0.66, 0.05, 0.05, cadre, xClapet, yClapet, zClapet), boite(0.66, 0.05, 0.05, cadre, xClapet, yClapet + 0.45, zClapet));
  groupe.add(boite(0.05, 0.5, 0.05, cadre, xClapet - 0.31, yClapet, zClapet), boite(0.05, 0.5, 0.05, cadre, xClapet + 0.31, yClapet, zClapet));
  const lames: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(xClapet, yClapet + 0.1 + i * 0.1, zClapet);
    pivot.add(boite(0.56, 0.085, 0.008, gris, 0, -0.0425, 0));
    lames.push(pivot);
    groupe.add(pivot);
  }

  /* ---------- Centrale ECS / CMSI (paroi du fond) ---------- */

  const xCentrale = -4.25;
  const yCentrale = 1.2;
  const largeurC = 0.55;
  const hauteurC = 0.65;
  groupe.add(boite(largeurC, hauteurC, 0.12, gris, xCentrale, yCentrale, zFond + 0.06));
  const faceCentrale = new THREE.MeshStandardMaterial({
    map: toile(256, 300, (ctx) => {
      ctx.fillStyle = '#e4e7ea';
      ctx.fillRect(0, 0, 256, 300);
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(0, 0, 256, 40);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 17px "Segoe UI", Arial';
      ctx.fillText('CENTRALE INCENDIE', 14, 26);
      ctx.fillStyle = '#2b3036';
      ctx.font = '600 12px "Segoe UI", Arial';
      ctx.fillText('ECS · CMSI · EXTINCTION AUTOMATIQUE', 14, 60);
      ctx.font = '600 14px "Segoe UI", Arial';
      for (const [y, texte] of [
        [100, 'Sous tension'],
        [130, 'Feu'],
        [160, 'Extinction'],
        [190, 'Dérangement'],
      ] as const) {
        ctx.fillStyle = '#2b3036';
        ctx.fillText(texte, 62, y + 5);
        ctx.fillStyle = '#9aa1a8';
        ctx.beginPath();
        ctx.arc(40, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#20302a';
      ctx.fillRect(14, 222, 228, 40);
      ctx.fillStyle = '#7cf0b5';
      ctx.font = '600 13px Consolas, monospace';
      ctx.fillText('BOUCLES 1-2 · ASPIRATION', 22, 247);
      ctx.fillStyle = '#c4c9ce';
      for (let k = 0; k < 4; k++) ctx.fillRect(14 + k * 60, 272, 48, 18);
    }),
    roughness: 0.5,
  });
  const yHautC = yCentrale + hauteurC;
  groupe.add(panneau(largeurC, hauteurC, faceCentrale, xCentrale, yCentrale + hauteurC / 2, zFond + 0.122));
  const sousTension = voyant(0x3dff8a, 2);
  const feu = voyant(0xff2a2a);
  const extinction = voyant(0xffa31a);
  const derangement = voyant(0xffd400);
  [sousTension, feu, extinction, derangement].forEach((mat, i) => {
    const y = yHautC - ((100 + i * 30) / 300) * hauteurC;
    const x = xCentrale - largeurC / 2 + (40 / 256) * largeurC;
    const led = cylindre(0.017, 0.012, mat, x, y, zFond + 0.128, 12);
    led.position.y = y;
    led.rotation.x = Math.PI / 2;
    groupe.add(led);
  });

  /* ---------- Détection précoce par aspiration ---------- */

  const xUnite = -3.3;
  const yUnite = 1.35;
  groupe.add(boite(0.34, 0.4, 0.13, blanc, xUnite, yUnite, zFond + 0.065));
  const faceUnite = new THREE.MeshStandardMaterial({
    map: toile(170, 200, (ctx) => {
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, 170, 200);
      ctx.fillStyle = '#1f2937';
      ctx.font = '700 13px "Segoe UI", Arial';
      ctx.fillText('DÉTECTION', 12, 26);
      ctx.fillText('PAR ASPIRATION', 12, 44);
      ctx.font = '500 11px "Segoe UI", Arial';
      ctx.fillText('Alerte · Action · Feu 1 · Feu 2', 12, 66);
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = k < 4 ? '#22c55e' : k < 7 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(14 + k * 14, 90, 10, 22);
      }
    }),
    roughness: 0.5,
  });
  groupe.add(panneau(0.34, 0.4, faceUnite, xUnite, yUnite + 0.2, zFond + 0.132));
  const aspiration = voyant(0x22c55e, 1.2);
  groupe.add(boite(0.24, 0.025, 0.01, aspiration, xUnite, yUnite + 0.07, zFond + 0.135));

  // Réseau de prélèvement : de l'unité au plafond, puis le long de l'allée chaude du fond ; orifices tous les 1,2 m.
  const yAsp = H - 0.16;
  const zAsp = zFond + 0.18;
  const reseau = [
    new THREE.Vector3(xUnite, yUnite + 0.4, zFond + 0.065),
    new THREE.Vector3(xUnite, yAsp, zFond + 0.065),
    new THREE.Vector3(xUnite, yAsp, zAsp),
    new THREE.Vector3(5.2, yAsp, zAsp),
  ];
  const matAsp = materiau(0xc62828, { rugosite: 0.5 });
  groupe.add(conduite(reseau, 0.018, matAsp));
  for (let x = xUnite + 0.9; x < 5.2; x += 1.2) {
    const orifice = cylindre(0.024, 0.012, noir, x, yAsp - 0.026, zAsp, 10);
    groupe.add(orifice);
  }

  /* ---------- Détecteurs ponctuels, deux boucles ---------- */

  const boucleA = voyant(0x22c55e, 1);
  const boucleB = voyant(0x22c55e, 1);
  const detecteurs: readonly (readonly [number, number])[] = [
    [-3.3, 0],
    [-1.5, 0],
    [1.0, 0],
    [3.5, 0],
    [-2.4, -1.95],
    [0.6, -1.95],
    [-2.4, 1.95],
    [2.6, 1.95],
  ];
  detecteurs.forEach(([xd, zd], i) => {
    groupe.add(cylindre(0.075, 0.012, blanc, xd, H - 0.072, zd, 16));
    groupe.add(cylindre(0.062, 0.035, blanc, xd, H - 0.105, zd, 16));
    groupe.add(cylindre(0.012, 0.01, i % 2 === 0 ? boucleA : boucleB, xd, H - 0.112, zd + 0.035, 8));
  });

  /* ---------- Commandes près de la porte (pignon gauche, intérieur) ---------- */

  const zCommandes = 1.05;
  const yCommandes = 1.25;
  const plaque = new THREE.MeshStandardMaterial({
    map: toile(360, 240, (ctx) => {
      ctx.fillStyle = '#eceff1';
      ctx.fillRect(0, 0, 360, 240);
      ctx.fillStyle = '#1f2328';
      ctx.font = '800 17px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('EXTINCTION AUTOMATIQUE', 180, 28);
      const boutons = [
        ['#d32f2f', 'ALARME', 'FEU'],
        ['#f9a825', 'DÉCLENCHER', "L'EXTINCTION"],
        ['#1e63c4', "ARRÊT", "D'URGENCE"],
      ] as const;
      boutons.forEach(([couleur, l1, l2], k) => {
        const cx = 60 + k * 120;
        ctx.fillStyle = couleur;
        ctx.fillRect(cx - 42, 50, 84, 84);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 26, 66, 52, 52);
        ctx.fillStyle = '#1f2328';
        ctx.font = '700 13px "Segoe UI", Arial';
        ctx.fillText(l1, cx, 166);
        ctx.fillText(l2, cx, 184);
      });
      ctx.font = '500 12px "Segoe UI", Arial';
      ctx.fillText("Temporisation 30 s · L'arrêt d'urgence suspend l'émission", 180, 222);
    }),
    roughness: 0.6,
  });
  const plaqueMesh = panneau(0.6, 0.4, plaque, xPignon + 0.012, yCommandes + 0.2, zCommandes);
  plaqueMesh.rotation.y = Math.PI / 2;
  groupe.add(boite(0.012, 0.42, 0.62, gris, xPignon + 0.004, yCommandes - 0.01, zCommandes));
  groupe.add(plaqueMesh);
  // Boîtiers en relief : de gauche à droite pour qui fait face au mur (+z vers -z).
  const couleursBoitiers = [0xd32f2f, 0xf9a825, 0x1e63c4] as const;
  couleursBoitiers.forEach((couleur, k) => {
    const z = zCommandes + 0.2 - k * 0.2;
    groupe.add(boite(0.035, 0.14, 0.14, materiau(couleur, { rugosite: 0.4 }), xPignon + 0.03, yCommandes + 0.25, z));
  });

  /* ---------- Flashs et sirènes ---------- */

  const flashs = voyant(0xff2020);
  const flash = (x: number, y: number, z: number, axe: 'x' | 'z', sens: 1 | -1): void => {
    const socle = boite(0.12, 0.12, 0.05, blanc, 0, -0.06, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), flashs);
    dome.position.z = 0.025;
    dome.rotation.x = Math.PI / 2;
    const g = new THREE.Group();
    g.add(socle, dome);
    g.position.set(x, y, z);
    g.rotation.y = axe === 'x' ? (sens * Math.PI) / 2 : sens === 1 ? 0 : Math.PI;
    groupe.add(g);
  };
  // Au-dessus de la porte (dedans et dehors) et sur la paroi du fond.
  flash(xPignon + 0.03, 2.42, 0, 'x', 1);
  flash(xPignon - CONTENEUR.E - 0.04, 2.42, 0.75, 'x', -1);
  flash(1.8, 2.45, zFond + 0.03, 'z', 1);

  /* ---------- Panneau lumineux extérieur, au-dessus de la porte ---------- */

  const evacuation = texteLumineux(['ÉVACUATION', 'alarme feu en cours'], '#ff3b30');
  const gazEmis = texteLumineux(['GAZ ÉMIS', 'ne pas entrer'], '#ff3b30');
  const xExterieur = xPignon - CONTENEUR.E - 0.02;
  groupe.add(boite(0.05, 0.62, 1.04, noir, xExterieur + 0.01, 2.2, 0));
  for (const [mat, y] of [
    [evacuation, 2.66],
    [gazEmis, 2.36],
  ] as const) {
    const p = panneau(1.0, 0.28, mat, xExterieur - 0.018, y, 0);
    p.rotation.y = -Math.PI / 2;
    groupe.add(p);
  }

  /* ---------- Extincteurs CO2 près de l'entrée ---------- */

  const signe = new THREE.MeshStandardMaterial({
    map: toile(96, 96, (ctx) => {
      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(0, 0, 96, 96);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 20px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CO₂', 48, 44);
      ctx.font = '600 12px "Segoe UI", Arial';
      ctx.fillText('EXTINCTEUR', 48, 70);
    }),
  });
  for (const z of [-1.0, -1.3]) {
    const x = xPignon + 0.12;
    groupe.add(cylindre(0.085, 0.55, rouge, x, PLANCHER + 0.18, z));
    groupe.add(cylindre(0.03, 0.08, noir, x, PLANCHER + 0.73, z));
    const cornet = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 10), noir);
    cornet.position.set(x + 0.08, PLANCHER + 0.62, z);
    cornet.rotation.z = Math.PI / 2;
    groupe.add(cornet);
  }
  const signeMesh = panneau(0.24, 0.24, signe, xPignon + 0.006, PLANCHER + 1.15, -1.15);
  signeMesh.rotation.y = Math.PI / 2;
  groupe.add(signeMesh);

  return {
    groupe,
    materiel: { boucleA, boucleB, aspiration, sousTension, feu, extinction, flashs, evacuation, gazEmis, lames },
    reperes: {
      aspiration: [...reseau].reverse(),
      uniteAspiration: new THREE.Vector3(xUnite, yUnite + 0.2, zFond + 0.14),
      centrale: new THREE.Vector3(xCentrale, yHautC, zFond + 0.15),
      commandes: new THREE.Vector3(xPignon + 0.05, yCommandes + 0.45, zCommandes),
      clapet: new THREE.Vector3(xClapet, yClapet + 0.25, zClapet - 0.05),
      collecteur: new THREE.Vector3(xMontee, yCollecteur, zBouteilles),
      diffuseurs,
      yReseau,
      zReseau,
    },
  };
}
