import * as THREE from 'three';
import type { ComposantKind } from '../types';
import { aleatoire, boite, cylindre, materiau, toile } from './outils';

/**
 * Modèles détaillés des composants, à l'échelle réelle (mètres), pour le mode « Examiner » :
 * on les tourne dans tous les sens, et la vue éclatée sépare leurs couches.
 */

/** Partie mobile de la vue éclatée : elle s'écarte de `ecart` quand le modèle est éclaté. */
export interface PartieExamen {
  readonly objet: THREE.Object3D;
  readonly ecart: THREE.Vector3;
}

export interface LegendeExamen {
  readonly texte: string;
  /** Position dans le repère de la partie (ou du modèle si `partie` est nul). */
  readonly position: THREE.Vector3;
  readonly partie: THREE.Object3D | null;
}

export interface ModeleExamen {
  readonly groupe: THREE.Group;
  readonly parties: readonly PartieExamen[];
  readonly legendes: readonly LegendeExamen[];
  /** Plus grande dimension, pour cadrer la caméra. */
  readonly taille: number;
}

export type Examinable = 'processeur' | 'dissipateur' | 'memoire' | 'disque' | 'gpu' | 'ventilateur' | 'alimentation';
const EXAMINABLES: readonly ComposantKind[] = ['processeur', 'dissipateur', 'memoire', 'disque', 'gpu', 'ventilateur', 'alimentation'];

export function estExaminable(kind: ComposantKind): kind is Examinable {
  return EXAMINABLES.includes(kind);
}

/* ---------- Matières et textures ---------- */

const metal = (couleur: number, rugosite = 0.3): THREE.MeshStandardMaterial => materiau(couleur, { rugosite, metal: 0.9 });
const OR = (): THREE.MeshStandardMaterial => metal(0xd6b24c, 0.25);

function textePuce(lignes: readonly string[], fondCouleur = '#15171a'): THREE.CanvasTexture {
  return toile(256, 256, (ctx) => {
    ctx.fillStyle = fondCouleur;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(230,234,238,0.75)';
    ctx.font = '600 30px monospace';
    lignes.forEach((l, i) => ctx.fillText(l, 22, 70 + i * 44));
    ctx.beginPath();
    ctx.arc(30, 222, 8, 0, Math.PI * 2);
    ctx.fill();
  });
}

function texturePcb(couleur: string, graine: number): THREE.CanvasTexture {
  return toile(512, 512, (ctx) => {
    const rnd = aleatoire(graine);
    ctx.fillStyle = couleur;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 70; i++) {
      let x = rnd() * 512;
      let y = rnd() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        if (rnd() > 0.5) x += (rnd() - 0.5) * 200;
        else y += (rnd() - 0.5) * 200;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rnd() > 0.5 ? '#c9b458' : '#d7dbe0';
      ctx.fillRect(rnd() * 512, rnd() * 512, 3 + rnd() * 4, 2 + rnd() * 2);
    }
  });
}

/** Grille de pastilles dorées (contacts LGA vus de dessous). */
function textureContacts(): THREE.CanvasTexture {
  return toile(512, 384, (ctx) => {
    ctx.fillStyle = '#1f4d36';
    ctx.fillRect(0, 0, 512, 384);
    ctx.fillStyle = '#d9b64e';
    for (let y = 10; y < 374; y += 6.5) {
      for (let x = 10 + ((y / 6.5) % 2) * 3.2; x < 502; x += 6.5) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** Rangée de contacts d'un connecteur de carte (barrette, carte PCIe). */
function textureDoigts(nombre: number): THREE.CanvasTexture {
  return toile(1024, 32, (ctx) => {
    ctx.fillStyle = '#115e3a';
    ctx.fillRect(0, 0, 1024, 32);
    ctx.fillStyle = '#d9b64e';
    const pas = 1024 / nombre;
    for (let i = 0; i < nombre; i++) ctx.fillRect(i * pas + pas * 0.15, 2, pas * 0.7, 30);
  });
}

function partie(groupe: THREE.Group, parties: PartieExamen[], ecart: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  groupe.add(g);
  parties.push({ objet: g, ecart });
  return g;
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/* ---------- Modèles ---------- */

/** Processeur serveur sur support LGA : capot IHS, puces, substrat et contacts. */
function processeur(): ModeleExamen {
  const groupe = new THREE.Group();
  const parties: PartieExamen[] = [];
  const legendes: LegendeExamen[] = [];
  const L = 0.0775;
  const P = 0.0565;

  const contacts = partie(groupe, parties, v(0, -0.018, 0));
  const dessous = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.004, P - 0.004).rotateX(Math.PI / 2), materiau(0xffffff, { rugosite: 0.4, metal: 0.5, map: textureContacts() }));
  dessous.position.y = -0.0002;
  contacts.add(dessous);
  legendes.push({ texte: '4 677 contacts plats (LGA)', position: v(-L / 2, -0.002, P / 2), partie: contacts });

  const substrat = partie(groupe, parties, v(0, 0, 0));
  substrat.add(boite(L, 0.0018, P, materiau(0xffffff, { rugosite: 0.5, map: texturePcb('#1f4d36', 11) })));
  // Condensateurs de découplage sur les bords.
  const matCondo = metal(0x8a6a3a, 0.4);
  for (let i = 0; i < 26; i++) {
    const x = -L / 2 + 0.004 + (i % 13) * 0.0055;
    substrat.add(boite(0.0012, 0.0006, 0.0008, matCondo, x, 0.0018, i < 13 ? -P / 2 + 0.003 : P / 2 - 0.003));
  }
  legendes.push({ texte: 'Substrat : relie les puces aux contacts', position: v(L / 2, 0.001, -P / 2), partie: substrat });

  const puces = partie(groupe, parties, v(0, 0.016, 0));
  const matPuce = materiau(0x3b4a63, { rugosite: 0.12, metal: 0.85 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) puces.add(boite(0.0205, 0.0008, 0.021, matPuce, sx * 0.0112, 0.0018, sz * 0.0113));
  }
  legendes.push({ texte: '4 puces de silicium (chiplets) : les cœurs de calcul', position: v(0.022, 0.003, 0.02), partie: puces });

  const ihs = partie(groupe, parties, v(0, 0.038, 0));
  const matIhs = materiau(0xffffff, {
    rugosite: 0.28,
    metal: 0.85,
    map: toile(512, 384, (ctx) => {
      ctx.fillStyle = '#c3c7cb';
      ctx.fillRect(0, 0, 512, 384);
      ctx.fillStyle = 'rgba(40,44,50,0.75)';
      ctx.font = '700 38px "Segoe UI", Arial';
      ctx.fillText('INTEL XEON', 60, 140);
      ctx.font = '600 28px monospace';
      ctx.fillText('GOLD 6430  32C', 60, 190);
      ctx.fillText('2.10 GHz  LGA4677', 60, 232);
    }),
  });
  ihs.add(boite(0.07, 0.003, 0.05, matIhs, 0, 0.0026, 0));
  ihs.add(boite(0.072, 0.0012, 0.052, metal(0xb0b5ba), 0, 0.0018, 0));
  legendes.push({ texte: 'Capot métallique (IHS) : répartit la chaleur', position: v(-0.03, 0.006, -0.02), partie: ihs });
  return { groupe, parties, legendes, taille: 0.09 };
}

/** Dissipateur : semelle en cuivre, caloducs et ailettes. */
function dissipateur(): ModeleExamen {
  const groupe = new THREE.Group();
  const parties: PartieExamen[] = [];
  const legendes: LegendeExamen[] = [];
  const semelle = partie(groupe, parties, v(0, -0.02, 0));
  semelle.add(boite(0.08, 0.005, 0.09, metal(0xc27a48, 0.25)));
  semelle.add(boite(0.05, 0.0006, 0.05, materiau(0x8f949a, { rugosite: 0.9 }), 0, -0.0006, 0));
  legendes.push({ texte: 'Semelle en cuivre et pâte thermique', position: v(0.04, 0.002, 0.045), partie: semelle });
  const caloducs = partie(groupe, parties, v(0, 0, 0));
  for (let i = 0; i < 4; i++) {
    const x = -0.024 + i * 0.016;
    const courbe = new THREE.CatmullRomCurve3([v(x, 0.004, -0.03), v(x, 0.004, 0.02), v(x, 0.02, 0.04), v(x, 0.05, 0.04)]);
    caloducs.add(new THREE.Mesh(new THREE.TubeGeometry(courbe, 24, 0.003, 10), metal(0xc27a48, 0.3)));
  }
  legendes.push({ texte: 'Caloducs : transportent la chaleur', position: v(0.03, 0.03, 0.04), partie: caloducs });
  const ailettes = partie(groupe, parties, v(0, 0.025, 0));
  for (let i = 0; i < 28; i++) ailettes.add(boite(0.0008, 0.045, 0.09, metal(0xd5d9dd, 0.35), -0.039 + i * 0.0029, 0.006, 0));
  legendes.push({ texte: '28 ailettes en aluminium', position: v(-0.04, 0.05, -0.045), partie: ailettes });
  return { groupe, parties, legendes, taille: 0.1 };
}

/** Barrette DDR5 RDIMM : circuit, puces DRAM des deux faces, RCD, PMIC, SPD, contacts. */
function memoire(): ModeleExamen {
  const groupe = new THREE.Group();
  const parties: PartieExamen[] = [];
  const legendes: LegendeExamen[] = [];
  const L = 0.13335;
  const H = 0.03125;
  const E = 0.00127;

  const circuit = partie(groupe, parties, v(0, 0, 0));
  const matPcb = materiau(0xffffff, { rugosite: 0.5, map: texturePcb('#115e3a', 21) });
  // Circuit en deux morceaux autour du détrompeur.
  const xEncoche = -0.0076;
  circuit.add(boite(L / 2 + xEncoche - 0.001, H, E, matPcb, (-L / 2 + xEncoche - 0.001) / 2, -H / 2, 0));
  circuit.add(boite(L / 2 - xEncoche - 0.001, H, E, matPcb, (L / 2 + xEncoche + 0.001) / 2, -H / 2, 0));
  circuit.add(boite(0.0022, H - 0.004, E, matPcb, xEncoche, -H / 2 + 0.004, 0));
  const doigts = materiau(0xffffff, { rugosite: 0.25, metal: 0.8, map: textureDoigts(72) });
  for (const z of [E / 2 + 0.0001, -E / 2 - 0.0001]) {
    const bande = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.004, 0.004), doigts);
    bande.position.set(0, -H / 2 + 0.002, z);
    if (z < 0) bande.rotation.y = Math.PI;
    circuit.add(bande);
  }
  legendes.push({ texte: '288 contacts dorés', position: v(0.05, -H / 2, 0.002), partie: circuit });
  legendes.push({ texte: 'Détrompeur : un seul sens possible', position: v(xEncoche, -H / 2 + 0.002, 0.002), partie: circuit });

  const matDram = materiau(0xffffff, { rugosite: 0.45, map: textePuce(['DDR5', '16Gb', 'x4'], '#141518') });
  const matRcd = materiau(0xffffff, { rugosite: 0.45, map: textePuce(['RCD', 'DDR5'], '#202326') });
  const matPmic = materiau(0xffffff, { rugosite: 0.45, map: textePuce(['PMIC'], '#202326') });
  for (const face of [1, -1] as const) {
    const cote = partie(groupe, parties, v(0, 0, face * 0.012));
    for (let i = 0; i < 10; i++) {
      const x = -L / 2 + 0.008 + i * 0.0124 + (i >= 5 ? 0.011 : 0);
      cote.add(boite(0.0095, 0.0112, 0.0011, matDram, x, -0.0075, face * (E / 2 + 0.00055)));
    }
    if (face === 1) {
      cote.add(boite(0.0105, 0.0105, 0.0012, matRcd, 0.0005, -0.0072, E / 2 + 0.0006));
      cote.add(boite(0.006, 0.006, 0.0011, matPmic, 0.0005, 0.006, E / 2 + 0.0006));
      cote.add(boite(0.003, 0.003, 0.0008, matDram, 0.06, 0.008, E / 2 + 0.0004));
      // Étiquette du fabricant.
      const etiquette = materiau(0xffffff, {
        rugosite: 0.8,
        map: toile(512, 96, (ctx) => {
          ctx.fillStyle = '#f2f3f5';
          ctx.fillRect(0, 0, 512, 96);
          ctx.fillStyle = '#1e2125';
          ctx.font = '700 30px monospace';
          ctx.fillText('64GB 2Rx4 PC5-4800B-RB0', 14, 42);
          ctx.font = '500 24px monospace';
          ctx.fillText('RDIMM  ECC  1.1V', 14, 78);
        }),
      });
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.0085), etiquette);
      plaque.position.set(-0.035, 0.0085, E / 2 + 0.0002);
      cote.add(plaque);
      legendes.push({ texte: '10 puces DRAM par face : la mémoire', position: v(-0.05, -0.002, 0.002), partie: cote });
      legendes.push({ texte: 'Registre d’horloge (RCD)', position: v(0.0005, -0.0015, 0.002), partie: cote });
      legendes.push({ texte: 'Gestion d’alimentation (PMIC)', position: v(0.0005, 0.0095, 0.002), partie: cote });
      legendes.push({ texte: 'Puce SPD : décrit la barrette', position: v(0.06, 0.0105, 0.002), partie: cote });
    }
  }
  return { groupe, parties, legendes, taille: 0.14 };
}

/** SSD 2,5" dans son tiroir : boîtier, capot, circuit avec puces NAND, contrôleur et cache. */
function disque(): ModeleExamen {
  const groupe = new THREE.Group();
  const parties: PartieExamen[] = [];
  const legendes: LegendeExamen[] = [];
  const W = 0.06985;
  const D = 0.1;
  const T = 0.015;

  const tiroir = partie(groupe, parties, v(0, 0, 0.045));
  const matTiroir = materiau(0x6b737d, { rugosite: 0.4, metal: 0.6 });
  for (const sx of [-1, 1]) tiroir.add(boite(0.003, T + 0.002, D + 0.01, matTiroir, sx * (W / 2 + 0.0035), -0.001, 0));
  tiroir.add(boite(W + 0.01, T + 0.004, 0.012, materiau(0x2a2f36, { rugosite: 0.5 }), 0, -0.002, D / 2 + 0.01));
  tiroir.add(boite(0.03, 0.004, 0.006, materiau(0x2e8b57, { rugosite: 0.5 }), 0, T - 0.002, D / 2 + 0.017));
  legendes.push({ texte: 'Tiroir : remplacement à chaud', position: v(0, T + 0.004, D / 2 + 0.012), partie: tiroir });

  const fond = partie(groupe, parties, v(0, -0.012, 0));
  fond.add(boite(W, 0.006, D, metal(0x9ba2aa, 0.4)));
  const circuit = partie(groupe, parties, v(0, 0.012, 0));
  circuit.add(boite(W - 0.004, 0.0012, D - 0.006, materiau(0xffffff, { rugosite: 0.5, map: texturePcb('#0e4a2e', 31) }), 0, 0.006, 0));
  const matNand = materiau(0xffffff, { rugosite: 0.45, map: textePuce(['NAND', '3D TLC', '1Tb']) });
  for (let i = 0; i < 4; i++) {
    for (const sx of [-1, 1]) circuit.add(boite(0.014, 0.0012, 0.018, matNand, sx * 0.016, 0.0072, -0.035 + i * 0.021));
  }
  circuit.add(boite(0.016, 0.0014, 0.016, materiau(0xffffff, { rugosite: 0.4, map: textePuce(['CTRL', 'NVMe']) }), 0, 0.0072, 0.038));
  circuit.add(boite(0.008, 0.0012, 0.012, materiau(0xffffff, { rugosite: 0.45, map: textePuce(['DRAM']) }), 0.022, 0.0072, 0.038));
  circuit.add(boite(0.03, 0.004, 0.004, OR(), -0.012, 0.0055, -D / 2 + 0.002));
  legendes.push({ texte: '8 puces NAND : les données', position: v(-0.03, 0.009, -0.01), partie: circuit });
  legendes.push({ texte: 'Contrôleur', position: v(0, 0.009, 0.038), partie: circuit });
  legendes.push({ texte: 'Cache DRAM', position: v(0.026, 0.009, 0.045), partie: circuit });
  legendes.push({ texte: 'Connecteur SAS', position: v(-0.012, 0.009, -D / 2), partie: circuit });

  const capot = partie(groupe, parties, v(0, 0.035, 0));
  const matCapot = materiau(0xffffff, {
    rugosite: 0.35,
    metal: 0.8,
    map: toile(256, 384, (ctx) => {
      ctx.fillStyle = '#aab1b8';
      ctx.fillRect(0, 0, 256, 384);
      ctx.fillStyle = '#f2f3f5';
      ctx.fillRect(24, 40, 208, 160);
      ctx.fillStyle = '#1e2125';
      ctx.font = '700 22px monospace';
      ctx.fillText('SSD 3.84TB', 40, 80);
      ctx.font = '500 18px monospace';
      ctx.fillText('SAS 24G  2.5in', 40, 112);
      ctx.fillText('Mixed Use', 40, 140);
    }),
  });
  capot.add(boite(W, 0.004, D, matCapot, 0, T - 0.004, 0));
  legendes.push({ texte: 'Capot du SSD', position: v(W / 2, T, 0), partie: capot });
  return { groupe, parties, legendes, taille: 0.13 };
}

/** Carte NVIDIA A100 PCIe : circuit, puce GA100 et HBM2e, radiateur passif, carénage. */
function gpu(): ModeleExamen {
  const groupe = new THREE.Group();
  const parties: PartieExamen[] = [];
  const legendes: LegendeExamen[] = [];
  const Lc = 0.267;
  const Hc = 0.111;

  const circuit = partie(groupe, parties, v(0, 0, -0.015));
  circuit.add(boite(Lc, Hc - 0.006, 0.0016, materiau(0xffffff, { rugosite: 0.5, map: texturePcb('#15201a', 41) }), 0, -Hc / 2 + 0.006, -0.012));
  const doigts = new THREE.Mesh(new THREE.PlaneGeometry(0.089, 0.009), materiau(0xffffff, { rugosite: 0.25, metal: 0.8, map: textureDoigts(82) }));
  doigts.position.set(0.02, -Hc / 2 + 0.0015, -0.0111);
  circuit.add(doigts);
  for (let i = 0; i < 3; i++) circuit.add(boite(0.018, 0.003, 0.0012, OR(), -0.05 + i * 0.03, Hc / 2 - 0.004, -0.012));
  circuit.add(boite(0.02, 0.012, 0.01, materiau(0x111214, { rugosite: 0.6 }), Lc / 2 - 0.02, Hc / 2 - 0.016, -0.006));
  // Équerre de fixation, percée d'aérations.
  const equerre = boite(0.0015, 0.12, 0.036, metal(0xc4cad1, 0.35), -Lc / 2 - 0.001, -0.06, 0);
  circuit.add(equerre);
  legendes.push({ texte: 'Connecteur PCIe 4.0 x16', position: v(0.02, -Hc / 2, -0.01), partie: circuit });
  legendes.push({ texte: 'Connecteurs NVLink (pont entre cartes)', position: v(-0.02, Hc / 2, -0.012), partie: circuit });
  legendes.push({ texte: 'Alimentation 8 broches', position: v(Lc / 2 - 0.02, Hc / 2 - 0.004, -0.006), partie: circuit });

  const puce = partie(groupe, parties, v(0, 0, 0.012));
  puce.add(boite(0.055, 0.055, 0.0015, materiau(0x1f4d36, { rugosite: 0.5 }), 0, -0.0275, -0.011));
  puce.add(boite(0.029, 0.029, 0.0008, materiau(0x3b4a63, { rugosite: 0.1, metal: 0.85 }), 0, -0.0145, -0.0095));
  const matHbm = materiau(0x23272c, { rugosite: 0.2, metal: 0.6 });
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) puce.add(boite(0.008, 0.011, 0.0009, matHbm, sx * 0.0205, -0.0055 - 0.0165 + k * 0.0115 - 0.005, -0.0095));
  }
  legendes.push({ texte: 'Puce GA100 : 54 milliards de transistors', position: v(0, 0.002, -0.009), partie: puce });
  legendes.push({ texte: 'Mémoire HBM2e empilée', position: v(0.026, 0.012, -0.009), partie: puce });

  const radiateur = partie(groupe, parties, v(0, 0, 0.032));
  for (let i = 0; i < 46; i++) radiateur.add(boite(0.0012, 0.092, 0.022, metal(0xd5d9dd, 0.35), -Lc / 2 + 0.012 + i * 0.0053, -0.048, -0.006));
  legendes.push({ texte: 'Radiateur passif : l’air du serveur le traverse', position: v(0.06, 0.046, 0.005), partie: radiateur });

  const carenage = partie(groupe, parties, v(0, 0, 0.06));
  const matCarenage = materiau(0xffffff, {
    rugosite: 0.32,
    metal: 0.85,
    map: toile(1024, 432, (ctx) => {
      const d = ctx.createLinearGradient(0, 0, 0, 432);
      d.addColorStop(0, '#d9dcdf');
      d.addColorStop(1, '#a9aeb3');
      ctx.fillStyle = d;
      ctx.fillRect(0, 0, 1024, 432);
      ctx.fillStyle = 'rgba(60,64,70,0.35)';
      for (let x = 40; x < 1000; x += 18) ctx.fillRect(x, 60, 7, 312);
      ctx.fillStyle = '#2a2e33';
      ctx.font = '800 54px "Segoe UI", Arial';
      ctx.fillText('NVIDIA', 60, 40 + 10);
      ctx.font = '700 40px "Segoe UI", Arial';
      ctx.fillText('A100', 880, 410);
    }),
  });
  carenage.add(boite(Lc - 0.004, 0.1, 0.002, matCarenage, 0, -0.05, 0.015));
  for (const sy of [-1, 1]) carenage.add(boite(Lc - 0.004, 0.002, 0.03, metal(0xb9bec4), 0, sy > 0 ? 0.048 : -0.05, 0.001));
  legendes.push({ texte: 'Carénage : guide l’air dans le radiateur', position: v(-0.08, 0.04, 0.016), partie: carenage });
  return { groupe, parties, legendes, taille: 0.28 };
}

/** Module ventilateur 60 mm remplaçable à chaud. */
function ventilateur(): ModeleExamen {
  const groupe = new THREE.Group();
  const parties: PartieExamen[] = [];
  const legendes: LegendeExamen[] = [];
  const C = 0.06;
  const cadre = partie(groupe, parties, v(0, 0, 0));
  const matCadre = materiau(0x1d2026, { rugosite: 0.55, metal: 0.2 });
  for (const sx of [-1, 1]) cadre.add(boite(0.006, C, 0.038, matCadre, sx * (C / 2 - 0.003), -C / 2, 0));
  for (const sy of [-1, 1]) cadre.add(boite(C, 0.006, 0.038, matCadre, 0, sy > 0 ? C / 2 - 0.006 : -C / 2, 0));
  const anneau = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0025, 8, 40), matCadre);
  cadre.add(anneau);
  cadre.add(boite(0.03, 0.006, 0.012, materiau(0xf2720c, { rugosite: 0.6 }), 0, C / 2, -0.012));
  cadre.add(boite(0.012, 0.008, 0.006, materiau(0xe8e4d6, { rugosite: 0.6 }), 0.02, -C / 2 - 0.008, -0.014));
  legendes.push({ texte: 'Poignée de remplacement à chaud', position: v(0, C / 2 + 0.006, -0.012), partie: cadre });
  legendes.push({ texte: 'Connecteur d’alimentation', position: v(0.02, -C / 2 - 0.008, -0.014), partie: cadre });
  const rotor = partie(groupe, parties, v(0, 0, 0.04));
  const moyeu = cylindre(0.011, 0.02, materiau(0x2a2e33, { rugosite: 0.4 }), 0, -0.01, 0, 24);
  moyeu.rotation.x = Math.PI / 2;
  rotor.add(moyeu);
  for (let k = 0; k < 7; k++) {
    const bras = new THREE.Group();
    bras.rotation.z = (k * Math.PI * 2) / 7;
    const pale = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.009, 0.0015), materiau(0x30363d, { rugosite: 0.5 }));
    pale.position.x = 0.018;
    pale.rotation.x = 0.55;
    bras.add(pale);
    rotor.add(bras);
  }
  legendes.push({ texte: 'Rotor à 7 pales, vitesse pilotée', position: v(0.018, 0.012, 0), partie: rotor });
  return { groupe, parties, legendes, taille: 0.075 };
}

/** Bloc d'alimentation redondant : boîtier, transformateur, condensateurs, ventilateur. */
function alimentation(): ModeleExamen {
  const groupe = new THREE.Group();
  const parties: PartieExamen[] = [];
  const legendes: LegendeExamen[] = [];
  const W = 0.0735;
  const T = 0.04;
  const D = 0.185;
  const fond = partie(groupe, parties, v(0, 0, 0));
  fond.add(boite(W, 0.002, D, metal(0x9ba2aa, 0.4)));
  for (const sx of [-1, 1]) fond.add(boite(0.0015, T, D, metal(0x9ba2aa, 0.4), sx * (W / 2 - 0.00075), 0, 0));
  fond.add(boite(W, T, 0.003, materiau(0x2a2e33, { rugosite: 0.5 }), 0, 0, -D / 2));
  fond.add(boite(0.03, 0.006, 0.003, OR(), 0, 0.005, D / 2));
  const interieur = partie(groupe, parties, v(0, 0.02, 0));
  interieur.add(boite(W - 0.006, 0.0015, D - 0.01, materiau(0xffffff, { rugosite: 0.5, map: texturePcb('#123d2b', 51) }), 0, 0.002, 0));
  interieur.add(boite(0.026, 0.024, 0.026, materiau(0xd9b23c, { rugosite: 0.6 }), -0.012, 0.0035, 0.01));
  for (let i = 0; i < 3; i++) interieur.add(cylindre(0.0055, 0.026, materiau(0x1f2a44, { rugosite: 0.4, metal: 0.3 }), 0.018, 0.0035, -0.04 + i * 0.013, 16));
  for (let i = 0; i < 8; i++) interieur.add(boite(0.0012, 0.022, 0.05, metal(0xd5d9dd, 0.35), -0.03 + i * 0.004, 0.0035, -0.05));
  const ventilo = cylindre(0.017, 0.006, materiau(0x2a2e33, { rugosite: 0.5 }), 0, 0.012, -D / 2 + 0.006, 24);
  ventilo.rotation.x = Math.PI / 2;
  interieur.add(ventilo);
  legendes.push({ texte: 'Transformateur', position: v(-0.012, 0.03, 0.01), partie: interieur });
  legendes.push({ texte: 'Condensateurs de filtrage', position: v(0.018, 0.031, -0.03), partie: interieur });
  legendes.push({ texte: 'Radiateur des semi-conducteurs', position: v(-0.016, 0.027, -0.06), partie: interieur });
  legendes.push({ texte: 'Connecteur vers le serveur', position: v(0, 0.01, D / 2), partie: fond });
  const capot = partie(groupe, parties, v(0, 0.05, 0));
  capot.add(boite(W, 0.0015, D, metal(0xb0b6bd, 0.35), 0, T - 0.0015, 0));
  legendes.push({ texte: 'Capot', position: v(W / 2, T, 0), partie: capot });
  return { groupe, parties, legendes, taille: 0.2 };
}

/** Modèle détaillé d'un composant, centré sur l'origine. */
export function modeleExamen(kind: Examinable): ModeleExamen {
  const modele = {
    processeur,
    dissipateur,
    memoire,
    disque,
    gpu,
    ventilateur,
    alimentation,
  }[kind]();
  // Centre le modèle (vue rassemblée) sur l'origine.
  const boiteEnglobante = new THREE.Box3().setFromObject(modele.groupe);
  const centre = boiteEnglobante.getCenter(new THREE.Vector3());
  for (const enfant of modele.groupe.children) enfant.position.sub(centre);
  modele.groupe.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return modele;
}
