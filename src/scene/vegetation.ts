import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { aleatoire } from './outils';

/**
 * Arbres de savane en low-poly facetté : chaque essence est un modèle fusionné (tronc, branches,
 * masses de feuillage irrégulières) teinté par sommet, puis instancié avec des variations de taille,
 * d'orientation et d'inclinaison.
 */

type Rnd = () => number;

const ECORCE = new THREE.Color(0x5a4331);
const ECORCE_CLAIRE = new THREE.Color(0x8a7563);

/** Donne une couleur à chaque sommet, plus sombre vers le bas (ombre propre du feuillage). */
function teinter(geo: THREE.BufferGeometry, base: THREE.Color, contraste: number, rnd: Rnd): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  geo.computeBoundingBox();
  const boite = geo.boundingBox ?? new THREE.Box3();
  const hauteur = Math.max(1e-3, boite.max.y - boite.min.y);
  const couleurs = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  // Une nuance par face (trois sommets) : l'aspect facetté ressort davantage.
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const k = (y - boite.min.y) / hauteur;
    const lum = 1 - contraste + contraste * k + (rnd() - 0.5) * 0.12;
    c.copy(base).multiplyScalar(lum);
    for (let j = 0; j < 3; j++) c.toArray(couleurs, (i + j) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
  return geo;
}

/** Bosselle une forme : chaque sommet est poussé selon sa position (les sommets partagés restent soudés). */
function bosseler(geo: THREE.BufferGeometry, amplitude: number, graine: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + graine) * 43758.5453;
    const bruit = (h - Math.floor(h) - 0.5) * 2;
    v.multiplyScalar(1 + bruit * amplitude);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Masse de feuillage : icosaèdre bosselé, aplati, teinté. */
function feuillage(
  rnd: Rnd,
  centre: THREE.Vector3,
  taille: THREE.Vector3,
  couleur: THREE.Color,
  detail = 1,
): THREE.BufferGeometry {
  const geo = bosseler(new THREE.IcosahedronGeometry(1, detail), 0.22, rnd() * 100);
  geo.scale(taille.x, taille.y, taille.z);
  geo.rotateY(rnd() * Math.PI);
  geo.translate(centre.x, centre.y, centre.z);
  const nuance = couleur.clone().offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.06);
  return teinter(geo.toNonIndexed(), nuance, 0.45, rnd);
}

/** Segment de bois (tronc ou branche) de `a` à `b`, effilé. */
function bois(rnd: Rnd, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, couleur = ECORCE): THREE.BufferGeometry {
  const longueur = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r1, r0, longueur, 6, 1);
  geo.translate(0, longueur / 2, 0);
  const direction = b.clone().sub(a).normalize();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
  geo.translate(a.x, a.y, a.z);
  return teinter(geo.toNonIndexed(), couleur, 0.3, rnd);
}

function fusionner(parties: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parties) {
    p.deleteAttribute('uv');
  }
  const geo = mergeGeometries(parties, false);
  if (!geo) throw new Error('Fusion des géométries de végétation impossible');
  geo.computeVertexNormals();
  return geo;
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Acacia : tronc qui se divise en branches obliques, houppier en plateaux étagés. */
function acacia(rnd: Rnd): THREE.BufferGeometry {
  const parties: THREE.BufferGeometry[] = [];
  const vert = new THREE.Color(0x56732f);
  const fourche = v(0, 1.6, 0);
  parties.push(bois(rnd, v(0, 0, 0), fourche, 0.2, 0.15));
  const nb = 3;
  for (let i = 0; i < nb; i++) {
    const angle = (i / nb) * Math.PI * 2 + rnd() * 0.6;
    const portee = 1.3 + rnd() * 0.7;
    const bout = v(Math.cos(angle) * portee, 3.3 + rnd() * 0.7, Math.sin(angle) * portee);
    parties.push(bois(rnd, fourche, bout, 0.13, 0.06));
    // Plateau de feuillage au bout de chaque branche.
    parties.push(feuillage(rnd, bout.clone().add(v(0, 0.35, 0)), v(1.7 + rnd() * 0.6, 0.45 + rnd() * 0.15, 1.5 + rnd() * 0.5), vert));
  }
  // Plateau supérieur qui unifie la couronne.
  parties.push(feuillage(rnd, v(0, 4.1, 0), v(2.6, 0.5, 2.3), vert.clone().offsetHSL(0, 0, 0.04)));
  return fusionner(parties);
}

/** Karité : tronc court et trapu, couronne ronde et dense faite de plusieurs masses. */
function karite(rnd: Rnd): THREE.BufferGeometry {
  const parties: THREE.BufferGeometry[] = [];
  const vert = new THREE.Color(0x3f6a2c);
  parties.push(bois(rnd, v(0, 0, 0), v(0.1, 1.9, 0), 0.28, 0.2));
  parties.push(bois(rnd, v(0.1, 1.6, 0), v(-0.8, 2.7, 0.3), 0.14, 0.08));
  parties.push(bois(rnd, v(0.1, 1.7, 0), v(0.9, 2.8, -0.4), 0.14, 0.08));
  parties.push(feuillage(rnd, v(0, 3.4, 0), v(1.9, 1.5, 1.8), vert));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd();
    const r = 1.2 + rnd() * 0.4;
    parties.push(feuillage(rnd, v(Math.cos(a) * r, 2.8 + rnd() * 0.9, Math.sin(a) * r), v(1.1, 0.95, 1.1), vert));
  }
  return fusionner(parties);
}

/** Baobab : tronc en bouteille, branches courtes et tortueuses, feuillage clairsemé. */
function baobab(rnd: Rnd): THREE.BufferGeometry {
  const parties: THREE.BufferGeometry[] = [];
  const profil = [
    new THREE.Vector2(0.95, 0),
    new THREE.Vector2(1.05, 0.4),
    new THREE.Vector2(0.98, 1.6),
    new THREE.Vector2(0.8, 2.8),
    new THREE.Vector2(0.55, 3.6),
    new THREE.Vector2(0.45, 4.0),
  ];
  const tronc = bosseler(new THREE.LatheGeometry(profil, 9), 0.05, rnd() * 50);
  parties.push(teinter(tronc.toNonIndexed(), ECORCE_CLAIRE, 0.35, rnd));
  const vert = new THREE.Color(0x5f7d35);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
    const depart = v(Math.cos(a) * 0.3, 3.8, Math.sin(a) * 0.3);
    const coude = v(Math.cos(a) * 1.1, 4.5 + rnd() * 0.4, Math.sin(a) * 1.1);
    const bout = v(Math.cos(a + 0.3) * 1.9, 5.1 + rnd() * 0.5, Math.sin(a + 0.3) * 1.9);
    parties.push(bois(rnd, depart, coude, 0.2, 0.13, ECORCE_CLAIRE), bois(rnd, coude, bout, 0.13, 0.06, ECORCE_CLAIRE));
    if (rnd() > 0.35) parties.push(feuillage(rnd, bout.clone().add(v(0, 0.2, 0)), v(0.8, 0.45, 0.8), vert, 0));
  }
  return fusionner(parties);
}

/** Arbuste : touffe basse de quelques masses. */
function arbuste(rnd: Rnd): THREE.BufferGeometry {
  const parties: THREE.BufferGeometry[] = [];
  const vert = new THREE.Color(0x6b8238);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 0.5;
    parties.push(feuillage(rnd, v(Math.cos(a) * r, 0.45 + rnd() * 0.3, Math.sin(a) * r), v(0.75, 0.6, 0.75), vert, 0));
  }
  return fusionner(parties);
}

export interface PlacementArbre {
  readonly x: number;
  readonly z: number;
}

/** Plante les arbres et arbustes aux emplacements donnés, chaque essence en un seul appel de dessin. */
export function planterVegetation(scene: THREE.Scene, arbres: readonly PlacementArbre[], arbustes: readonly PlacementArbre[]): void {
  const rnd = aleatoire(9031);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  // Deux variantes par essence pour éviter les clones parfaits.
  const essences = [
    { modeles: [acacia(rnd), acacia(rnd)], part: 0.55, taille: [0.85, 1.35] },
    { modeles: [karite(rnd), karite(rnd)], part: 0.3, taille: [0.8, 1.2] },
    { modeles: [baobab(rnd)], part: 0.15, taille: [0.9, 1.3] },
  ] as const;

  const matrices = essences.map((e) => e.modeles.map(() => [] as THREE.Matrix4[]));
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const p of arbres) {
    let tirage = rnd();
    let i = 0;
    while (i < essences.length - 1 && tirage > (essences[i]?.part ?? 1)) {
      tirage -= essences[i]?.part ?? 1;
      i++;
    }
    const essence = essences[i];
    const liste = matrices[i];
    if (!essence || !liste) continue;
    const variante = Math.floor(rnd() * essence.modeles.length);
    const s = essence.taille[0] + rnd() * (essence.taille[1] - essence.taille[0]);
    // Légère inclinaison : les arbres ne poussent pas tous parfaitement droits.
    e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08);
    liste[variante]?.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), q.setFromEuler(e), new THREE.Vector3(s, s * (0.9 + rnd() * 0.2), s)));
  }

  const ajouter = (geo: THREE.BufferGeometry, liste: THREE.Matrix4[]): void => {
    if (liste.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, mat, liste.length);
    liste.forEach((m, k) => mesh.setMatrixAt(k, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    scene.add(mesh);
  };
  essences.forEach((essence, i) => essence.modeles.forEach((geo, j) => ajouter(geo, matrices[i]?.[j] ?? [])));

  const touffes = [arbuste(rnd), arbuste(rnd)];
  const listes: THREE.Matrix4[][] = [[], []];
  for (const p of arbustes) {
    const s = 0.6 + rnd() * 0.9;
    listes[Math.floor(rnd() * 2)]?.push(
      new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), new THREE.Vector3(s, s, s)),
    );
  }
  touffes.forEach((geo, i) => ajouter(geo, listes[i] ?? []));
}
