import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { son } from '../audio/son';
import { COMPOSANTS, CONTENU_BAIE, libelleUnite } from '../baies';
import type { ComposantKind, EtatInspection, RackKind, SiteId, UniteBaie } from '../types';
import { estExaminable, modeleExamen, type ModeleExamen } from './examen';
import { ECART_U, U } from './facades';
import { amortir, boite, champVertical, creerCanvas, cylindre, materiau, MOBILE, panneau, toile } from './outils';
import { cable, construireServeur, L_CHASSIS, matFacade, P_CHASSIS, type Piece, type ServeurOuvert } from './serveur';
const H_BAIE = 2.0;
const L_BAIE = 0.6;
const P_BAIE = 1.0;
/** Hauteur du premier emplacement au-dessus du sol. */
const Y_BAS = 0.09;

interface Cadrage {
  readonly position: THREE.Vector3;
  readonly cible: THREE.Vector3;
}

const VERT = '#3dff8a';

function repeter(texture: THREE.CanvasTexture, x: number, y: number): THREE.CanvasTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y);
  // Indispensable pour une texture clonée, qui sinon ne serait jamais envoyée à la carte graphique.
  texture.needsUpdate = true;
  return texture;
}

/** Montant de baie : trois perforations carrées par unité. */
function textureMontant(): THREE.CanvasTexture {
  return toile(32, 48, (ctx) => {
    ctx.fillStyle = '#7d8590';
    ctx.fillRect(0, 0, 32, 48);
    ctx.fillStyle = '#16181c';
    for (const y of [4, 20, 36]) ctx.fillRect(11, y, 10, 9);
    ctx.fillStyle = '#5c636d';
    ctx.fillRect(0, 47, 32, 1);
  });
}

/** Tôle perforée des portes : trous sur fond opaque, découpés par transparence. */
function texturePerforee(): THREE.CanvasTexture {
  return toile(32, 32, (ctx) => {
    ctx.fillStyle = '#2b3038';
    ctx.fillRect(0, 0, 32, 32);
    ctx.globalCompositeOperation = 'destination-out';
    for (const [x, y] of [[8, 8], [24, 8], [16, 24], [0, 24], [32, 24]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  });
}

/** Bandeau de prises électriques : une prise par motif, avec son voyant. */
function texturePrises(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const [canvasMap, m] = creerCanvas(32, 64);
  const [canvasEmi, e] = creerCanvas(32, 64);
  m.fillStyle = '#14161a';
  m.fillRect(0, 0, 32, 64);
  m.fillStyle = '#2c3037';
  m.fillRect(5, 10, 22, 40);
  m.fillStyle = '#060708';
  m.fillRect(9, 18, 4, 10);
  m.fillRect(19, 18, 4, 10);
  m.fillRect(13, 34, 6, 8);
  e.fillStyle = '#000';
  e.fillRect(0, 0, 32, 64);
  for (const ctx of [m, e]) {
    ctx.fillStyle = VERT;
    ctx.fillRect(13, 54, 6, 5);
  }
  const map = new THREE.CanvasTexture(canvasMap);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(canvasEmi);
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map, emissive };
}

/* ---------- Scène d'inspection ---------- */

/** Durée du vol d'une pièce entre son logement et sa présentation, en secondes. */
const DUREE_VOL = 0.75;
/** Distance de présentation devant la caméra. */
const DISTANCE_PRESENTATION = 0.5;
/** Part de la hauteur de l'écran occupée par la pièce présentée (vue rassemblée). */
const PART_ECRAN = 0.48;
/** Couche de rendu de la pièce présentée : dessinée après le reste, par-dessus le voile. */
const COUCHE_PRESENTATION = 1;
const AXE_X = new THREE.Vector3(1, 0, 0);
const AXE_Y = new THREE.Vector3(0, 1, 0);
/** Inclinaison de présentation : le dessus de la pièce se tourne vers soi, de trois quarts. */
const INCLINAISON = new THREE.Quaternion().setFromAxisAngle(AXE_X, 0.95);

/** Cadrages du serveur ouvert. */
const VUES_SERVEUR = {
  haut: { position: [0, 1.22, 0.09], cible: [0, 0.03, 0] },
  face: { position: [0, 0.13, 0.98], cible: [0, 0.04, 0.3] },
} as const;

function cadrageServeur(vue: VueServeur): Cadrage {
  const c = VUES_SERVEUR[vue];
  return { position: new THREE.Vector3(...c.position), cible: new THREE.Vector3(...c.cible) };
}

export type VueServeur = keyof typeof VUES_SERVEUR;

/** Pièce sortie du serveur et présentée devant la caméra. */
interface Presentation {
  readonly piece: Piece;
  /** Pivot centré : modèle détaillé de la pièce, ou sa copie. */
  readonly objet: THREE.Object3D;
  readonly modele: ModeleExamen | null;
  /** Plus grande dimension de l'objet à l'échelle 1. */
  readonly taille: number;
  readonly depart: { readonly position: THREE.Vector3; readonly quaternion: THREE.Quaternion; readonly echelle: number };
  /** 0 = dans le serveur, 1 = présentée (animé). */
  t: number;
  sens: 1 | -1;
  /** Rotation donnée à la main, dans le repère de la caméra. */
  readonly rotation: THREE.Quaternion;
  /** Rotation lente autour de l'axe propre de la pièce, jusqu'à la première manipulation. */
  tour: number;
  auto: boolean;
  zoom: number;
  /** Dissipateur soulevé pour dégager le processeur, reposé au retour. */
  readonly dissipateur: Piece | null;
}

/** Vue rapprochée d'une baie, puis d'un serveur ouvert vu de haut, dont on présente les pièces une à une. */
export class Inspection {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 80);
  readonly controles: OrbitControls;

  /** Appelé au clic sur un composant (ou `null` dans le vide). */
  surComposant: (kind: ComposantKind | null) => void = () => {};
  /** Appelé à chaque changement de niveau ; `null` quand l'inspection se ferme. */
  surNavigation: (etat: EtatInspection | null) => void = () => {};
  /** Nom de l'élément survolé, pour l'afficher dans l'interface. */
  surSurvol: (nom: string | null) => void = () => {};

  private readonly rendu2D: CSS2DRenderer;
  private readonly baie = new THREE.Group();
  private readonly serveur = new THREE.Group();
  private readonly examen = new THREE.Group();
  private readonly unites = new Map<THREE.Object3D, UniteBaie>();
  private ouvert: ServeurOuvert | null = null;
  private capotZ = 0;
  private readonly rayon = new THREE.Raycaster();
  private readonly pointeur = new THREE.Vector2();
  private etat: EtatInspection | null = null;
  private survole: THREE.Object3D | null = null;
  private extraction: { objet: THREE.Object3D; unite: UniteBaie; t: number } | null = null;
  private ouverture = 0;
  private transition: { de: Cadrage; vers: Cadrage; t: number } | null = null;
  private surlignage: THREE.BoxHelper | null = null;
  private dernierSurvol: string | null = null;
  private presentation: Presentation | null = null;
  /** Glisser en cours sur la pièce présentée. */
  private saisie: { x: number; y: number } | null = null;
  private repos = new Map<THREE.Object3D, THREE.Vector3>();
  private eclatement = 0;
  private eclate = false;
  private readonly legendes: CSS2DObject[] = [];
  /** Voile sombre tendu derrière la pièce présentée. */
  private readonly voile: THREE.Mesh;
  private readonly voileMat = new THREE.MeshBasicMaterial({
    color: 0x0b0f14,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  });

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly calque: HTMLElement,
    environnement: THREE.Texture | null,
  ) {
    this.rendu2D = new CSS2DRenderer({ element: calque });
    calque.style.display = 'none';

    this.scene.background = new THREE.Color(0x343c47);
    this.scene.environment = environnement;
    this.scene.environmentIntensity = 1.5;
    const ciel = new THREE.HemisphereLight(0xffffff, 0x4a525c, 2.8);
    const principale = new THREE.DirectionalLight(0xffffff, 5.5);
    principale.position.set(2.5, 5, 3.5);
    principale.castShadow = true;
    principale.shadow.mapSize.setScalar(MOBILE ? 2048 : 4096);
    const ombre = principale.shadow.camera;
    ombre.left = -2;
    ombre.right = 2;
    ombre.top = 2.6;
    ombre.bottom = -0.6;
    ombre.near = 0.5;
    ombre.far = 14;
    principale.shadow.bias = -0.0002;
    principale.shadow.normalBias = 0.004;
    const appoint = new THREE.DirectionalLight(0x9fc4ff, 2.2);
    appoint.position.set(-3, 2, -2);
    // Les lumières éclairent aussi la couche de la pièce présentée.
    for (const lumiere of [ciel, principale, appoint]) lumiere.layers.enable(COUCHE_PRESENTATION);
    this.scene.add(ciel, principale, appoint);

    const sol = new THREE.Mesh(
      new THREE.CircleGeometry(9, 64).rotateX(-Math.PI / 2),
      materiau(0x4a535f, { rugosite: 0.85, metal: 0.1 }),
    );
    sol.receiveShadow = true;
    sol.raycast = () => {};
    const grille = new THREE.GridHelper(18, 36, 0x6b7684, 0x596370);
    grille.position.y = 0.002;
    grille.raycast = () => {};
    this.scene.add(sol, grille, this.baie, this.serveur, this.examen);

    // Voile accroché à la caméra : il assombrit le serveur derrière la pièce présentée.
    this.voile = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), this.voileMat);
    this.voile.position.z = -1;
    this.voile.renderOrder = 10;
    this.voile.visible = false;
    this.voile.raycast = () => {};
    this.camera.add(this.voile);
    this.scene.add(this.camera);

    this.controles = new OrbitControls(this.camera, canvas);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controles.screenSpacePanning = true;
    this.controles.enabled = false;
    this.controles.addEventListener('start', () => {
      this.transition = null;
    });

    // Pièce présentée : on la saisit pour la tourner dans tous les sens, la molette la rapproche.
    // Doigts posés sur la pièce présentée : un doigt la fait tourner, deux la rapprochent ou l'éloignent.
    const doigts = new Map<number, { x: number; y: number }>();
    let ecart = 0;
    const distance = (): number => {
      const [a, b] = [...doigts.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    canvas.addEventListener('pointerdown', (e) => {
      const p = this.presentation;
      if (!p || p.sens !== 1 || p.t < 1 || e.button !== 0) return;
      doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (doigts.size === 2) {
        this.saisie = null;
        ecart = distance();
      } else if (doigts.size === 1) {
        this.saisie = { x: e.clientX, y: e.clientY };
      }
    });
    const lever = (e: PointerEvent): void => {
      doigts.delete(e.pointerId);
      this.saisie = null;
    };
    window.addEventListener('pointerup', lever);
    window.addEventListener('pointercancel', lever);
    window.addEventListener('pointermove', (e) => {
      const p = this.presentation;
      if (!p) return;
      if (doigts.has(e.pointerId)) doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (doigts.size === 2) {
        const d = distance();
        if (ecart > 0 && d > 0) p.zoom = THREE.MathUtils.clamp(p.zoom * (d / ecart), 0.45, 3);
        ecart = d;
        return;
      }
      if (!this.saisie) return;
      const dx = e.clientX - this.saisie.x;
      const dy = e.clientY - this.saisie.y;
      this.saisie = { x: e.clientX, y: e.clientY };
      if (dx === 0 && dy === 0) return;
      p.auto = false;
      const q = new THREE.Quaternion().setFromAxisAngle(AXE_Y, dx * 0.011);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(AXE_X, dy * 0.011));
      p.rotation.premultiply(q);
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        const p = this.presentation;
        if (!p) return;
        e.preventDefault();
        p.zoom = THREE.MathUtils.clamp(p.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 3);
      },
      { passive: false },
    );
  }

  get actif(): boolean {
    return this.etat !== null;
  }

  /** Site de la baie inspectée, `null` hors inspection. */
  get site(): SiteId | null {
    return this.etat?.site ?? null;
  }

  /** Ouvre l'inspection sur une baie. */
  ouvrir(site: SiteId, module: number, baie: RackKind): void {
    this.construireBaie(baie);
    this.montrerBaie({ site, module, baie, serveur: null, examen: null }, true);
    this.controles.enabled = true;
    this.calque.style.display = '';
  }

  /** Remonte d'un niveau : la pièce présentée retourne à sa place, le serveur à la baie, la baie au site. */
  retour(): void {
    if (!this.etat) return;
    if (this.presentation) this.remettre();
    else if (this.etat.serveur) this.montrerBaie({ ...this.etat, serveur: null }, false);
    else this.fermer();
  }

  fermer(): void {
    if (this.etat) son.fermer();
    this.etat = null;
    this.extraction = null;
    this.abandonnerPresentation();
    this.controles.enabled = false;
    this.calque.style.display = 'none';
    this.surligner(null);
    this.surSurvol(null);
    this.surNavigation(null);
  }

  redimensionner(largeur: number, hauteur: number): void {
    this.camera.aspect = largeur / hauteur;
    this.camera.fov = champVertical(40, this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.rendu2D.setSize(largeur, hauteur);
  }

  clic(clientX: number, clientY: number): void {
    if (!this.etat || this.extraction) return;
    const p = this.presentation;
    if (p) {
      // Un clic remet la pièce à sa place (un glisser, lui, la fait tourner).
      if (p.sens === 1 && p.t >= 1) this.remettre();
      return;
    }
    const touche = this.viser(clientX, clientY);
    if (this.etat.serveur) {
      const piece = touche ? this.pieceDe(touche) : null;
      if (piece) {
        this.presenter(piece);
        return;
      }
      const composant = touche ? this.composantDe(touche) : null;
      this.surligner(composant?.racine ?? null);
      this.surComposant(composant?.kind ?? null);
      return;
    }
    const unite = touche ? this.uniteDe(touche) : null;
    if (unite) {
      son.tiroir();
      this.extraction = { objet: unite.objet, unite: unite.unite, t: 0 };
    }
  }

  /** Le double-clic est précédé de deux clics, qui font déjà le nécessaire. */
  doubleClic(_clientX: number, _clientY: number): void {}

  /** Bouton « Éclater / rassembler » de la pièce présentée. */
  basculerEclatement(): void {
    if (!this.presentation?.modele) return;
    this.eclate = !this.eclate;
  }

  /** Vue de haut, pour se déplacer au-dessus de la carte mère, ou de face, pour la façade et ses ports. */
  vueServeur(vue: VueServeur): void {
    if (!this.etat?.serveur || this.presentation) return;
    this.cadrer(cadrageServeur(vue), false);
    // De face, les étiquettes des composants internes flotteraient au-dessus de la façade.
    for (const etiquette of this.ouvert?.etiquettes ?? []) etiquette.visible = vue === 'haut';
  }

  /** Soulève les dissipateurs et les range en retrait pour découvrir les processeurs, ou les repose. */
  basculerDissipateurs(): void {
    if (!this.ouvert || this.presentation) return;
    const dissipateurs = [...this.ouvert.pieces.values()].filter((p) => p.kind === 'dissipateur' || p.kind === 'asic');
    const lever = dissipateurs.some((p) => !p.sortieDemandee);
    for (const p of dissipateurs) p.sortieDemandee = lever;
    if (dissipateurs.length > 0) son.tiroir();
  }

  /** Vrai si la pièce présentée peut s'éclater (modèle détaillé). */
  get eclatable(): boolean {
    return this.presentation?.modele != null;
  }

  /** Met à jour le survol et renvoie vrai si le pointeur est sur un élément cliquable. */
  survol(clientX: number, clientY: number): boolean {
    if (!this.etat || this.extraction) return false;
    let nom: string | null = null;
    if (this.presentation) {
      nom = this.presentation.t >= 1 ? 'Glisser : tourner la pièce · Molette : zoomer · Clic : la remettre en place' : null;
    } else if (this.etat.serveur) {
      const touche = this.viser(clientX, clientY);
      const piece = touche ? this.pieceDe(touche) : null;
      const kind = piece?.kind ?? (touche ? this.composantDe(touche)?.kind : undefined);
      if (kind) nom = `${COMPOSANTS[kind].nom}${piece ? ' · clic : la sortir et la regarder' : ''}`;
    } else {
      const touche = this.viser(clientX, clientY);
      const unite = touche ? this.uniteDe(touche) : null;
      this.survole = unite?.objet ?? null;
      nom = unite ? `${libelleUnite(unite.unite)} · ${unite.unite.nom}` : null;
    }
    if (nom !== this.dernierSurvol) {
      this.dernierSurvol = nom;
      this.surSurvol(nom);
    }
    return nom !== null && this.presentation === null;
  }

  maj(dt: number, t: number, renderer: THREE.WebGLRenderer): void {
    // Au survol, l'unité avance légèrement hors de la baie.
    for (const objet of this.unites.keys()) {
      const cible = objet === this.survole && !this.extraction ? 0.07 : 0;
      if (this.extraction?.objet !== objet) objet.position.z = amortir(objet.position.z, cible, 12, dt);
    }
    // Extraction de l'unité choisie, puis ouverture du serveur.
    if (this.extraction && this.etat) {
      const ex = this.extraction;
      ex.t = Math.min(1, ex.t + dt / 0.45);
      ex.objet.position.z = ex.t * ex.t * (3 - 2 * ex.t) * 0.45;
      if (ex.t >= 1) {
        this.extraction = null;
        ex.objet.position.z = 0;
        this.montrerServeur({ ...this.etat, serveur: `${libelleUnite(ex.unite)} · ${ex.unite.nom}` }, ex.unite);
      }
    }
    const ouvert = this.ouvert;
    if (ouvert && this.serveur.visible) {
      // Le capot se soulève puis glisse derrière le serveur : la vue de haut est dégagée.
      this.ouverture = amortir(this.ouverture, 1, 2.2, dt);
      const k = this.ouverture;
      ouvert.capot.mesh.position.y = ouvert.capot.repos + Math.min(1, k * 2) * 0.05 - Math.max(0, k * 2 - 1) * 0.05;
      ouvert.capot.mesh.position.z = this.capotZ - Math.max(0, k * 1.6 - 0.6) * (P_CHASSIS + 0.08);
      ouvert.capot.mat.opacity = 1;
      if (ouvert.conduit) ouvert.conduit.opacity = 0.5 - k * 0.38;
      for (const rotor of ouvert.rotors) rotor.rotation.z = t * 9;
      // Pièces soulevées (dissipateur au-dessus d'un processeur présenté), en douceur.
      for (const piece of ouvert.pieces.values()) {
        piece.avancee = amortir(piece.avancee, piece.sortieDemandee ? 1 : 0, 7, dt);
        const a = piece.avancee * piece.avancee * (3 - 2 * piece.avancee);
        piece.objet.position.copy(piece.repos).addScaledVector(piece.sortie, a);
      }
    }

    const tr = this.transition;
    if (tr) {
      tr.t = Math.min(1, tr.t + dt / 0.9);
      const k = tr.t * tr.t * (3 - 2 * tr.t);
      this.camera.position.lerpVectors(tr.de.position, tr.vers.position, k);
      this.controles.target.lerpVectors(tr.de.cible, tr.vers.cible, k);
      if (tr.t >= 1) this.transition = null;
    }
    if (this.controles.enabled) this.controles.update();
    this.borner();
    this.camera.updateMatrixWorld();
    this.majPresentation(dt);
    this.surlignage?.update();

    // Rendu en deux passes : la scène (voile compris), puis la pièce présentée par-dessus.
    renderer.render(this.scene, this.camera);
    if (this.presentation) {
      const fond = this.scene.background;
      renderer.autoClear = false;
      renderer.clearDepth();
      this.scene.background = null;
      this.camera.layers.set(COUCHE_PRESENTATION);
      renderer.render(this.scene, this.camera);
      this.camera.layers.set(0);
      this.scene.background = fond;
      renderer.autoClear = true;
    }
    this.rendu2D.render(this.scene, this.camera);
  }

  /** La caméra ne passe pas sous le sol ; dans le serveur, le point visé reste au-dessus du châssis. */
  private borner(): void {
    const cible = this.controles.target;
    if (this.etat?.serveur) {
      cible.x = THREE.MathUtils.clamp(cible.x, -0.4, 0.4);
      cible.y = THREE.MathUtils.clamp(cible.y, 0, 0.25);
      cible.z = THREE.MathUtils.clamp(cible.z, -0.6, 0.65);
    } else if (cible.y < 0) {
      cible.y = 0;
    }
    if (this.camera.position.y < 0.03) this.camera.position.y = 0.03;
  }

  /* ---------- Niveaux ---------- */

  private montrerBaie(etat: EtatInspection, immediat: boolean): void {
    this.etat = etat;
    this.abandonnerPresentation();
    this.baie.visible = true;
    this.serveur.visible = false;
    for (const etiquette of this.ouvert?.etiquettes ?? []) etiquette.visible = false;
    this.surligner(null);
    this.surComposant(null);
    this.controles.minDistance = 1.0;
    this.controles.maxDistance = 7;
    // Dans la baie : glisser pour tourner autour, clic droit pour se déplacer.
    this.controles.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controles.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.cadrer(
      { position: new THREE.Vector3(1.5, 1.4, 2.9), cible: new THREE.Vector3(0.05, 1.0, 0.1) },
      immediat,
    );
    this.surNavigation(etat);
  }

  private montrerServeur(etat: EtatInspection, unite: UniteBaie): void {
    this.etat = etat;
    this.vider(this.serveur);
    this.ouvert = construireServeur(unite);
    this.capotZ = this.ouvert.capot.mesh.position.z;
    this.serveur.add(this.ouvert.groupe);
    this.baie.visible = false;
    this.serveur.visible = true;
    this.survole = null;
    this.ouverture = 0;
    this.controles.minDistance = 0.15;
    this.controles.maxDistance = 1.8;
    // Vue de haut : glisser pour se déplacer au-dessus du serveur, clic droit pour tourner, molette pour zoomer.
    this.controles.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controles.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.cadrer(cadrageServeur('haut'), false);
    this.surNavigation(etat);
  }

  /** Sort la pièce de son logement et l'amène devant soi, en grand, prête à être tournée. */
  private presenter(piece: Piece): void {
    if (!this.etat || !this.ouvert) return;
    const kind = piece.kind;
    // Un processeur ne sort qu'une fois son dissipateur soulevé.
    let dissipateur: Piece | null = null;
    if (kind === 'processeur') {
      for (const autre of this.ouvert.pieces.values()) {
        if (autre.kind === 'dissipateur' && Math.abs(autre.repos.x - piece.repos.x) < 0.01 && !autre.sortieDemandee) {
          autre.sortieDemandee = true;
          dissipateur = autre;
        }
      }
    }

    piece.objet.updateWorldMatrix(true, true);
    const boitePiece = new THREE.Box3().setFromObject(piece.objet);
    const taillePiece = Math.max(...boitePiece.getSize(new THREE.Vector3()).toArray(), 0.02);
    const modele = estExaminable(kind) ? modeleExamen(kind) : null;

    // Pivot centré : le modèle détaillé, déjà centré, ou une copie recentrée de la pièce.
    const objet = new THREE.Group();
    let taille: number;
    if (modele) {
      objet.add(modele.groupe);
      taille = modele.taille;
    } else {
      const copie = piece.objet.clone();
      copie.position.set(0, 0, 0);
      copie.quaternion.identity();
      copie.scale.setScalar(1);
      copie.updateMatrixWorld(true);
      const boite = new THREE.Box3().setFromObject(copie);
      copie.position.copy(boite.getCenter(new THREE.Vector3())).negate();
      objet.add(copie);
      taille = Math.max(...boite.getSize(new THREE.Vector3()).toArray(), 0.02);
    }
    objet.traverse((o) => {
      o.castShadow = false;
      o.layers.set(COUCHE_PRESENTATION);
    });

    // Légendes du modèle détaillé, visibles une fois la pièce éclatée.
    this.repos = new Map(modele?.parties.map((p) => [p.objet, p.objet.position.clone()]) ?? []);
    for (const l of modele?.legendes ?? []) {
      const element = document.createElement('div');
      element.className = 'etiquette-composant legende-examen';
      element.textContent = l.texte;
      const etiquette = new CSS2DObject(element);
      etiquette.position.copy(l.position);
      etiquette.visible = false;
      (l.partie ?? modele?.groupe ?? objet).add(etiquette);
      this.legendes.push(etiquette);
    }

    const position = boitePiece.getCenter(new THREE.Vector3());
    const quaternion = piece.objet.getWorldQuaternion(new THREE.Quaternion());
    this.examen.add(objet);
    this.examen.visible = true;
    piece.objet.visible = false;
    son.presenter();
    this.presentation = {
      piece,
      objet,
      modele,
      taille,
      depart: { position, quaternion, echelle: taillePiece / taille },
      t: 0,
      sens: 1,
      rotation: new THREE.Quaternion(),
      tour: 0,
      auto: true,
      zoom: 1,
      dissipateur,
    };
    this.eclate = false;
    this.eclatement = 0;
    this.transition = null;
    this.controles.enabled = false;
    for (const etiquette of this.ouvert.etiquettes) etiquette.visible = false;
    this.surligner(null);
    this.surComposant(kind);
    this.etat = { ...this.etat, examen: COMPOSANTS[kind].nom };
    this.surNavigation(this.etat);
  }

  /** Renvoie la pièce présentée à sa place, dans le serveur. */
  private remettre(): void {
    const p = this.presentation;
    if (!p || p.sens === -1) return;
    p.sens = -1;
    son.remettre();
    this.eclate = false;
    this.saisie = null;
    for (const l of this.legendes) l.visible = false;
  }

  /** Vol de la pièce entre son logement et sa présentation, rotation, vue éclatée et voile. */
  private majPresentation(dt: number): void {
    const p = this.presentation;
    if (!p) return;
    p.t = THREE.MathUtils.clamp(p.t + (p.sens * dt) / DUREE_VOL, 0, 1);
    const k = p.t * p.t * (3 - 2 * p.t);
    if (p.auto && p.t >= 1) p.tour += dt * 0.45;

    // Pose d'arrivée : devant la caméra, à une taille lisible, de trois quarts.
    const cam = this.camera;
    const avant = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const arrivee = cam.position.clone().addScaledVector(avant, DISTANCE_PRESENTATION);
    const hauteurVue = 2 * DISTANCE_PRESENTATION * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // En portrait, c'est la largeur de l'écran qui limite la taille de la pièce.
    const vue = Math.min(hauteurVue, hauteurVue * cam.aspect * 0.9);
    const echelle = (vue * PART_ECRAN * p.zoom) / p.taille;
    const qArrivee = cam.quaternion
      .clone()
      .multiply(p.rotation)
      .multiply(INCLINAISON)
      .multiply(new THREE.Quaternion().setFromAxisAngle(AXE_Y, -0.6 + p.tour));

    // La pièce monte d'abord hors du châssis, puis vient vers soi.
    p.objet.position.lerpVectors(p.depart.position, arrivee, k);
    p.objet.position.y += Math.sin(Math.PI * k) * 0.06;
    p.objet.quaternion.slerpQuaternions(p.depart.quaternion, qArrivee, k);
    p.objet.scale.setScalar(THREE.MathUtils.lerp(p.depart.echelle, echelle, k));
    this.voileMat.opacity = 0.82 * k;
    this.voile.visible = k > 0.001;

    if (p.modele) {
      this.eclatement = amortir(this.eclatement, this.eclate ? 1 : 0, 4, dt);
      const e = this.eclatement * this.eclatement * (3 - 2 * this.eclatement);
      for (const partie of p.modele.parties) {
        const repos = this.repos.get(partie.objet);
        if (repos) partie.objet.position.copy(repos).addScaledVector(partie.ecart, e);
      }
      for (const l of this.legendes) l.visible = p.t >= 1 && this.eclatement > 0.7;
    }

    if (p.sens === -1 && p.t <= 0) this.finirPresentation();
  }

  /** La pièce a regagné son logement : on retrouve le serveur ouvert. */
  private finirPresentation(): void {
    const p = this.presentation;
    if (!p || !this.etat) return;
    this.abandonnerPresentation();
    this.controles.enabled = true;
    this.surComposant(null);
    this.etat = { ...this.etat, examen: null };
    this.surNavigation(this.etat);
  }

  /** Retire la pièce présentée et remet tout en place, sans animation. */
  private abandonnerPresentation(): void {
    const p = this.presentation;
    if (p) {
      p.piece.objet.visible = true;
      if (p.dissipateur) p.dissipateur.sortieDemandee = false;
    }
    this.presentation = null;
    this.saisie = null;
    this.vider(this.examen);
    for (const l of this.legendes) l.element.remove();
    this.legendes.length = 0;
    this.examen.visible = false;
    this.voile.visible = false;
    this.voileMat.opacity = 0;
    if (this.etat?.serveur) for (const etiquette of this.ouvert?.etiquettes ?? []) etiquette.visible = true;
  }

  private cadrer(vers: Cadrage, immediat: boolean): void {
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

  /* ---------- Construction de la baie ---------- */

  private construireBaie(kind: RackKind): void {
    this.vider(this.baie);
    this.unites.clear();
    const L = L_BAIE;
    const P = P_BAIE;
    const ossature = materiau(0x2e343c, { rugosite: 0.45, metal: 0.6 });
    const flanc = materiau(0x3a414b, { rugosite: 0.5, metal: 0.5 });
    const chrome = materiau(0xc9ced4, { rugosite: 0.25, metal: 0.9 });
    const structure = new THREE.Group();

    // Socle sur vérins, toit avec ventilation et passe-câbles.
    structure.add(boite(L, 0.05, P, ossature, 0, 0.03, 0));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) structure.add(cylindre(0.028, 0.03, chrome, sx * (L / 2 - 0.06), 0, sz * (P / 2 - 0.08), 12));
    }
    structure.add(boite(L, 0.04, P, ossature, 0, H_BAIE - 0.04, 0));
    const sombre = materiau(0x101215, { rugosite: 0.6, metal: 0.4 });
    for (const z of [0.2, -0.05]) {
      structure.add(cylindre(0.1, 0.006, sombre, 0, H_BAIE, z, 28));
      const couronne = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 8, 28), chrome);
      couronne.rotation.x = Math.PI / 2;
      couronne.position.set(0, H_BAIE + 0.006, z);
      structure.add(couronne);
    }
    structure.add(boite(0.36, 0.012, 0.09, sombre, 0, H_BAIE, -0.36));

    // Flancs pleins et montants perforés, à l'avant comme à l'arrière.
    for (const sx of [-1, 1]) {
      structure.add(boite(0.012, H_BAIE - 0.12, P - 0.02, flanc, (sx * (L - 0.012)) / 2, 0.08, 0));
    }
    const hMontant = 42 * U;
    const matMontant = materiau(0xffffff, {
      rugosite: 0.4,
      metal: 0.7,
      map: repeter(textureMontant(), 1, 42),
    });
    for (const sx of [-1, 1]) {
      for (const z of [P / 2 - 0.06, -P / 2 + 0.1]) {
        structure.add(boite(0.03, hMontant, 0.03, matMontant, sx * 0.255, Y_BAS, z));
      }
    }

    // Portes en tôle perforée : celle de devant est ouverte, celle de derrière fermée.
    const matPerfore = new THREE.MeshStandardMaterial({
      map: repeter(texturePerforee(), 22, 74),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.6,
    });
    const porte = (): THREE.Group => {
      const vantail = new THREE.Group();
      const tole = panneau(L - 0.07, H_BAIE - 0.2, matPerfore, L / 2, 1.0, 0);
      tole.raycast = () => {};
      vantail.add(tole);
      for (const x of [0.02, L - 0.02]) vantail.add(boite(0.04, H_BAIE - 0.12, 0.022, ossature, x, 0.08, 0));
      for (const y of [0.08, H_BAIE - 0.1]) vantail.add(boite(L, 0.06, 0.022, ossature, L / 2, y, 0));
      vantail.add(boite(0.02, 0.2, 0.03, chrome, L - 0.035, 0.95, 0.02));
      vantail.traverse((objet) => {
        objet.raycast = () => {};
      });
      return vantail;
    };
    const avant = porte();
    avant.position.set(-L / 2, 0, P / 2);
    avant.rotation.y = -1.95;
    const arriere = porte();
    arriere.position.set(L / 2, 0, -P / 2);
    arriere.rotation.y = Math.PI;
    structure.add(avant, arriere);

    // Deux bandeaux de prises, un par voie électrique.
    const prises = texturePrises();
    const zPrises = -P / 2 + 0.055;
    for (const sx of [-1, 1]) {
      const matPrises = new THREE.MeshStandardMaterial({
        map: repeter(prises.map.clone(), 1, 24),
        emissiveMap: repeter(prises.emissive.clone(), 1, 24),
        emissive: 0xffffff,
        emissiveIntensity: 2,
        roughness: 0.6,
        metalness: 0.3,
      });
      structure.add(boite(0.05, 1.7, 0.045, matPrises, sx * 0.215, 0.18, zPrises));
    }
    structure.traverse((objet) => {
      objet.raycast = () => {};
    });
    this.baie.add(structure);

    // Châssis, du haut vers le bas.
    const corps = materiau(0x2a2f37, { rugosite: 0.4, metal: 0.7 });
    const oreille = materiau(0x525a66, { rugosite: 0.4, metal: 0.7 });
    const zChassis = P / 2 - 0.075 - P_CHASSIS / 2;
    const zDos = zChassis - P_CHASSIS / 2;
    const zFace = zChassis + P_CHASSIS / 2;
    const noir = materiau(0x111214, { rugosite: 0.7 });
    const cordonBleu = materiau(0x2f7fff, { rugosite: 0.6 });
    const cordonJaune = materiau(0xffc93d, { rugosite: 0.6 });
    const cablage = new THREE.Group();
    let ySwitch: number | null = null;
    let y = Y_BAS + 42 * U;
    for (const unite of CONTENU_BAIE[kind]) {
      const h = unite.u * U;
      y -= h;
      const groupe = new THREE.Group();
      const face = matFacade(unite);
      // Ordre des faces d'une boîte : +x, -x, +y, -y, +z, -z.
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(L_CHASSIS, h - 0.003, P_CHASSIS), [
        corps,
        corps,
        corps,
        corps,
        face,
        corps,
      ]);
      chassis.position.set(0, h / 2, zChassis);
      chassis.castShadow = true;
      chassis.receiveShadow = true;
      groupe.add(chassis);
      // Oreilles de fixation et poignées d'extraction.
      for (const sx of [-1, 1]) {
        groupe.add(boite(0.035, h - 0.004, 0.004, oreille, sx * 0.24, 0.002, zFace));
        groupe.add(boite(0.01, h * 0.55, 0.024, chrome, sx * 0.24, h * 0.22, zFace + 0.012));
      }
      groupe.position.y = y;
      this.unites.set(groupe, unite);
      this.baie.add(groupe);

      // Câblage arrière : deux alimentations, une par voie, et deux liens réseau vers les switchs.
      const yc = y + h / 2;
      cable(cablage, [[0.15, yc, zDos], [0.17, yc, zDos - 0.05], [0.2, yc + 0.01, zPrises + 0.03]], noir, 0.005);
      cable(cablage, [[-0.17, yc, zDos], [-0.19, yc, zDos - 0.05], [-0.205, yc + 0.01, zPrises + 0.03]], noir, 0.005);
      if (unite.type === 'reseau' && ySwitch === null) {
        ySwitch = yc;
      } else {
        const yCible = ySwitch ?? H_BAIE - 0.06;
        const xToron = -0.1;
        const zToron = zDos - 0.085;
        [cordonBleu, cordonJaune].forEach((mat, i) => {
          const dx = i * 0.012;
          cable(
            cablage,
            [
              [-0.04 + i * 0.03, yc, zDos],
              [-0.06 + dx, yc, zDos - 0.05],
              [xToron + dx, yc + 0.04, zToron],
              [xToron + dx, yCible - 0.04, zToron],
              [-0.05 + i * 0.03, yCible, ySwitch === null ? zDos - 0.085 : zDos],
            ],
            mat,
            0.0035,
          );
        });
      }
      // Espace d'aération entre deux châssis.
      y -= U * ECART_U;
    }
    this.baie.add(cablage);

    // Panneaux obturateurs sur les emplacements libres.
    const obturateur = materiau(0x23272e, { rugosite: 0.5, metal: 0.6 });
    while (y - Y_BAS > 2 * U) {
      y -= 2 * U;
      const panneauPlein = boite(0.5, 2 * U - 0.003, 0.006, obturateur, 0, y, zFace);
      panneauPlein.raycast = () => {};
      this.baie.add(panneauPlein);
    }
  }

  /* ---------- Outils ---------- */

  private vider(groupe: THREE.Group): void {
    for (const enfant of [...groupe.children]) {
      groupe.remove(enfant);
      if (enfant instanceof CSS2DObject) enfant.element.remove();
    }
  }

  private viser(clientX: number, clientY: number): THREE.Object3D | null {
    const cadre = this.canvas.getBoundingClientRect();
    this.pointeur.set(
      ((clientX - cadre.left) / cadre.width) * 2 - 1,
      -((clientY - cadre.top) / cadre.height) * 2 + 1,
    );
    this.rayon.setFromCamera(this.pointeur, this.camera);
    const racine = this.etat?.examen ? this.examen : this.etat?.serveur ? this.serveur : this.baie;
    return this.rayon.intersectObject(racine, true)[0]?.object ?? null;
  }

  private uniteDe(objet: THREE.Object3D): { objet: THREE.Object3D; unite: UniteBaie } | null {
    for (let courant: THREE.Object3D | null = objet; courant; courant = courant.parent) {
      const unite = this.unites.get(courant);
      if (unite) return { objet: courant, unite };
    }
    return null;
  }

  private pieceDe(objet: THREE.Object3D): Piece | null {
    for (let courant: THREE.Object3D | null = objet; courant; courant = courant.parent) {
      const piece = this.ouvert?.pieces.get(courant);
      if (piece) return piece;
    }
    return null;
  }

  private composantDe(objet: THREE.Object3D): { racine: THREE.Object3D; kind: ComposantKind } | null {
    for (let courant: THREE.Object3D | null = objet; courant; courant = courant.parent) {
      const kind = this.ouvert?.composants.get(courant);
      if (kind) return { racine: courant, kind };
    }
    return null;
  }

  private surligner(objet: THREE.Object3D | null): void {
    if (this.surlignage) {
      this.scene.remove(this.surlignage);
      this.surlignage.dispose();
      this.surlignage = null;
    }
    if (!objet) return;
    this.surlignage = new THREE.BoxHelper(objet, 0x22d3ee);
    this.surlignage.raycast = () => {};
    this.scene.add(this.surlignage);
  }
}
