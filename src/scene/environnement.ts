import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SITE_IDS } from '../types';
import { aleatoire, boite, cylindre, materiau, SITE_X, Y_DALLE } from './outils';
import { DALLE, X_PORTAIL } from './site';
import { textureBureaux, textureHerbe, textureRoute, textureSol } from './textures';
import { planterVegetation, type PlacementArbre } from './vegetation';

/** Axe de la route principale, qui longe les deux sites côté avant. */
export const Z_ROUTE = 25;
const LARGEUR_ROUTE = 6.5;
/** Centre de l'esplanade des utilisateurs. */
export const POS_ESPLANADE = new THREE.Vector3(0, 0, 40);

export interface Environnement {
  /** Direction du soleil, partagée avec l'éclairage. */
  readonly soleil: THREE.Vector3;
  /** Ciel atmosphérique, dont l'ambiance règle la clarté. */
  readonly ciel: Sky;
  /** Groupe cliquable représentant les utilisateurs. */
  readonly utilisateurs: THREE.Group;
}

/** Vrai si le point est sur une emprise à laisser dégagée (sites, routes, fibre, esplanade). */
function reserve(x: number, z: number, marge: number): boolean {
  for (const id of SITE_IDS) {
    const dx = Math.abs(x - SITE_X[id]);
    // Dalle, champ solaire à l'arrière et marge de dégagement.
    if (dx < DALLE.x1 + 4 + marge && z > DALLE.z0 - 12 - marge && z < DALLE.z1 + 4 + marge) return true;
    // Ligne électrique qui part vers l'arrière.
    if (Math.abs(x - (SITE_X[id] + 17)) < 3 + marge && z < 4) return true;
  }
  if (Math.abs(z - Z_ROUTE) < LARGEUR_ROUTE / 2 + 2 + marge) return true;
  // Couloir de la fibre entre les deux sites.
  if (Math.abs(x) < Math.abs(SITE_X.DC1) && z > -2 - marge && z < Z_ROUTE) return true;
  return Math.hypot(x - POS_ESPLANADE.x, z - POS_ESPLANADE.z) < 17 + marge;
}

function instancier(
  scene: THREE.Scene,
  geometrie: THREE.BufferGeometry,
  mat: THREE.Material,
  matrices: THREE.Matrix4[],
  ombre = true,
): void {
  const mesh = new THREE.InstancedMesh(geometrie, mat, matrices.length);
  matrices.forEach((matrice, i) => mesh.setMatrixAt(i, matrice));
  mesh.castShadow = ombre;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  scene.add(mesh);
}

function matrice(x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(sx, sy, sz),
  );
}

export function creerEnvironnement(scene: THREE.Scene): Environnement {
  const rnd = aleatoire(2026);
  const soleil = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(38));

  // Ciel atmosphérique.
  const ciel = new Sky();
  ciel.scale.setScalar(4000);
  const u = ciel.material.uniforms;
  if (u['turbidity']) u['turbidity'].value = 4.5;
  if (u['rayleigh']) u['rayleigh'].value = 1.1;
  if (u['mieCoefficient']) u['mieCoefficient'].value = 0.004;
  if (u['mieDirectionalG']) u['mieDirectionalG'].value = 0.8;
  if (u['sunPosition']) (u['sunPosition'].value as THREE.Vector3).copy(soleil);
  scene.add(ciel);

  // Sol de latérite.
  const texSol = textureSol();
  texSol.repeat.set(70, 70);
  const sol = new THREE.Mesh(
    new THREE.CircleGeometry(700, 72),
    materiau(0xffffff, { rugosite: 1, metal: 0, map: texSol }),
  );
  sol.rotation.x = -Math.PI / 2;
  sol.receiveShadow = true;
  sol.raycast = () => {};
  scene.add(sol);

  // Taches de végétation rase, pour casser l'uniformité du sol.
  const matHerbe = new THREE.MeshStandardMaterial({
    map: textureHerbe(),
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const taches: THREE.Matrix4[] = [];
  const plan = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  for (let i = 0; i < 170; i++) {
    const x = (rnd() - 0.5) * 520;
    const z = (rnd() - 0.5) * 420 - 30;
    if (reserve(x, z, -2)) continue;
    const taille = 8 + rnd() * 26;
    taches.push(matrice(x, 0.03, z, taille, 1, taille * (0.6 + rnd() * 0.6), rnd() * Math.PI));
  }
  instancier(scene, plan, matHerbe, taches, false);

  // Arbres de savane (acacias, karités, baobabs) et arbustes, modélisés dans vegetation.ts.
  const arbres: PlacementArbre[] = [];
  for (let i = 0; i < 400 && arbres.length < 70; i++) {
    const x = (rnd() - 0.5) * 460;
    const z = (rnd() - 0.5) * 380 - 40;
    // Le premier plan reste dégagé pour ne pas masquer les sites.
    if (reserve(x, z, 4) || (z > Z_ROUTE + 6 && Math.abs(x) < 95)) continue;
    arbres.push({ x, z });
  }
  const arbustes: PlacementArbre[] = [];
  const rochers: THREE.Matrix4[] = [];
  for (let i = 0; i < 520; i++) {
    const x = (rnd() - 0.5) * 420;
    const z = (rnd() - 0.5) * 340 - 20;
    if (reserve(x, z, 0.5)) continue;
    if (rnd() > 0.35) {
      arbustes.push({ x, z });
    } else {
      const s = 0.3 + rnd() * 0.9;
      rochers.push(matrice(x, s * 0.25, z, s, s * 0.6, s * (0.7 + rnd() * 0.6), rnd() * 3));
    }
  }
  planterVegetation(scene, arbres, arbustes);
  instancier(scene, new THREE.DodecahedronGeometry(1, 0), materiau(0x8a7f72, { rugosite: 0.95 }), rochers);

  // Collines à l'horizon, estompées par la brume.
  const collines: THREE.Matrix4[] = [];
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + rnd() * 0.2;
    const distance = 430 + rnd() * 140;
    const largeur = 90 + rnd() * 110;
    collines.push(
      matrice(Math.cos(angle) * distance, -4, Math.sin(angle) * distance, largeur, 22 + rnd() * 34, largeur * 0.8),
    );
  }
  instancier(scene, new THREE.SphereGeometry(1, 18, 10), materiau(0x8c7a5c, { rugosite: 1 }), collines, false);

  creerRoutes(scene);
  creerLignesElectriques(scene);
  const utilisateurs = creerEsplanade();
  scene.add(utilisateurs);

  return { soleil, ciel, utilisateurs };
}

/** Route principale et voies d'accès aux portails et à l'esplanade. */
function creerRoutes(scene: THREE.Scene): void {
  const voie = (x1: number, z1: number, x2: number, z2: number, largeur: number): void => {
    const longueur = Math.hypot(x2 - x1, z2 - z1);
    const texture = textureRoute();
    texture.repeat.set(longueur / 8, 1);
    const route = new THREE.Mesh(
      new THREE.PlaneGeometry(longueur, largeur).rotateX(-Math.PI / 2),
      materiau(0xffffff, { rugosite: 0.95, metal: 0, map: texture }),
    );
    route.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
    route.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
    route.receiveShadow = true;
    route.raycast = () => {};
    scene.add(route);
  };
  voie(-330, Z_ROUTE, 330, Z_ROUTE, LARGEUR_ROUTE);
  for (const id of SITE_IDS) {
    voie(SITE_X[id] + X_PORTAIL, DALLE.z1 + 2.4, SITE_X[id] + X_PORTAIL, Z_ROUTE - LARGEUR_ROUTE / 2, 4.2);
  }
  voie(POS_ESPLANADE.x - 9, Z_ROUTE + LARGEUR_ROUTE / 2, POS_ESPLANADE.x - 9, POS_ESPLANADE.z - 8, 4.2);
}

/** Ligne du réseau public : poteaux et conducteurs jusqu'au poste de chaque site. */
function creerLignesElectriques(scene: THREE.Scene): void {
  const bois = materiau(0x4a3a2c, { rugosite: 1 });
  const matFil = new THREE.LineBasicMaterial({ color: 0x1c1c1c });
  const H = 8.5;
  for (const id of SITE_IDS) {
    const x = SITE_X[id] + 17;
    const sommets: THREE.Vector3[] = [];
    for (const z of [1.5, -22, -50, -80, -112, -146]) {
      const poteau = cylindre(0.16, H, bois, x, 0, z, 8);
      poteau.raycast = () => {};
      const traverse = boite(2.4, 0.14, 0.14, bois, x, H - 0.6, z);
      traverse.raycast = () => {};
      scene.add(poteau, traverse);
      sommets.push(new THREE.Vector3(x, H - 0.4, z));
    }
    // Trois conducteurs, avec une flèche entre deux poteaux.
    for (const dx of [-1, 0, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < sommets.length - 1; i++) {
        const a = sommets[i];
        const b = sommets[i + 1];
        if (!a || !b) continue;
        for (let k = 0; k <= 10; k++) {
          const p = a.clone().lerp(b, k / 10);
          p.x += dx;
          p.y -= Math.sin((k / 10) * Math.PI) * 0.9;
          points.push(p);
        }
      }
      // Descente du premier poteau vers le poste de livraison.
      const premier = sommets[0];
      if (premier) {
        points.unshift(new THREE.Vector3(SITE_X[id] + 10.5 + dx * 0.3, Y_DALLE + 2.1, 1.5));
      }
      const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), matFil);
      ligne.raycast = () => {};
      scene.add(ligne);
    }
  }
}

/** Esplanade des utilisateurs : parvis, immeuble de bureaux et mobilier. */
function creerEsplanade(): THREE.Group {
  const groupe = new THREE.Group();
  groupe.position.copy(POS_ESPLANADE);

  // Parvis dallé.
  groupe.add(cylindre(9, 0.14, materiau(0xc9c2b4, { rugosite: 0.9 }), 0, 0, 0, 48));
  groupe.add(cylindre(8.4, 0.02, materiau(0xb5ad9d, { rugosite: 0.9 }), 0, 0.14, 0, 48));

  // Immeuble de bureaux en fond de parvis.
  const facade = textureBureaux();
  facade.map.repeat.set(2, 1);
  facade.emissive.repeat.set(2, 1);
  const matFacade = new THREE.MeshStandardMaterial({
    map: facade.map,
    emissiveMap: facade.emissive,
    emissive: 0xffffff,
    emissiveIntensity: 0.6,
    roughness: 0.6,
    metalness: 0.2,
  });
  // Placé sur le côté du parvis pour ne pas le masquer depuis la vue d'ensemble.
  const immeuble = new THREE.Group();
  immeuble.add(boite(18, 9, 7, matFacade));
  immeuble.add(boite(18.6, 0.4, 7.6, materiau(0x8f8a80, { rugosite: 0.8 }), 0, 9, 0));
  immeuble.add(boite(4, 3, 0.5, materiau(0x2c3e50, { rugosite: 0.2, metal: 0.6 }), 0, 0, -3.6));
  immeuble.add(boite(5, 0.25, 2.2, materiau(0x8f8a80, { rugosite: 0.8 }), 0, 3, -4.4));
  immeuble.position.set(15.5, 0, 2);
  immeuble.rotation.y = Math.PI / 2;
  groupe.add(immeuble);

  // Mobilier : bancs et table haute.
  const bois = materiau(0x8a6a48, { rugosite: 0.85 });
  const acier = materiau(0x5d6670, { rugosite: 0.4, metal: 0.8 });
  for (const x of [-5.5, 5.5]) {
    groupe.add(boite(2.2, 0.08, 0.55, bois, x, 0.5, 4.5));
    groupe.add(boite(0.08, 0.45, 0.5, acier, x - 0.9, 0.14, 4.5));
    groupe.add(boite(0.08, 0.45, 0.5, acier, x + 0.9, 0.14, 4.5));
  }
  groupe.add(cylindre(0.5, 0.05, bois, 2.6, 1.15, -1.6, 20));
  groupe.add(cylindre(0.05, 1.0, acier, 2.6, 0.14, -1.6, 10));
  // Ordinateur portable posé sur la table haute.
  groupe.add(boite(0.34, 0.015, 0.24, materiau(0x2a2e35, { metal: 0.6, rugosite: 0.3 }), 2.6, 1.2, -1.6));
  const ecran = boite(0.34, 0.22, 0.012, materiau(0x0, { emissive: 0x9fd8ff, intensite: 1.2 }), 2.6, 1.21, -1.73);
  ecran.rotation.x = -0.25;
  groupe.add(ecran);

  return groupe;
}
