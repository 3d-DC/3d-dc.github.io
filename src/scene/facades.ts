import * as THREE from 'three';
import { CONTENU_BAIE } from '../baies';
import type { RackKind, UniteBaie } from '../types';
import { aleatoire, creerCanvas } from './outils';

/**
 * Faces avant des équipements, dessinées sur canvas d'après la disposition réelle de chaque modèle :
 * groupes de ports par type et par vitesse, numérotation, ports d'administration, panneaux de commande.
 * Les marques sont écrites en texte simple : aucun logo n'est reproduit.
 */

export interface Facade {
  readonly map: THREE.CanvasTexture;
  /** Voyants et écrans : seule cette texture « s'allume ». */
  readonly emissive: THREE.CanvasTexture;
  readonly canvasMap: HTMLCanvasElement;
  readonly canvasEmi: HTMLCanvasElement;
}

/** Types de ports en façade. */
export type TypePort = 'rj45' | 'sfp' | 'sfp+' | 'sfp28' | 'qsfp28' | 'console' | 'mgmt' | 'usb';

/** Port dessiné, en coordonnées logiques de la façade (origine en haut à gauche). */
export interface Port {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly type: TypePort;
  /** Un câble ou un module optique y est branché. */
  readonly occupe: boolean;
}

const VERT = '#3dff8a';
const AMBRE = '#ffb020';
const BLEU = '#4db8ff';
const POLICE = '"Segoe UI", Arial, sans-serif';

/** Largeur logique d'une façade (0,445 m) ; la hauteur vaut 64 par unité de baie. 1 mm ≈ 1,44 unité. */
export const LARGEUR_FACADE = 640;
export const HAUTEUR_U = 64;
const L = LARGEUR_FACADE;
const H_U = HAUTEUR_U;

/** Dimensions des ports, en unités logiques. */
const DIM: Record<TypePort, { w: number; h: number }> = {
  rj45: { w: 16.5, h: 18.5 },
  console: { w: 16.5, h: 18.5 },
  mgmt: { w: 16.5, h: 18.5 },
  sfp: { w: 19.5, h: 13.5 },
  'sfp+': { w: 19.5, h: 13.5 },
  sfp28: { w: 19.5, h: 13.5 },
  qsfp28: { w: 26, h: 12.5 },
  usb: { w: 17, h: 7 },
};

/** Couleur de la languette des modules optiques, selon le débit. */
const LANGUETTE: Record<TypePort, string> = {
  rj45: '#000',
  console: '#000',
  mgmt: '#000',
  usb: '#000',
  sfp: '#6b7480',
  'sfp+': '#e8dcc0',
  sfp28: '#2bb6c9',
  qsfp28: '#7c6ee6',
};

/** Part des ports occupés, par type. */
const TAUX_OCCUPATION: Record<TypePort, number> = {
  rj45: 0.75,
  console: 0.5,
  mgmt: 1,
  usb: 0,
  sfp: 0.6,
  'sfp+': 0.6,
  sfp28: 0.55,
  qsfp28: 0.5,
};

function texture(canvas: HTMLCanvasElement, couleur: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  if (couleur) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

interface Pinceau {
  readonly m: CanvasRenderingContext2D;
  readonly e: CanvasRenderingContext2D;
  readonly H: number;
  readonly rnd: () => number;
  readonly ports: Port[];
}

function voyant(p: Pinceau, x: number, y: number, couleur: string, taille = 4): void {
  for (const ctx of [p.m, p.e]) {
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.arc(x + taille / 2, y + taille / 2, taille / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Écrit un texte en réduisant la police jusqu'à ce qu'il tienne dans `largeur`. */
function ecrire(
  ctx: CanvasRenderingContext2D,
  texte: string,
  x: number,
  y: number,
  largeur: number,
  taille: number,
  couleur: string,
  graisse = 600,
  alignement: CanvasTextAlign = 'left',
): void {
  let t = taille;
  ctx.font = `${graisse} ${t}px ${POLICE}`;
  while (t > 3.5 && ctx.measureText(texte).width > largeur) {
    t -= 0.25;
    ctx.font = `${graisse} ${t}px ${POLICE}`;
  }
  ctx.fillStyle = couleur;
  ctx.textBaseline = 'middle';
  ctx.textAlign = alignement;
  ctx.fillText(texte, x, y);
  ctx.textAlign = 'left';
}

function fond(p: Pinceau, haut: string, bas: string): void {
  const degrade = p.m.createLinearGradient(0, 0, 0, p.H);
  degrade.addColorStop(0, haut);
  degrade.addColorStop(1, bas);
  p.m.fillStyle = degrade;
  p.m.fillRect(0, 0, L, p.H);
  p.m.fillStyle = 'rgba(255,255,255,0.12)';
  p.m.fillRect(0, 0, L, 1.2);
  p.m.fillStyle = 'rgba(0,0,0,0.35)';
  p.m.fillRect(0, p.H - 1.2, L, 1.2);
  p.e.fillStyle = '#000';
  p.e.fillRect(0, 0, L, p.H);
}

function oreilles(p: Pinceau, couleur: string): void {
  for (const x of [0, L - 22]) {
    p.m.fillStyle = couleur;
    p.m.fillRect(x, 0, 22, p.H);
    p.m.fillStyle = 'rgba(255,255,255,0.08)';
    p.m.fillRect(x + (x === 0 ? 20 : 0), 0, 2, p.H);
    p.m.fillStyle = '#121418';
    for (const y of p.H > H_U ? [p.H * 0.22, p.H * 0.78] : [p.H / 2]) {
      p.m.beginPath();
      p.m.arc(x + 11, y, 3.6, 0, Math.PI * 2);
      p.m.fill();
      p.m.fillStyle = '#5b636e';
      p.m.fillRect(x + 9, y - 0.6, 4, 1.2);
      p.m.fillStyle = '#121418';
    }
  }
}

/* ---------- Ports ---------- */

/** Dessine un port et l'enregistre ; `bas` vaut vrai pour la rangée du bas (prises tête-bêche). */
function port(p: Pinceau, type: TypePort, x: number, y: number, bas: boolean, occupe: boolean): void {
  const { w, h } = DIM[type];
  const m = p.m;
  p.ports.push({ x, y, w, h, type, occupe });
  if (type === 'rj45' || type === 'console' || type === 'mgmt') {
    // Blindage métallique, ouverture, détrompeur et huit contacts dorés.
    m.fillStyle = type === 'console' ? '#5b8fd6' : type === 'mgmt' ? '#d0a24a' : '#aeb5be';
    m.fillRect(x, y, w, h);
    m.fillStyle = '#08090b';
    m.fillRect(x + 1.6, y + 2.6, w - 3.2, h - 5);
    const yEncoche = bas ? y + 2.6 : y + h - 6.4;
    m.fillRect(x + w / 2 - 3, yEncoche + (bas ? -1.8 : 1.8), 6, 3.8);
    m.fillStyle = '#c8a54a';
    const yContacts = bas ? y + h - 6 : y + 3.4;
    for (let k = 0; k < 8; k++) m.fillRect(x + 3 + k * ((w - 6) / 8), yContacts, 0.9, 2.6);
    // Voyants de lien (vert) et d'activité ou PoE (ambre) dans les angles.
    const yVoyant = bas ? y + h - 2.2 : y + 0.4;
    if (occupe) {
      voyant(p, x + 1.2, yVoyant, VERT, 2);
      if (type === 'rj45' && p.rnd() > 0.45) voyant(p, x + w - 3.2, yVoyant, AMBRE, 2);
    } else {
      m.fillStyle = '#3d434b';
      m.fillRect(x + 1.2, yVoyant, 2, 2);
      m.fillRect(x + w - 3.2, yVoyant, 2, 2);
    }
    return;
  }
  if (type === 'usb') {
    m.fillStyle = '#9aa1a9';
    m.fillRect(x, y, w, h);
    m.fillStyle = '#0a0b0d';
    m.fillRect(x + 1, y + 1, w - 2, h - 2);
    m.fillStyle = '#2f6fd0';
    m.fillRect(x + 2, y + (bas ? h - 3.5 : 1.8), w - 4, 1.8);
    return;
  }
  // Cage SFP ou QSFP : tôle emboutie, ouverture, et module optique si le port est occupé.
  m.fillStyle = '#c3c9d0';
  m.fillRect(x, y, w, h);
  m.fillStyle = '#9aa2ab';
  for (let k = 0; k < 3; k++) m.fillRect(x + 2 + k * ((w - 4) / 3), y + (bas ? h - 1.6 : 0.4), (w - 4) / 3 - 1.5, 1.2);
  m.fillStyle = '#07080a';
  m.fillRect(x + 1.4, y + 1.8, w - 2.8, h - 3.6);
  if (occupe) {
    // Face du module : deux ouvertures LC et languette de couleur.
    m.fillStyle = '#4b525b';
    m.fillRect(x + 2.2, y + 2.6, w - 4.4, h - 5.2);
    m.fillStyle = '#e7e2d3';
    const lc = type === 'qsfp28' ? 4.4 : 3.2;
    m.fillRect(x + w / 2 - lc - 0.8, y + h / 2 - 1.6, lc, 3.2);
    m.fillRect(x + w / 2 + 0.8, y + h / 2 - 1.6, lc, 3.2);
    m.fillStyle = LANGUETTE[type];
    m.fillRect(x + 2.2, bas ? y + h - 3.6 : y + 2.6, w - 4.4, 1.6);
  }
  // Voyant de lien, sous forme de petite flèche (vers le haut pour la rangée du haut).
  for (const ctx of [m, p.e]) {
    ctx.fillStyle = occupe ? VERT : '#2a2f36';
    ctx.beginPath();
    const cx = x + w + 1.2;
    const cy = y + h / 2;
    ctx.moveTo(cx, cy + (bas ? -1.6 : 1.6));
    ctx.lineTo(cx + 2.6, cy + (bas ? -1.6 : 1.6));
    ctx.lineTo(cx + 1.3, cy + (bas ? 1.4 : -1.4));
    ctx.closePath();
    if (ctx === m || occupe) ctx.fill();
  }
}

interface Groupe {
  readonly type: TypePort;
  readonly nombre: number;
  readonly rangees: 1 | 2;
  /** Abscisse du premier port et ordonnée du haut de la première rangée. */
  readonly x: number;
  readonly y: number;
  /** Distance entre deux colonnes de ports. */
  readonly pas?: number;
  /** Ports regroupés par paquets (petit écart entre paquets), 0 = aucun. */
  readonly paquet?: number;
  readonly premier?: number;
  /** Texte au-dessus du groupe : débit et type d'interface. */
  readonly titre?: string;
  /** Afficher le numéro de chaque port. */
  readonly numeros?: boolean;
  /** Préfixe des numéros (« 1/0/ », « Gi0/0/ »…). */
  readonly prefixe?: string;
  /** Libellé sous chaque port (ports d'administration). */
  readonly libelles?: readonly string[];
}

/** Dessine un groupe de ports (numérotés en colonnes : impairs en haut, pairs en bas) et renvoie l'abscisse de fin. */
function groupe(p: Pinceau, g: Groupe): number {
  const { w, h } = DIM[g.type];
  const pas = g.pas ?? w + 3;
  const colonnes = Math.ceil(g.nombre / g.rangees);
  const ecartRangees = g.type === 'rj45' || g.type === 'mgmt' || g.type === 'console' ? 1.5 : 4;
  const premier = g.premier ?? 1;
  let xFin = g.x;
  for (let c = 0; c < colonnes; c++) {
    const x = g.x + c * pas + (g.paquet ? Math.floor(c / g.paquet) * 4 : 0);
    for (let r = 0; r < g.rangees; r++) {
      const index = c * g.rangees + r;
      if (index >= g.nombre) break;
      const y = g.y + r * (h + ecartRangees);
      port(p, g.type, x, y, r === 1, p.rnd() < TAUX_OCCUPATION[g.type]);
      if (g.numeros) {
        const numero = `${g.prefixe ?? ''}${premier + index}`;
        const yTexte = r === 0 ? y - 2.6 : y + h + 2.8;
        ecrire(p.m, numero, x + w / 2, yTexte, pas - 1, 4.2, '#c9d1da', 600, 'center');
      }
      if (g.libelles?.[index]) ecrire(p.m, g.libelles[index] ?? '', x + w / 2, y + h + 3, pas + 6, 4.2, '#e6e9ec', 700, 'center');
    }
    xFin = x + w;
  }
  if (g.titre) {
    // Titre du groupe et trait de regroupement, comme sur la sérigraphie réelle.
    const yTitre = g.y - (g.numeros ? 8.6 : 4.4);
    ecrire(p.m, g.titre, g.x, yTitre, xFin - g.x + 20, 4.6, '#f1f4f7', 700);
    p.m.fillStyle = 'rgba(241,244,247,0.35)';
    p.m.fillRect(g.x, yTitre + 3, xFin - g.x, 0.6);
  }
  return xFin;
}

/* ---------- Disques ---------- */

/** Tiroir de disque 2,5" vertical : poignée, bouton d'éjection, voyants. */
function disque25(p: Pinceau, x: number, y: number, w: number, h: number, style: 'hpe' | 'dell'): void {
  const m = p.m;
  m.fillStyle = '#0b0c0e';
  m.fillRect(x, y, w, h);
  m.fillStyle = style === 'hpe' ? '#8a929c' : '#22252a';
  m.fillRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6);
  // Grille d'aération du tiroir.
  m.fillStyle = 'rgba(0,0,0,0.5)';
  for (let gy = y + 14; gy < y + h - 22; gy += 3.2) m.fillRect(x + 3, gy, w - 6, 1.4);
  // Poignée et bouton d'éjection.
  m.fillStyle = style === 'hpe' ? '#5b636e' : '#6b737d';
  m.fillRect(x + 2.4, y + h - 20, w - 4.8, 16);
  m.fillStyle = style === 'hpe' ? '#2e8b57' : '#4f7cc4';
  m.fillRect(x + w / 2 - 2.5, y + h - 8, 5, 3);
  // Voyants d'activité et de panne en tête du tiroir.
  voyant(p, x + 2.4, y + 3, p.rnd() > 0.93 ? AMBRE : VERT, 2.6);
  voyant(p, x + w - 5, y + 3, BLEU, 2.6);
  m.fillStyle = '#e8ecef';
  m.fillRect(x + 2.4, y + 8, w - 4.8, 3);
}

/** Tiroir de disque 3,5" horizontal. */
function disque35(p: Pinceau, x: number, y: number, w: number, h: number, style: 'hpe' | 'dell'): void {
  const m = p.m;
  m.fillStyle = '#0b0c0e';
  m.fillRect(x, y, w, h);
  m.fillStyle = style === 'hpe' ? '#8a929c' : '#22252a';
  m.fillRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6);
  m.fillStyle = 'rgba(0,0,0,0.5)';
  for (let gx = x + 22; gx < x + w - 8; gx += 3.2) m.fillRect(gx, y + 4, 1.4, h - 8);
  m.fillStyle = style === 'hpe' ? '#5b636e' : '#6b737d';
  m.fillRect(x + 3, y + 3, 16, h - 6);
  m.fillStyle = style === 'hpe' ? '#2e8b57' : '#4f7cc4';
  m.fillRect(x + 7, y + h / 2 - 3, 3, 6);
  voyant(p, x + w - 6, y + 3, p.rnd() > 0.93 ? AMBRE : VERT, 2.6);
  voyant(p, x + w - 6, y + h - 6, BLEU, 2.6);
}

function obturateur(p: Pinceau, x: number, y: number, w: number, h: number): void {
  p.m.fillStyle = '#16181c';
  p.m.fillRect(x, y, w, h);
  p.m.fillStyle = '#2a2e34';
  for (let gx = x + 3; gx < x + w - 2; gx += 3.4) p.m.fillRect(gx, y + 3, 1.6, h - 6);
}

/** Panneau de commande d'oreille de serveur : bouton marche, voyants, USB, port de gestion, VGA. */
function panneauServeur(p: Pinceau, x: number, style: 'hpe' | 'dell', gauche: boolean): void {
  const m = p.m;
  const H = p.H;
  if (gauche) {
    // Voyants d'état (santé, réseau, alimentation) en colonne.
    for (let k = 0; k < (H > H_U ? 4 : 3); k++) voyant(p, x + 8, 8 + k * (H > H_U ? 13 : 12), k === 0 ? VERT : k === 1 ? BLEU : VERT, 4);
    ecrire(m, style === 'hpe' ? 'iLO' : 'iDRAC', x + 3, H - 8, 18, 4.2, '#e6e9ec', 700);
    return;
  }
  // Bouton marche (anneau vert lumineux) et bouton d'identification.
  for (const ctx of [m, p.e]) {
    ctx.strokeStyle = VERT;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x + 11, 9, 4.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  m.fillStyle = '#c9ced4';
  m.beginPath();
  m.arc(x + 11, 9, 3, 0, Math.PI * 2);
  m.fill();
  voyant(p, x + 8.5, 18, BLEU, 5);
  if (H > H_U) {
    port(p, 'usb', x + 2.5, 30, false, false);
    // Port de gestion directe (micro-USB) et VGA.
    m.fillStyle = '#0a0b0d';
    m.fillRect(x + 6, 44, 10, 4);
    m.fillStyle = '#2b4f9e';
    m.beginPath();
    m.moveTo(x + 3, 56);
    m.lineTo(x + 19, 56);
    m.lineTo(x + 17, 66);
    m.lineTo(x + 5, 66);
    m.closePath();
    m.fill();
    m.fillStyle = '#0a0b0d';
    for (let k = 0; k < 5; k++) m.fillRect(x + 6 + k * 2.4, 59, 1, 1);
  }
}

/* ---------- Marques et modèles ---------- */

function dessinerHPE(p: Pinceau, unite: UniteBaie): void {
  fond(p, '#5d646d', '#454b53');
  oreilles(p, '#6b737d');
  const deuxU = p.H > H_U;
  // Oreilles : levier d'extraction et étiquette à gauche, commandes à droite.
  panneauServeur(p, 0, 'hpe', true);
  panneauServeur(p, L - 22, 'hpe', false);
  ecrire(p.m, 'HPE', 30, 7, 30, deuxU ? 9 : 6.5, '#ffffff', 800);
  ecrire(p.m, unite.modele.replace('ProLiant ', 'ProLiant '), 52, 7, 150, deuxU ? 6 : 5, '#e6e9ec', 600);
  const y0 = deuxU ? 14 : 12;
  const h = p.H - y0 - 4;
  if (unite.modele.endsWith('LFF')) {
    // 12 disques 3,5" : 4 colonnes de 3.
    const w = (L - 52) / 4;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) disque35(p, 26 + c * w, y0 + (r * h) / 3, w - 2, h / 3 - 2, 'hpe');
    return;
  }
  if (!deuxU) {
    // 1U : 8 disques 2,5" et grille.
    for (let k = 0; k < 8; k++) disque25(p, 26 + k * 24, y0, 22, h, 'hpe');
    p.m.fillStyle = '#2f343a';
    for (let gy = y0 + 2; gy < p.H - 6; gy += 4) for (let gx = 226 + ((gy / 4) % 2) * 2; gx < 600; gx += 4) p.m.fillRect(gx, gy, 2.4, 2.4);
    return;
  }
  // 2U : boîtier 1 avec 8 disques, baie média (USB, DisplayPort), boîtier 3 obturé.
  const pasD = 24;
  for (let k = 0; k < 8; k++) disque25(p, 26 + k * pasD, y0, pasD - 2, h, 'hpe');
  const xMedia = 26 + 8 * pasD + 6;
  p.m.fillStyle = '#2f343a';
  p.m.fillRect(xMedia, y0, 170, h);
  port(p, 'usb', xMedia + 10, y0 + 12, false, false);
  p.m.fillStyle = '#0a0b0d';
  p.m.fillRect(xMedia + 34, y0 + 12, 12, 7);
  ecrire(p.m, 'Baie média', xMedia + 10, y0 + 30, 80, 5, '#c9d1da', 600);
  p.m.fillStyle = '#23272d';
  for (let gx = xMedia + 6; gx < xMedia + 164; gx += 4) p.m.fillRect(gx, y0 + 46, 2.2, h - 52);
  obturateur(p, xMedia + 176, y0, L - 22 - (xMedia + 176) - 4, h);
}

function dessinerDell(p: Pinceau, unite: UniteBaie): void {
  fond(p, '#1f2125', '#141518');
  oreilles(p, '#2c2f34');
  const deuxU = p.H > H_U;
  panneauServeur(p, 0, 'dell', true);
  panneauServeur(p, L - 22, 'dell', false);
  const y0 = deuxU ? 11 : 9;
  const h = p.H - y0 - 3;
  const nom = `DELL ${unite.modele.replace('PowerEdge ', 'PowerEdge ')}`;
  ecrire(p.m, nom, 26, 5, 160, deuxU ? 5.6 : 4.6, '#c9ced4', 700);

  if (unite.modele.startsWith('PowerVault')) {
    for (let k = 0; k < 24; k++) disque25(p, 26 + k * 24.6, y0, 23, h, 'dell');
    return;
  }
  if (unite.type === 'gpu') {
    // R760xa : entrées d'air des cartes graphiques à gauche et à droite, 8 disques au centre.
    const grille = (x0: number, x1: number): void => {
      p.m.fillStyle = '#0d0e10';
      p.m.fillRect(x0, y0, x1 - x0, h);
      p.m.fillStyle = '#3d4248';
      const r = 3;
      for (let y = y0 + r, ligne = 0; y < y0 + h - r; y += r * 1.6, ligne++) {
        for (let x = x0 + r + (ligne % 2) * r; x < x1 - r; x += r * 2) {
          p.m.beginPath();
          p.m.arc(x, y, r * 0.75, 0, Math.PI * 2);
          p.m.fill();
        }
      }
      // Liseré vert lumineux : un serveur GPU se repère au premier coup d'œil, même de loin.
      for (const ctx of [p.m, p.e]) {
        ctx.strokeStyle = '#3ddc84';
        ctx.lineWidth = 2.4;
        ctx.strokeRect(x0 + 1.2, y0 + 1.2, x1 - x0 - 2.4, h - 2.4);
      }
    };
    grille(26, 168);
    for (let k = 0; k < 8; k++) disque25(p, 172 + k * 37, y0, 35, h, 'dell');
    grille(472, L - 26);
    // Bandeau d'identification sur toute la largeur, au-dessus des grilles.
    for (const ctx of [p.m, p.e]) {
      ctx.fillStyle = '#3ddc84';
      ctx.fillRect(196, 2.2, 250, y0 - 3.6);
    }
    ecrire(p.m, 'SERVEUR GPU · 4× NVIDIA A100', 321, y0 / 2 + 0.6, 240, y0 - 3.8, '#06240f', 800, 'center');
    p.e.fillStyle = '#000';
    ecrire(p.e, 'SERVEUR GPU · 4× NVIDIA A100', 321, y0 / 2 + 0.6, 240, y0 - 3.8, '#103a1c', 800, 'center');
    for (const [x0, x1] of [[26, 168], [472, L - 26]] as const) {
      for (const ctx of [p.m, p.e]) {
        ctx.fillStyle = 'rgba(8, 10, 12, 0.85)';
        ctx.fillRect(x0 + (x1 - x0) / 2 - 34, y0 + h / 2 - 9, 68, 18);
      }
      ecrire(p.m, '2× A100', x0 + (x1 - x0) / 2, y0 + h / 2, 62, 11, '#3ddc84', 800, 'center');
      ecrire(p.e, '2× A100', x0 + (x1 - x0) / 2, y0 + h / 2, 62, 11, '#2fae68', 800, 'center');
    }
    return;
  }
  if (unite.type === 'stockage') {
    // 12 disques 3,5" horizontaux.
    const w = (L - 52) / 4;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) disque35(p, 26 + c * w, y0 + (r * h) / 3, w - 2, h / 3 - 2, 'dell');
    return;
  }
  // R760 : 24 disques 2,5" ; R660 (1U) : 10 disques.
  const nombre = deuxU ? 24 : 10;
  const pasD = deuxU ? 24.6 : 26;
  for (let k = 0; k < nombre; k++) disque25(p, 26 + k * pasD, y0, pasD - 1.6, h, 'dell');
  if (!deuxU) {
    p.m.fillStyle = '#0d0e10';
    p.m.fillRect(26 + nombre * pasD + 4, y0, L - 26 - (26 + nombre * pasD + 4) - 4, h);
    p.m.fillStyle = '#3d4248';
    for (let gy = y0 + 3; gy < y0 + h - 2; gy += 4) for (let gx = 26 + nombre * pasD + 8; gx < L - 32; gx += 4) p.m.fillRect(gx, gy, 2.2, 2.2);
  }
}

function dessinerCisco(p: Pinceau, unite: UniteBaie): void {
  const m = unite.modele;
  if (m.startsWith('ISR')) {
    // Routeur de services intégrés (2U) : emplacements NIM et SM-X, ports GE intégrés, console.
    fond(p, '#666d74', '#4d5359');
    oreilles(p, '#757c84');
    ecrire(p.m, 'cisco', 30, 12, 50, 11, '#ffffff', 700);
    ecrire(p.m, 'ISR 4451', 30, 24, 60, 7, '#e6e9ec', 600);
    // Ports intégrés : console, AUX, gestion, USB, puis GE 0/0/0 à 0/0/3.
    groupe(p, { type: 'console', nombre: 1, rangees: 1, x: 30, y: 44, libelles: ['CON'] });
    groupe(p, { type: 'rj45', nombre: 1, rangees: 1, x: 52, y: 44, libelles: ['AUX'] });
    groupe(p, { type: 'mgmt', nombre: 1, rangees: 1, x: 30, y: 80, libelles: ['GE0 MGMT'] });
    port(p, 'usb', 54, 84, false, false);
    groupe(p, { type: 'rj45', nombre: 2, rangees: 1, x: 30, y: 108, numeros: true, prefixe: 'Gi0/0/', premier: 0 });
    groupe(p, { type: 'sfp', nombre: 2, rangees: 1, x: 72, y: 110, numeros: true, prefixe: 'Gi0/0/', premier: 2, titre: 'GE intégrés' });
    // Trois emplacements NIM (en haut) et deux SM-X (en bas).
    const nim = (x: number, y: number, contenu: (x: number, y: number) => void, nom: string): void => {
      p.m.fillStyle = '#3a3f45';
      p.m.fillRect(x, y, 148, 46);
      p.m.fillStyle = '#2a2e33';
      p.m.fillRect(x + 3, y + 3, 142, 40);
      ecrire(p.m, nom, x + 6, y + 8, 80, 4.6, '#d6dbe0', 700);
      for (const dx of [6, 140]) {
        p.m.fillStyle = '#9aa1a9';
        p.m.beginPath();
        p.m.arc(x + dx, y + 38, 2.2, 0, Math.PI * 2);
        p.m.fill();
      }
      contenu(x, y);
    };
    nim(126, 8, (x, y) => {
      groupe(p, { type: 'rj45', nombre: 2, rangees: 1, x: x + 16, y: y + 18, numeros: true, prefixe: 'Gi0/1/', premier: 0 });
      groupe(p, { type: 'sfp', nombre: 2, rangees: 1, x: x + 62, y: y + 20, numeros: true, prefixe: 'Gi0/1/', premier: 2 });
    }, 'NIM-2GE-CU-SFP · GE');
    nim(278, 8, (x, y) => {
      groupe(p, { type: 'rj45', nombre: 8, rangees: 1, x: x + 8, y: y + 18, pas: 17, numeros: true, premier: 0 });
    }, 'NIM-ES2-8 · 8×GE');
    nim(430, 8, () => {
      /* Emplacement libre. */
    }, 'NIM · libre');
    const smx = (x: number, contenu: ((x: number) => void) | null, nom: string): void => {
      p.m.fillStyle = '#3a3f45';
      p.m.fillRect(x, 62, 222, 56);
      p.m.fillStyle = '#2a2e33';
      p.m.fillRect(x + 3, 65, 216, 50);
      ecrire(p.m, nom, x + 8, 71, 140, 4.6, '#d6dbe0', 700);
      if (contenu) contenu(x);
    };
    smx(126, (x) => {
      groupe(p, { type: 'sfp', nombre: 4, rangees: 1, x: x + 12, y: 88, numeros: true, prefixe: 'Gi1/0/', premier: 0, pas: 24 });
      groupe(p, { type: 'sfp+', nombre: 1, rangees: 1, x: x + 120, y: 88, numeros: true, prefixe: 'Te1/0/', premier: 4, titre: '10GE' });
    }, 'SM-X-4X1G-1X10G · 4×GE + 1×10GE');
    smx(354, null, 'SM-X · libre');
    voyant(p, 590, 12, VERT, 5);
    voyant(p, 600, 12, VERT, 5);
    ecrire(p.m, 'SYS', 586, 22, 22, 4.4, '#e6e9ec', 700);
    return;
  }
  if (m.startsWith('Catalyst 2960')) {
    // Switch d'administration : 24 ports Fast Ethernet et 2 ports GE mixtes (cuivre ou SFP).
    fond(p, '#3c4248', '#30353a');
    oreilles(p, '#4a5158');
    p.m.fillStyle = '#5c7385';
    p.m.fillRect(24, 2, 58, p.H - 4);
    ecrire(p.m, 'cisco', 28, 10, 50, 7, '#ffffff', 700);
    ecrire(p.m, 'Catalyst 2960', 28, 19, 52, 4.6, '#e6edf2', 600);
    for (let k = 0; k < 4; k++) voyant(p, 30 + k * 12, 30, k === 0 ? VERT : '#2a2f36', 3);
    ecrire(p.m, 'SYST RPS STAT DUPLX', 28, 37, 52, 3.6, '#d6dee6', 600);
    groupe(p, { type: 'console', nombre: 1, rangees: 1, x: 40, y: 42, libelles: [] });
    const fin = groupe(p, {
      type: 'rj45', nombre: 24, rangees: 2, x: 104, y: 12, pas: 20, paquet: 6, numeros: true,
      titre: '1–24 · 10/100BASE-TX (Fast Ethernet)',
    });
    groupe(p, { type: 'rj45', nombre: 2, rangees: 1, x: fin + 26, y: 12, numeros: true, premier: 1, prefixe: 'G', titre: 'GE' });
    groupe(p, { type: 'sfp', nombre: 2, rangees: 1, x: fin + 24, y: 37, pas: 23 });
    return;
  }
  if (m.startsWith('Catalyst')) {
    // Switch d'accès : 48 ports GE PoE+ et module réseau 4 × 10G SFP+.
    fond(p, '#3c4248', '#30353a');
    oreilles(p, '#4a5158');
    p.m.fillStyle = '#5c7385';
    p.m.fillRect(24, 2, 28, p.H - 4);
    ecrire(p.m, 'cisco', 26, 8, 24, 5.2, '#ffffff', 700);
    ecrire(p.m, 'C9300', 26, 15, 24, 4, '#e6edf2', 600);
    for (let k = 0; k < 5; k++) voyant(p, 28, 22 + k * 7, k < 2 ? VERT : '#2a2f36', 3);
    const fin = groupe(p, {
      type: 'rj45', nombre: 48, rangees: 2, x: 56, y: 12, pas: 19.6, paquet: 12, numeros: true, prefixe: '',
      titre: '1/0/1–48 · 10/100/1000BASE-T PoE+',
    });
    p.m.fillStyle = '#2a2f35';
    p.m.fillRect(fin + 6, 3, L - 22 - (fin + 6) - 2, p.H - 6);
    groupe(p, { type: 'sfp+', nombre: 4, rangees: 2, x: fin + 12, y: 15, pas: 23, numeros: true, titre: '10G SFP+' });
    return;
  }
  // Gamme Nexus : façade noire, cages optiques, ports de gestion à gauche.
  fond(p, '#1b1d20', '#121315');
  oreilles(p, '#2a2d31');
  ecrire(p.m, 'cisco', 25, 7, 26, 5.4, '#ffffff', 700);
  ecrire(p.m, m.replace('Nexus ', 'N'), 25, 14, 26, 3.8, '#c9ced4', 600);
  for (let k = 0; k < 3; k++) voyant(p, 27 + k * 8, 20, k === 0 ? VERT : k === 1 ? BLEU : '#2a2f36', 3);
  ecrire(p.m, 'STS BCN ENV', 25, 26, 26, 3.4, '#b9c1ca', 600);
  groupe(p, { type: 'mgmt', nombre: 1, rangees: 1, x: 30, y: 33, libelles: ['MGMT'] });
  if (m.includes('9336')) {
    groupe(p, { type: 'qsfp28', nombre: 36, rangees: 2, x: 62, y: 18, pas: 29.4, paquet: 6, numeros: true, titre: '1–36 · 40/100G QSFP28' });
  } else {
    const fin = groupe(p, { type: 'sfp28', nombre: 48, rangees: 2, x: 50, y: 17, pas: 19.6, paquet: 12, numeros: true, titre: '1–48 · 1/10/25G SFP28' });
    groupe(p, { type: 'qsfp28', nombre: 6, rangees: 2, x: fin + 6, y: 17, pas: 26.5, numeros: true, premier: 49, titre: '40/100G QSFP28' });
  }
}

function dessinerFortinet(p: Pinceau, unite: UniteBaie): void {
  fond(p, '#1c1d20', '#111214');
  oreilles(p, '#2a2c30');
  const deuxU = p.H > H_U;
  p.m.fillStyle = '#d0271d';
  p.m.fillRect(22, 0, 8, p.H);
  ecrire(p.m, 'FORTINET', 36, deuxU ? 14 : 8, 84, deuxU ? 11 : 7, '#e23a2e', 800);
  ecrire(p.m, unite.modele, 36, deuxU ? 28 : 16, 84, deuxU ? 7 : 5, '#e6e9ec', 600);
  if (deuxU) {
    // FortiGate 1800F : administration, puis GE cuivre, GE SFP, 25GE SFP28 et 100GE QSFP28.
    groupe(p, { type: 'console', nombre: 1, rangees: 1, x: 36, y: 50, libelles: ['CONSOLE'] });
    port(p, 'usb', 60, 54, false, false);
    groupe(p, { type: 'mgmt', nombre: 2, rangees: 1, x: 36, y: 86, pas: 22, libelles: ['MGMT', 'HA'] });
    const yG = 54;
    let x = groupe(p, { type: 'rj45', nombre: 16, rangees: 2, x: 130, y: yG, pas: 19, numeros: true, titre: '1–16 · GE RJ45' });
    x = groupe(p, { type: 'sfp', nombre: 8, rangees: 2, x: x + 10, y: yG + 2, pas: 21.5, numeros: true, premier: 17, titre: '17–24 · GE SFP' });
    x = groupe(p, { type: 'sfp28', nombre: 16, rangees: 2, x: x + 10, y: yG + 2, pas: 21.5, numeros: true, premier: 25, titre: '25–40 · 25GE SFP28' });
    groupe(p, { type: 'qsfp28', nombre: 4, rangees: 2, x: x + 8, y: yG + 2, pas: 28, numeros: true, premier: 41, titre: '41–44 · 100GE' });
    voyant(p, 92, 52, VERT, 5);
    ecrire(p.m, 'STATUS', 86, 62, 26, 4.2, '#e6e9ec', 700);
  } else {
    // FortiGate 600F : administration, GE cuivre, GE SFP, 10GE SFP+ et 25GE SFP28.
    groupe(p, { type: 'console', nombre: 1, rangees: 1, x: 36, y: 26, libelles: [] });
    groupe(p, { type: 'mgmt', nombre: 2, rangees: 1, x: 58, y: 26, pas: 20, libelles: [] });
    ecrire(p.m, 'CON  MGMT HA', 36, 50, 60, 3.6, '#c9d1da', 600);
    let x = groupe(p, { type: 'rj45', nombre: 8, rangees: 2, x: 124, y: 14, pas: 20, numeros: true, titre: 'GE RJ45' });
    x = groupe(p, { type: 'sfp', nombre: 8, rangees: 2, x: x + 14, y: 16, pas: 23, numeros: true, premier: 9, titre: 'GE SFP' });
    x = groupe(p, { type: 'sfp+', nombre: 4, rangees: 2, x: x + 14, y: 16, pas: 23, numeros: true, premier: 17, titre: '10GE SFP+' });
    groupe(p, { type: 'sfp28', nombre: 4, rangees: 2, x: x + 14, y: 16, pas: 23, numeros: true, premier: 21, titre: '25GE SFP28' });
    voyant(p, 604, 10, VERT, 4);
  }
}

const cache = new Map<string, Facade>();
const portsParCle = new Map<string, readonly Port[]>();

function cleUnite(unite: UniteBaie): string {
  return `${unite.marque}|${unite.modele}|${unite.type}|${unite.u}`;
}

/** Face avant d'un équipement, selon sa marque, son modèle et sa hauteur. */
export function facadeUnite(unite: UniteBaie): Facade {
  const cle = cleUnite(unite);
  const existante = cache.get(cle);
  if (existante) return existante;

  // Les équipements réseau, riches en petits détails, sont dessinés plus finement.
  const FINESSE = unite.type === 'reseau' || unite.type === 'pare-feu' ? 3.2 : 2.4;
  const H = H_U * unite.u;
  const [canvasMap, m] = creerCanvas(Math.round(L * FINESSE), Math.round(H * FINESSE));
  const [canvasEmi, e] = creerCanvas(Math.round(L * FINESSE), Math.round(H * FINESSE));
  m.scale(FINESSE, FINESSE);
  e.scale(FINESSE, FINESSE);
  let graine = 0;
  for (const c of cle) graine = (graine * 31 + c.charCodeAt(0)) >>> 0;
  const p: Pinceau = { m, e, H, rnd: aleatoire(graine), ports: [] };

  switch (unite.marque) {
    case 'HPE':
      dessinerHPE(p, unite);
      break;
    case 'Dell':
      dessinerDell(p, unite);
      break;
    case 'Cisco':
      dessinerCisco(p, unite);
      break;
    case 'Fortinet':
      dessinerFortinet(p, unite);
      break;
  }

  const facade: Facade = { map: texture(canvasMap, true), emissive: texture(canvasEmi, true), canvasMap, canvasEmi };
  cache.set(cle, facade);
  portsParCle.set(cle, p.ports);
  return facade;
}

/** Ports en façade d'un équipement (pour y brancher câbles et modules en 3D). */
export function portsUnite(unite: UniteBaie): readonly Port[] {
  facadeUnite(unite);
  return portsParCle.get(cleUnite(unite)) ?? [];
}

/* ---------- Façade complète d'une baie, vue dans la salle ---------- */

/** Hauteur d'une unité de baie, en mètres. */
export const U = 0.04445;
/** Espace laissé libre sous chaque équipement, en unités. */
export const ECART_U = 0.35;

const cacheBaies = new Map<RackKind, Facade>();

/**
 * Assemble les façades de tous les équipements d'une baie dans une seule texture,
 * pour que la salle montre fidèlement ce que contient chaque baie.
 */
export function facadeBaie(kind: RackKind): Facade {
  const existante = cacheBaies.get(kind);
  if (existante) return existante;

  // 256 × 896 en coordonnées logiques : la façade visible mesure 0,51 m × 1,79 m.
  const LB = 256;
  const HB = 896;
  const FINESSE = 1.5;
  const [canvasMap, m] = creerCanvas(LB * FINESSE, HB * FINESSE);
  const [canvasEmi, e] = creerCanvas(LB * FINESSE, HB * FINESSE);
  m.scale(FINESSE, FINESSE);
  e.scale(FINESSE, FINESSE);
  const pxParU = HB / 42;
  const largeurUnite = (0.48 / 0.51) * LB;
  const x0 = (LB - largeurUnite) / 2;

  // Intérieur sombre et montants perforés.
  m.fillStyle = '#0b0d10';
  m.fillRect(0, 0, LB, HB);
  e.fillStyle = '#000';
  e.fillRect(0, 0, LB, HB);
  for (const x of [x0 - 2, LB - x0 - 6]) {
    m.fillStyle = '#5c636d';
    m.fillRect(x, 0, 8, HB);
    m.fillStyle = '#16181c';
    for (let y = 2; y < HB; y += pxParU / 3) m.fillRect(x + 2.5, y, 3, 3);
  }

  let y = 2;
  for (const unite of CONTENU_BAIE[kind]) {
    const h = unite.u * pxParU;
    const facade = facadeUnite(unite);
    m.drawImage(facade.canvasMap, x0, y, largeurUnite, h - 0.6);
    e.drawImage(facade.canvasEmi, x0, y, largeurUnite, h - 0.6);
    y += h + ECART_U * pxParU;
  }
  // Panneaux obturateurs sur les emplacements libres.
  while (y + pxParU <= HB - 2) {
    m.fillStyle = '#1f2227';
    m.fillRect(x0, y, largeurUnite, pxParU - 0.8);
    m.fillStyle = 'rgba(255,255,255,0.06)';
    m.fillRect(x0, y, largeurUnite, 1);
    y += pxParU;
  }

  const facade: Facade = { map: texture(canvasMap, true), emissive: texture(canvasEmi, true), canvasMap, canvasEmi };
  cacheBaies.set(kind, facade);
  return facade;
}
