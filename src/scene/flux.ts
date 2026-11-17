import * as THREE from 'three';
import { amortir } from './outils';

/** Sens de circulation : 1 du début vers la fin du tracé, -1 l'inverse, 0 dans les deux sens. */
export type Sens = 1 | -1 | 0;

/* ---------- Matériau de courant : bandes lumineuses qui avancent le long d'un tube ---------- */

interface UniformesCourant {
  readonly uTemps: THREE.IUniform<number>;
  /** Vitesse d'avancée des bandes, en mètres par seconde. */
  readonly uVitesse: THREE.IUniform<number>;
  /** Écart entre deux bandes, en mètres. */
  readonly uPas: THREE.IUniform<number>;
  /** 0 = éteint, 1 = plein débit. */
  readonly uNiveau: THREE.IUniform<number>;
  readonly uSens: THREE.IUniform<number>;
  /** Luminosité et opacité du courant entre deux bandes. */
  readonly uFond: THREE.IUniform<number>;
  /** Vrai (1) quand le tracé est coupé en son milieu. */
  readonly uCoupure: THREE.IUniform<number>;
  readonly uMilieu: THREE.IUniform<number>;
}

const ENTETE_VERTEX = /* glsl */ `
attribute float abscisse;
varying float vAbscisse;
`;

const ENTETE_FRAGMENT = /* glsl */ `
uniform float uTemps;
uniform float uVitesse;
uniform float uPas;
uniform float uNiveau;
uniform float uSens;
uniform float uFond;
uniform float uCoupure;
uniform float uMilieu;
varying float vAbscisse;
// Bande en dent de scie : montée douce puis front net, qui indique le sens de circulation.
float motifCourant(float p) {
  return smoothstep(0.0, 0.62, p) * (1.0 - smoothstep(0.7, 0.9, p));
}
`;

/**
 * Transforme un matériau de base en courant : `abscisse` (en mètres le long du tracé) sert à faire
 * défiler des bandes lumineuses dans le sens du flux. Avec `bandes` à faux, seule la coupure s'applique.
 */
function preparerCourant(mat: THREE.Material, u: UniformesCourant, bandes: boolean): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ENTETE_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAbscisse = abscisse;');
    const coupure = 'if (uCoupure > 0.5 && abs(vAbscisse - uMilieu) < 2.2) discard;';
    const motif = bandes
      ? /* glsl */ `
      float avance = motifCourant(fract((vAbscisse - uTemps * uVitesse) / uPas));
      float recul = motifCourant(fract((vAbscisse + uTemps * uVitesse) / uPas));
      float b = uSens > 0.5 ? avance : (uSens < -0.5 ? recul : max(avance, recul));
      outgoingLight *= mix(uFond, 1.9, b) * mix(0.25, 1.0, uNiveau);
      diffuseColor.a *= mix(uFond, 1.0, b) * uNiveau;`
      : '';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ENTETE_FRAGMENT}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${coupure}`)
      .replace('#include <opaque_fragment>', `${motif}\n#include <opaque_fragment>`);
  };
  // Chaque variante (avec ou sans bandes) a son propre programme.
  mat.customProgramCacheKey = () => (bandes ? 'courant' : 'courant-gaine');
}

function uniformes(vitesse: number, pas: number, fond: number): UniformesCourant {
  return {
    uTemps: { value: 0 },
    uVitesse: { value: vitesse },
    uPas: { value: pas },
    uNiveau: { value: 1 },
    uSens: { value: 1 },
    uFond: { value: fond },
    uCoupure: { value: 0 },
    uMilieu: { value: 0 },
  };
}

/* ---------- Géométrie : tube le long d'un tracé, coudes arrondis ---------- */

/** Tracé à coudes arrondis passant par `points` (rayon de coude borné par la longueur des segments). */
export function traceArrondi(points: readonly THREE.Vector3[], coude = 0.18): THREE.CurvePath<THREE.Vector3> {
  const pts = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1] ?? p) > 1e-4);
  const trace = new THREE.CurvePath<THREE.Vector3>();
  let courant = pts[0]?.clone() ?? new THREE.Vector3();
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    if (!a || !b || !c) continue;
    const r = Math.min(coude, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const entree = b.clone().addScaledVector(a.clone().sub(b).normalize(), r);
    const sortie = b.clone().addScaledVector(c.clone().sub(b).normalize(), r);
    if (courant.distanceTo(entree) > 1e-4) trace.add(new THREE.LineCurve3(courant, entree));
    trace.add(new THREE.QuadraticBezierCurve3(entree, b.clone(), sortie));
    courant = sortie;
  }
  const fin = pts[pts.length - 1];
  if (fin && courant.distanceTo(fin) > 1e-4) trace.add(new THREE.LineCurve3(courant, fin));
  return trace;
}

/** Couleur le long du tracé : interpolée entre les couleurs données aux points de passage. */
export interface Teinte {
  readonly fractions: readonly number[];
  readonly couleurs: readonly THREE.Color[];
}

function teinteUnie(couleur: number): Teinte {
  return { fractions: [0, 1], couleurs: [new THREE.Color(couleur), new THREE.Color(couleur)] };
}

function couleurA(teinte: Teinte, f: number, cible: THREE.Color): THREE.Color {
  const { fractions, couleurs } = teinte;
  let i = 1;
  while (i < fractions.length - 1 && (fractions[i] ?? 1) < f) i++;
  const f0 = fractions[i - 1] ?? 0;
  const f1 = fractions[i] ?? 1;
  const c0 = couleurs[i - 1] ?? couleurs[0];
  const c1 = couleurs[i] ?? c0;
  if (!c0 || !c1) return cible.set(0xffffff);
  return cible.lerpColors(c0, c1, f1 > f0 ? THREE.MathUtils.clamp((f - f0) / (f1 - f0), 0, 1) : 0);
}

/** Tube le long d'une courbe, avec l'abscisse (en mètres) et la couleur de chaque sommet. */
function geometrieCourant(courbe: THREE.Curve<THREE.Vector3>, rayon: number, teinte: Teinte): THREE.TubeGeometry {
  const longueur = courbe.getLength();
  const segments = Math.min(900, Math.max(24, Math.round(longueur * 10)));
  const geo = new THREE.TubeGeometry(courbe, segments, rayon, 10, false);
  const uv = geo.getAttribute('uv');
  const abscisses = new Float32Array(uv.count);
  const couleurs = new Float32Array(uv.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < uv.count; i++) {
    const f = uv.getX(i);
    abscisses[i] = f * longueur;
    couleurA(teinte, f, c).toArray(couleurs, i * 3);
  }
  geo.setAttribute('abscisse', new THREE.BufferAttribute(abscisses, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
  return geo;
}

/** Tracé parallèle, décalé à l'horizontale (perpendiculairement au sens de marche). */
function decaler(courbe: THREE.Curve<THREE.Vector3>, ecart: number): THREE.CurvePath<THREE.Vector3> {
  const n = Math.max(40, Math.round(courbe.getLength() * 2));
  const points: THREE.Vector3[] = [];
  const haut = new THREE.Vector3(0, 1, 0);
  let lateral = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = courbe.getPointAt(u);
    const tangente = courbe.getTangentAt(u);
    const l = new THREE.Vector3().crossVectors(tangente, haut);
    // Sur un tronçon vertical, on garde le décalage précédent.
    if (l.lengthSq() > 1e-4) lateral = l.normalize();
    points.push(p.addScaledVector(lateral, ecart));
  }
  const trace = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b && a.distanceTo(b) > 1e-5) trace.add(new THREE.LineCurve3(a, b));
  }
  return trace;
}

/* ---------- Courants d'un circuit technique ---------- */

export interface PointCircuit {
  readonly p: THREE.Vector3;
  /** Couleur du courant à ce point ; elle varie progressivement jusqu'au point suivant. */
  readonly c: number;
}

export interface Chemin {
  readonly points: readonly PointCircuit[];
}

export interface OptionsCourants {
  readonly rayon: number;
  /** Vitesse d'avancée des bandes, en mètres par seconde. */
  readonly vitesse: number;
  /** Écart entre deux bandes, en mètres. */
  readonly pas?: number;
  /** Opacité et luminosité entre deux bandes (0 à 1). */
  readonly fond?: number;
  readonly coude?: number;
}

/**
 * Courants continus qui suivent des chemins : des gaines translucides, teintées le long du trajet
 * (froid → chaud par exemple), parcourues de bandes lumineuses dans le sens du flux.
 */
export class Courants {
  readonly mesh = new THREE.Group();
  private readonly u: UniformesCourant;

  constructor(chemins: readonly Chemin[], o: OptionsCourants) {
    this.u = uniformes(o.vitesse, o.pas ?? 0.9, o.fond ?? 0.4);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    preparerCourant(mat, this.u, true);
    for (const c of chemins) {
      const pts = c.points.map((p) => p.p);
      const cumul = [0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        cumul.push((cumul[i - 1] ?? 0) + (a && b ? a.distanceTo(b) : 0));
      }
      const total = cumul[cumul.length - 1] || 1;
      const teinte: Teinte = {
        fractions: cumul.map((d) => d / total),
        couleurs: c.points.map((p) => new THREE.Color(p.c)),
      };
      const tube = new THREE.Mesh(geometrieCourant(traceArrondi(pts, o.coude ?? 0.18), o.rayon, teinte), mat);
      tube.raycast = () => {};
      tube.renderOrder = 3;
      this.mesh.add(tube);
    }
  }

  /** `niveau` (0 à 1) fait apparaître ou disparaître les courants en douceur. */
  maj(t: number, niveau = 1): void {
    this.u.uTemps.value = t;
    this.u.uNiveau.value = niveau;
  }
}

/* ---------- Liaison entre deux points (énergie, réseau, fibre, trafic) ---------- */

export interface OptionsFlux {
  readonly rayon: number;
  /** Vitesse des bandes, en mètres par seconde. */
  readonly vitesse: number;
  readonly pas?: number;
  /**
   * Deux voies côte à côte dans une gaine translucide : l'aller (début → fin) et le retour,
   * chacune dans sa couleur. Sans cela, un seul courant qui peut circuler dans les deux sens.
   */
  readonly voies?: { readonly retour: number; readonly ecart: number };
}

/** Liaison matérialisée par un courant continu (une voie) ou par deux voies dans une gaine. */
export class Flux {
  readonly groupe = new THREE.Group();
  /** Objet cliquable de la liaison : la gaine, ou le courant s'il n'y a qu'une voie. */
  readonly tube: THREE.Mesh;
  private readonly voies: { readonly u: UniformesCourant; readonly sens: 1 | -1 | 0 }[] = [];
  private readonly matGaine: THREE.MeshStandardMaterial | null = null;
  private readonly uGaine: UniformesCourant | null = null;
  private niveau = 0;

  constructor(courbe: THREE.Curve<THREE.Vector3>, couleur: number, o: OptionsFlux) {
    const longueur = courbe.getLength();
    const voie = (trace: THREE.Curve<THREE.Vector3>, teinte: number, rayon: number, sens: 1 | -1 | 0): THREE.Mesh => {
      const u = uniformes(o.vitesse, o.pas ?? 1.2, 0.3);
      u.uMilieu.value = longueur / 2;
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
      preparerCourant(mat, u, true);
      const mesh = new THREE.Mesh(geometrieCourant(trace, rayon, teinteUnie(teinte)), mat);
      mesh.renderOrder = 3;
      this.voies.push({ u, sens });
      this.groupe.add(mesh);
      return mesh;
    };

    if (o.voies) {
      voie(decaler(courbe, o.voies.ecart), couleur, o.rayon * 0.32, 1);
      voie(decaler(courbe, -o.voies.ecart), o.voies.retour, o.rayon * 0.32, -1);
      // Gaine translucide qui enveloppe les deux voies.
      this.uGaine = uniformes(0, 1, 1);
      this.uGaine.uMilieu.value = longueur / 2;
      this.matGaine = new THREE.MeshStandardMaterial({
        color: 0x9aa4b0,
        roughness: 0.25,
        metalness: 0.1,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      });
      preparerCourant(this.matGaine, this.uGaine, false);
      this.tube = new THREE.Mesh(geometrieCourant(courbe, o.rayon, teinteUnie(0xffffff)), this.matGaine);
      this.tube.renderOrder = 4;
      this.groupe.add(this.tube);
    } else {
      this.tube = voie(courbe, couleur, o.rayon, 1);
    }
    for (const enfant of this.groupe.children) enfant.castShadow = false;
  }

  /**
   * `intensite` va de 0 (liaison au repos) à 1 (plein débit). Avec deux voies, `sens` choisit
   * la voie active (1 : aller, -1 : retour, 0 : les deux). `coupee` ouvre une brèche au milieu.
   */
  maj(dt: number, t: number, intensite: number, sens: Sens, coupee = false): void {
    this.niveau = amortir(this.niveau, intensite, 4, dt);
    const deuxVoies = this.matGaine !== null;
    for (const v of this.voies) {
      v.u.uTemps.value = t;
      v.u.uCoupure.value = coupee ? 1 : 0;
      if (deuxVoies) {
        const active = sens === 0 || sens === v.sens;
        v.u.uSens.value = v.sens;
        // Une voie inactive reste visible, éteinte : on voit qu'elle existe.
        v.u.uNiveau.value = Math.max(0.12, active ? this.niveau : 0);
      } else {
        v.u.uSens.value = sens;
        v.u.uNiveau.value = Math.max(0.12, this.niveau);
      }
    }
    if (this.uGaine && this.matGaine) {
      this.uGaine.uCoupure.value = coupee ? 1 : 0;
      this.matGaine.color.setHex(coupee ? 0xb04848 : 0x9aa4b0);
    }
  }
}
