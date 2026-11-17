import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { son } from '../audio/son';
import {
  autreSite,
  ECLAIRAGE_DEFAUT,
  SITE_IDS,
  type Ambiance,
  type Eclairage,
  type Affichage,
  type EquipmentRef,
  type RackKind,
  type SiteId,
  type ViewId,
  type WorldState,
} from '../types';
import { phaseIncendie } from './circuits';
import { creerEnvironnement, POS_ESPLANADE, type Environnement } from './environnement';
import { Flux, traceArrondi, type Sens } from './flux';
import { Inspection } from './inspection';
import { boite, champVertical, cylindre, estVisible, marquer, materiau, MOBILE, SITE_X, trouverEquipement, Y_DALLE } from './outils';
import { Promenade } from './promenade';
import { DALLE, MODULE_X, Site, zModule } from './site';

interface Cadrage {
  readonly position: THREE.Vector3;
  readonly cible: THREE.Vector3;
}

function cadrage(px: number, py: number, pz: number, cx: number, cy: number, cz: number): Cadrage {
  return { position: new THREE.Vector3(px, py, pz), cible: new THREE.Vector3(cx, cy, cz) };
}

const X1 = SITE_X.DC1;
const X2 = SITE_X.DC2;

/** Intérieur du premier module : regard le long de l'allée froide, depuis la porte. */
function vueInterieure(x: number): Cadrage {
  const z = zModule(1);
  return cadrage(x + MODULE_X - 5.6, 3.25, z, x + MODULE_X + 1.6, 1.0, z);
}

/** Salle du premier module vue de haut et de face : les deux rangées et leurs allées d'un coup d'œil. */
function vueSalle(x: number): Cadrage {
  const z = zModule(1);
  return cadrage(x + MODULE_X - 2.0, 9.4, z + 4.6, x + MODULE_X - 1.6, 0.6, z - 0.3);
}

/** Toit du premier module et ses aérorefroidisseurs, salle visible en dessous. */
function vueToit(x: number): Cadrage {
  const z = zModule(1);
  return cadrage(x + MODULE_X + 4.6, 7.6, z + 7.2, x + MODULE_X - 2.6, 1.9, z - 0.3);
}

/** Bloc des modules vu de haut, toit escamoté, pour suivre les interconnexions. */
function vueModules(x: number): Cadrage {
  return cadrage(x + 13, 27, 11, x + MODULE_X, 0, zModule(3));
}

const VUES: Record<ViewId, Cadrage> = {
  ensemble: cadrage(0, 50, 104, 0, 0, 2),
  dc1: cadrage(X1 + 17, 22, 34, X1 - 2, 1.5, -3),
  'dc1-interieur': vueInterieure(X1),
  'dc1-energie': cadrage(X1 + 23, 14, 9, X1 + 6, 1, -6),
  'dc1-modules': vueModules(X1),
  'dc1-salle': vueSalle(X1),
  'dc1-toit': vueToit(X1),
  dc2: cadrage(X2 + 17, 22, 34, X2 - 2, 1.5, -3),
  'dc2-interieur': vueInterieure(X2),
  'dc2-energie': cadrage(X2 + 23, 14, 9, X2 + 6, 1, -6),
  'dc2-modules': vueModules(X2),
  'dc2-salle': vueSalle(X2),
  'dc2-toit': vueToit(X2),
  fibre: cadrage(0, 26, 58, 0, 0, 14),
};

/** Réglages de chaque ambiance : soleil, lumière diffuse du ciel, reflets, et aspect du ciel. */
const AMBIANCES: Record<Ambiance, { soleil: number; ciel: number; reflets: number; turbidite: number; rayleigh: number; mie: number; brume: number }> = {
  soleil: { soleil: 4.2, ciel: 1.5, reflets: 0.75, turbidite: 4.5, rayleigh: 1.1, mie: 0.004, brume: 0xcfd9df },
  doux: { soleil: 2.4, ciel: 2.0, reflets: 0.95, turbidite: 7, rayleigh: 1.6, mie: 0.008, brume: 0xd4dce2 },
  couvert: { soleil: 0.9, ciel: 2.6, reflets: 1.15, turbidite: 14, rayleigh: 3, mie: 0.02, brume: 0xc9ced3 },
};
/** Exposition de référence, multipliée par la luminosité choisie. */
const EXPOSITION = 0.62;
/** Hauteur minimale de la caméra orbitale au-dessus du terrain. */
const SOL_CAMERA = 1.2;
/** Distance maximale du point visé au centre de la carte (le terrain s'étend sur 700 m). */
const LIMITE_CARTE = 260;
/** Surcroît d'exposition sous un toit, quand l'adaptation est active. */
const ADAPTATION_INTERIEUR = 1.45;
/** Intensité de la lampe du visiteur réglée au maximum. */
const LAMPE_MAX = 3.6;

const TEXTE_LIEN: Record<WorldState['lien']['mode'], (source: SiteId) => string> = {
  repos: () => 'liaison au repos',
  replication: (source) => `réplication ${source} → ${autreSite(source)}`,
  synchro: () => 'synchronisation bidirectionnelle',
  coupee: () => 'réplication interrompue',
};

/** Scène complète : rendu, caméra, deux sites, fibre inter-sites et trafic utilisateur. */
export class Monde {
  /** Appelé quand l'utilisateur clique sur un équipement (ou dans le vide). */
  surSelection: (ref: EquipmentRef | null) => void = () => {};
  /** Vue rapprochée d'une baie et de ses serveurs. */
  readonly inspection: Inspection;
  /** Appelé quand le visiteur quitte la visite à pied avec Échap. */
  surSortiePromenade: () => void = () => {};
  /** À pied : la souris vient d'être capturée (regard libre) ou libérée. */
  surRegard: (libre: boolean) => void = () => {};
  /** À pied : le visiteur demande à ouvrir l'équipement visé (touche E). */
  surOuvrir: (ref: EquipmentRef) => void = () => {};
  /** Double-clic sur un équipement : entrer, ouvrir ou s'approcher (décidé par l'application). */
  surEntrer: (ref: EquipmentRef, objet: THREE.Object3D) => void = () => {};

  private readonly renderer: THREE.WebGLRenderer;
  private readonly rendu2D: CSS2DRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.3, 1600);
  private readonly controles: OrbitControls;
  private readonly sites: Record<SiteId, Site>;
  private readonly environnement: Environnement;
  private readonly fibre: Flux;
  private readonly trafic: Record<SiteId, Flux>;
  private readonly etatFibre = document.createElement('span');
  private readonly rayon = new THREE.Raycaster();
  private readonly pointeur = new THREE.Vector2();
  private transition: { de: Cadrage; vers: Cadrage; t: number } | null = null;
  /** Équipement sous le pointeur (ou visé au centre de l'écran, à pied). */
  private survole: THREE.Object3D | null = null;
  private prochaineVisee = 0;
  /** Dernière position du pointeur à analyser (le survol est traité au plus 20 fois par seconde). */
  private pointeurEnAttente: { x: number; y: number } | null = null;
  private derniereOmbre = 0;
  /** Vrai quand le panneau de commandes occupe la gauche de l'écran. */
  private panneauVisible = true;
  private readonly promenade: Promenade;
  private sitePromenade: SiteId | null = null;
  /** Éclairage d'appoint porté par le visiteur. */
  private readonly lampe = new THREE.PointLight(0xfff4e6, 0, 8, 2);
  private readonly soleil = new THREE.DirectionalLight(0xfff0d6, 4.2);
  private readonly lumiereCiel = new THREE.HemisphereLight(0xdfeeff, 0x9a7654, 1.5);
  private eclairage: Eclairage = { ...ECLAIRAGE_DEFAUT };
  private exposition = EXPOSITION;
  private surlignage: THREE.BoxHelper | null = null;
  private texteFibre = '';
  /** À pied, vrai quand le visiteur est sous un toit (pour le son des pas et l'ambiance). */
  private sousToit = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly calque: HTMLElement,
    calqueInspection: HTMLElement,
  ) {
    // Tampon de profondeur logarithmique : la scène va de quelques centimètres (visite à pied)
    // à plusieurs centaines de mètres ; sans lui, les surfaces proches l'une de l'autre scintillent.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    // Sur mobile, définition et ombres plus légères : la démo reste fluide sur un téléphone.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.25 : 1.5));
    this.renderer.shadowMap.enabled = true;
    // Les ombres ne sont recalculées que si quelque chose bouge (voir `maj`).
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.rendu2D = new CSS2DRenderer({ element: calque });

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const reflets = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = reflets;
    this.scene.environmentIntensity = 0.75;
    this.scene.fog = new THREE.Fog(0xcfd9df, 220, 720);

    this.environnement = creerEnvironnement(this.scene);
    marquer(this.environnement.utilisateurs, { kind: 'utilisateurs', site: null });
    this.eclairer(this.environnement.soleil);

    this.sites = { DC1: new Site('DC1'), DC2: new Site('DC2') };
    for (const id of SITE_IDS) this.scene.add(this.sites[id].groupe);

    this.fibre = this.creerFibre();
    this.trafic = { DC1: this.creerTrafic('DC1'), DC2: this.creerTrafic('DC2') };
    this.etiqueterUtilisateurs();

    this.controles = new OrbitControls(this.camera, canvas);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.09;
    this.controles.rotateSpeed = 0.7;
    this.controles.zoomSpeed = 1.1;
    this.controles.panSpeed = 0.9;
    // La molette rapproche vers l'endroit pointé, comme dans un logiciel de cartographie.
    this.controles.zoomToCursor = true;
    this.controles.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controles.minDistance = 1.5;
    this.controles.maxDistance = 260;
    this.controles.addEventListener('start', () => {
      this.transition = null;
    });

    this.inspection = new Inspection(canvas, calqueInspection, reflets);
    this.promenade = new Promenade(
      canvas,
      this.camera,
      (x, z, h) => this.sites[x < 0 ? 'DC1' : 'DC2'].surface(x, z, h),
      () => !this.inspection.actif,
    );
    this.promenade.surSortie = () => this.surSortiePromenade();
    this.promenade.surRegard = (libre) => this.surRegard(libre);
    // Pas du visiteur : plancher technique sous un toit, gravier dehors.
    this.promenade.surPas = () => son.pas(this.sousToit);
    this.promenade.surAction = () => {
      // E ou Entrée : ouvrir l'équipement visé au centre de l'écran.
      this.rayon.setFromCamera(this.pointeur.set(0, 0), this.camera);
      const selection = this.premierEquipement();
      if (selection) this.surOuvrir(selection.ref);
    };
    this.camera.add(this.lampe);
    this.scene.add(this.camera);

    this.allerA('ensemble', true);
    this.ecouterPointeur();
    window.addEventListener('resize', () => this.redimensionner());
    this.redimensionner();
  }

  /** Déplace la caméra vers un cadrage prédéfini. */
  allerA(vue: ViewId, immediat = false): void {
    const vers = VUES[vue];
    if (immediat) {
      this.camera.position.copy(vers.position);
      this.controles.target.copy(vers.cible);
      this.transition = null;
      return;
    }
    this.transition = {
      de: { position: this.camera.position.clone(), cible: this.controles.target.clone() },
      vers,
      t: 0,
    };
  }

  get enPromenade(): SiteId | null {
    return this.sitePromenade;
  }

  /**
   * Passe en première personne à l'endroit regardé : le visiteur est posé au point praticable
   * le plus proche du centre de la vue, tourné dans la même direction. Renvoie le site visité.
   */
  demarrerPromenadeIci(): SiteId {
    const cible = this.controles.target;
    const regard = cible.clone().sub(this.camera.position);
    const cap = Math.atan2(-regard.x, -regard.z);
    const site: SiteId = Math.abs(cible.x - SITE_X.DC1) <= Math.abs(cible.x - SITE_X.DC2) ? 'DC1' : 'DC2';
    const point = this.sites[site].pointPres(cible.x, cible.y, cible.z, cap);
    this.lancerPromenade(site, point ?? this.sites[site].pointDepart());
    return site;
  }

  /**
   * Visite à pied d'un site : devant la porte du premier module, ou directement
   * à l'intérieur du module `module` s'il est posé.
   */
  demarrerPromenade(site: SiteId, module?: number): void {
    const depart = (module !== undefined ? this.sites[site].pointInterieur(module) : null) ?? this.sites[site].pointDepart();
    this.lancerPromenade(site, depart);
  }

  private lancerPromenade(site: SiteId, depart: { position: THREE.Vector3; cap: number; sol: number }): void {
    this.sitePromenade = site;
    this.transition = null;
    this.controles.enabled = false;
    this.camera.near = 0.05;
    this.camera.fov = champVertical(68, this.camera.aspect, 95);
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.lampe.intensity = LAMPE_MAX * this.eclairage.lampe;
    // Les étiquettes du site (rôle, fibre, utilisateurs) traverseraient les parois : on les masque.
    this.calque.classList.add('promenade');
    this.surligner(null, null);
    this.promenade.demarrer(depart.position, depart.cap, depart.sol);
  }

  /** Fin de la visite : retour à la caméra orbitale, devant l'intérieur du site visité. */
  arreterPromenade(): void {
    const site = this.sitePromenade;
    if (!site) return;
    this.promenade.arreter();
    this.sitePromenade = null;
    this.lampe.intensity = 0;
    this.calque.classList.remove('promenade');
    this.camera.near = 0.3;
    this.camera.fov = champVertical(42, this.camera.aspect, 100);
    this.controles.enabled = !this.inspection.actif;
    this.redimensionner();
    this.allerA(site === 'DC1' ? 'dc1-interieur' : 'dc2-interieur');
  }

  /** Rapproche la caméra orbitale d'un objet, en gardant l'angle de vue courant. */
  cadrerSur(objet: THREE.Object3D): void {
    if (this.sitePromenade) return;
    const boite = new THREE.Box3().setFromObject(objet);
    if (boite.isEmpty()) return;
    const centre = boite.getCenter(new THREE.Vector3());
    const rayon = Math.max(0.6, boite.getSize(new THREE.Vector3()).length() / 2);
    const direction = this.camera.position.clone().sub(this.controles.target).normalize();
    // On garde l'orientation, mais toujours un peu en surplomb pour voir l'objet par-dessus ses voisins.
    direction.y = Math.max(direction.y, 0.35);
    direction.normalize();
    const distance = Math.max(2.4, rayon * 2.8);
    this.transition = {
      de: { position: this.camera.position.clone(), cible: this.controles.target.clone() },
      vers: { position: centre.clone().addScaledVector(direction, distance), cible: centre },
      t: 0,
    };
  }

  get reglagesEclairage(): Eclairage {
    return { ...this.eclairage };
  }

  /** Applique l'ambiance, les ombres, la luminosité et la lampe du visiteur. */
  reglerEclairage(eclairage: Eclairage): void {
    this.eclairage = { ...eclairage };
    const a = AMBIANCES[eclairage.ambiance];
    this.soleil.intensity = a.soleil;
    this.lumiereCiel.intensity = a.ciel;
    this.scene.environmentIntensity = a.reflets;
    const u = this.environnement.ciel.material.uniforms;
    if (u['turbidity']) u['turbidity'].value = a.turbidite;
    if (u['rayleigh']) u['rayleigh'].value = a.rayleigh;
    if (u['mieCoefficient']) u['mieCoefficient'].value = a.mie;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.setHex(a.brume);

    // Ombres : supprimées, adoucies (flou large, moins sombres) ou nettes.
    this.soleil.castShadow = eclairage.ombres !== 'aucune';
    this.soleil.shadow.radius = eclairage.ombres === 'douces' ? 5 : 1;
    this.soleil.shadow.intensity = eclairage.ombres === 'douces' ? 0.72 : 1;
    this.renderer.shadowMap.needsUpdate = true;

    if (this.sitePromenade) this.lampe.intensity = LAMPE_MAX * eclairage.lampe;
  }

  /** Le cadrage tient compte du panneau de commandes quand il est déplié. */
  definirPanneau(visible: boolean): void {
    this.panneauVisible = visible;
    this.redimensionner();
  }

  /** Bascule vers la vue rapprochée d'une baie. */
  inspecter(site: SiteId, module: number, baie: RackKind): void {
    son.ouvrir();
    this.promenade.liberer();
    this.controles.enabled = false;
    this.calque.style.display = 'none';
    this.inspection.ouvrir(site, module, baie);
  }

  /** Rend la main à la scène principale quand l'inspection se ferme. */
  reprendre(): void {
    this.controles.enabled = this.sitePromenade === null;
    this.calque.style.display = '';
    this.canvas.style.cursor = 'grab';
    // À pied, on retrouve le visiteur à l'endroit et dans la direction où il avait ouvert la baie.
    if (this.sitePromenade) this.promenade.reprendre();
  }

  maj(dt: number, t: number, etat: WorldState, affichage: Affichage): void {
    // Exposition : luminosité choisie, éclaircie sous un toit si l'adaptation est active (transition douce).
    const cam = this.camera.position;
    const dedans =
      this.eclairage.adaptation &&
      !this.inspection.actif &&
      this.sitePromenade !== null &&
      this.sites[this.sitePromenade].estInterieur(cam.x, cam.y, cam.z);
    const cible = EXPOSITION * this.eclairage.luminosite * (dedans ? ADAPTATION_INTERIEUR : 1);
    this.exposition += (cible - this.exposition) * (1 - Math.exp(-2.5 * dt));
    this.renderer.toneMappingExposure = this.exposition;

    this.majSon(dt, t, etat, affichage);
    this.calque.classList.toggle('sans-reperes', !affichage.reperes);

    if (this.inspection.actif) {
      this.renderer.shadowMap.needsUpdate = true;
      this.inspection.maj(dt, t, this.renderer);
      return;
    }
    if (this.pointeurEnAttente && t > this.prochaineVisee && !this.sitePromenade) {
      const { x, y } = this.pointeurEnAttente;
      this.pointeurEnAttente = null;
      this.prochaineVisee = t + 0.05;
      const selection = this.viser(x, y);
      this.survole = selection?.racine ?? null;
      this.canvas.style.cursor = selection ? 'pointer' : 'grab';
    }

    if (this.sitePromenade && t > this.prochaineVisee) {
      // À pied, l'équipement visé est celui au centre de l'écran.
      this.prochaineVisee = t + 0.2;
      this.rayon.setFromCamera(this.pointeur.set(0, 0), this.camera);
      this.survole = this.premierEquipement()?.racine ?? null;
    }
    const vue = { camera: this.camera.position, promenade: this.sitePromenade !== null, survole: this.survole };
    for (const id of SITE_IDS) this.sites[id].maj(dt, t, etat.sites[id], affichage, vue);

    // Fibre inter-sites.
    const { mode, source } = etat.lien;
    const debit = mode === 'replication' ? 0.75 : mode === 'synchro' ? 1 : 0;
    const sens: Sens = mode === 'synchro' ? 0 : source === 'DC1' ? 1 : -1;
    this.fibre.maj(dt, t, debit, sens, mode === 'coupee');
    const texte = TEXTE_LIEN[mode](source);
    if (texte !== this.texteFibre) {
      this.texteFibre = texte;
      this.etatFibre.textContent = texte;
      this.etatFibre.dataset['mode'] = mode;
    }

    // Trafic des utilisateurs vers le ou les sites actifs.
    for (const id of SITE_IDS) this.trafic[id].maj(dt, t, etat.trafic[id], 1);

    if (this.sitePromenade) {
      this.promenade.maj(dt);
    } else {
      this.animerCamera(dt);
      // Pendant une transition, l'inertie d'un glisser précédent ferait trembler la caméra.
      this.controles.enableDamping = this.transition === null;
      this.controles.update();
      this.garderAuDessusDuSol();
    }
    // Ombres : recalculées quand un site bouge, et sinon deux fois par seconde (hélices, VM, groupes).
    if (SITE_IDS.some((id) => this.sites[id].enMouvement) || t - this.derniereOmbre > 0.5) {
      this.renderer.shadowMap.needsUpdate = true;
      this.derniereOmbre = t;
    }
    this.surlignage?.update();
    this.renderer.render(this.scene, this.camera);
    this.rendu2D.render(this.scene, this.camera);
  }

  /** Transmet au son la position d'écoute (la caméra), l'intérieur ou l'extérieur et l'état des sites. */
  private majSon(dt: number, t: number, etat: WorldState, affichage: Affichage): void {
    const cam = this.camera;
    const site = this.sitePromenade;
    this.sousToit = site !== null && this.sites[site].estInterieur(cam.position.x, cam.position.y, cam.position.z);
    const siteIci = this.inspection.site ?? site;
    const charge = (id: SiteId): number => {
      const s = etat.sites[id];
      const alimente = s.role !== 'sinistre' && (s.secteur || s.groupe || s.surBatterie || s.solaire);
      return alimente ? s.charge / 100 : 0;
    };
    const sites = {} as Parameters<typeof son.maj>[1]['sites'];
    for (const id of SITE_IDS) {
      const s = etat.sites[id];
      sites[id] = {
        sources: this.sites[id].sourcesSon,
        charge: charge(id),
        groupe: s.groupe && s.role !== 'sinistre',
        secteur: s.secteur && s.role !== 'sinistre',
        sinistre: s.role === 'sinistre',
      };
    }
    son.maj(dt, {
      t,
      ecoute: {
        position: cam.position,
        avant: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion),
        haut: new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion),
      },
      // Devant une baie ouverte, on est dans la salle, un peu moins immergé qu'à pied.
      dedans: this.inspection.actif ? 0.75 : this.sousToit ? 1 : 0,
      chargeIci: siteIci ? charge(siteIci) : 0,
      sites,
      incendie: affichage.circuit === 'incendie' ? phaseIncendie(t) : null,
    });
  }

  /**
   * La caméra orbitale ne passe jamais sous le terrain : le point visé reste au sol ou au-dessus
   * (un déplacement latéral ou un zoom vers le curseur pourrait l'y entraîner), et la caméra
   * garde au moins 1,2 m de hauteur.
   */
  private garderAuDessusDuSol(): void {
    const cible = this.controles.target;
    const cam = this.camera.position;
    if (cible.y < 0) {
      cam.y -= cible.y;
      cible.y = 0;
    }
    if (cam.y < SOL_CAMERA) cam.y = SOL_CAMERA;
    // Pas plus loin que les collines : au-delà, on verrait le bord de la carte.
    const horizontal = Math.hypot(cible.x, cible.z);
    if (horizontal > LIMITE_CARTE) {
      const k = LIMITE_CARTE / horizontal;
      const dx = cible.x * (1 - k);
      const dz = cible.z * (1 - k);
      cible.x -= dx;
      cible.z -= dz;
      cam.x -= dx;
      cam.z -= dz;
    }
  }

  private animerCamera(dt: number): void {
    const tr = this.transition;
    if (!tr) return;
    tr.t = Math.min(1, tr.t + dt / 1.6);
    const k = tr.t * tr.t * (3 - 2 * tr.t);
    this.camera.position.lerpVectors(tr.de.position, tr.vers.position, k);
    this.controles.target.lerpVectors(tr.de.cible, tr.vers.cible, k);
    if (tr.t >= 1) this.transition = null;
  }

  private eclairer(direction: THREE.Vector3): void {
    this.scene.add(this.lumiereCiel);
    const soleil = this.soleil;
    soleil.position.copy(direction).multiplyScalar(160);
    soleil.castShadow = true;
    soleil.shadow.mapSize.setScalar(MOBILE ? 2048 : 4096);
    const ombre = soleil.shadow.camera;
    ombre.left = -85;
    ombre.right = 85;
    ombre.top = 70;
    ombre.bottom = -70;
    ombre.near = 20;
    ombre.far = 360;
    soleil.shadow.bias = -0.0003;
    soleil.shadow.normalBias = 0.04;
    this.scene.add(soleil);
  }

  /** Fibre : du module de DC1 à celui de DC2, en passant par les dalles puis le terrain. */
  private creerFibre(): Flux {
    const a = this.sites.DC1.entreeFibre;
    const b = this.sites.DC2.entreeFibre;
    const y = Y_DALLE + 0.06;
    const zDalle = 6.5;
    const bordA = SITE_X.DC1 + DALLE.x1;
    const bordB = SITE_X.DC2 + DALLE.x0;

    const points: THREE.Vector3[] = [
      a.clone(),
      new THREE.Vector3(a.x, y, zDalle),
      new THREE.Vector3(bordA, y, zDalle),
    ];
    // Tracé sur le terrain, légèrement bombé vers l'avant pour rester lisible.
    const pas = 36;
    const bornes: THREE.Vector3[] = [];
    const supports: THREE.Vector3[] = [];
    for (let i = 0; i <= pas; i++) {
      const k = i / pas;
      const point = new THREE.Vector3(
        bordA + 3 + (bordB - bordA - 6) * k,
        0.42,
        zDalle + 9 * Math.sin(Math.PI * k),
      );
      points.push(point);
      if (i % 6 === 3) bornes.push(point);
      if (i % 2 === 1) supports.push(point);
    }
    points.push(new THREE.Vector3(bordB, y, zDalle), new THREE.Vector3(b.x, y, zDalle), b.clone());

    // Une gaine, deux voies : l'aller DC1 → DC2 (cyan) et le retour DC2 → DC1 (violet).
    // En réplication, seule la voie de la source vers le secours s'allume ; en synchrone, les deux.
    const flux = new Flux(traceArrondi(points, 0.8), 0x22d3ee, {
      rayon: 0.27,
      vitesse: 8,
      pas: 3,
      voies: { retour: 0xa78bfa, ecart: 0.1 },
    });
    marquer(flux.tube, { kind: 'fibre', site: null });
    this.scene.add(flux.groupe);

    // Bornes de repérage le long du tracé.
    const matBorne = materiau(0xf2720c, { rugosite: 0.6 });
    const matSocle = materiau(0xe8e4da, { rugosite: 0.8 });
    // Petits supports : la gaine court à hauteur de genou, lisible de loin.
    const matSupport = materiau(0x5d6670, { rugosite: 0.5, metal: 0.6 });
    for (const p of supports) {
      const support = cylindre(0.035, 0.42, matSupport, p.x, 0, p.z, 8);
      support.raycast = () => {};
      this.scene.add(support);
    }
    for (const borne of bornes) {
      const socle = cylindre(0.12, 0.7, matSocle, borne.x, 0, borne.z - 0.9, 10);
      const tete = cylindre(0.13, 0.22, matBorne, borne.x, 0.7, borne.z - 0.9, 10);
      socle.raycast = () => {};
      tete.raycast = () => {};
      this.scene.add(socle, tete);
    }

    const etiquette = document.createElement('div');
    etiquette.className = 'etiquette-lien';
    const titre = document.createElement('strong');
    titre.textContent = 'Fibre optique · ≈ 100 km';
    this.etatFibre.className = 'etat';
    etiquette.append(titre, this.etatFibre);
    const objet = new CSS2DObject(etiquette);
    objet.position.set(0, 3.2, zDalle + 9);
    this.scene.add(objet);
    return flux;
  }

  /** Arc reliant les utilisateurs aux machines virtuelles d'un site. */
  private creerTrafic(id: SiteId): Flux {
    const depart = POS_ESPLANADE.clone().setY(2.4);
    const arrivee = this.sites[id].centreVM;
    const sommet = depart.clone().lerp(arrivee, 0.5).setY(26);
    const flux = new Flux(new THREE.QuadraticBezierCurve3(depart, sommet, arrivee), 0xf8fafc, { rayon: 0.06, vitesse: 6, pas: 2.4 });
    flux.tube.raycast = () => {};
    flux.tube.castShadow = false;
    this.scene.add(flux.groupe);
    // Mât d'où part le trafic, au centre du parvis.
    const mat = boite(0.12, 2.3, 0.12, materiau(0x5d6670, { rugosite: 0.4, metal: 0.8 }), depart.x, 0.14, depart.z);
    mat.raycast = () => {};
    this.scene.add(mat);
    return flux;
  }

  private etiqueterUtilisateurs(): void {
    const etiquette = document.createElement('div');
    etiquette.className = 'etiquette-lien';
    const titre = document.createElement('strong');
    titre.textContent = 'Utilisateurs et applications';
    etiquette.append(titre);
    const objet = new CSS2DObject(etiquette);
    objet.position.copy(POS_ESPLANADE).setY(4.2);
    this.scene.add(objet);
  }

  private ecouterPointeur(): void {
    let depart: { x: number; y: number } | null = null;
    /** Dernier toucher, pour reconnaître un double toucher (les navigateurs mobiles n'émettent pas toujours `dblclick`). */
    let dernierToucher = { t: 0, x: 0, y: 0 };
    let doubleToucher = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      depart = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('pointerup', (e) => {
      // Un glisser sert à orbiter : seul un clic franc sélectionne (un doigt bouge un peu plus qu'une souris).
      const tolerance = e.pointerType === 'touch' ? 12 : 5;
      if (!depart || Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > tolerance) return;
      if (e.pointerType === 'touch') {
        const maintenant = performance.now();
        const double = maintenant - dernierToucher.t < 350 && Math.hypot(e.clientX - dernierToucher.x, e.clientY - dernierToucher.y) < 40;
        dernierToucher = { t: double ? 0 : maintenant, x: e.clientX, y: e.clientY };
        if (double) {
          doubleToucher = maintenant;
          this.entrer(e.clientX, e.clientY);
          return;
        }
      }
      if (this.inspection.actif) {
        this.inspection.clic(e.clientX, e.clientY);
        return;
      }
      if (this.sitePromenade) {
        // À pied, on sélectionne ce qui est visé au centre de l'écran ; le clic qui capture la souris ne compte pas.
        if (this.promenade.consommerClic()) return;
        this.rayon.setFromCamera(this.pointeur.set(0, 0), this.camera);
        const visee = this.premierEquipement();
        this.surligner(visee?.racine ?? null, visee?.ref ?? null);
        this.surSelection(visee?.ref ?? null);
        return;
      }
      const selection = this.viser(e.clientX, e.clientY);
      if (selection) son.clic();
      this.surligner(selection?.racine ?? null, selection?.ref ?? null);
      this.surSelection(selection?.ref ?? null);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) return;
      if (this.inspection.actif) {
        this.canvas.style.cursor = this.inspection.survol(e.clientX, e.clientY) ? 'pointer' : 'grab';
        return;
      }
      // Le lancer de rayon est différé à l'image suivante, au plus 20 fois par seconde.
      if (!this.sitePromenade) this.pointeurEnAttente = { x: e.clientX, y: e.clientY };
    });
    this.canvas.addEventListener('dblclick', (e) => {
      // Un double toucher déjà traité ne doit pas compter deux fois.
      if (performance.now() - doubleToucher < 600) return;
      this.entrer(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.sitePromenade) this.survole = null;
    });
  }

  /** Double-clic ou double toucher : entrer, ouvrir ou s'approcher (décidé par l'application). */
  private entrer(clientX: number, clientY: number): void {
    if (this.inspection.actif) {
      this.inspection.doubleClic(clientX, clientY);
      return;
    }
    let selection: ReturnType<typeof trouverEquipement>;
    if (this.sitePromenade) {
      this.rayon.setFromCamera(this.pointeur.set(0, 0), this.camera);
      selection = this.premierEquipement();
    } else {
      selection = this.viser(clientX, clientY);
    }
    if (selection) this.surEntrer(selection.ref, selection.racine);
  }

  /** Joystick tactile de la visite à pied (`x` vers la droite, `y` vers l'avant, de -1 à 1). */
  deplacementTactile(x: number, y: number): void {
    this.promenade.deplacementTactile(x, y);
  }

  /** Bouton « Ouvrir » de la visite tactile : comme la touche E. */
  actionPromenade(): void {
    this.promenade.surAction();
  }

  /** Premier équipement visible sous le pointeur. */
  private viser(clientX: number, clientY: number): ReturnType<typeof trouverEquipement> {
    const cadre = this.canvas.getBoundingClientRect();
    this.pointeur.set(
      ((clientX - cadre.left) / cadre.width) * 2 - 1,
      -((clientY - cadre.top) / cadre.height) * 2 + 1,
    );
    this.rayon.setFromCamera(this.pointeur, this.camera);
    return this.premierEquipement();
  }

  /** Premier équipement visible le long du rayon courant. */
  private premierEquipement(): ReturnType<typeof trouverEquipement> {
    for (const impact of this.rayon.intersectObjects(this.scene.children, true)) {
      if (!estVisible(impact.object)) continue;
      const selection = trouverEquipement(impact.object);
      if (selection) return selection;
    }
    return null;
  }

  private surligner(objet: THREE.Object3D | null, ref: EquipmentRef | null): void {
    if (this.surlignage) {
      this.scene.remove(this.surlignage);
      this.surlignage.dispose();
      this.surlignage = null;
    }
    // La fibre s'étend sur toute la scène : un cadre englobant n'aurait pas de sens.
    if (!objet || ref?.kind === 'fibre') return;
    this.surlignage = new THREE.BoxHelper(objet, 0x22d3ee);
    this.surlignage.raycast = () => {};
    this.scene.add(this.surlignage);
  }

  private redimensionner(): void {
    const largeur = window.innerWidth;
    const hauteur = window.innerHeight;
    this.camera.aspect = largeur / hauteur;
    this.inspection.redimensionner(largeur, hauteur);
    this.renderer.setSize(largeur, hauteur);
    this.rendu2D.setSize(largeur, hauteur);
    // En portrait, le champ vertical s'élargit pour garder la largeur de la scène.
    this.camera.fov = this.sitePromenade ? champVertical(68, this.camera.aspect, 95) : champVertical(42, this.camera.aspect, 100);
    if (this.sitePromenade) {
      // À pied, les panneaux latéraux sont masqués : l'image reste centrée.
      this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
      return;
    }
    // Décale l'image vers la droite et vers le haut : les panneaux de commandes et de narration ne masquent pas la scène.
    // La barre d'outils occupe un liseré à gauche : l'image est à peine décalée.
    const decalage = largeur > 900 && this.panneauVisible ? 28 : 0;
    this.camera.setViewOffset(largeur, hauteur, -decalage, 0, largeur, hauteur);
  }
}
