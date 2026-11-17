import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { marquesBaie } from '../baies';
import { CATALOGUE, COULEUR_FAMILLE } from '../catalog';
import type { EquipmentKind, EquipmentRef, Famille, RackKind, SiteId } from '../types';
import { CONTENEUR, PLANCHER } from './conteneur';
import { facadeBaie } from './facades';
import { boite, cylindre, figer, marquer, materiau, panneau, toile } from './outils';
import { creerCircuits, type CircuitActif, type CircuitModule, type GeometrieSalle } from './circuits';
import { construireIncendie } from './incendie';
import { plaque, textureDalles, textureDanger, textureDisjoncteurs, textureGrille } from './textures';

/** Étiquette flottante et l'équipement qu'elle désigne (pour l'afficher au survol). */
export interface EtiquetteEquipement {
  readonly objet: CSS2DObject;
  readonly cible: THREE.Object3D;
}

/** Emprise au sol d'un obstacle, dans le repère du module. */
export interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export interface Interieur {
  readonly groupe: THREE.Group;
  /** Façades des baies : leur intensité lumineuse suit l'alimentation du site. */
  readonly facades: THREE.MeshStandardMaterial[];
  /** Volumes des allées froide et chaude, montrés avec le circuit de l'air. */
  readonly fluxAir: THREE.Group;
  readonly ecransOnduleur: THREE.MeshStandardMaterial[];
  /** Étiquettes flottantes au-dessus des équipements. */
  readonly etiquettes: EtiquetteEquipement[];
  /** Circuits techniques animés (un seul visible à la fois). */
  readonly circuits: Record<CircuitActif, CircuitModule>;
  /** Obstacles pour la visite à pied. */
  readonly obstacles: readonly Rect[];
  /** Points de raccordement, dans le repère du module. */
  readonly ancres: {
    readonly reseau: THREE.Vector3;
    readonly tableau: THREE.Vector3;
    /** Sommet des baies de calcul et de stockage de la rangée du fond (plan cœur du module 1). */
    readonly calcul: readonly THREE.Vector3[];
    readonly stockage: THREE.Vector3;
  };
}

type Element = RackKind | 'inrow';

interface PlanModule {
  /** Rangée du fond : ses façades regardent l'allée froide centrale. */
  readonly fond: readonly Element[];
  /** Rangée avant, en vis-à-vis. */
  readonly avant: readonly Element[];
}

/** Module 1 : cœur de réseau, sécurité et services communs. */
const PLAN_COEUR: PlanModule = {
  fond: ['inrow', 'rack-reseau', 'rack-calcul', 'rack-calcul', 'rack-stockage', 'inrow'],
  avant: ['inrow', 'rack-securite', 'rack-stockage', 'rack-sauvegarde', 'rack-supervision', 'inrow'],
};

/** Modules d'extension : capacité de calcul et de stockage, raccordée au cœur du module 1. */
const PLAN_EXTENSION: PlanModule = {
  fond: ['inrow', 'rack-reseau', 'rack-calcul', 'rack-calcul', 'rack-calcul', 'inrow'],
  avant: ['inrow', 'rack-calcul', 'rack-calcul', 'rack-stockage', 'rack-stockage', 'inrow'],
};

export const H_BAIE = 2.0;
export const P_BAIE = 1.0;
export const L_BAIE = 0.6;
const L_INROW = 0.3;
/** Torons de câbles sortant du toit de chaque baie : réseau, fibre, énergie. */
const COULEURS_TORON = [0x2f7fff, 0xffd23d, 0x1c1c1c, 0xe9eef5, 0x2f7fff] as const;
/** Demi-largeur de l'allée froide centrale. */
const DEMI_ALLEE = 0.6;
const X_DEBUT = -3.9;

function famille(kind: RackKind): Famille {
  return CATALOGUE[kind].famille;
}

/** Étiquette flottante : titre, précision et pastille de couleur. */
function etiquette(titre: string, detail: string, couleur: string, x: number, y: number, z: number): CSS2DObject {
  const racine = document.createElement('div');
  racine.className = 'etiquette-equipement';
  racine.style.setProperty('--accent', couleur);
  const t = document.createElement('strong');
  t.textContent = titre;
  const d = document.createElement('span');
  d.textContent = detail;
  racine.append(t, d);
  const objet = new CSS2DObject(racine);
  objet.position.set(x, y, z);
  objet.visible = false;
  return objet;
}

/** Écran d'onduleur : le texte est lumineux, sa couleur suit l'état (vert ou ambre). */
function ecranOnduleur(numero: number): THREE.MeshStandardMaterial {
  const texte = toile(256, 128, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`ONDULEUR ${numero}`, 14, 40);
    ctx.font = '500 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Charge', 14, 74);
    for (let i = 0; i < 10; i++) ctx.fillRect(98 + i * 14, 60, 10, 18);
    ctx.fillText('Batteries 100 %', 14, 108);
  });
  const fondEcran = toile(32, 32, (ctx) => {
    ctx.fillStyle = '#0a1a14';
    ctx.fillRect(0, 0, 32, 32);
  });
  return new THREE.MeshStandardMaterial({
    map: fondEcran,
    emissiveMap: texte,
    emissive: 0x3dff8a,
    emissiveIntensity: 1.8,
    roughness: 0.25,
    metalness: 0.1,
  });
}

/** Bandes jaunes et noires des armoires à risque électrique. */
function textureHachures(): THREE.CanvasTexture {
  return toile(128, 32, (ctx) => {
    ctx.fillStyle = '#f5c518';
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = '#15171a';
    for (let x = -32; x < 128; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 32);
      ctx.lineTo(x + 12, 32);
      ctx.lineTo(x + 44, 0);
      ctx.lineTo(x + 32, 0);
      ctx.closePath();
      ctx.fill();
    }
  });
}

export function creerInterieur(site: SiteId, module: number): Interieur {
  const plan = module === 1 ? PLAN_COEUR : PLAN_EXTENSION;
  const prefixe = module === 1 ? '' : `M${module}·`;
  const groupe = new THREE.Group();
  const facades: THREE.MeshStandardMaterial[] = [];
  const etiquettes: EtiquetteEquipement[] = [];
  const inrows: { x: number; z: number; face: 1 | -1 }[] = [];
  const xBaies: number[] = [];
  const obstacles: Rect[] = [];
  const ref = (kind: EquipmentKind): EquipmentRef => ({ kind, site, module });

  const corps = materiau(0x1b1f25, { rugosite: 0.45, metal: 0.6 });
  const matInrow = materiau(0xeef1f4, { rugosite: 0.4, metal: 0.3 });
  const matGrilleInrow = materiau(0xffffff, { rugosite: 0.5, metal: 0.3, map: textureGrille('#d8dee3', '#6f7780') });
  const matPorteArriere = materiau(0xffffff, { rugosite: 0.6, metal: 0.4, map: textureGrille('#1b1f25', '#0b0d10') });
  const matPlaqueClim = materiau(0xffffff, { rugosite: 0.5, map: plaque('CLIM', '#0c4a6e', '#ffffff', 64) });
  const demiP = CONTENEUR.P / 2 - CONTENEUR.E;
  const cadreBaie = materiau(0x2a2f37, { rugosite: 0.4, metal: 0.7 });
  const chromeBaie = materiau(0xc9ced4, { rugosite: 0.25, metal: 0.9 });
  const yEtiquette = PLANCHER + H_BAIE + 0.42;
  let numero = 0;
  let numeroClim = 0;

  // Faux plancher.
  const dalles = textureDalles();
  dalles.repeat.set(20, 8);
  const sol = new THREE.Mesh(
    new THREE.PlaneGeometry(CONTENEUR.L - 0.2, CONTENEUR.P - 0.16),
    materiau(0xffffff, { rugosite: 0.7, metal: 0.2, map: dalles }),
  );
  sol.rotation.x = -Math.PI / 2;
  sol.position.y = PLANCHER + 0.01;
  sol.receiveShadow = true;
  groupe.add(sol);

  /** Construit une rangée ; `face` vaut +1 si les façades regardent +z, -1 sinon. */
  const rangee = (elements: readonly Element[], face: 1 | -1): number => {
    const z = -face * (DEMI_ALLEE + P_BAIE / 2);
    let x = X_DEBUT;
    for (const element of elements) {
      const largeur = element === 'inrow' ? L_INROW : L_BAIE;
      let objet: THREE.Group;
      if (element === 'inrow') {
        numeroClim += 1;
        objet = marquer(new THREE.Group(), ref('inrow'));
        objet.add(boite(L_INROW, H_BAIE, P_BAIE, matInrow));
        objet.add(panneau(L_INROW - 0.05, 1.45, matGrilleInrow, 0, 0.82, P_BAIE / 2 + 0.004));
        objet.add(boite(L_INROW + 0.01, 0.08, P_BAIE + 0.02, materiau(0x38bdf8, { rugosite: 0.4 }), 0, H_BAIE - 0.07, 0));
        objet.add(panneau(0.24, 0.06, matPlaqueClim, 0, 1.62, P_BAIE / 2 + 0.005));
        objet.add(
          boite(0.16, 0.08, 0.01, materiau(0x0, { emissive: 0x4dd2ff, intensite: 1.6 }), 0, 1.72, P_BAIE / 2 + 0.004),
        );
        inrows.push({ x: x + largeur / 2, z, face });
        etiquettes.push({
          objet: etiquette(`${prefixe}Clim In-Row`, 'Refroidissement', COULEUR_FAMILLE.Refroidissement, x + largeur / 2, yEtiquette, z),
          cible: objet,
        });
      } else {
        numero += 1;
        objet = marquer(new THREE.Group(), ref(element));
        const facade = facadeBaie(element);
        const matFacade = new THREE.MeshStandardMaterial({
          map: facade.map,
          emissiveMap: facade.emissive,
          emissive: 0xffffff,
          emissiveIntensity: 1.3,
          roughness: 0.45,
          metalness: 0.35,
        });
        facades.push(matFacade);
        const zFace = P_BAIE / 2;
        // Plinthe, corps et façade.
        objet.add(boite(L_BAIE - 0.01, 0.08, P_BAIE, cadreBaie));
        objet.add(boite(L_BAIE - 0.02, H_BAIE - 0.08, P_BAIE - 0.03, corps, 0, 0.08, 0));
        objet.add(panneau(L_BAIE - 0.09, H_BAIE - 0.21, matFacade, 0, 1.035, zFace - 0.008));
        // Cadre de porte en relief : montants et traverses.
        for (const sx of [-1, 1]) {
          objet.add(boite(0.035, H_BAIE - 0.08, 0.035, cadreBaie, sx * (L_BAIE / 2 - 0.022), 0.08, zFace - 0.012));
        }
        objet.add(boite(L_BAIE - 0.01, 0.07, 0.035, cadreBaie, 0, H_BAIE - 0.07, zFace - 0.012));
        objet.add(boite(L_BAIE - 0.01, 0.05, 0.035, cadreBaie, 0, 0.08, zFace - 0.012));
        // Poignée de porte et plaque d'identification.
        objet.add(boite(0.016, 0.18, 0.022, chromeBaie, L_BAIE / 2 - 0.022, 0.95, zFace + 0.006));
        const nomFamille = famille(element);
        const accentCss = COULEUR_FAMILLE[nomFamille];
        const code = `${prefixe}B${String(numero).padStart(2, '0')}`;
        const matPlaque = materiau(0xffffff, {
          rugosite: 0.5,
          map: plaque(`${code} ${nomFamille.toUpperCase()}`, '#0f141c', '#ffffff', 46),
        });
        objet.add(panneau(0.3, 0.06, matPlaque, 0, H_BAIE - 0.035, zFace + 0.011));
        // Porte arrière perforée, côté allée chaude.
        const arriere = panneau(L_BAIE - 0.06, H_BAIE - 0.1, matPorteArriere, 0, H_BAIE / 2, -P_BAIE / 2 - 0.004);
        arriere.rotation.y = Math.PI;
        objet.add(arriere);
        for (const sx of [-1, 1]) {
          objet.add(boite(0.03, H_BAIE - 0.08, 0.03, cadreBaie, sx * (L_BAIE / 2 - 0.02), 0.08, -zFace + 0.01));
        }
        // Bandeau à la couleur de la famille, passe-câbles et torons montant vers le chemin de câbles.
        const accent = new THREE.Color(accentCss).getHex();
        objet.add(boite(L_BAIE - 0.01, 0.045, P_BAIE + 0.01, materiau(accent, { rugosite: 0.4 }), 0, H_BAIE, 0));
        objet.add(boite(0.3, 0.03, 0.14, cadreBaie, 0, H_BAIE + 0.045, -0.1));
        COULEURS_TORON.forEach((couleur, i) => {
          const toron = cylindre(0.014, 0.25, materiau(couleur, { rugosite: 0.6 }), -0.08 + i * 0.04, H_BAIE + 0.07, -0.1, 8);
          toron.castShadow = false;
          objet.add(toron);
        });
        if (face === 1) xBaies.push(x + largeur / 2);
        etiquettes.push({
          objet: etiquette(`${code} · ${nomFamille}`, marquesBaie(element).join(' · '), accentCss, x + largeur / 2, yEtiquette, z),
          cible: objet,
        });
      }
      objet.position.set(x + largeur / 2, PLANCHER, z);
      if (face === -1) objet.rotation.y = Math.PI;
      groupe.add(objet);
      x += largeur;
    }
    obstacles.push({ x0: X_DEBUT, x1: x, z0: z - P_BAIE / 2, z1: z + P_BAIE / 2 });
    // Chemin de câbles au-dessus de la rangée.
    groupe.add(
      boite(x - X_DEBUT + 4.4, 0.05, 0.36, materiau(0x5b6470, { metal: 0.5, rugosite: 0.5 }), (X_DEBUT + x) / 2 + 2.2, 2.32, z),
    );
    return x;
  };

  const xFin = rangee(plan.fond, 1);
  rangee(plan.avant, -1);
  const longueur = xFin - X_DEBUT;
  const xCentre = (X_DEBUT + xFin) / 2;

  // Confinement de l'allée froide : toit vitré et portes d'extrémité.
  const verre = materiau(0xbfe9ff, { opacite: 0.18, rugosite: 0.05, metal: 0.1 });
  const cadre = materiau(0x8c949c, { rugosite: 0.35, metal: 0.8 });
  const confinement = new THREE.Group();
  confinement.add(boite(longueur, 0.03, DEMI_ALLEE * 2, verre, xCentre, PLANCHER + H_BAIE + 0.02, 0));
  for (const x of [X_DEBUT, xFin]) {
    confinement.add(boite(0.03, H_BAIE, DEMI_ALLEE * 2, verre, x, PLANCHER, 0));
    confinement.add(boite(0.05, H_BAIE + 0.06, 0.05, cadre, x, PLANCHER, -DEMI_ALLEE));
    confinement.add(boite(0.05, H_BAIE + 0.06, 0.05, cadre, x, PLANCHER, DEMI_ALLEE));
    confinement.add(boite(0.05, 0.05, DEMI_ALLEE * 2, cadre, x, PLANCHER + H_BAIE + 0.01, 0));
  }
  confinement.traverse((objet) => {
    objet.castShadow = false;
    objet.raycast = () => {};
  });
  groupe.add(confinement);

  // Zone énergie, contre la paroi du fond.
  const zFond = -demiP;
  const hachures = materiau(0xffffff, { rugosite: 0.6, map: textureHachures() });
  const danger = materiau(0xffffff, { rugosite: 0.6, map: textureDanger() });

  // Tableau général basse tension : armoire claire, porte vitrée sur les disjoncteurs.
  const tableau = marquer(new THREE.Group(), ref('tableau'));
  tableau.add(boite(1.0, H_BAIE, 0.45, materiau(0xd8d5cc, { rugosite: 0.55, metal: 0.2 })));
  tableau.add(panneau(0.86, 1.5, materiau(0xffffff, { rugosite: 0.5, map: textureDisjoncteurs() }), 0, 0.95, 0.228));
  tableau.add(boite(0.88, 1.52, 0.012, materiau(0xbfe9ff, { opacite: 0.25, rugosite: 0.05 }), 0, 0.19, 0.235));
  tableau.add(panneau(0.4, 0.09, materiau(0xffffff, { map: plaque('TGBT', '#1e293b', '#facc15', 70) }), -0.2, 1.86, 0.232));
  tableau.add(panneau(0.16, 0.16, danger, 0.32, 1.86, 0.232));
  tableau.add(panneau(1.0, 0.08, hachures, 0, 0.04, 0.232));
  tableau.position.set(1.3, PLANCHER, zFond + 0.25);
  groupe.add(tableau);
  obstacles.push({ x0: 0.8, x1: 1.8, z0: zFond, z1: zFond + 0.5 });
  etiquettes.push({
    objet: etiquette(`${prefixe}TGBT`, 'Distribution électrique', COULEUR_FAMILLE['Énergie'], 1.3, yEtiquette, zFond + 0.25),
    cible: tableau,
  });

  // Deux onduleurs redondants : armoires blanches, écran d'état et bandeau jaune.
  const ecransOnduleur: THREE.MeshStandardMaterial[] = [];
  const matGrilleOnduleur = materiau(0xffffff, { map: textureGrille('#d5d9de', '#7c848e') });
  [2.5, 3.45].forEach((x, i) => {
    const ecran = ecranOnduleur(i + 1);
    ecransOnduleur.push(ecran);
    const onduleur = marquer(new THREE.Group(), ref('onduleur'));
    onduleur.add(boite(0.8, H_BAIE, 0.9, materiau(0xeceff2, { rugosite: 0.4, metal: 0.25 })));
    onduleur.add(boite(0.7, 0.62, 0.012, materiau(0x23272e, { rugosite: 0.4 }), 0, 1.18, 0.452));
    onduleur.add(boite(0.44, 0.24, 0.01, ecran, 0, 1.42, 0.458));
    onduleur.add(panneau(0.66, 0.8, matGrilleOnduleur, 0, 0.55, 0.456));
    onduleur.add(boite(0.81, 0.11, 0.92, materiau(0xfacc15, { rugosite: 0.4 }), 0, H_BAIE - 0.1, 0));
    onduleur.add(
      panneau(0.5, 0.075, materiau(0xffffff, { map: plaque(`ONDULEUR ${i + 1}`, '#1e293b', '#facc15', 52) }), 0, 1.0, 0.462),
    );
    onduleur.position.set(x, PLANCHER, zFond + 0.47);
    groupe.add(onduleur);
    etiquettes.push({
      objet: etiquette(`${prefixe}Onduleur ${i + 1}`, 'Énergie secourue', COULEUR_FAMILLE['Énergie'], x, yEtiquette, zFond + 0.47),
      cible: onduleur,
    });
  });
  obstacles.push({ x0: 2.1, x1: 3.85, z0: zFond, z1: zFond + 0.92 });

  // Armoires de batteries contre le pignon droit : caisson clair, porte vitrée sur les modules lithium-ion,
  // écran de supervision (BMS) et flancs ventilés, pour qu'elles se lisent sous tous les angles.
  const batteries = marquer(new THREE.Group(), ref('batteries'));
  const matCaisson = materiau(0xd9dde2, { rugosite: 0.45, metal: 0.35 });
  const matCadre = materiau(0x2a2f37, { rugosite: 0.4, metal: 0.6 });
  const matFond = materiau(0x15181d, { rugosite: 0.8 });
  const matVerre = materiau(0x9fb7c9, { opacite: 0.16, rugosite: 0.05, metal: 0.2 });
  const matEtagere = materiau(0x8a929c, { rugosite: 0.4, metal: 0.7 });
  const matModule = materiau(0xffffff, { rugosite: 0.5, metal: 0.2, map: textureModuleBatterie() });
  const matBornePlus = materiau(0xd32f2f, { rugosite: 0.4 });
  const matBorneMoins = materiau(0x15171a, { rugosite: 0.4 });
  const matFlanc = materiau(0xffffff, { rugosite: 0.5, metal: 0.3, map: textureGrille('#c9ced4', '#6b737d') });
  const matBms = materiau(0x0, { emissive: 0x3dff8a, intensite: 1.6 });
  const matPlaqueBatteries = materiau(0xffffff, { map: plaque('BATTERIES', '#1e293b', '#facc15', 52) });
  const matPlaqueFlanc = materiau(0xffffff, { map: plaque('BATTERIES LITHIUM-ION', '#1e293b', '#facc15', 34) });
  const geoModule = new THREE.BoxGeometry(0.16, 0.25, 0.6);
  const geoBorne = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8);
  const geoEtagere = new THREE.BoxGeometry(0.54, 0.02, 0.68);
  const NIVEAUX = 5;
  const PAR_NIVEAU = 3;
  const positionsArmoires = [-0.98, -0.33, 0.33, 0.98] as const;
  positionsArmoires.forEach((dz, rangArmoire) => {
    const armoire = new THREE.Group();
    // Caisson ouvert : fond, flancs, socle et chapeau.
    armoire.add(boite(0.56, H_BAIE - 0.3, 0.02, matFond, 0, 0.1, -0.38));
    for (const sx of [-1, 1]) {
      armoire.add(boite(0.03, H_BAIE - 0.02, 0.78, matCaisson, sx * 0.28, 0.01, 0));
      const flanc = panneau(0.66, 1.4, matFlanc, sx * 0.302, 0.95, 0);
      flanc.rotation.y = (sx * Math.PI) / 2;
      armoire.add(flanc);
    }
    armoire.add(boite(0.61, 0.1, 0.81, matCadre));
    armoire.add(boite(0.61, 0.2, 0.81, matCaisson, 0, H_BAIE - 0.2, 0));
    // Modules de batteries sur étagères, dessinés en une fois.
    const modules = new THREE.InstancedMesh(geoModule, matModule, NIVEAUX * PAR_NIVEAU);
    const bornes = [new THREE.InstancedMesh(geoBorne, matBornePlus, NIVEAUX * PAR_NIVEAU), new THREE.InstancedMesh(geoBorne, matBorneMoins, NIVEAUX * PAR_NIVEAU)];
    const etageres = new THREE.InstancedMesh(geoEtagere, matEtagere, NIVEAUX);
    const m = new THREE.Matrix4();
    for (let n = 0; n < NIVEAUX; n++) {
      const yEtagere = 0.12 + n * 0.33;
      etageres.setMatrixAt(n, m.makeTranslation(0, yEtagere, -0.02));
      for (let k = 0; k < PAR_NIVEAU; k++) {
        const i = n * PAR_NIVEAU + k;
        const xm = (k - 1) * 0.175;
        modules.setMatrixAt(i, m.makeTranslation(xm, yEtagere + 0.135, -0.02));
        bornes[0]?.setMatrixAt(i, m.makeTranslation(xm - 0.04, yEtagere + 0.27, 0.22));
        bornes[1]?.setMatrixAt(i, m.makeTranslation(xm + 0.04, yEtagere + 0.27, 0.22));
      }
    }
    for (const im of [modules, etageres, ...bornes]) {
      im.castShadow = true;
      im.receiveShadow = true;
      armoire.add(im);
    }
    // Porte vitrée : cadre sombre, verre légèrement teinté, poignée.
    for (const sx of [-1, 1]) armoire.add(boite(0.035, H_BAIE - 0.3, 0.03, matCadre, sx * 0.27, 0.1, 0.4));
    armoire.add(boite(0.56, 0.035, 0.03, matCadre, 0, 0.1, 0.4));
    armoire.add(boite(0.56, 0.035, 0.03, matCadre, 0, H_BAIE - 0.235, 0.4));
    armoire.add(boite(0.5, H_BAIE - 0.37, 0.008, matVerre, 0, 0.135, 0.405));
    armoire.add(boite(0.016, 0.16, 0.025, materiau(0xc9ced4, { rugosite: 0.25, metal: 0.9 }), 0.23, 0.95, 0.425));
    // Chapeau : plaque et écran de supervision.
    armoire.add(panneau(0.46, 0.07, matPlaqueBatteries, -0.04, H_BAIE - 0.065, 0.412));
    armoire.add(boite(0.1, 0.06, 0.01, matBms, 0.22, H_BAIE - 0.16, 0.412));
    armoire.add(panneau(0.6, 0.07, hachures, 0, 0.04, 0.412));
    // Plaque latérale, visible depuis l'allée sur les armoires d'extrémité.
    if (rangArmoire === 0 || rangArmoire === positionsArmoires.length - 1) {
      const sx = rangArmoire === 0 ? 1 : -1;
      const plaqueFlanc = panneau(0.6, 0.12, matPlaqueFlanc, sx * 0.31, 1.68, 0);
      plaqueFlanc.rotation.y = (sx * Math.PI) / 2;
      armoire.add(plaqueFlanc);
    }
    armoire.rotation.y = -Math.PI / 2;
    armoire.position.z = dz;
    batteries.add(armoire);
  });
  const xBatteries = CONTENEUR.L / 2 - CONTENEUR.E - 0.42;
  batteries.position.set(xBatteries, PLANCHER, 0.2);
  groupe.add(batteries);
  obstacles.push({ x0: xBatteries - 0.42, x1: xBatteries + 0.42, z0: -1.1, z1: 1.5 });
  etiquettes.push({
    objet: etiquette(`${prefixe}Batteries`, 'Autonomie des onduleurs', COULEUR_FAMILLE['Énergie'], xBatteries, yEtiquette, 0.2),
    cible: batteries,
  });

  // Sécurité incendie complète : détection, centrale, commandes, signalisation, extinction (incendie.ts).
  const extinction = marquer(new THREE.Group(), ref('extinction'));
  const incendie = construireIncendie(zFond);
  extinction.add(incendie.groupe);
  groupe.add(extinction);
  // Bouteilles et extincteurs près de l'entrée.
  obstacles.push({ x0: -5.85, x1: -4.65, z0: zFond, z1: zFond + 0.5 });
  obstacles.push({ x0: -6.1, x1: -5.85, z0: -1.45, z1: -0.85 });
  etiquettes.push({
    objet: etiquette(`${prefixe}Sécurité incendie`, 'Détection et extinction au gaz inerte', COULEUR_FAMILLE['Sécurité'], -5.25, yEtiquette - 0.3, zFond + 0.3),
    cible: extinction,
  });

  // Caméra dôme intérieure, au-dessus de l'entrée.
  const camera = marquer(new THREE.Group(), ref('camera'));
  camera.add(boite(0.2, 0.05, 0.2, materiau(0xe5e7eb), -5.6, 2.6, 1.2));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    materiau(0x111418, { rugosite: 0.1, metal: 0.6 }),
  );
  dome.position.set(-5.6, 2.6, 1.2);
  camera.add(dome);
  groupe.add(camera);

  // Flux d'air : allée froide au centre, allées chaudes derrière chaque rangée.
  const fluxAir = new THREE.Group();
  const zArriere = DEMI_ALLEE + P_BAIE;
  const pChaud = demiP - zArriere;
  fluxAir.add(
    boite(longueur, H_BAIE, DEMI_ALLEE * 2 - 0.02, materiau(0x38bdf8, { opacite: 0.22 }), xCentre, PLANCHER, 0),
  );
  for (const cote of [-1, 1]) {
    fluxAir.add(
      boite(
        longueur,
        H_BAIE,
        pChaud,
        materiau(0xef4444, { opacite: 0.28 }),
        xCentre,
        PLANCHER,
        cote * (zArriere + pChaud / 2),
      ),
    );
  }
  fluxAir.traverse((objet) => {
    objet.castShadow = false;
    objet.receiveShadow = false;
    objet.raycast = () => {};
  });
  fluxAir.visible = false;
  groupe.add(fluxAir);

  for (const e of etiquettes) groupe.add(e.objet);

  const geometrie: GeometrieSalle = {
    inrows,
    baies: xBaies,
    demiAllee: DEMI_ALLEE,
    profondeurBaie: P_BAIE,
    tableau: new THREE.Vector3(1.3, PLANCHER + H_BAIE, zFond + 0.25),
    onduleurs: [2.5, 3.45].map((x) => new THREE.Vector3(x, PLANCHER + H_BAIE, zFond + 0.47)),
    batteries: new THREE.Vector3(xBatteries, PLANCHER + H_BAIE, 0.2),
    incendie: incendie.reperes,
    foyer: new THREE.Vector3(xBaies[2] ?? -2.1, PLANCHER + H_BAIE + 0.05, -(DEMI_ALLEE + P_BAIE / 2)),
  };
  // Tout ce qui précède est immobile dans le module ; les circuits, animés, viennent ensuite.
  figer(groupe);
  const circuits = creerCircuits(geometrie, incendie.materiel);
  for (const c of Object.values(circuits)) groupe.add(c.groupe);

  return {
    groupe,
    facades,
    fluxAir,
    ecransOnduleur,
    etiquettes,
    circuits,
    obstacles,
    ancres: {
      // Baie réseau : deuxième élément de la rangée du fond.
      reseau: new THREE.Vector3(X_DEBUT + L_INROW + L_BAIE / 2, PLANCHER + H_BAIE + 0.05, -(DEMI_ALLEE + P_BAIE / 2)),
      tableau: new THREE.Vector3(1.3, PLANCHER + H_BAIE, zFond + 0.25),
      calcul: [1.5, 2.5].map((k) => new THREE.Vector3(X_DEBUT + L_INROW + L_BAIE * k, PLANCHER + H_BAIE + 0.05, -(DEMI_ALLEE + P_BAIE / 2))),
      stockage: new THREE.Vector3(X_DEBUT + L_INROW + L_BAIE * 3.5, PLANCHER + H_BAIE + 0.05, -(DEMI_ALLEE + P_BAIE / 2)),
    },
  };
}

/** Face avant d'un module de batterie : étiquette, jauge de charge et voyant. */
function textureModuleBatterie(): THREE.CanvasTexture {
  return toile(64, 96, (ctx) => {
    ctx.fillStyle = '#2b3038';
    ctx.fillRect(0, 0, 64, 96);
    ctx.fillStyle = '#eef0f2';
    ctx.fillRect(8, 10, 48, 26);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(12, 14, 26, 5);
    ctx.fillRect(12, 23, 36, 3);
    ctx.fillRect(12, 29, 30, 3);
    ctx.fillStyle = '#15181c';
    ctx.fillRect(10, 48, 44, 12);
    ctx.fillStyle = '#35c46a';
    for (let i = 0; i < 4; i++) ctx.fillRect(13 + i * 10, 51, 8, 6);
    ctx.fillStyle = '#5b636e';
    for (let y = 70; y < 90; y += 5) ctx.fillRect(8, y, 48, 2);
  });
}
