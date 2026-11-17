import * as THREE from 'three';
import type { SiteId } from '../types';
import { Bouffees } from './effets';
import { boite, cylindre, marquer, materiau, panneau } from './outils';
import { textureDanger, textureGrillage, textureGrille, textureSolaire } from './textures';

export interface GroupeElectrogene {
  readonly groupe: THREE.Group;
  /** Partie qui vibre quand le moteur tourne. */
  readonly capot: THREE.Group;
  readonly voyant: THREE.MeshStandardMaterial;
  readonly fumee: Bouffees;
}

export function creerGroupeElectrogene(site: SiteId): GroupeElectrogene {
  const groupe = marquer(new THREE.Group(), { kind: 'groupe', site });
  const capot = new THREE.Group();
  const clair = materiau(0xdde1e5, { rugosite: 0.45, metal: 0.4 });
  const sombre = materiau(0x1c1f24, { rugosite: 0.5, metal: 0.5 });
  const voyant = materiau(0x0, { emissive: 0x3dff8a, intensite: 0 });

  groupe.add(boite(3.4, 0.25, 1.4, sombre));
  capot.add(boite(3.2, 1.6, 1.3, clair, 0, 0.25, 0));
  capot.add(boite(3.26, 0.06, 1.36, clair, 0, 1.85, 0));
  // Pupitre de commande et son écran.
  capot.add(boite(0.55, 0.7, 0.02, sombre, -1.05, 0.95, 0.655));
  capot.add(boite(0.3, 0.16, 0.02, materiau(0x0, { emissive: 0x7dd3fc, intensite: 0.9 }), -1.05, 1.4, 0.66));
  capot.add(boite(0.07, 0.07, 0.03, voyant, -1.05, 1.05, 0.665));
  // Portes et grille d'aération.
  for (const x of [-0.6, 0.3]) capot.add(boite(0.02, 1.5, 0.01, sombre, x, 0.3, 0.655));
  capot.add(
    panneau(1.0, 1.1, materiau(0xffffff, { metal: 0.3, map: textureGrille('#c4c9ce', '#4b5259') }), 0.95, 1.05, 0.656),
  );
  // Échappement.
  const metal = materiau(0x8c949c, { rugosite: 0.3, metal: 0.9 });
  capot.add(cylindre(0.08, 0.55, metal, 1.25, 1.9, 0, 14));
  groupe.add(capot);

  const fumee = new Bouffees(6, 0x8a8f96, 0.35, 2.6);
  fumee.groupe.position.set(1.25, 2.5, 0);
  groupe.add(fumee.groupe);

  return { groupe, capot, voyant, fumee };
}

/** Deux rangées de cinq panneaux photovoltaïques inclinés. */
export function creerChampSolaire(site: SiteId): THREE.Group {
  const groupe = marquer(new THREE.Group(), { kind: 'solaire', site });
  const matPanneau = materiau(0xffffff, { rugosite: 0.2, metal: 0.5, map: textureSolaire() });
  const matPied = materiau(0x8c949c, { rugosite: 0.4, metal: 0.8 });
  for (const z of [0, 3.3]) {
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 3.4;
      const dalle = boite(3.1, 0.08, 1.9, matPanneau, 0, -0.04, 0);
      dalle.rotation.x = 0.45;
      dalle.position.set(x, 1.25, z);
      groupe.add(dalle);
      groupe.add(cylindre(0.05, 1.48, matPied, x - 1.1, 0, z - 0.6, 8));
      groupe.add(cylindre(0.05, 1.48, matPied, x + 1.1, 0, z - 0.6, 8));
      groupe.add(cylindre(0.05, 0.9, matPied, x - 1.1, 0, z + 0.6, 8));
      groupe.add(cylindre(0.05, 0.9, matPied, x + 1.1, 0, z + 0.6, 8));
    }
  }
  return groupe;
}

/** Poste de livraison du réseau public. */
export function creerPosteSecteur(site: SiteId): THREE.Group {
  const groupe = marquer(new THREE.Group(), { kind: 'secteur', site });
  groupe.add(boite(1.8, 0.15, 1.5, materiau(0x6b7280, { rugosite: 0.9 })));
  groupe.add(boite(1.6, 1.8, 1.3, materiau(0x4f6b5a, { rugosite: 0.5, metal: 0.3 }), 0, 0.15, 0));
  groupe.add(boite(1.75, 0.08, 1.45, materiau(0x3c5346, { rugosite: 0.5, metal: 0.3 }), 0, 1.95, 0));
  groupe.add(panneau(0.6, 0.6, materiau(0xffffff, { map: textureDanger() }), 0, 1.25, 0.656));
  return groupe;
}

/** Mât portant une caméra de surveillance du périmètre. */
export function creerMatCamera(site: SiteId, orientation: number): THREE.Group {
  const groupe = marquer(new THREE.Group(), { kind: 'camera', site });
  const metal = materiau(0x8c949c, { rugosite: 0.35, metal: 0.8 });
  groupe.add(cylindre(0.07, 4.2, metal, 0, 0, 0, 10));
  const tete = new THREE.Group();
  tete.add(boite(0.2, 0.18, 0.45, materiau(0xf1f3f5, { rugosite: 0.4 }), 0, -0.09, 0.2));
  tete.add(boite(0.14, 0.12, 0.02, materiau(0x0b0d10, { rugosite: 0.1, metal: 0.6 }), 0, -0.06, 0.43));
  tete.position.y = 4.1;
  tete.rotation.set(0.35, orientation, 0, 'YXZ');
  groupe.add(tete);
  return groupe;
}

export interface Cloture {
  readonly groupe: THREE.Group;
  /** Borne à badge du portail. */
  readonly borne: THREE.Group;
}

/** Clôture grillagée sur le pourtour de la dalle, avec un portail ouvert côté avant. */
export function creerCloture(site: SiteId, demiL: number, demiP: number): Cloture {
  const groupe = marquer(new THREE.Group(), { kind: 'cloture', site });
  const H = 2.2;
  const matPoteau = materiau(0x5d6670, { rugosite: 0.4, metal: 0.8 });
  const portail = { debut: -10, fin: -6 };

  const troncon = (x1: number, z1: number, x2: number, z2: number): void => {
    const longueur = Math.hypot(x2 - x1, z2 - z1);
    const texture = textureGrillage();
    texture.repeat.set(longueur / 0.22, H / 0.22);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.6,
    });
    const grille = panneau(longueur, H, mat, (x1 + x2) / 2, H / 2, (z1 + z2) / 2);
    grille.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
    // Le grillage ne doit pas intercepter les clics destinés aux équipements.
    grille.raycast = () => {};
    groupe.add(grille);
    const lisse = boite(longueur, 0.05, 0.05, matPoteau, (x1 + x2) / 2, H - 0.05, (z1 + z2) / 2);
    lisse.rotation.y = grille.rotation.y;
    groupe.add(lisse);
    const nb = Math.max(1, Math.round(longueur / 3.2));
    for (let i = 0; i <= nb; i++) {
      const k = i / nb;
      groupe.add(cylindre(0.05, H, matPoteau, x1 + (x2 - x1) * k, 0, z1 + (z2 - z1) * k, 8));
    }
  };

  troncon(-demiL, -demiP, demiL, -demiP);
  troncon(demiL, -demiP, demiL, demiP);
  troncon(-demiL, -demiP, -demiL, demiP);
  troncon(-demiL, demiP, portail.debut, demiP);
  troncon(portail.fin, demiP, demiL, demiP);

  // Vantaux du portail, ouverts vers l'extérieur.
  for (const [x, angle] of [
    [portail.debut, -1.2],
    [portail.fin, Math.PI + 1.2],
  ] as const) {
    const vantail = new THREE.Group();
    vantail.add(boite(2, 0.06, 0.06, matPoteau, 1, H - 0.1, 0));
    vantail.add(boite(2, 0.06, 0.06, matPoteau, 1, 0.1, 0));
    vantail.add(boite(0.06, H - 0.1, 0.06, matPoteau, 2, 0.05, 0));
    for (let i = 1; i < 8; i++) vantail.add(boite(0.03, H - 0.3, 0.03, matPoteau, i * 0.25, 0.15, 0));
    vantail.position.set(x, 0, demiP);
    vantail.rotation.y = angle;
    groupe.add(vantail);
  }

  const borne = marquer(new THREE.Group(), { kind: 'controle-acces', site });
  borne.add(boite(0.16, 1.2, 0.16, materiau(0x2b3b52, { rugosite: 0.4, metal: 0.5 })));
  borne.add(boite(0.2, 0.26, 0.06, materiau(0x15181c), 0, 1.0, 0.09));
  borne.add(boite(0.06, 0.04, 0.02, materiau(0x0, { emissive: 0x3dff8a, intensite: 2.5 }), 0, 1.2, 0.125));
  borne.position.set(portail.fin + 0.7, 0, demiP + 0.6);

  return { groupe, borne };
}
