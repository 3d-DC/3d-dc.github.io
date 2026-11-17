import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { SourcesSite } from '../audio/son';
import { NOMBRES_MODULES, type Affichage, type Disposition, type SiteId, type SiteState } from '../types';
import { cheminArrivee, DESCRIPTION_CIRCUIT, pastille } from './circuits';
import { CONTENEUR, ModuleConteneur, PASSAGE, PLANCHER, PORTE, type EtatMur } from './conteneur';
import { Bouffees } from './effets';
import {
  creerChampSolaire,
  creerCloture,
  creerGroupeElectrogene,
  creerMatCamera,
  creerPosteSecteur,
  type GroupeElectrogene,
} from './exterieur';
import { Courants, Flux, traceArrondi } from './flux';
import { creerInterieur, type Interieur, type Rect } from './interieur';
import { amortir, boite, cylindre, marquer, materiau, SITE_X, toile, Y_DALLE } from './outils';
import { textureBeton, textureGravier, textureGrille } from './textures';

/* ---------- Implantation (repère du site) ---------- */

const { L, H, P, E } = CONTENEUR;

/** Abscisse commune des modules, alignés vers l'arrière de la dalle. */
export const MODULE_X = -4;
const Z_MODULE_1 = 1.5;

/** Profondeur du centre de la colonne `col` (0 = devant). */
function zColonne(col: number): number {
  return Z_MODULE_1 - col * P;
}

/** Profondeur du centre du module `numero` quand les modules sont côte à côte. */
export function zModule(numero: number): number {
  return zColonne(numero - 1);
}

/** Case occupée par un module : colonne (vers l'arrière) et niveau (0 au sol, 1 à l'étage). */
function caseModule(numero: number, disposition: Disposition): { col: number; niveau: number } {
  return disposition === 'etage'
    ? { col: Math.floor((numero - 1) / 2), niveau: (numero - 1) % 2 }
    : { col: numero - 1, niveau: 0 };
}

/** Emprise de la dalle : elle accueille jusqu'à cinq modules. */
export const DALLE = { x0: -13.2, x1: 13.2, z0: -22.5, z1: 10.5 } as const;
const Z_CENTRE_DALLE = (DALLE.z0 + DALLE.z1) / 2;
/** Abscisse (repère du site) de l'axe du portail. */
export const X_PORTAIL = -8;
/** Gaine électrique principale, qui longe les modules côté énergie. */
const X_BUS = 4.2;
/** Colonne montante des liaisons vers l'étage, entre les modules et la gaine. */
const X_COLONNE = MODULE_X + L / 2 + 0.9;
const POSTE = { x: 10.5, z: 1.5 } as const;
const X_GROUPES = 8.2;
const Z_GROUPES = [-4.5, -9.5, -14.5] as const;
const Z_SOLAIRE = -30;
const NB_VM_MAX = 12;
/** Soulèvement de l'étage en vue en coupe, pour laisser voir le niveau du bas. */
const ECLATEMENT = 2.6;
/** Plateau de la couche virtuelle : au-dessus de deux niveaux de modules (il monte encore en vue éclatée). */
const Y_PLATEAU = Y_DALLE + 2 * H + 1.2;
const PLATEAU = { largeur: 6.6, profondeur: 2.1 } as const;
/** Applications hébergées, une par VM (une VM est un serveur logiciel qui rend un service). */
const APPLICATIONS = [
  'Site web',
  'Base de données',
  'Messagerie',
  'Gestion (ERP)',
  'Fichiers',
  'API',
  'Annuaire',
  'Supervision',
  'Intranet',
  'Relation client',
  'Calcul IA',
  'Visio',
] as const;
/** Rayon du visiteur pour les collisions et dénivelé franchissable en un pas. */
const RAYON_VISITEUR = 0.22;
const MARCHE_MAX = 0.5;

/** Passerelle de l'étage, le long des pignons gauches, et escalier qui y monte depuis l'avant. */
const X_PIGNON_GAUCHE = MODULE_X - L / 2;
const ACCES = {
  x0: X_PIGNON_GAUCHE - 1.3,
  x1: X_PIGNON_GAUCHE,
  /** Haut de l'escalier, au droit de la façade avant. */
  zHaut: Z_MODULE_1 + P / 2,
  zBas: Z_MODULE_1 + P / 2 + 4.6,
  hauteur: Y_DALLE + H + PLANCHER,
} as const;

type Point = readonly [x: number, z: number];

/** Groupes électrogènes nécessaires selon le nombre de modules. */
function groupesNecessaires(modules: number): number {
  return modules <= 2 ? 1 : modules <= 4 ? 2 : 3;
}

const LIBELLE_ROLE: Record<SiteState['role'], string> = {
  actif: 'ACTIF',
  passif: 'EN ATTENTE',
  sinistre: 'SINISTRE',
};

/** Ce que la scène sait du point de vue courant. */
export interface ContexteVue {
  readonly camera: THREE.Vector3;
  readonly promenade: boolean;
  /** Équipement sous le pointeur (ou au centre de l'écran, à pied). */
  readonly survole: THREE.Object3D | null;
}

interface Cable {
  readonly mat: THREE.MeshStandardMaterial;
  readonly meshes: THREE.Mesh[];
}

interface Emplacement {
  readonly numero: number;
  readonly module: ModuleConteneur;
  readonly interieur: Interieur;
  /** Câble qui relie la gaine principale à ce module. */
  branche: Cable;
  /** 0 = module absent (en l'air), 1 = posé. */
  avancee: number;
  /** Hauteur courante de la base du module, animée lors des changements de disposition. */
  y: number;
  /** Vrai quand le module a rejoint sa case. */
  arrive: boolean;
}

interface Groupe {
  readonly electrogene: GroupeElectrogene;
  readonly cable: Cable;
  presence: number;
}

interface Lien {
  readonly flux: Flux;
  readonly type: 'reseau' | 'energie';
}

interface Etiquette {
  readonly racine: HTMLElement;
  readonly role: HTMLElement;
  readonly ligne1: HTMLElement;
  readonly ligne2: HTMLElement;
}

/** Surface sur laquelle on peut marcher : emprise, hauteur du sol et obstacles. */
interface Surface {
  readonly zones: readonly Rect[];
  readonly hauteur: (x: number, z: number) => number;
  readonly obstacles: readonly Rect[];
}

function dans(r: Rect, x: number, z: number, marge = 0): boolean {
  return x > r.x0 - marge && x < r.x1 + marge && z > r.z0 - marge && z < r.z1 + marge;
}

/** Un site complet : dalle, modules, énergie, sûreté et représentation des VM. */
export class Site {
  readonly groupe = new THREE.Group();
  /** Point visé par le trafic des utilisateurs (repère monde). */
  readonly centreVM: THREE.Vector3;
  /** Point d'entrée de la fibre dans le premier module (repère monde). */
  readonly entreeFibre: THREE.Vector3;
  /** Positions des sources sonores : salle du module 1, premier groupe électrogène, poste, alarme (repère monde). */
  readonly sourcesSon: SourcesSite;

  private readonly emplacements = new Map<number, Emplacement>();
  private readonly groupes: Groupe[] = [];
  private readonly cables: Record<'secteur' | 'solaire' | 'bus', THREE.MeshStandardMaterial>;
  private readonly interconnexions = new THREE.Group();
  private liens: Lien[] = [];
  private signatureLiens = '';
  private surfaces: Surface[] = [];
  private signatureSurfaces = '';
  private readonly acces = new THREE.Group();
  private signatureAcces = '';
  /** Passerelle de l'étage : elle suit les modules du haut en vue éclatée. */
  private readonly passerelle = new THREE.Group();
  /** Étais affichés en vue éclatée, entre les modules du bas et ceux qu'ils portent. */
  private readonly etais = new THREE.Group();
  private readonly plateforme = new THREE.Group();
  /** Emprise au sol du monte-charge (obstacle de la visite à pied), `null` s'il n'y a pas d'étage. */
  private emprisesMonteCharge: Rect | null = null;
  private disposition: Disposition = 'horizontale';
  private readonly traces: Record<Disposition, THREE.Group> = { horizontale: new THREE.Group(), etage: new THREE.Group() };
  private readonly arrivee: Courants;
  private readonly arriveeGroupe = new THREE.Group();
  private readonly fumeeSinistre = new Bouffees(8, 0x2a2a2a, 1.3, 9);
  private readonly feu = new THREE.PointLight(0xff6a00, 0, 18, 2);
  private readonly gyrophare = materiau(0x551111, { emissive: 0xff2a2a, intensite: 0 });
  private readonly lumiereAlarme = new THREE.PointLight(0xff2a2a, 0, 28, 2);
  /** Couche virtuelle : plateau, une plaque par VM, faisceaux vers les baies qui les portent. */
  private readonly coucheVM = new THREE.Group();
  private readonly vms: { readonly mesh: THREE.Mesh; readonly mat: THREE.MeshStandardMaterial }[] = [];
  private readonly faisceaux = new THREE.Group();
  private readonly faisceauxCalcul: Flux[] = [];
  private faisceauStockage: Flux | null = null;
  private readonly matPlateau = materiau(0x22d3ee, { opacite: 0.16, rugosite: 0.2, emissive: 0x0e7490, intensite: 0.5 });
  private readonly etiquette: Etiquette;
  private readonly position = new THREE.Vector3();

  /** Instant où s'achève le fondu de disparition de chaque étiquette. */
  private readonly finFondu = new WeakMap<CSS2DObject, number>();
  private bouge = false;
  private coupe = 0;
  private eclatement = 0;
  private alimentation = 1;
  private signature = '';

  constructor(readonly id: SiteId) {
    this.groupe.position.x = SITE_X[id];
    const x0 = SITE_X[id];
    this.centreVM = new THREE.Vector3(x0 + MODULE_X, Y_PLATEAU + 0.5, Z_MODULE_1);
    this.entreeFibre = new THREE.Vector3(x0 + MODULE_X + 0.4, Y_DALLE + 0.06, Z_MODULE_1 + P / 2);
    this.sourcesSon = {
      salle: new THREE.Vector3(x0 + MODULE_X, Y_DALLE + 1.4, Z_MODULE_1),
      groupe: new THREE.Vector3(x0 + X_GROUPES, Y_DALLE + 1, Z_GROUPES[0]),
      poste: new THREE.Vector3(x0 + POSTE.x, Y_DALLE + 1, POSTE.z),
      alarme: new THREE.Vector3(x0 + MODULE_X + L / 2 - 0.5, Y_DALLE + H + 0.3, Z_MODULE_1 + P / 2 - 0.5),
    };

    // Dalle béton sur assise de gravier.
    const largeur = DALLE.x1 - DALLE.x0;
    const profondeur = DALLE.z1 - DALLE.z0;
    const beton = textureBeton();
    beton.repeat.set(largeur / 4, profondeur / 4);
    this.groupe.add(
      boite(largeur, Y_DALLE, profondeur, materiau(0xffffff, { rugosite: 0.92, metal: 0, map: beton }), 0, 0, Z_CENTRE_DALLE),
    );
    const gravier = textureGravier();
    gravier.repeat.set(10, 12);
    const assise = boite(largeur + 5, 0.08, profondeur + 5, materiau(0xffffff, { rugosite: 1, metal: 0, map: gravier }), 0, 0, Z_CENTRE_DALLE);
    assise.castShadow = false;
    this.groupe.add(assise);
    this.tracerEmplacements();

    // Énergie : poste de livraison, groupes électrogènes, champ solaire, gaine principale.
    const poste = creerPosteSecteur(id);
    poste.position.set(POSTE.x, Y_DALLE, POSTE.z);
    this.groupe.add(poste);
    const solaire = creerChampSolaire(id);
    solaire.position.set(0, 0, Z_SOLAIRE);
    this.groupe.add(solaire);
    this.cables = {
      secteur: this.cable(0xffc400, [[POSTE.x - 0.9, POSTE.z], [X_BUS, POSTE.z]]).mat,
      solaire: this.cable(0x8dff4a, [[4, Z_SOLAIRE + 4.2], [4, DALLE.z0 + 1], [X_BUS, DALLE.z0 + 1]]).mat,
      bus: this.cable(0xffd84d, [[X_BUS, POSTE.z], [X_BUS, DALLE.z0 + 1]]).mat,
    };
    for (const z of Z_GROUPES) {
      const electrogene = creerGroupeElectrogene(id);
      electrogene.groupe.position.set(X_GROUPES, Y_DALLE, z);
      this.groupe.add(electrogene.groupe);
      const cable = this.cable(0xff7a1a, [[X_GROUPES - 1.7, z], [X_BUS, z]]);
      this.groupes.push({ electrogene, cable, presence: 0 });
    }

    // Arrivée de l'énergie jusqu'au premier module, montrée avec le circuit « énergie ».
    const yE = Y_DALLE + PLANCHER + 2.42;
    const zEntree = Z_MODULE_1 - (P / 2 - E) + 0.45;
    const xPignonDroit = MODULE_X + L / 2;
    this.arrivee = cheminArrivee([
      new THREE.Vector3(POSTE.x - 0.9, Y_DALLE + 0.3, POSTE.z),
      new THREE.Vector3(X_BUS, Y_DALLE + 0.3, POSTE.z),
      new THREE.Vector3(X_BUS, Y_DALLE + 0.3, Z_MODULE_1),
      new THREE.Vector3(xPignonDroit + 0.2, Y_DALLE + 0.3, Z_MODULE_1),
      new THREE.Vector3(xPignonDroit + 0.2, yE, Z_MODULE_1),
      new THREE.Vector3(xPignonDroit + 0.2, yE, zEntree),
      new THREE.Vector3(xPignonDroit - 0.1, yE, zEntree),
    ]);
    this.arriveeGroupe.add(
      this.arrivee.mesh,
      pastille(1, DESCRIPTION_CIRCUIT.energie.couleur, new THREE.Vector3(POSTE.x, Y_DALLE + 2.7, POSTE.z)),
    );
    this.arriveeGroupe.visible = false;
    this.groupe.add(this.arriveeGroupe);

    // Sûreté : clôture, portail à badge, caméras.
    const cloture = creerCloture(id, -DALLE.x0 - 0.5, (DALLE.z1 - DALLE.z0) / 2 - 0.6);
    cloture.groupe.position.set(0, Y_DALLE, Z_CENTRE_DALLE);
    cloture.borne.position.y = Y_DALLE;
    cloture.borne.position.z += Z_CENTRE_DALLE;
    this.groupe.add(cloture.groupe, cloture.borne);
    const camera1 = creerMatCamera(id, 2.4);
    camera1.position.set(DALLE.x0 + 1, Y_DALLE, DALLE.z1 - 1.1);
    const camera2 = creerMatCamera(id, -0.8);
    camera2.position.set(DALLE.x1 - 1, Y_DALLE, DALLE.z0 + 1.1);
    this.groupe.add(camera1, camera2);

    // Premier module, présent d'emblée.
    const premier = this.emplacement(1);
    premier.avancee = 1;

    // Alarme et effets de sinistre, sur le premier module (coin avant droit, visible depuis la route).
    const base = boite(0.16, 0.08, 0.16, materiau(0x15181c), 0, H, 0);
    const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), this.gyrophare);
    lampe.position.y = H + 0.16;
    this.lumiereAlarme.position.y = H + 0.6;
    const alarme = new THREE.Group();
    alarme.add(base, lampe, this.lumiereAlarme);
    alarme.position.set(L / 2 - 0.5, 0, P / 2 - 0.5);
    premier.module.groupe.add(alarme);
    this.feu.position.set(0, 1.6, 0);
    this.fumeeSinistre.groupe.position.set(0, H, 0);
    premier.module.groupe.add(this.feu, this.fumeeSinistre.groupe);

    marquer(this.acces, { kind: 'escalier', site: id });
    this.acces.visible = false;
    this.interconnexions.visible = false;
    this.groupe.add(this.acces, this.interconnexions);
    this.creerVMs();
    this.etiquette = this.creerEtiquette();
  }

  /** Vrai tant qu'un élément qui projette une ombre est en mouvement (modules, étage, groupes, parois). */
  get enMouvement(): boolean {
    return this.bouge;
  }

  /** Position de départ de la visite à pied, devant la porte du premier module (repère monde). */
  pointDepart(): { position: THREE.Vector3; cap: number; sol: number } {
    return {
      position: new THREE.Vector3(SITE_X[this.id] + X_PIGNON_GAUCHE - 1.6, 0, Z_MODULE_1),
      // Regard tourné vers +x, c'est-à-dire vers la porte.
      cap: -Math.PI / 2,
      sol: Y_DALLE,
    };
  }

  /** Vrai si le point (coordonnées monde) est à l'intérieur d'un module posé, sous son toit. */
  estInterieur(x: number, y: number, z: number): boolean {
    const lx = x - SITE_X[this.id];
    for (const e of this.emplacements.values()) {
      if (!e.arrive) continue;
      const { col, niveau } = caseModule(e.numero, this.disposition);
      const y0 = Y_DALLE + niveau * H;
      const mz = zColonne(col);
      if (Math.abs(lx - MODULE_X) < L / 2 && Math.abs(z - mz) < P / 2 && y > y0 && y < y0 + H) return true;
    }
    return false;
  }

  /**
   * Point praticable le plus proche de (x, y, z), coordonnées monde, pour y poser le visiteur
   * en première personne. La hauteur `y` départage le sol et l'étage. `null` si rien à moins de 8 m.
   */
  pointPres(x: number, y: number, z: number, cap: number): { position: THREE.Vector3; cap: number; sol: number } | null {
    const etage = Y_DALLE + H + PLANCHER;
    const hauteurs = y > Y_DALLE + H ? [etage, Y_DALLE + PLANCHER, Y_DALLE] : [Y_DALLE + PLANCHER, Y_DALLE, etage];
    for (let r = 0; r <= 8; r += 0.35) {
      const directions = r === 0 ? 1 : 16;
      for (let k = 0; k < directions; k++) {
        const a = (k / directions) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        for (const h of hauteurs) {
          const sol = this.surface(px, pz, h);
          if (sol !== null && Math.abs(sol - h) < 0.01) {
            return { position: new THREE.Vector3(px, 0, pz), cap: this.capDegage(px, pz, sol, cap), sol };
          }
        }
      }
    }
    return null;
  }

  /**
   * Direction de regard à l'arrivée : celle demandée si la vue y est dégagée sur 3 m,
   * sinon le quart de tour qui offre le plus long dégagement (allée plutôt que face d'une baie).
   */
  private capDegage(x: number, z: number, sol: number, cap: number): number {
    const degagement = (c: number): number => {
      let d = 0;
      while (d < 6 && this.surface(x - Math.sin(c) * (d + 0.3), z - Math.cos(c) * (d + 0.3), sol) !== null) d += 0.3;
      return d;
    };
    const candidats = [cap, cap + Math.PI / 2, cap - Math.PI / 2, cap + Math.PI];
    let meilleur = cap;
    let longueur = -1;
    for (const c of candidats) {
      const d = degagement(c);
      if (d >= 3) return c;
      if (d > longueur) {
        longueur = d;
        meilleur = c;
      }
    }
    return meilleur;
  }

  /**
   * Position d'arrivée à l'intérieur d'un module, juste après la porte, face à l'allée froide (repère monde).
   * `null` si le module n'est pas encore posé.
   */
  pointInterieur(numero: number): { position: THREE.Vector3; cap: number; sol: number } | null {
    const e = this.emplacements.get(numero);
    if (!e?.arrive) return null;
    const { col, niveau } = caseModule(numero, this.disposition);
    return {
      position: new THREE.Vector3(SITE_X[this.id] + MODULE_X - L / 2 + 1.0, 0, zColonne(col)),
      cap: -Math.PI / 2,
      sol: Y_DALLE + niveau * H + PLANCHER,
    };
  }

  /**
   * Hauteur du sol où se poserait un visiteur en (x, z), coordonnées monde, venant d'un sol à `h`.
   * `null` si l'endroit est inaccessible (paroi, équipement, vide, marche trop haute).
   */
  surface(x: number, z: number, h: number): number | null {
    const lx = x - SITE_X[this.id];
    let meilleure: number | null = null;
    for (const s of this.surfaces) {
      if (!s.zones.some((zone) => dans(zone, lx, z))) continue;
      if (s.obstacles.some((o) => dans(o, lx, z, RAYON_VISITEUR))) continue;
      const hs = s.hauteur(lx, z);
      if (Math.abs(hs - h) > MARCHE_MAX) continue;
      if (meilleure === null || Math.abs(hs - h) < Math.abs(meilleure - h)) meilleure = hs;
    }
    return meilleure;
  }

  maj(dt: number, t: number, etat: SiteState, affichage: Affichage, vue: ContexteVue): void {
    const sinistre = etat.role === 'sinistre';
    const alimente = !sinistre && (etat.secteur || etat.groupe || etat.surBatterie || etat.solaire);
    const coupeCible = affichage.coupe ? 1 : 0;
    const eclatementCible = etat.disposition === 'etage' && affichage.eclatee && !vue.promenade ? 1 : 0;
    this.bouge = Math.abs(this.coupe - coupeCible) > 0.005 || Math.abs(this.eclatement - eclatementCible) > 0.005;
    this.coupe = amortir(this.coupe, coupeCible, 5, dt);
    this.eclatement = amortir(this.eclatement, eclatementCible, 3, dt);
    this.alimentation = amortir(this.alimentation, alimente ? 1 : 0, 4, dt);
    if (etat.disposition !== this.disposition) this.changerDisposition(etat.disposition);

    // Modules : création à la demande, mise en place dans leur case, parois partagées.
    for (const numero of NOMBRES_MODULES) {
      if (numero <= etat.modules) this.emplacement(numero);
    }
    for (const e of this.emplacements.values()) {
      const { col, niveau } = caseModule(e.numero, this.disposition);
      const zCible = zColonne(col);
      const yCible = Y_DALLE + niveau * (H + ECLATEMENT * this.eclatement);
      e.avancee = amortir(e.avancee, e.numero <= etat.modules ? 1 : 0, 1.6, dt);
      const g = e.module.groupe;
      if (e.avancee < 0.05) {
        g.position.z = zCible;
        e.y = yCible;
      } else {
        g.position.z = amortir(g.position.z, zCible, 3, dt);
        e.y = amortir(e.y, yCible, 3, dt);
      }
      const reste = 1 - e.avancee;
      g.visible = e.avancee > 0.01;
      g.position.y = e.y + reste * reste * 16;
      e.arrive = e.avancee > 0.97 && Math.abs(g.position.z - zCible) < 0.05 && Math.abs(e.y - yCible) < 0.05;
      const immobile = (e.avancee > 0.999 || e.avancee < 0.001) && Math.abs(g.position.z - zCible) < 0.002 && Math.abs(e.y - yCible) < 0.002;
      if (!immobile) this.bouge = true;
    }
    const pose = (numero: number): boolean => numero <= etat.modules && (this.emplacements.get(numero)?.arrive ?? false);
    const voisin = (col: number, niveau: number): number | null => {
      for (const e of this.emplacements.values()) {
        const c = caseModule(e.numero, this.disposition);
        if (c.col === col && c.niveau === niveau && pose(e.numero)) return e.numero;
      }
      return null;
    };

    const partage: EtatMur = etat.assemblage === 'fusionne' ? 'retire' : 'porte';
    const etatsMurs = new Map<number, { avant: EtatMur; arriere: EtatMur }>();
    for (const e of this.emplacements.values()) {
      const n = e.numero;
      const { col, niveau } = caseModule(n, this.disposition);
      const devant = col > 0 && voisin(col - 1, niveau) !== null;
      const derriere = voisin(col + 1, niveau) !== null;
      const avant: EtatMur = pose(n) && devant ? partage : 'plein';
      const arriere: EtatMur = pose(n) && derriere ? partage : 'plein';
      etatsMurs.set(n, { avant, arriere });
      e.module.appliquer(dt, {
        coupe: this.coupe,
        avant,
        arriere,
        avantEscamotable: col === 0,
        porteOuverte: vue.promenade,
        // Sur le toit, ils masqueraient la salle en vue en coupe : on ne les montre alors qu'avec leur circuit.
        couvert: voisin(col, niveau + 1) !== null || (this.coupe > 0.5 && affichage.circuit !== 'climatisation'),
        ventile: alimente,
      });
      this.majInterieur(e, dt, t, etat, affichage, vue, pose(n));
      const brancheActive = alimente && pose(n);
      e.branche.mat.emissiveIntensity = amortir(e.branche.mat.emissiveIntensity, brancheActive ? 1.7 + 0.5 * Math.sin(t * 5) : 0, 5, dt);
      for (const mesh of e.branche.meshes) mesh.visible = e.module.groupe.visible;
    }
    this.majAcces(pose, t);
    this.majSurfaces(etatsMurs, pose);

    // Énergie.
    this.allumer(this.cables.secteur, etat.secteur && !sinistre, dt, t);
    this.allumer(this.cables.solaire, etat.solaire && !sinistre, dt, t);
    this.allumer(this.cables.bus, alimente, dt, t);
    const tourne = etat.groupe && !sinistre;
    const nbGroupes = groupesNecessaires(etat.modules);
    this.groupes.forEach((gr, i) => {
      const presenceCible = i < nbGroupes ? 1 : 0;
      if (Math.abs(gr.presence - presenceCible) > 0.005) this.bouge = true;
      gr.presence = amortir(gr.presence, presenceCible, 3, dt);
      const visible = gr.presence > 0.02;
      const el = gr.electrogene;
      el.groupe.visible = visible;
      el.groupe.scale.setScalar(Math.max(0.001, gr.presence));
      for (const mesh of gr.cable.meshes) mesh.visible = visible;
      el.capot.position.y = tourne ? Math.sin(t * 70 + i) * 0.006 : 0;
      el.voyant.emissiveIntensity = amortir(el.voyant.emissiveIntensity, tourne ? 3 : 0, 5, dt);
      el.fumee.maj(dt, t, tourne && visible);
      this.allumer(gr.cable.mat, tourne && visible, dt, t);
    });
    this.arriveeGroupe.visible = affichage.circuit === 'energie';
    if (this.arriveeGroupe.visible) this.arrivee.maj(t);

    // Interconnexions entre modules.
    this.majLiens(pose);
    this.interconnexions.visible = affichage.interconnexions;
    if (this.interconnexions.visible) {
      for (const lien of this.liens) lien.flux.maj(dt, t, alimente ? 1 : 0, lien.type === 'reseau' ? 0 : 1);
    }

    // Sinistre : gyrophare, lueur d'incendie, fumée.
    const flash = sinistre ? (Math.sin(t * 9) > 0 ? 1 : 0.12) : 0;
    this.gyrophare.emissiveIntensity = 5 * flash;
    this.lumiereAlarme.intensity = 90 * flash;
    this.feu.intensity = amortir(this.feu.intensity, sinistre ? 70 + 30 * Math.sin(t * 13) : 0, 3, dt);
    this.fumeeSinistre.maj(dt, t, sinistre);

    // Couche virtuelle : une plaque par VM, pleine si elle tourne, translucide si c'est une réplique en attente.
    this.coucheVM.visible = !vue.promenade;
    this.faisceaux.visible = !vue.promenade;
    const leve = this.eclatement * ECLATEMENT;
    this.coucheVM.position.y = leve;
    for (const f of [...this.faisceauxCalcul, this.faisceauStockage]) {
      const longueur = f?.groupe.userData['longueur'];
      if (f && typeof longueur === 'number') f.groupe.scale.y = (longueur + leve) / longueur;
    }
    this.vms.forEach(({ mesh, mat }, i) => {
      const presente = i < etat.vmActives + etat.vmRepliques;
      const active = i < etat.vmActives;
      const echelle = amortir(mesh.scale.x, presente ? 1 : 0, 6, dt);
      mesh.scale.setScalar(Math.max(echelle, 0.0001));
      mesh.visible = echelle > 0.02;
      mat.opacity = amortir(mat.opacity, active ? 1 : 0.32, 5, dt);
      mat.emissiveIntensity = amortir(mat.emissiveIntensity, active ? 0.85 : 0.05, 5, dt);
      mat.color.setHex(active ? 0xffffff : 0x9aa6b4);
    });
    // Faisceaux : les serveurs de calcul font tourner les VM actives ; leurs disques vivent sur la baie de stockage
    // (les répliques n'existent que là, copiées depuis l'autre site).
    for (const f of this.faisceauxCalcul) f.maj(dt, t, etat.vmActives > 0 ? 1 : 0, 1);
    this.faisceauStockage?.maj(dt, t, etat.vmActives + etat.vmRepliques > 0 ? 1 : 0, 0);

    this.majEtiquette(etat);
  }

  private majInterieur(
    e: Emplacement,
    dt: number,
    t: number,
    etat: SiteState,
    affichage: Affichage,
    vue: ContexteVue,
    pose: boolean,
  ): void {
    const interieur = e.interieur;
    interieur.fluxAir.visible = affichage.circuit === 'air' && this.coupe > 0.5 && !vue.promenade;
    interieur.facades.forEach((mat, i) => {
      mat.emissiveIntensity = this.alimentation * (1.25 + 0.2 * Math.sin(t * 6 + i * 1.7));
    });
    for (const ecran of interieur.ecransOnduleur) {
      ecran.emissive.setHex(etat.surBatterie ? 0xffb020 : 0x3dff8a);
      ecran.emissiveIntensity = this.alimentation * (etat.surBatterie ? 1.6 + Math.sin(t * 8) : 1.8);
    }

    // Circuit technique choisi ; les pastilles d'étape ne sont posées que dans le premier module.
    for (const [cle, circuit] of Object.entries(interieur.circuits)) {
      const actif = pose && cle === affichage.circuit;
      circuit.groupe.visible = actif;
      if (!actif) continue;
      circuit.maj(dt, t);
      for (const p of circuit.pastilles) {
        // Toit en place, les pastilles traverseraient les parois : elles n'apparaissent qu'en coupe ou à pied.
        p.visible =
          e.numero === 1 && (this.coupe > 0.5 || vue.promenade) && p.getWorldPosition(this.position).distanceTo(vue.camera) < 45;
      }
    }
    // Hors démonstration, le système incendie revient en veille (voyants verts, clapet fermé).
    if (affichage.circuit !== 'incendie') interieur.circuits.incendie.repos?.();

    // Étiquettes : en vue en coupe ou à pied ; soit celle de l'équipement survolé, soit les plus proches.
    const mode = affichage.etiquettes;
    const contexte = pose && mode !== 'aucune' && (vue.promenade || this.coupe > 0.5);
    const seuil = vue.promenade ? 7 : 20;
    for (const { objet, cible } of interieur.etiquettes) {
      if (!contexte) {
        objet.visible = false;
        continue;
      }
      const distance = objet.getWorldPosition(this.position).distanceTo(vue.camera);
      const montrer = mode === 'survol' ? cible === vue.survole : distance < seuil;
      // Une étiquette qui s'efface reste présente le temps de son fondu, puis sort de la page :
      // seules les étiquettes utiles sont repositionnées à chaque image.
      if (montrer) this.finFondu.set(objet, t + 0.3);
      objet.visible = montrer || (this.finFondu.get(objet) ?? 0) > t;
      objet.element.classList.toggle('visible', montrer);
    }
  }

  /** Crée un module (et sa salle) à la première demande. */
  private emplacement(numero: number): Emplacement {
    const existant = this.emplacements.get(numero);
    if (existant) return existant;
    const module = new ModuleConteneur(this.id, numero);
    const interieur = creerInterieur(this.id, numero);
    module.groupe.add(interieur.groupe);
    const { col, niveau } = caseModule(numero, this.disposition);
    const y = Y_DALLE + niveau * H;
    module.groupe.position.set(MODULE_X, y + 16, zColonne(col));
    module.groupe.visible = false;
    this.groupe.add(module.groupe);
    const e: Emplacement = { numero, module, interieur, branche: this.brancheModule(numero), avancee: 0, y, arrive: false };
    this.emplacements.set(numero, e);
    return e;
  }

  /** Câble de la gaine principale vers un module ; une colonne montante dessert l'étage. */
  private brancheModule(numero: number): Cable {
    const { col, niveau } = caseModule(numero, this.disposition);
    const z = zColonne(col) + (niveau === 1 ? 0.6 : 0);
    const xPignon = MODULE_X + L / 2;
    const cable = this.cable(0xffd84d, [[X_BUS, z], [xPignon + (niveau === 1 ? 0.35 : 0), z]]);
    if (niveau === 1) {
      const montante = boite(0.14, H + 0.5, 0.14, cable.mat, xPignon + 0.35, Y_DALLE, z);
      const entree = boite(0.35, 0.14, 0.14, cable.mat, xPignon + 0.17, Y_DALLE + H + 0.4, z);
      for (const m of [montante, entree]) {
        m.castShadow = false;
        this.groupe.add(m);
        cable.meshes.push(m);
      }
    }
    return cable;
  }

  private changerDisposition(disposition: Disposition): void {
    this.disposition = disposition;
    for (const e of this.emplacements.values()) {
      for (const m of e.branche.meshes) {
        this.groupe.remove(m);
        m.geometry.dispose();
      }
      e.branche = this.brancheModule(e.numero);
    }
    this.traces.horizontale.visible = disposition === 'horizontale';
    this.traces.etage.visible = disposition === 'etage';
  }

  /** Passerelle et escalier : présents dès qu'un module est posé à l'étage. */
  private majAcces(pose: (n: number) => boolean, t: number): void {
    let colonnes = 0;
    if (this.disposition === 'etage') {
      for (const n of NOMBRES_MODULES) {
        const c = caseModule(n, 'etage');
        if (c.niveau === 1 && pose(n)) colonnes = Math.max(colonnes, c.col + 1);
      }
    }
    this.acces.visible = colonnes > 0;
    // Vue éclatée : la passerelle monte avec l'étage, des étais matérialisent l'écart.
    const levee = ECLATEMENT * this.eclatement;
    this.passerelle.position.y = levee;
    this.etais.visible = levee > 0.02;
    for (const etai of this.etais.children) etai.scale.y = Math.max(0.001, levee);
    // Le monte-charge fait l'aller-retour entre le sol et la passerelle (pause en haut et en bas).
    const cycle = (Math.sin(t * 0.35) + 1) / 2;
    const course = THREE.MathUtils.smoothstep(cycle, 0.15, 0.85);
    this.plateforme.position.y = course * (ACCES.hauteur - Y_DALLE) + levee * course;

    const signature = `${colonnes}#${NOMBRES_MODULES.filter((n) => pose(n)).join(',')}`;
    if (signature === this.signatureAcces) return;
    this.signatureAcces = signature;
    this.acces.clear();
    this.passerelle.clear();
    this.etais.clear();
    this.plateforme.clear();
    this.emprisesMonteCharge = null;
    if (colonnes === 0) return;
    this.acces.add(this.passerelle, this.etais);

    const acier = materiau(0x5d6670, { rugosite: 0.4, metal: 0.8 });
    const jaune = materiau(0xf5c518, { rugosite: 0.5, metal: 0.3 });
    const caillebotis = textureGrille('#6b737d', '#2f343a');
    caillebotis.wrapS = THREE.RepeatWrapping;
    caillebotis.wrapT = THREE.RepeatWrapping;
    const largeur = ACCES.x1 - ACCES.x0;
    const xc = (ACCES.x0 + ACCES.x1) / 2;
    const yDeck = ACCES.hauteur;
    const zFond = zColonne(colonnes - 1) - P / 2;
    const longueur = ACCES.zHaut - zFond;
    caillebotis.repeat.set(3, longueur * 2);
    const deck = materiau(0xffffff, { rugosite: 0.6, metal: 0.6, map: caillebotis });

    // Passerelle : plancher, poteaux, garde-corps côté vide.
    this.passerelle.add(boite(largeur, 0.08, longueur, deck, xc, yDeck - 0.08, (ACCES.zHaut + zFond) / 2));
    for (let z = zFond + 0.2; z <= ACCES.zHaut; z += 2.4) {
      this.passerelle.add(cylindre(0.06, yDeck - Y_DALLE, acier, ACCES.x0 + 0.08, Y_DALLE, z, 10));
      this.passerelle.add(cylindre(0.025, 1.1, acier, ACCES.x0 + 0.04, yDeck, z, 8));
    }
    this.passerelle.add(boite(0.05, 0.05, longueur, jaune, ACCES.x0 + 0.04, yDeck + 1.05, (ACCES.zHaut + zFond) / 2));
    this.passerelle.add(boite(0.03, 0.03, longueur, acier, ACCES.x0 + 0.04, yDeck + 0.55, (ACCES.zHaut + zFond) / 2));
    this.passerelle.add(boite(largeur, 0.05, 0.05, jaune, xc, yDeck + 1.05, zFond));

    // Escalier droit, de la façade avant jusqu'au sol, avec ses deux limons et ses mains courantes.
    const marches = 16;
    const hauteur = yDeck - Y_DALLE;
    const pente = Math.atan2(hauteur, ACCES.zBas - ACCES.zHaut);
    for (let i = 0; i < marches; i++) {
      const k = (i + 0.5) / marches;
      const z = ACCES.zBas - k * (ACCES.zBas - ACCES.zHaut);
      this.acces.add(boite(largeur - 0.1, 0.04, 0.26, deck, xc, Y_DALLE + k * hauteur - 0.04, z));
    }
    const longueurLimon = Math.hypot(hauteur, ACCES.zBas - ACCES.zHaut);
    for (const x of [ACCES.x0 + 0.03, ACCES.x1 - 0.03]) {
      const limon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, longueurLimon), acier);
      limon.position.set(x, Y_DALLE + hauteur / 2, (ACCES.zBas + ACCES.zHaut) / 2);
      limon.rotation.x = pente;
      limon.castShadow = true;
      const main = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, longueurLimon), jaune);
      main.position.set(x, Y_DALLE + hauteur / 2 + 1.0, (ACCES.zBas + ACCES.zHaut) / 2);
      main.rotation.x = pente;
      this.acces.add(limon, main);
    }

    // Étais de la vue éclatée : un à chaque angle des modules de l'étage (hauteur 1, mise à l'échelle).
    const geoEtai = new THREE.CylinderGeometry(0.05, 0.05, 1, 10).translate(0, 0.5, 0);
    for (const n of NOMBRES_MODULES) {
      const c = caseModule(n, 'etage');
      if (c.niveau !== 1 || !pose(n)) continue;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const etai = new THREE.Mesh(geoEtai, jaune);
          etai.position.set(MODULE_X + sx * (L / 2 - 0.3), Y_DALLE + H, zColonne(c.col) + sz * (P / 2 - 0.3));
          etai.castShadow = true;
          this.etais.add(etai);
        }
      }
    }

    // Monte-charge, au bout de la passerelle : pylône, plateforme mobile et portillons.
    const mc = { x0: ACCES.x0, x1: ACCES.x1, z0: zFond - 1.75, z1: zFond - 0.05 };
    this.emprisesMonteCharge = mc;
    const monteCharge = marquer(new THREE.Group(), { kind: 'monte-charge', site: this.id });
    const hautPylone = yDeck + 2.6;
    const xm = (mc.x0 + mc.x1) / 2;
    const zm = (mc.z0 + mc.z1) / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        monteCharge.add(boite(0.08, hautPylone - Y_DALLE, 0.08, acier, xm + sx * (largeur / 2 - 0.04), Y_DALLE, zm + sz * 0.81));
      }
    }
    for (let y = Y_DALLE + 0.9; y < hautPylone; y += 1.1) {
      for (const sz of [-1, 1]) monteCharge.add(boite(largeur, 0.04, 0.04, acier, xm, y, zm + sz * 0.81));
      monteCharge.add(boite(0.04, 0.04, 1.62, acier, xm - largeur / 2 + 0.04, y, zm));
    }
    monteCharge.add(boite(largeur, 0.12, 1.7, jaune, xm, hautPylone, zm));
    const platine = new THREE.Group();
    platine.add(boite(largeur - 0.16, 0.08, 1.5, deck, 0, 0, 0));
    for (const sz of [-1, 1]) platine.add(boite(largeur - 0.16, 0.04, 0.04, jaune, 0, 1.05, sz * 0.73));
    platine.add(boite(0.04, 1.05, 1.5, materiau(0x5d6670, { opacite: 0.35, rugosite: 0.4 }), -largeur / 2 + 0.1, 0.05, 0));
    this.plateforme.position.set(0, 0, 0);
    platine.position.set(xm, Y_DALLE, zm);
    this.plateforme.add(platine);
    monteCharge.add(this.plateforme);
    // Portillon du haut, côté passerelle.
    this.passerelle.add(boite(largeur - 0.1, 1.05, 0.04, materiau(0xf5c518, { opacite: 0.6, rugosite: 0.5 }), xc, yDeck, zFond - 0.02));
    this.acces.add(monteCharge);
  }

  /** Surfaces de marche : sol et salles du bas, escalier, passerelle et salles de l'étage. */
  private majSurfaces(murs: ReadonlyMap<number, { avant: EtatMur; arriere: EtatMur }>, pose: (n: number) => boolean): void {
    const groupes = this.groupes.filter((g) => g.presence > 0.5).length;
    const posesListe = [...murs].filter(([n]) => pose(n));
    const cle = `${this.disposition}#${groupes}#${this.acces.visible}#${posesListe.map(([n, m]) => `${n}${m.avant[0]}${m.arriere[0]}`).join('|')}`;
    if (cle === this.signatureSurfaces) return;
    this.signatureSurfaces = cle;

    const obstacles: Rect[][] = [[], []];
    const empreintes: Rect[][] = [[], []];
    const exterieur: Rect[] = [
      { x0: POSTE.x - 0.9, x1: POSTE.x + 0.9, z0: POSTE.z - 0.75, z1: POSTE.z + 0.75 },
      ...Z_GROUPES.slice(0, groupes).map((z) => ({ x0: X_GROUPES - 1.7, x1: X_GROUPES + 1.7, z0: z - 0.7, z1: z + 0.7 })),
    ];
    const longue = (o: Rect[], mx: number, z0: number, z1: number, etat: EtatMur): void => {
      if (etat === 'retire') return;
      if (etat === 'plein') {
        o.push({ x0: mx - L / 2, x1: mx + L / 2, z0, z1 });
        return;
      }
      o.push({ x0: mx - L / 2, x1: mx + PASSAGE.x0, z0, z1 }, { x0: mx + PASSAGE.x1, x1: mx + L / 2, z0, z1 });
    };
    for (const [n, m] of posesListe) {
      const { col, niveau } = caseModule(n, this.disposition);
      const o = obstacles[niveau];
      const emp = empreintes[niveau];
      if (!o || !emp) continue;
      const mx = MODULE_X;
      const mz = zColonne(col);
      emp.push({ x0: mx - L / 2, x1: mx + L / 2, z0: mz - P / 2, z1: mz + P / 2 });
      // Pignon gauche percé de la porte, pignon droit plein.
      const xg0 = mx - L / 2 - 0.06;
      const xg1 = mx - L / 2 + E + 0.02;
      o.push({ x0: xg0, x1: xg1, z0: mz - P / 2, z1: mz + PORTE.z0 }, { x0: xg0, x1: xg1, z0: mz + PORTE.z1, z1: mz + P / 2 });
      o.push({ x0: mx + L / 2 - E - 0.02, x1: mx + L / 2 + 0.06, z0: mz - P / 2, z1: mz + P / 2 });
      longue(o, mx, mz + P / 2 - E - 0.02, mz + P / 2, m.avant);
      longue(o, mx, mz - P / 2, mz - P / 2 + E + 0.02, m.arriere);
      for (const r of this.emplacements.get(n)?.interieur.obstacles ?? []) {
        o.push({ x0: mx + r.x0, x1: mx + r.x1, z0: mz + r.z0, z1: mz + r.z1 });
      }
    }

    const cloture: Rect = { x0: DALLE.x0 + 0.7, x1: DALLE.x1 - 0.7, z0: DALLE.z0 + 0.8, z1: DALLE.z1 - 0.8 };
    const sol0 = Y_DALLE;
    const plancher0 = Y_DALLE + PLANCHER;
    const surfaces: Surface[] = [];
    const escalier: Rect = { x0: ACCES.x0 + 0.08, x1: ACCES.x1 - 0.08, z0: ACCES.zHaut, z1: ACCES.zBas };
    const sousEscalier: Rect[] = this.acces.visible ? [{ x0: ACCES.x0, x1: ACCES.x1, z0: ACCES.zHaut, z1: ACCES.zBas - 0.7 }] : [];
    if (this.acces.visible && this.emprisesMonteCharge) sousEscalier.push(this.emprisesMonteCharge);
    surfaces.push({
      zones: [cloture],
      hauteur: (x, z) => (empreintes[0]?.some((r) => dans(r, x, z)) ? plancher0 : sol0),
      obstacles: [...exterieur, ...sousEscalier, ...(obstacles[0] ?? [])],
    });
    if (this.acces.visible) {
      // L'escalier monte de l'avant (au sol) vers la façade, au niveau de la passerelle.
      surfaces.push({
        zones: [escalier],
        hauteur: (_x, z) => sol0 + ((ACCES.zBas - z) / (ACCES.zBas - ACCES.zHaut)) * (ACCES.hauteur - sol0),
        obstacles: [],
      });
      let zFond = ACCES.zHaut;
      for (const r of empreintes[1] ?? []) zFond = Math.min(zFond, r.z0);
      surfaces.push({
        zones: [{ x0: ACCES.x0 + 0.08, x1: ACCES.x1 + 0.02, z0: zFond, z1: ACCES.zHaut + 0.02 }, ...(empreintes[1] ?? [])],
        hauteur: () => ACCES.hauteur,
        obstacles: obstacles[1] ?? [],
      });
    }
    this.surfaces = surfaces;
  }

  /** Reconstruit les liaisons réseau et énergie quand la disposition des modules posés change. */
  private majLiens(pose: (n: number) => boolean): void {
    const poses = NOMBRES_MODULES.filter((n) => pose(n));
    const eclate = this.eclatement > 0.5;
    const signature = `${this.disposition}#${eclate}#${poses.join(',')}`;
    if (signature === this.signatureLiens) return;
    this.signatureLiens = signature;

    for (const lien of this.liens) {
      lien.flux.groupe.traverse((objet) => {
        if (objet instanceof THREE.Mesh) objet.geometry.dispose();
      });
    }
    this.interconnexions.clear();
    this.liens = [];

    const origine = (n: number): THREE.Vector3 => {
      const { col, niveau } = caseModule(n, this.disposition);
      return new THREE.Vector3(MODULE_X, Y_DALLE + niveau * (H + (eclate ? ECLATEMENT : 0)), zColonne(col));
    };
    const premier = this.emplacements.get(1)?.interieur.ancres.reseau;
    for (const n of poses) {
      const e = this.emplacements.get(n);
      if (!e) continue;
      const o = origine(n);
      const niveau = caseModule(n, this.disposition).niveau;
      // Énergie : de la gaine principale au tableau du module.
      const tab = e.interieur.ancres.tableau;
      const tx = o.x + tab.x;
      const tz = o.z + tab.z;
      // En étage, un module peut en porter un autre : les liaisons passent alors sous les plafonds.
      const sousPlafond = this.disposition === 'etage';
      const yE = sousPlafond ? o.y + H - 0.3 : o.y + H + 1.0;
      this.liens.push({
        type: 'energie',
        flux: new Flux(
          traceArrondi([
            new THREE.Vector3(X_BUS, Y_DALLE + 0.1, o.z),
            new THREE.Vector3(X_BUS, yE, o.z),
            new THREE.Vector3(X_BUS, yE, tz),
            new THREE.Vector3(tx, yE, tz),
            new THREE.Vector3(tx, o.y + tab.y, tz),
          ]),
          0xffc400,
          { rayon: 0.05, vitesse: 1.6, pas: 1.0 },
        ),
      });
      // Réseau : deux liens redondants de la baie réseau du module vers le cœur du module 1.
      if (n === 1 || !premier) continue;
      const r = e.interieur.ancres.reseau;
      const o1 = origine(1);
      for (const decalage of [-0.12, 0.12]) {
        const a = new THREE.Vector3(o.x + r.x + decalage, o.y + r.y, o.z + r.z);
        const b = new THREE.Vector3(o1.x + premier.x + decalage, o1.y + premier.y, o1.z + premier.z);
        const hauteur = (sousPlafond ? -0.45 : 0.55) + (decalage > 0 ? 0.12 : 0);
        const yA = o.y + H + hauteur;
        const yB = o1.y + H + hauteur;
        // Même niveau : par-dessus les toits ; à l'étage : par la colonne montante extérieure.
        const points =
          niveau === 0
            ? [a, new THREE.Vector3(a.x, yA, a.z), new THREE.Vector3(b.x, yA, b.z), b]
            : [
                a,
                new THREE.Vector3(a.x, yA, a.z),
                new THREE.Vector3(X_COLONNE + decalage, yA, a.z),
                new THREE.Vector3(X_COLONNE + decalage, yB, a.z),
                new THREE.Vector3(X_COLONNE + decalage, yB, b.z),
                new THREE.Vector3(b.x, yB, b.z),
                b,
              ];
        this.liens.push({ type: 'reseau', flux: new Flux(traceArrondi(points, 0.12), 0x22d3ee, { rayon: 0.04, vitesse: 2.4, pas: 0.7 }) });
      }
    }
    for (const lien of this.liens) {
      lien.flux.tube.raycast = () => {};
      lien.flux.tube.castShadow = false;
      this.interconnexions.add(lien.flux.groupe);
    }
  }

  /**
   * Couche virtuelle, au-dessus du site : un plateau translucide où chaque VM est une plaque
   * qui porte le nom de son application. Des faisceaux la relient aux baies qui la font exister :
   * en cyan les serveurs de calcul (processeur et mémoire), en violet la baie de stockage (disques virtuels).
   */
  private creerVMs(): void {
    const c = this.coucheVM;
    marquer(c, { kind: 'vm', site: this.id });

    // Plateau et son liseré.
    const plateau = boite(PLATEAU.largeur, 0.05, PLATEAU.profondeur, this.matPlateau, MODULE_X, Y_PLATEAU, Z_MODULE_1);
    plateau.castShadow = false;
    const contour = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(PLATEAU.largeur, 0.05, PLATEAU.profondeur)),
      new THREE.LineBasicMaterial({ color: 0x67e8f9 }),
    );
    contour.position.set(MODULE_X, Y_PLATEAU + 0.025, Z_MODULE_1);
    contour.raycast = () => {};
    // Bandeau de titre sur la tranche avant.
    const titre = new THREE.Mesh(
      new THREE.PlaneGeometry(PLATEAU.largeur, 0.3),
      new THREE.MeshBasicMaterial({
        map: toile(1024, 48, (ctx) => {
          ctx.fillStyle = '#0b3a46';
          ctx.fillRect(0, 0, 1024, 48);
          ctx.fillStyle = '#a5f3fc';
          ctx.font = '700 24px "Segoe UI", Arial, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText('COUCHE VIRTUELLE · les VM tournent sur les serveurs de la baie de calcul', 18, 25);
        }),
        toneMapped: false,
      }),
    );
    titre.position.set(MODULE_X, Y_PLATEAU - 0.17, Z_MODULE_1 + PLATEAU.profondeur / 2 + 0.005);
    c.add(plateau, contour, titre);

    // Une plaque par VM, debout sur le plateau : deux rangées de six.
    const geometrie = new THREE.BoxGeometry(0.86, 0.54, 0.04);
    for (let i = 0; i < NB_VM_MAX; i++) {
      const rangee = Math.floor(i / 6);
      const texture = textureVM(i);
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        emissiveMap: texture,
        emissive: 0xffffff,
        emissiveIntensity: 0.85,
        roughness: 0.4,
        metalness: 0.1,
        transparent: true,
      });
      const plaque = new THREE.Mesh(geometrie, mat);
      plaque.position.set(MODULE_X + ((i % 6) - 2.5) * 1.02, Y_PLATEAU + 0.33 + rangee * 0.12, Z_MODULE_1 + (rangee === 0 ? 0.45 : -0.45));
      plaque.rotation.x = -0.22;
      plaque.scale.setScalar(0.0001);
      plaque.castShadow = false;
      this.vms.push({ mesh: plaque, mat });
      c.add(plaque);
    }

    // Faisceaux vers les baies du module 1 : ils traversent le toit pour montrer où vivent les VM.
    const ancres = this.emplacements.get(1)?.interieur.ancres;
    if (ancres) {
      const o = new THREE.Vector3(MODULE_X, Y_DALLE, Z_MODULE_1);
      // Chaque faisceau part du sommet de sa baie ; il s'étire quand le plateau monte (vue éclatée).
      const faisceau = (bas: THREE.Vector3, couleur: number): Flux => {
        const depart = o.clone().add(bas);
        const longueur = Y_PLATEAU - 0.03 - depart.y;
        const trace = new THREE.LineCurve3(new THREE.Vector3(depart.x, 0, depart.z), new THREE.Vector3(depart.x, longueur, depart.z));
        const f = new Flux(trace, couleur, { rayon: 0.06, vitesse: 1.6, pas: 0.55 });
        f.tube.raycast = () => {};
        f.groupe.position.y = depart.y;
        f.groupe.userData['longueur'] = longueur;
        this.faisceaux.add(f.groupe);
        return f;
      };
      for (const baie of ancres.calcul) this.faisceauxCalcul.push(faisceau(baie, 0x22d3ee));
      this.faisceauStockage = faisceau(ancres.stockage, 0xa78bfa);
    }

    this.groupe.add(c, this.faisceaux);
  }

  /** Câble posé au sol, en segments parallèles aux axes ; il s'allume quand il transporte de l'énergie. */
  private cable(couleur: number, points: readonly Point[]): Cable {
    const mat = materiau(0x2a2d31, { emissive: couleur, intensite: 0, rugosite: 0.5 });
    const meshes: THREE.Mesh[] = [];
    const surDalle = ([x, z]: Point): boolean => x >= DALLE.x0 && x <= DALLE.x1 && z >= DALLE.z0 && z <= DALLE.z1;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) continue;
      const y = surDalle(a) || surDalle(b) ? Y_DALLE : 0;
      const segment = boite(Math.abs(b[0] - a[0]) + 0.14, 0.09, Math.abs(b[1] - a[1]) + 0.14, mat, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
      segment.castShadow = false;
      meshes.push(segment);
      this.groupe.add(segment);
    }
    return { mat, meshes };
  }

  private allumer(mat: THREE.MeshStandardMaterial, actif: boolean, dt: number, t: number): void {
    const cible = actif ? 1.7 + 0.5 * Math.sin(t * 5) : 0;
    mat.emissiveIntensity = amortir(mat.emissiveIntensity, cible, 5, dt);
  }

  /** Marquage au sol des emplacements réservés, pour chaque disposition. */
  private tracerEmplacements(): void {
    const mat = materiau(0xf5c518, { rugosite: 0.8 });
    const e = 0.1;
    const tracer = (cible: THREE.Group, colonnes: number): void => {
      const zHaut = zColonne(1) + P / 2;
      const zBas = zColonne(colonnes) - P / 2;
      const traits: (readonly [number, number, number, number])[] = [
        [e, zHaut - zBas, MODULE_X - L / 2 - 0.3, (zHaut + zBas) / 2],
        [e, zHaut - zBas, MODULE_X + L / 2 + 0.3, (zHaut + zBas) / 2],
      ];
      for (let c = 1; c <= colonnes; c++) traits.push([L + 0.6, e, MODULE_X, zColonne(c) - P / 2]);
      for (const [largeur, profondeur, cx, cz] of traits) {
        const trait = boite(largeur, 0.012, profondeur, mat, cx, Y_DALLE, cz);
        trait.castShadow = false;
        cible.add(trait);
      }
    };
    tracer(this.traces.horizontale, 4);
    tracer(this.traces.etage, 2);
    this.traces.etage.visible = false;
    this.groupe.add(this.traces.horizontale, this.traces.etage);
  }

  private creerEtiquette(): Etiquette {
    const racine = document.createElement('div');
    racine.className = 'etiquette-site';
    const entete = document.createElement('div');
    entete.className = 'entete';
    const nom = document.createElement('strong');
    nom.textContent = this.id;
    const role = document.createElement('span');
    role.className = 'role';
    entete.append(nom, role);
    const ligne1 = document.createElement('div');
    const ligne2 = document.createElement('div');
    racine.append(entete, ligne1, ligne2);

    const objet = new CSS2DObject(racine);
    objet.position.set(MODULE_X, Y_PLATEAU + 1.2, Z_MODULE_1 - PLATEAU.profondeur / 2);
    objet.center.set(0.5, 1);
    // L'étiquette du site suit le plateau des VM.
    this.coucheVM.add(objet);
    return { racine, role, ligne1, ligne2 };
  }

  private majEtiquette(etat: SiteState): void {
    const signature = JSON.stringify(etat);
    if (signature === this.signature) return;
    this.signature = signature;

    // Repère compact : le détail (énergie, modules) est dans la télémétrie de l'interface.
    const vm = etat.vmActives > 0 ? `${etat.vmActives} VM` : etat.vmRepliques > 0 ? `${etat.vmRepliques} répliques` : 'aucune VM';
    const { racine, role, ligne1, ligne2 } = this.etiquette;
    racine.dataset['role'] = etat.role;
    role.textContent = LIBELLE_ROLE[etat.role];
    ligne1.textContent = `${etat.charge} % · ${vm}`;
    ligne2.textContent = '';
  }
}

/** Fenêtre d'une VM : nom de l'application, système et ressources allouées. */
function textureVM(i: number): THREE.CanvasTexture {
  const application = APPLICATIONS[i % APPLICATIONS.length] ?? 'Service';
  return toile(256, 160, (ctx) => {
    ctx.fillStyle = '#0d2530';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(0, 0, 256, 30);
    ctx.fillStyle = '#05303a';
    ctx.font = '700 18px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`VM ${String(i + 1).padStart(2, '0')}`, 12, 16);
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(236 - k * 18, 15, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ecfeff';
    let taille = 30;
    ctx.font = `700 ${taille}px "Segoe UI", Arial, sans-serif`;
    while (ctx.measureText(application).width > 232 && taille > 16) {
      taille -= 1;
      ctx.font = `700 ${taille}px "Segoe UI", Arial, sans-serif`;
    }
    ctx.fillText(application, 12, 78);
    ctx.fillStyle = '#7dd3e6';
    ctx.font = '500 16px "Segoe UI", Arial, sans-serif';
    ctx.fillText(i % 3 === 1 ? 'Windows Server' : 'Linux', 12, 114);
    ctx.fillText(`${2 + (i % 4) * 2} vCPU · ${8 * (1 + (i % 3))} Go`, 12, 138);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 156);
  });
}
