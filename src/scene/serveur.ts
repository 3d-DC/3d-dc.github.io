import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ARCHITECTURE, COMPOSANTS } from '../baies';
import type { ComposantKind, UniteBaie } from '../types';
import { facadeUnite, portsUnite, U } from './facades';
import { aleatoire, boite, cylindre, materiau, toile } from './outils';

/** Dimensions d'un châssis au format baie 19 pouces. */
export const L_CHASSIS = 0.445;
export const P_CHASSIS = 0.72;

type Point = readonly [x: number, y: number, z: number];

/** Pièce que l'on peut sortir de son logement d'un clic (dissipateur, processeur, barrette, disque…). */
export interface Piece {
  readonly kind: ComposantKind;
  readonly objet: THREE.Object3D;
  readonly repos: THREE.Vector3;
  /** Déplacement quand la pièce est sortie. */
  readonly sortie: THREE.Vector3;
  /** 0 = en place, 1 = sortie (animé). */
  avancee: number;
  sortieDemandee: boolean;
}

export interface ServeurOuvert {
  readonly groupe: THREE.Group;
  /** Famille de composant de chaque groupe cliquable. */
  readonly composants: WeakMap<THREE.Object3D, ComposantKind>;
  readonly pieces: Map<THREE.Object3D, Piece>;
  readonly rotors: THREE.Object3D[];
  readonly etiquettes: CSS2DObject[];
  readonly capot: { readonly mesh: THREE.Mesh; readonly mat: THREE.MeshStandardMaterial; readonly repos: number };
  readonly conduit: THREE.MeshStandardMaterial | null;
}

export function matFacade(unite: UniteBaie): THREE.MeshStandardMaterial {
  const facade = facadeUnite(unite);
  return new THREE.MeshStandardMaterial({
    map: facade.map,
    emissiveMap: facade.emissive,
    emissive: 0xffffff,
    emissiveIntensity: 1.6,
    roughness: 0.45,
    metalness: 0.45,
  });
}

/** Étiquette de service collée sur le capot : marque, modèle et schéma simplifié. */
function textureCapot(unite: UniteBaie): THREE.CanvasTexture {
  return toile(512, 512, (ctx) => {
    ctx.fillStyle = '#a3abb4';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#eef0f2';
    ctx.fillRect(150, 150, 212, 212);
    ctx.strokeStyle = '#2a2e33';
    ctx.lineWidth = 2;
    ctx.strokeRect(150, 150, 212, 212);
    ctx.fillStyle = '#15181c';
    ctx.font = '800 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText(unite.marque, 164, 186);
    ctx.font = '600 15px "Segoe UI", Arial, sans-serif';
    ctx.fillText(unite.modele, 164, 210);
    ctx.font = '500 12px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Étiquette de service', 164, 232);
    ctx.strokeStyle = '#5a636d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(166, 248, 180, 100);
    for (const x of [196, 286]) ctx.strokeRect(x, 280, 36, 36);
    for (let k = 0; k < 6; k++) ctx.strokeRect(172 + k * 29, 254, 22, 14);
  });
}

let texturePcb: THREE.CanvasTexture | null = null;

/** Circuit imprimé : pistes à angles droits, pastilles, sérigraphie et petits composants. */
export function pcb(): THREE.CanvasTexture {
  texturePcb ??= toile(1024, 1024, (ctx) => {
    const rnd = aleatoire(808);
    ctx.fillStyle = '#0b5234';
    ctx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 1024;
      const y = rnd() * 1024;
      const brins = 2 + Math.floor(rnd() * 5);
      ctx.strokeStyle = rnd() > 0.5 ? '#1c7d54' : '#16694a';
      ctx.lineWidth = 2;
      for (let b = 0; b < brins; b++) {
        let px = x + b * 5;
        let py = y + b * 5;
        ctx.beginPath();
        ctx.moveTo(px, py);
        const graine = aleatoire(i * 97 + 3);
        for (let k = 0; k < 4; k++) {
          if (graine() > 0.5) px += (graine() - 0.5) * 300;
          else py += (graine() - 0.5) * 300;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = rnd() > 0.6 ? '#c9b458' : '#2a9a6a';
      ctx.beginPath();
      ctx.arc(rnd() * 1024, rnd() * 1024, 1.5 + rnd() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 520; i++) {
      const x = rnd() * 1010;
      const y = rnd() * 1010;
      const horizontal = rnd() > 0.5;
      const l = 6 + rnd() * 8;
      ctx.fillStyle = '#d7dbe0';
      ctx.fillRect(x, y, horizontal ? l : 5, horizontal ? 5 : l);
      ctx.fillStyle = rnd() > 0.5 ? '#1a1c1f' : '#8a6a3a';
      ctx.fillRect(x + (horizontal ? 2 : 0), y + (horizontal ? 0 : 2), horizontal ? l - 4 : 5, horizontal ? 5 : l - 4);
    }
    for (let i = 0; i < 46; i++) {
      const s = 14 + rnd() * 34;
      const x = rnd() * 980;
      const y = rnd() * 980;
      ctx.fillStyle = '#111316';
      ctx.fillRect(x, y, s, s * (0.6 + rnd() * 0.8));
      ctx.fillStyle = '#b9bfc7';
      for (let k = 2; k < s - 2; k += 4) ctx.fillRect(x + k, y - 2, 2, 2);
    }
    ctx.fillStyle = 'rgba(235, 240, 245, 0.7)';
    ctx.font = '600 11px monospace';
    for (let i = 0; i < 60; i++) {
      const prefixe = ['R', 'C', 'U', 'Q', 'L', 'J'][Math.floor(rnd() * 6)] ?? 'R';
      ctx.fillText(`${prefixe}${Math.floor(rnd() * 900 + 10)}`, rnd() * 990, rnd() * 1010 + 10);
    }
  });
  return texturePcb;
}

/** Étiquette blanche à lignes de texte, collée sur les blocs et les barrettes. */
function textureEtiquette(): THREE.CanvasTexture {
  return toile(128, 64, (ctx) => {
    ctx.fillStyle = '#eef0f2';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#20242a';
    ctx.fillRect(6, 6, 30, 14);
    for (let y = 26; y < 58; y += 7) ctx.fillRect(6, y, 60 + ((y * 7) % 50), 2.5);
    for (let x = 80; x < 122; x += 3) ctx.fillRect(x, 6, 1 + (x % 2), 14);
  });
}

/** Capot du processeur (IHS) : métal nickelé gravé. */
function textureIhs(): THREE.CanvasTexture {
  return toile(256, 192, (ctx) => {
    ctx.fillStyle = '#c3c7cb';
    ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = 'rgba(40,44,50,0.75)';
    ctx.font = '700 22px "Segoe UI", Arial';
    ctx.fillText('INTEL XEON', 30, 80);
    ctx.font = '600 16px monospace';
    ctx.fillText('GOLD 6430', 30, 110);
  });
}

/** Dessus du carénage d'une A100 : ailettes et nom. */
function textureA100(): THREE.CanvasTexture {
  return toile(256, 640, (ctx) => {
    const d = ctx.createLinearGradient(0, 0, 256, 0);
    d.addColorStop(0, '#d9dcdf');
    d.addColorStop(1, '#aeb3b8');
    ctx.fillStyle = d;
    ctx.fillRect(0, 0, 256, 640);
    ctx.fillStyle = 'rgba(60,64,70,0.35)';
    for (let y = 60; y < 600; y += 14) ctx.fillRect(20, y, 216, 5);
    ctx.save();
    ctx.translate(128, 320);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#2a2e33';
    ctx.font = '800 34px "Segoe UI", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('NVIDIA A100', 0, 12);
    ctx.restore();
  });
}

/** Câble souple passant par les points donnés. */
export function cable(cible: THREE.Object3D, points: readonly Point[], mat: THREE.Material, rayon = 0.0045): void {
  const courbe = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    'catmullrom',
    0.35,
  );
  const tube = new THREE.Mesh(new THREE.TubeGeometry(courbe, points.length * 8, rayon, 6, false), mat);
  tube.castShadow = true;
  tube.raycast = () => {};
  cible.add(tube);
}

/**
 * Serveur (ou équipement réseau) ouvert, capot levé. Chaque pièce amovible est un groupe
 * à part, enregistré dans `pieces` avec son déplacement de sortie.
 */
export function construireServeur(unite: UniteBaie): ServeurOuvert {
  const groupe = new THREE.Group();
  const composants = new WeakMap<THREE.Object3D, ComposantKind>();
  const pieces = new Map<THREE.Object3D, Piece>();
  const rotors: THREE.Object3D[] = [];
  const etiquettes: CSS2DObject[] = [];
  let conduitMat: THREE.MeshStandardMaterial | null = null;

  const marquer = <T extends THREE.Object3D>(objet: T, kind: ComposantKind): T => {
    composants.set(objet, kind);
    return objet;
  };
  /** Rend un groupe amovible : il se déplace de `sortie` quand on clique dessus. */
  const amovible = <T extends THREE.Object3D>(objet: T, kind: ComposantKind, sortie: THREE.Vector3): T => {
    marquer(objet, kind);
    pieces.set(objet, { kind, objet, repos: objet.position.clone(), sortie, avancee: 0, sortieDemandee: false });
    return objet;
  };
  const etiqueter = (kind: ComposantKind, x: number, y: number, z: number): void => {
    const element = document.createElement('div');
    element.className = 'etiquette-composant';
    element.textContent = COMPOSANTS[kind].nom;
    const etiquette = new CSS2DObject(element);
    etiquette.position.set(x, y, z);
    etiquettes.push(etiquette);
    groupe.add(etiquette);
  };

  const arch = ARCHITECTURE[unite.type];
  const gpu = unite.type === 'gpu';
  const H = unite.u * U;
  const hi = H - 0.01;
  const L = L_CHASSIS;
  const P = P_CHASSIS;

  const tole = materiau(0x9aa2ab, { rugosite: 0.35, metal: 0.85 });
  const sombre = materiau(0x15181c, { rugosite: 0.5, metal: 0.5 });
  const alu = materiau(0xc4cad1, { rugosite: 0.3, metal: 0.9 });
  const cuivre = materiau(0xc27a48, { rugosite: 0.3, metal: 0.95 });
  const noirMat = materiau(0x0c0d0f, { rugosite: 0.6 });
  const matEtiquette = materiau(0xffffff, { rugosite: 0.7, map: textureEtiquette() });
  const haut = Math.min(hi, 0.06);
  const yBase = 0.004;
  const zAvant = P / 2;

  // Châssis : fond, flancs à glissières, panneau arrière et sa connectique, façade.
  const chassis = marquer(new THREE.Group(), 'chassis');
  chassis.add(boite(L, 0.004, P, tole));
  for (const sx of [-1, 1]) {
    chassis.add(boite(0.004, H, P, tole, (sx * (L - 0.004)) / 2, 0, 0));
    chassis.add(boite(0.012, 0.02, P * 0.94, alu, sx * (L / 2 + 0.006), H / 2 - 0.01, -0.02));
  }
  chassis.add(boite(L, H, 0.004, tole, 0, 0, -P / 2 + 0.002));
  const zDos = -P / 2 - 0.004;
  for (const x of [-0.19, -0.165]) chassis.add(boite(0.018, 0.014, 0.012, alu, x, yBase + 0.004, zDos));
  chassis.add(boite(0.032, 0.012, 0.012, materiau(0x2a4fb5, { rugosite: 0.5 }), -0.13, yBase + 0.004, zDos));
  for (const x of [-0.1, -0.085]) chassis.add(boite(0.012, 0.006, 0.012, sombre, x, yBase + 0.006, zDos));
  const face = matFacade(unite);
  const facade = new THREE.Mesh(new THREE.BoxGeometry(L + 0.04, H, 0.012), [sombre, sombre, sombre, sombre, face, sombre]);
  facade.position.set(0, H / 2, zAvant + 0.006);
  facade.castShadow = true;
  chassis.add(facade);
  for (const sx of [-1, 1]) chassis.add(boite(0.01, H * 0.55, 0.026, alu, sx * (L / 2 + 0.008), H * 0.22, zAvant + 0.02));
  groupe.add(chassis);

  // Capot, soulevé à l'ouverture.
  const matCapot = materiau(0xffffff, { rugosite: 0.4, metal: 0.75, map: textureCapot(unite) });
  matCapot.transparent = true;
  const capot = marquer(boite(L, 0.003, P, matCapot, 0, H, 0), 'chassis');
  capot.raycast = () => {};
  groupe.add(capot);

  // Agencement : le serveur GPU loge ses cartes à l'avant, ce qui repousse ventilateurs et carte mère.
  const zVentilo = gpu ? 0.055 : 0.165;
  const zCarte = gpu ? -0.045 : -0.005;
  const pCarte = gpu ? 0.19 : 0.27;

  // Disques : chaque tiroir sort vers l'avant.
  const [colonnes, rangeesBase] = arch.disques;
  const rangees = rangeesBase * (unite.u === 4 ? 2 : 1);
  const largeurDisques = gpu ? 0.2 : unite.type === 'stockage' ? L - 0.03 : unite.type === 'calcul' ? L * 0.55 : L * 0.3;
  const xDisques = gpu ? -0.1 : -L / 2 + 0.015;
  if (colonnes > 0) {
    const lc = largeurDisques / colonnes;
    const hr = hi / rangees;
    const matDisque = materiau(0x2b3038, { rugosite: 0.35, metal: 0.8 });
    const matTiroir = materiau(0x6b7480, { rugosite: 0.4, metal: 0.7 });
    const matVoyant = materiau(0x0, { emissive: 0x3dff8a, intensite: 2.5 });
    for (let r = 0; r < rangees; r++) {
      for (let c = 0; c < colonnes; c++) {
        const tiroir = new THREE.Group();
        tiroir.add(boite(lc - 0.006, hr - 0.006, 0.12, matDisque, 0, 0.001, 0));
        for (const sx of [-1, 1]) tiroir.add(boite(0.002, hr - 0.004, 0.13, matTiroir, sx * (lc / 2 - 0.002), 0, 0));
        tiroir.add(boite(lc - 0.004, hr - 0.004, 0.006, matTiroir, 0, 0, 0.064));
        const etiquette = boite(lc * 0.62, 0.0006, 0.07, matEtiquette, 0, hr - 0.005, -0.002);
        etiquette.castShadow = false;
        tiroir.add(etiquette);
        tiroir.add(boite(0.004, 0.0015, 0.004, matVoyant, lc * 0.36, hr - 0.005, 0.056));
        tiroir.position.set(xDisques + lc * (c + 0.5), yBase + r * hr, zAvant - 0.068);
        groupe.add(amovible(tiroir, 'disque', new THREE.Vector3(0, 0, 0.11)));
      }
    }
    // Fond de panier : la carte sur laquelle tous les disques se branchent.
    groupe.add(boite(largeurDisques, hi * 0.92, 0.003, materiau(0x0b5234, { rugosite: 0.6 }), xDisques + largeurDisques / 2, yBase, zAvant - 0.136));
    etiqueter('disque', xDisques + largeurDisques / 2, H + 0.1, zAvant - 0.07);
  }

  // Ports en façade : cages derrière la façade et câbles branchés devant.
  if (arch.ports > 0) {
    const ports = marquer(new THREE.Group(), 'ports');
    const largeurFace = L + 0.04;
    const hLogique = 64 * unite.u;
    for (const p of portsUnite(unite)) {
      if (p.type === 'usb') continue;
      const x = ((p.x + p.w / 2) / 640 - 0.5) * largeurFace;
      const y = (1 - (p.y + p.h / 2) / hLogique) * H;
      const w = (p.w / 640) * largeurFace;
      const h = (p.h / hLogique) * H;
      ports.add(boite(w * 0.95, h * 0.95, 0.045, alu, x, y - (h * 0.95) / 2, zAvant - 0.0225));
    }
    groupe.add(ports);
    etiqueter('ports', 0, H + 0.1, zAvant);
  }

  // Cartes graphiques : couchées à l'avant, deux de chaque côté des disques, superposées.
  if (arch.gpus > 0) {
    const matCarenage = materiau(0xffffff, { rugosite: 0.32, metal: 0.85, map: textureA100() });
    const matPcbNoir = materiau(0x15201a, { rugosite: 0.5 });
    const lCarte = 0.267;
    let n = 0;
    for (const sx of [-1, 1]) {
      for (let etage = 0; etage < 2 && n < arch.gpus; etage++, n++) {
        const carte = new THREE.Group();
        carte.add(boite(0.105, 0.0016, lCarte, matPcbNoir, 0, 0, 0));
        carte.add(boite(0.108, 0.03, lCarte - 0.006, matCarenage, 0, 0.0016, 0));
        // Contacts PCIe sur la tranche, connecteur d'alimentation à l'arrière, pont NVLink sur le côté.
        carte.add(boite(0.003, 0.0016, 0.089, materiau(0xd6b24c, { rugosite: 0.25, metal: 0.9 }), -sx * 0.054, 0, -0.02));
        carte.add(boite(0.02, 0.012, 0.01, noirMat, sx * 0.03, 0.016, -lCarte / 2 + 0.004));
        carte.add(boite(0.004, 0.008, 0.05, materiau(0xd6b24c, { rugosite: 0.25, metal: 0.9 }), sx * 0.054, 0.012, 0.03));
        carte.add(boite(0.105, 0.032, 0.0015, alu, 0, 0, lCarte / 2));
        carte.position.set(sx * 0.159, yBase + 0.004 + etage * 0.037, zAvant - 0.012 - lCarte / 2);
        groupe.add(amovible(carte, 'gpu', new THREE.Vector3(0, 0.1 + etage * 0.05, 0)));
      }
    }
    etiqueter('gpu', 0.159, H + 0.12, zAvant - 0.15);
  }

  // Ventilateurs : chaque module se retire par le haut.
  const cote = Math.min(hi - 0.004, 0.062);
  const pas = (L - 0.03) / arch.ventilateurs;
  const largeurCarter = Math.min(pas - 0.006, cote + 0.012);
  const matPale = materiau(0x3a4048, { rugosite: 0.5, metal: 0.3 });
  const matCarter = materiau(0x1d2026, { rugosite: 0.55, metal: 0.3 });
  const matLanguette = materiau(0xf2720c, { rugosite: 0.6 });
  for (let i = 0; i < arch.ventilateurs; i++) {
    const module = new THREE.Group();
    module.add(boite(largeurCarter, cote, 0.028, matCarter, 0, 0, 0));
    module.add(boite(largeurCarter * 0.5, 0.003, 0.012, matLanguette, 0, cote, 0));
    for (const sz of [-1, 1]) {
      const couronne = new THREE.Mesh(new THREE.TorusGeometry(cote * 0.42, cote * 0.05, 6, 22), matCarter);
      couronne.position.set(0, cote / 2, sz * 0.015);
      module.add(couronne);
    }
    const rotor = new THREE.Group();
    for (let pale = 0; pale < 4; pale++) {
      const lame = new THREE.Mesh(new THREE.BoxGeometry(cote * 0.8, cote * 0.17, 0.004), matPale);
      lame.rotation.z = (pale * Math.PI) / 4;
      rotor.add(lame);
    }
    const moyeu = new THREE.Mesh(new THREE.CylinderGeometry(cote * 0.17, cote * 0.17, 0.01, 14), alu);
    moyeu.rotation.x = Math.PI / 2;
    rotor.add(moyeu);
    rotor.position.set(0, cote / 2, 0.016);
    rotors.push(rotor);
    module.add(rotor);
    module.position.set(-L / 2 + 0.015 + pas * (i + 0.5), yBase, zVentilo);
    groupe.add(amovible(module, 'ventilateur', new THREE.Vector3(0, 0.09, 0)));
  }
  etiqueter('ventilateur', L / 2 - 0.04, H + 0.06, zVentilo);

  // Carte mère.
  const matPcb = materiau(0xffffff, { rugosite: 0.55, metal: 0.15, map: pcb() });
  const carte = marquer(new THREE.Group(), 'carte-mere');
  carte.add(boite(L - 0.03, 0.003, pCarte, matPcb, 0, yBase + 0.004, zCarte));
  const zArriere = -P / 2 + 0.115;
  carte.add(boite(0.24, 0.003, 0.2, matPcb, -0.09, yBase + 0.004, zArriere - 0.005));
  const ySurCarte = yBase + 0.007;
  const zBordAvant = zCarte + pCarte / 2;
  const zBordArriere = zCarte - pCarte / 2;
  const matInductance = materiau(0x4a4f57, { rugosite: 0.5, metal: 0.5 });
  const jeu = new THREE.Group();
  jeu.add(boite(0.036, 0.004, 0.036, noirMat));
  for (let i = 0; i < 6; i++) jeu.add(boite(0.003, 0.009, 0.034, sombre, -0.015 + i * 0.006, 0.004, 0));
  jeu.position.set(0.0, ySurCarte, zBordArriere + 0.024);
  carte.add(jeu);
  carte.add(boite(0.024, 0.0025, 0.024, noirMat, -0.07, ySurCarte, zBordArriere + 0.022));
  carte.add(cylindre(0.01, 0.0035, alu, 0.06, ySurCarte, zBordArriere + 0.02, 18));
  carte.add(boite(0.052, 0.012, 0.011, materiau(0xe8e4d6, { rugosite: 0.7 }), 0.15, ySurCarte, zBordArriere + 0.014));
  groupe.add(carte);
  etiqueter('carte-mere', -L / 2 + 0.03, H + 0.02, zBordAvant - 0.01);

  // Processeurs : support LGA fixe, processeur amovible, dissipateur amovible par-dessus.
  const xProcesseurs = arch.asic ? [0.105] : arch.processeurs === 2 ? [-0.09, 0.09] : [0];
  const matIhs = materiau(0xffffff, { rugosite: 0.28, metal: 0.85, map: textureIhs() });
  const matSubstrat = materiau(0x1f4d36, { rugosite: 0.5 });
  for (const x of xProcesseurs) {
    const largeur = arch.asic ? 0.055 : 0.08;
    const profondeur = arch.asic ? 0.06 : 0.09;
    // Support et plaque de maintien, solidaires de la carte mère.
    carte.add(boite(0.088, 0.003, 0.068, sombre, x, ySurCarte - 0.001, zCarte));
    if (!arch.asic) {
      const processeur = new THREE.Group();
      processeur.add(boite(0.0775, 0.0018, 0.0565, matSubstrat, 0, 0, 0));
      processeur.add(boite(0.07, 0.003, 0.05, matIhs, 0, 0.0018, 0));
      processeur.position.set(x, ySurCarte + 0.002, zCarte);
      groupe.add(amovible(processeur, 'processeur', new THREE.Vector3(0, 0.06, 0.02)));
    }
    const dissipateur = new THREE.Group();
    dissipateur.add(boite(largeur + 0.012, 0.004, profondeur + 0.012, sombre));
    dissipateur.add(boite(largeur * 0.7, 0.003, profondeur * 0.7, cuivre, 0, 0.004, 0));
    dissipateur.add(boite(largeur, 0.004, profondeur, alu, 0, 0.007, 0));
    const hAilette = Math.max(0.008, haut - 0.026);
    const nb = Math.round(largeur / 0.0052);
    for (let i = 0; i < nb; i++) dissipateur.add(boite(0.0016, hAilette, profondeur, alu, -largeur / 2 + (i + 0.5) * (largeur / nb), 0.011, 0));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) dissipateur.add(cylindre(0.0035, 0.012, cuivre, sx * (largeur / 2 + 0.001), 0.004, sz * (profondeur / 2 + 0.001), 10));
    }
    dissipateur.position.set(x, ySurCarte + 0.007, zCarte);
    // Soulevé, le dissipateur se range au-dessus et en retrait : le processeur se voit de haut.
    groupe.add(amovible(dissipateur, arch.asic ? 'asic' : 'dissipateur', new THREE.Vector3(0, 0.11, -0.15)));
    for (let i = 0; i < 6; i++) carte.add(boite(0.009, 0.008, 0.009, matInductance, x - 0.03 + i * 0.012, ySurCarte, zBordAvant - 0.03));
  }
  etiqueter(arch.asic ? 'asic' : 'dissipateur', xProcesseurs[0] ?? 0, H + 0.14, zCarte);

  // Barrettes de mémoire : connecteurs et loquets fixes, barrette amovible.
  const xBarrettes: number[] = [];
  const PAS_RAM = 0.009;
  if (arch.asic) {
    for (let i = 0; i < arch.barrettes; i++) xBarrettes.push(0.148 + i * PAS_RAM);
  } else {
    for (const x of xProcesseurs) {
      for (let i = 0; i < arch.barrettes / 2; i++) xBarrettes.push(x - 0.053 - i * PAS_RAM, x + 0.053 + i * PAS_RAM);
    }
  }
  const hBarrette = Math.min(hi - 0.012, 0.03);
  const matBarrette = materiau(0x0f3a24, { rugosite: 0.5, metal: 0.2 });
  const matPuce = materiau(0x0b0c0e, { rugosite: 0.4 });
  const matLoquet = materiau(0xe8ebee, { rugosite: 0.6 });
  const matContact = materiau(0xd6b24c, { rugosite: 0.3, metal: 0.9 });
  for (const x of xBarrettes) {
    carte.add(boite(0.006, 0.004, 0.14, noirMat, x, ySurCarte, zCarte));
    for (const sz of [-1, 1]) carte.add(boite(0.006, hBarrette * 0.8, 0.006, matLoquet, x, ySurCarte, zCarte + sz * 0.071));
    const barrette = new THREE.Group();
    barrette.add(boite(0.0018, 0.003, 0.125, matContact, 0, 0, 0));
    barrette.add(boite(0.0018, hBarrette, 0.13, matBarrette, 0, 0.002, 0));
    for (let puce = 0; puce < 5; puce++) barrette.add(boite(0.0032, hBarrette * 0.42, 0.017, matPuce, 0, 0.002 + hBarrette * 0.4, -0.05 + puce * 0.025));
    barrette.position.set(x, ySurCarte + 0.004, zCarte);
    groupe.add(amovible(barrette, 'memoire', new THREE.Vector3(0, 0.075, 0)));
  }
  const xMem = xBarrettes.reduce((maximum, x) => Math.max(maximum, x), -1);
  etiqueter('memoire', xMem, H + 0.07, zCarte - 0.07);

  // Conduit d'air translucide (absent du serveur GPU, dont les cartes occupent l'avant).
  if (!arch.asic && !gpu) {
    const matConduit = materiau(0x9fb4c8, { opacite: 0.5, rugosite: 0.2 });
    const conduit = boite(L - 0.05, haut + 0.012, 0.2, matConduit, 0, ySurCarte, zCarte + 0.035);
    conduit.castShadow = false;
    conduit.raycast = () => {};
    conduitMat = matConduit;
    groupe.add(conduit);
  }

  // Cartes d'extension : chacune se retire par le haut.
  const matCarteFille = materiau(0xffffff, { rugosite: 0.6, metal: 0.1, map: pcb() });
  const carteFille = (kind: ComposantKind, x: number): void => {
    carte.add(boite(0.098, 0.011, 0.01, noirMat, x, yBase + 0.004, zArriere + 0.07));
    const g = new THREE.Group();
    g.add(boite(0.1, 0.002, 0.17, matCarteFille, 0, 0.014, 0));
    g.add(boite(0.034, 0.004, 0.034, matPuce, 0.01, 0.016, 0.02));
    g.add(boite(0.03, 0.0006, 0.018, matEtiquette, 0.01, 0.02, 0.02));
    const radiateur = new THREE.Group();
    radiateur.add(boite(0.042, 0.003, 0.042, alu));
    for (let i = 0; i < 7; i++) radiateur.add(boite(0.002, 0.012, 0.042, alu, -0.018 + i * 0.006, 0.003, 0));
    radiateur.position.set(-0.022, 0.016, -0.035);
    g.add(radiateur);
    g.add(boite(0.1, Math.min(hi, 0.03), 0.003, alu, 0, 0.004, -0.088));
    for (const dx of [-0.025, 0.025]) {
      g.add(boite(0.018, 0.013, 0.034, alu, dx, 0.016, -0.07));
      g.add(boite(0.014, 0.009, 0.003, noirMat, dx, 0.018, -0.0885));
    }
    if (kind === 'controleur') g.add(boite(0.026, 0.014, 0.05, sombre, 0.03, 0.016, -0.03));
    g.position.set(x, yBase, zArriere);
    groupe.add(amovible(g, kind, new THREE.Vector3(0, 0.07, 0)));
    etiqueter(kind, x, H + 0.05, zArriere - 0.03);
  };
  if (arch.carteReseau) carteFille('carte-reseau', -0.155);
  if (arch.controleur) {
    carteFille('controleur', -0.04);
    const matNappe = materiau(0x2f6fd0, { rugosite: 0.6 });
    const xFlanc = -L / 2 + 0.011;
    for (const dy of [0, 0.007]) {
      cable(
        groupe,
        [
          [-0.05, yBase + 0.022 + dy, zArriere + 0.06],
          [-0.14, yBase + 0.02 + dy, zArriere + 0.1],
          [xFlanc, yBase + 0.014 + dy, zBordArriere + 0.02],
          [xFlanc, yBase + 0.014 + dy, zVentilo - 0.03],
          [xDisques + 0.03, yBase + 0.016 + dy, zAvant - 0.142],
        ],
        matNappe,
        0.0032,
      );
    }
  }

  // Blocs d'alimentation redondants : chacun sort par l'arrière.
  const hAlim = Math.min(hi - 0.004, 0.04);
  const matVoyantAlim = materiau(0x0, { emissive: 0x3dff8a, intensite: 2.5 });
  for (const x of [0.085, 0.165]) {
    const bloc = new THREE.Group();
    bloc.add(boite(0.072, hAlim, 0.2, tole, 0, 0, 0));
    const etiquette = boite(0.05, 0.0006, 0.09, matEtiquette, 0, hAlim, 0.02);
    etiquette.castShadow = false;
    bloc.add(etiquette);
    bloc.add(boite(0.05, hAlim * 0.7, 0.004, sombre, 0, hAlim * 0.15, 0.101));
    bloc.add(boite(0.04, 0.004, 0.004, sombre, 0, hAlim * 0.5, -0.118));
    for (const sx of [-1, 1]) bloc.add(boite(0.004, 0.004, 0.018, sombre, sx * 0.018, hAlim * 0.5, -0.109));
    bloc.add(boite(0.006, 0.006, 0.002, matVoyantAlim, 0.026, hAlim * 0.75, -0.101));
    bloc.position.set(x, yBase, zArriere);
    groupe.add(amovible(bloc, 'alimentation', new THREE.Vector3(0, 0, -0.16)));
  }
  etiqueter('alimentation', 0.125, H + 0.09, zArriere);

  // Condensateurs disséminés sur la carte.
  const rnd = aleatoire(unite.nom.length * 13 + unite.u);
  const matCondo = materiau(0x1b1d21, { rugosite: 0.4, metal: 0.6 });
  for (let i = 0; i < 18; i++) {
    const condo = cylindre(0.0038, 0.009, matCondo, (rnd() - 0.5) * (L - 0.06), ySurCarte, zBordArriere + 0.045 + rnd() * 0.012, 10);
    condo.raycast = () => {};
    groupe.add(condo);
  }

  groupe.traverse((objet) => {
    if (objet instanceof THREE.Mesh) objet.receiveShadow = true;
  });
  return { groupe, composants, pieces, rotors, etiquettes, capot: { mesh: capot, mat: matCapot, repos: capot.position.y }, conduit: conduitMat };
}
