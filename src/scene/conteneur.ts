import * as THREE from 'three';
import type { SiteId } from '../types';
import { amortir, boite, figer, marquer, materiau, panneau } from './outils';
import { plaque, textureGrille, tole } from './textures';

/** Module 40 pieds double largeur (deux gabarits ISO accolés) : longueur, hauteur, profondeur, épaisseur de paroi. */
export const CONTENEUR = { L: 12.2, H: 2.9, P: 4.88, E: 0.06 } as const;
/** Épaisseur du plancher. */
export const PLANCHER = 0.12;
/** Ouverture ménagée dans les longues parois pour passer d'un module à l'autre (repère du module). */
export const PASSAGE = { x0: 4.0, x1: 5.1, h: 2.15 } as const;
/** Porte d'entrée, dans le pignon gauche (repère du module). */
export const PORTE = { z0: -0.5, z1: 0.5, h: 2.15 } as const;
/** Aérorefroidisseurs posés sur le toit, un par rangée de baies (repère du module). */
export const CONDENSEURS: readonly { readonly x: number; readonly z: number }[] = [
  { x: -2.4, z: -1.3 },
  { x: -2.4, z: 1.3 },
];

/**
 * État d'une longue paroi : pleine (paroi extérieure), percée d'un passage vers le module voisin,
 * ou retirée quand les modules sont réunis en une seule salle.
 */
export type EtatMur = 'plein' | 'porte' | 'retire';

export interface ReglageModule {
  /** 0 = module fermé, 1 = toit (et paroi avant si elle est escamotable) effacés. */
  readonly coupe: number;
  readonly avant: EtatMur;
  readonly arriere: EtatMur;
  /** Vrai pour la paroi avant du premier module, la seule visible depuis la route. */
  readonly avantEscamotable: boolean;
  readonly porteOuverte: boolean;
  /** Vrai quand un module est posé dessus : ses aérorefroidisseurs sont alors masqués. */
  readonly couvert: boolean;
  /** Vrai quand le module est alimenté : les ventilateurs du toit tournent. */
  readonly ventile: boolean;
}

function matTole(repetitions: number): THREE.MeshStandardMaterial {
  const { map, relief } = tole(Math.max(1, Math.round(repetitions)));
  return new THREE.MeshStandardMaterial({
    color: 0xe6eaee,
    roughness: 0.5,
    metalness: 0.35,
    map,
    bumpMap: relief,
    bumpScale: 2,
  });
}

/** Ondulations par mètre de tôle. */
const ONDES = 3.6;

interface Mur {
  readonly groupe: THREE.Group;
  readonly pleins: THREE.Mesh[];
  /** Panneau qui obture le passage quand la paroi est extérieure. */
  readonly obturateur: THREE.Mesh;
  /** Encadrement du passage. */
  readonly cadre: THREE.Group;
  readonly mats: THREE.MeshStandardMaterial[];
}

/** Longue paroi, avec un passage en attente entre `PASSAGE.x0` et `PASSAGE.x1`. */
function creerMur(z: number, structure: THREE.Material): Mur {
  const { L, H, E } = CONTENEUR;
  const groupe = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const morceau = (x0: number, x1: number, y0: number, y1: number): THREE.Mesh => {
    const mat = matTole((x1 - x0) * ONDES);
    mats.push(mat);
    const mesh = boite(x1 - x0, y1 - y0, E, mat, (x0 + x1) / 2, y0, z);
    groupe.add(mesh);
    return mesh;
  };
  // Les parois s'arrêtent sous le toit : aucune face n'est partagée avec lui (sinon elles scintillent).
  const pleins = [
    morceau(-L / 2, PASSAGE.x0, PLANCHER, H - E),
    morceau(PASSAGE.x1, L / 2, PLANCHER, H - E),
    morceau(PASSAGE.x0, PASSAGE.x1, PLANCHER + PASSAGE.h, H - E),
  ];
  const obturateur = morceau(PASSAGE.x0, PASSAGE.x1, PLANCHER, PLANCHER + PASSAGE.h);
  const cadre = new THREE.Group();
  const largeur = PASSAGE.x1 - PASSAGE.x0;
  for (const x of [PASSAGE.x0, PASSAGE.x1]) cadre.add(boite(0.07, PASSAGE.h, E + 0.06, structure, x, PLANCHER, z));
  cadre.add(boite(largeur + 0.07, 0.07, E + 0.06, structure, (PASSAGE.x0 + PASSAGE.x1) / 2, PLANCHER + PASSAGE.h, z));
  cadre.visible = false;
  groupe.add(cadre);
  return { groupe, pleins, obturateur, cadre, mats };
}

function appliquerOpacite(mats: readonly THREE.MeshStandardMaterial[], meshes: readonly THREE.Object3D[], opacite: number): void {
  const translucide = opacite < 0.999;
  for (const mat of mats) {
    mat.opacity = opacite;
    if (mat.transparent !== translucide) {
      mat.transparent = translucide;
      mat.needsUpdate = true;
    }
  }
  for (const mesh of meshes) {
    mesh.visible = opacite > 0.02;
    mesh.castShadow = opacite > 0.5;
  }
}

/** Un module préfabriqué : plancher, ossature, parois, toit éclairé et porte d'accès. */
export class ModuleConteneur {
  readonly groupe: THREE.Group;
  private readonly toit: THREE.Group;
  private readonly matToit: THREE.MeshStandardMaterial;
  private readonly avant: Mur;
  private readonly arriere: Mur;
  private readonly enseigne: THREE.Mesh | null;
  private readonly battant = new THREE.Group();
  private readonly aeros = new THREE.Group();
  private readonly helices: THREE.Object3D[] = [];
  private ouverture = 0;
  private vitesseHelices = 0;

  constructor(
    site: SiteId,
    readonly numero: number,
  ) {
    const { L, H, P, E } = CONTENEUR;
    this.groupe = marquer(new THREE.Group(), { kind: 'conteneur', site, module: numero });
    const structure = materiau(0x1f3a5f, { rugosite: 0.45, metal: 0.5 });
    const hauteurParoi = H - PLANCHER;

    this.groupe.add(boite(L, PLANCHER, P, materiau(0x4b5560, { rugosite: 0.8 })));

    // Longues parois, chacune prête à recevoir un passage vers le module voisin.
    this.avant = creerMur(P / 2 - E / 2, structure);
    this.arriere = creerMur(-P / 2 + E / 2, structure);
    this.groupe.add(this.avant.groupe, this.arriere.groupe);

    // Pignon droit plein, avec le numéro du module.
    this.groupe.add(boite(E, hauteurParoi - E, P - 2 * E, matTole(P * ONDES), L / 2 - E / 2, PLANCHER, 0));
    const numeroPlaque = panneau(
      1.6,
      0.42,
      materiau(0xffffff, { rugosite: 0.5, map: plaque(`MODULE ${numero}`, '#1f3a5f') }),
      L / 2 + 0.006,
      2.25,
      0,
    );
    numeroPlaque.rotation.y = Math.PI / 2;
    this.groupe.add(numeroPlaque);

    // Pignon gauche, percé de la porte d'entrée.
    const xGauche = -L / 2 + E / 2;
    const pignon = (z0: number, z1: number, y0: number, y1: number): void => {
      this.groupe.add(boite(E, y1 - y0, z1 - z0, matTole((z1 - z0) * ONDES), xGauche, y0, (z0 + z1) / 2));
    };
    pignon(-P / 2 + E, PORTE.z0, PLANCHER, H - E);
    pignon(PORTE.z1, P / 2 - E, PLANCHER, H - E);
    pignon(PORTE.z0, PORTE.z1, PLANCHER + PORTE.h, H - E);

    // Enseigne du site, sur la paroi avant du premier module.
    if (numero === 1) {
      const matEnseigne = materiau(0xffffff, { rugosite: 0.5, map: plaque(`${site} · MODULE 1`, '#1f3a5f') });
      this.enseigne = panneau(3.4, 0.85, matEnseigne, -2.6, 2.0, P / 2 + 0.006);
      this.avant.groupe.add(this.enseigne);
      this.avant.mats.push(matEnseigne);
    } else {
      this.enseigne = null;
    }

    // Toit et rampes d'éclairage, effacés ensemble par la vue en coupe.
    this.toit = new THREE.Group();
    this.matToit = matTole(L * ONDES);
    this.toit.add(boite(L, E, P, this.matToit, 0, H - E, 0));
    const matLumiere = materiau(0xffffff, { emissive: 0xf4f8ff, intensite: 2.2 });
    for (const z of [-1.95, 0, 1.95]) {
      const rampe = boite(9.5, 0.04, 0.14, matLumiere, -0.4, H - E - 0.05, z);
      rampe.castShadow = false;
      this.toit.add(rampe);
    }
    this.groupe.add(this.toit);

    // Ossature : montants d'angle et longerons, toujours visibles. Elle déborde de 5 mm des parois,
    // du plancher et du toit pour ne jamais partager de face avec eux.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.groupe.add(boite(0.15, H + 0.01, 0.15, structure, (sx * (L - 0.14)) / 2, -0.005, (sz * (P - 0.14)) / 2));
      }
    }
    for (const sz of [-1, 1]) {
      this.groupe.add(boite(L - 0.02, 0.15, 0.11, structure, 0, -0.005, (sz * (P - 0.1)) / 2));
      this.groupe.add(boite(L - 0.02, 0.13, 0.11, structure, 0, H - 0.12, (sz * (P - 0.1)) / 2));
    }
    for (const sx of [-1, 1]) {
      this.groupe.add(boite(0.11, 0.13, P - 0.02, structure, (sx * (L - 0.1)) / 2, H - 0.12, 0));
    }

    // Porte d'accès à badge : le battant pivote sur ses gonds pour la visite à pied.
    const porte = marquer(new THREE.Group(), { kind: 'controle-acces', site, module: numero });
    const xPorte = -L / 2 - 0.03;
    const largeurPorte = PORTE.z1 - PORTE.z0 - 0.04;
    this.battant.position.set(xPorte, 0, PORTE.z0 + 0.02);
    this.battant.add(
      boite(0.05, PORTE.h - 0.04, largeurPorte, materiau(0x2b3b52, { rugosite: 0.4, metal: 0.5 }), 0, PLANCHER, largeurPorte / 2),
    );
    this.battant.add(boite(0.06, 0.05, 0.22, materiau(0xc9ced4, { metal: 0.9, rugosite: 0.25 }), -0.03, 1.15, largeurPorte - 0.2));
    porte.add(this.battant);
    porte.add(boite(0.05, 0.2, 0.13, materiau(0x15181c), xPorte, 1.25, 0.72));
    porte.add(boite(0.055, 0.035, 0.035, materiau(0x0, { emissive: 0x3dff8a, intensite: 2.5 }), xPorte, 1.4, 0.72));
    porte.add(boite(0.7, PLANCHER, 1.3, materiau(0x6b7280, { rugosite: 0.8, metal: 0.4 }), xPorte - 0.36, 0, 0));
    this.groupe.add(porte);

    // Aérorefroidisseurs du toit : batterie d'échange, deux ventilateurs, pieds.
    const carrosserie = materiau(0xe5e8ec, { rugosite: 0.45, metal: 0.4 });
    const grille = materiau(0xffffff, { rugosite: 0.6, metal: 0.5, map: textureGrille('#9aa3ad', '#3f4650') });
    const noir = materiau(0x1c1f24, { rugosite: 0.5, metal: 0.4 });
    const matPale = materiau(0x30363d, { rugosite: 0.5 });
    for (const c of CONDENSEURS) {
      const aero = marquer(new THREE.Group(), { kind: 'aerorefroidisseur', site, module: numero });
      aero.add(boite(1.5, 0.12, 1.05, structure, 0, 0, 0));
      aero.add(boite(1.5, 0.7, 1.05, carrosserie, 0, 0.12, 0));
      for (const sz of [-1, 1]) aero.add(panneau(1.4, 0.6, grille, 0, 0.47, sz * 0.527));
      for (const dx of [-0.37, 0.37]) {
        const anneau = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 28, 1, true), noir);
        anneau.position.set(dx, 0.85, 0);
        aero.add(anneau);
        const helice = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const pale = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.09), matPale);
          pale.position.x = 0.15;
          const bras = new THREE.Group();
          bras.rotation.y = (k * Math.PI * 2) / 5;
          pale.rotation.x = 0.35;
          bras.add(pale);
          helice.add(bras);
        }
        helice.position.set(dx, 0.84, 0);
        this.helices.push(helice);
        aero.add(helice);
      }
      aero.position.set(c.x, H, c.z);
      this.aeros.add(aero);
    }
    this.groupe.add(this.aeros);
    figer(this.groupe);
  }

  appliquer(dt: number, r: ReglageModule): void {
    appliquerOpacite([this.matToit], [this.toit], 1 - r.coupe);
    this.appliquerMur(this.avant, r.avant, r.avantEscamotable ? 1 - r.coupe : 1);
    this.appliquerMur(this.arriere, r.arriere, 1);
    if (this.enseigne) this.enseigne.visible = this.avant.groupe.visible && r.avant === 'plein' && r.coupe < 0.98;

    this.ouverture = amortir(this.ouverture, r.porteOuverte ? 1 : 0, 4, dt);
    this.battant.rotation.y = -1.75 * this.ouverture;

    this.aeros.visible = !r.couvert;
    this.vitesseHelices = amortir(this.vitesseHelices, r.ventile ? 9 : 0, 1.5, dt);
    for (const helice of this.helices) helice.rotation.y += this.vitesseHelices * dt;
  }

  private appliquerMur(mur: Mur, etat: EtatMur, opacite: number): void {
    mur.groupe.visible = etat !== 'retire';
    if (etat === 'retire') return;
    appliquerOpacite(mur.mats, [...mur.pleins, mur.obturateur], opacite);
    if (etat === 'porte') mur.obturateur.visible = false;
    mur.cadre.visible = etat === 'porte';
  }
}
