import * as THREE from 'three';
import type { EquipmentRef, SiteId } from '../types';

/** Abscisse du centre de chaque site dans la scène (la distance réelle est symbolique). */
export const SITE_X: Record<SiteId, number> = { DC1: -38, DC2: 38 };
/** Hauteur du dessus de la dalle. */
export const Y_DALLE = 0.3;

const registre = new WeakMap<THREE.Object3D, EquipmentRef>();

/** Associe une fiche équipement à un objet (et donc à tous ses descendants). */
export function marquer<T extends THREE.Object3D>(objet: T, ref: EquipmentRef): T {
  registre.set(objet, ref);
  return objet;
}

export interface Selection {
  readonly ref: EquipmentRef;
  readonly racine: THREE.Object3D;
}

/** Remonte la hiérarchie jusqu'au premier objet marqué. */
export function trouverEquipement(objet: THREE.Object3D | null): Selection | null {
  for (let courant = objet; courant; courant = courant.parent) {
    const ref = registre.get(courant);
    if (ref) return { ref, racine: courant };
  }
  return null;
}

export function estVisible(objet: THREE.Object3D | null): boolean {
  for (let courant = objet; courant; courant = courant.parent) {
    if (!courant.visible) return false;
  }
  return true;
}

export interface OptionsMateriau {
  rugosite?: number;
  metal?: number;
  emissive?: number;
  intensite?: number;
  /** Rend le matériau translucide. */
  opacite?: number;
  map?: THREE.Texture;
}

export function materiau(couleur: number, o: OptionsMateriau = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: couleur,
    roughness: o.rugosite ?? 0.6,
    metalness: o.metal ?? 0.1,
  });
  if (o.emissive !== undefined) {
    m.emissive.setHex(o.emissive);
    m.emissiveIntensity = o.intensite ?? 1;
  }
  if (o.opacite !== undefined) {
    m.transparent = true;
    m.opacity = o.opacite;
    m.depthWrite = false;
  }
  if (o.map) m.map = o.map;
  return m;
}

/** Boîte posée sur sa base : (x, z) est le centre, y la hauteur du dessous. */
export function boite(
  largeur: number,
  hauteur: number,
  profondeur: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(largeur, hauteur, profondeur), mat);
  mesh.position.set(x, y + hauteur / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Cylindre vertical posé sur sa base. */
export function cylindre(
  rayon: number,
  hauteur: number,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  segments = 20,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rayon, rayon, hauteur, segments), mat);
  mesh.position.set(x, y + hauteur / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Plan vertical face à +z, centré en (x, y, z). */
export function panneau(largeur: number, hauteur: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(largeur, hauteur), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Fige la transformation locale des maillages d'un groupe : ils ne bougent jamais par rapport à leur parent,
 * inutile de la recalculer à chaque image. Les groupes restent animables (portes, hélices, modules).
 */
export function figer(racine: THREE.Object3D): void {
  racine.traverse((objet) => {
    if (objet instanceof THREE.Mesh) {
      objet.updateMatrix();
      objet.matrixAutoUpdate = false;
    }
  });
}

/** Interpolation exponentielle indépendante de la cadence d'affichage. */
export function amortir(actuel: number, cible: number, vitesse: number, dt: number): number {
  return actuel + (cible - actuel) * (1 - Math.exp(-vitesse * dt));
}

export function creerCanvas(largeur: number, hauteur: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte Canvas 2D indisponible');
  return [canvas, ctx];
}

/** Texture couleur dessinée à la volée. */
export function toile(
  largeur: number,
  hauteur: number,
  dessin: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const [canvas, ctx] = creerCanvas(largeur, hauteur);
  dessin(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Générateur pseudo-aléatoire déterministe : les façades sont identiques à chaque chargement. */
export function aleatoire(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0;
    return etat / 4294967296;
  };
}

/** Écran tactile ou petit écran : rendu allégé (définition, ombres) et commandes au doigt. */
export const MOBILE =
  typeof window !== 'undefined' && (window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600);

/**
 * Champ de vision vertical (en degrés) qui conserve, sur un écran étroit ou en portrait, le champ horizontal
 * qu'aurait un écran 16/10 : la scène n'est pas coupée sur les côtés d'un téléphone.
 */
export function champVertical(base: number, aspect: number, max = 85): number {
  const reference = 1.6;
  if (aspect >= reference) return base;
  const demiHorizontal = Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * reference);
  const vertical = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(demiHorizontal) / aspect));
  return Math.min(max, vertical);
}
