import * as THREE from 'three';

/** Hauteur des yeux du visiteur au-dessus du sol. */
const HAUTEUR_YEUX = 1.62;
const VITESSE_MARCHE = 1.7;
const VITESSE_COURSE = 3.6;
/** Vitesse de rotation au clavier, en radians par seconde. */
const VITESSE_ROTATION = 1.9;
/** Sensibilité de la souris, souris capturée ou glisser. */
const SENSIBILITE_LIBRE = 0.0022;
const SENSIBILITE_GLISSER = 0.0042;
/** Réactivité de l'accélération et du freinage (plus grand = plus vif). */
const REACTIVITE = 9;
const INCLINAISON_MAX = 1.35;
/** Décalages latéraux sondés quand le pas est bloqué, pour trouver une porte ou un passage voisin. */
const DECALAGES = [0.08, -0.08, 0.16, -0.16, 0.25, -0.25, 0.35, -0.35, 0.45, -0.45] as const;

/** Touches reconnues par position physique : ZQSD en AZERTY et WASD en QWERTY tombent au même endroit. */
const AVANCER = new Set(['KeyW', 'ArrowUp']);
const RECULER = new Set(['KeyS', 'ArrowDown']);
const GAUCHE = new Set(['KeyA']);
const DROITE = new Set(['KeyD']);
const TOURNER_GAUCHE = new Set(['ArrowLeft']);
const TOURNER_DROITE = new Set(['ArrowRight']);
const COURIR = new Set(['ShiftLeft', 'ShiftRight']);
const TOUTES = new Set([...AVANCER, ...RECULER, ...GAUCHE, ...DROITE, ...TOURNER_GAUCHE, ...TOURNER_DROITE, ...COURIR]);

/**
 * Visite à pied, à la première personne : un clic capture la souris pour regarder
 * librement, le clavier déplace avec accélération et freinage, et les collisions comme les dénivelés
 * (escalier, étage) sont délégués à `surface`.
 */
export class Promenade {
  /** Échap, une fois la souris libérée : fin de la visite. */
  surSortie: () => void = () => {};
  /** Touche E ou Entrée : ouvrir l'équipement visé. */
  surAction: () => void = () => {};
  /** La souris vient d'être capturée (`true`) ou libérée (`false`). */
  surRegard: (libre: boolean) => void = () => {};
  /** Un pas vient d'être fait (pour le son). */
  surPas: () => void = () => {};

  private actif = false;
  private cap = 0;
  private inclinaison = 0;
  private sol = 0;
  /** Position des pieds du visiteur (x, z) : la caméra s'en déduit selon la vue. */
  private readonly pied = new THREE.Vector2();
  private yeux = 0;
  /** Distance parcourue depuis le dernier pas. */
  private foulee = 0;
  private readonly vitesse = new THREE.Vector2();
  private readonly touches = new Set<string>();
  private glisser: { x: number; y: number } | null = null;
  private capturee = false;
  /** Le clic qui capture la souris ne doit pas aussi sélectionner un équipement. */
  private clicDeCapture = false;
  /** Instant de la dernière libération, pour qu'un même Échap ne fasse pas aussi quitter la visite. */
  private liberation = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    /** Hauteur du sol atteint en (x, z) depuis un sol à `h`, ou `null` si le passage est impossible. */
    private readonly surface: (x: number, z: number, h: number) => number | null,
    /** Faux quand une autre vue (l'inspection) a la main. */
    private readonly disponible: () => boolean,
  ) {
    window.addEventListener('keydown', (e) => {
      if (!this.actif || !this.disponible()) return;
      if (e.code === 'Escape') {
        if (!this.capturee && performance.now() - this.liberation > 400) this.surSortie();
        return;
      }
      if (e.repeat) {
        if (TOUTES.has(e.code)) e.preventDefault();
        return;
      }
      if (e.code === 'KeyE' || e.code === 'Enter') {
        this.surAction();
        return;
      }
      if (!TOUTES.has(e.code)) return;
      e.preventDefault();
      this.touches.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.touches.delete(e.code));
    window.addEventListener('blur', () => this.touches.clear());

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.actif || !this.disponible() || e.button !== 0) return;
      if (!this.capturee) {
        this.clicDeCapture = true;
        this.capturer();
      }
      this.glisser = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => {
      this.glisser = null;
    });
    document.addEventListener('pointerlockchange', () => {
      const capturee = document.pointerLockElement === this.canvas;
      if (capturee === this.capturee) return;
      this.capturee = capturee;
      if (!capturee) this.liberation = performance.now();
      this.surRegard(capturee);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.actif || !this.disponible()) return;
      if (this.capturee) {
        this.tourner(e.movementX * SENSIBILITE_LIBRE, e.movementY * SENSIBILITE_LIBRE);
      } else if (this.glisser) {
        // Sans capture (navigateur qui la refuse), le regard suit le glisser.
        this.tourner((e.clientX - this.glisser.x) * SENSIBILITE_GLISSER, (e.clientY - this.glisser.y) * SENSIBILITE_GLISSER);
        this.glisser = { x: e.clientX, y: e.clientY };
      }
    });
  }

  get enCours(): boolean {
    return this.actif;
  }

  /** Vrai quand la souris est capturée : le regard suit ses mouvements, la visée est au centre. */
  get regardLibre(): boolean {
    return this.capturee;
  }

  /** À appeler au relâchement d'un clic : vrai s'il s'agissait du clic de capture, à ignorer. */
  consommerClic(): boolean {
    const capture = this.clicDeCapture;
    this.clicDeCapture = false;
    return capture;
  }

  /** `sol` est la hauteur du sol sous le point de départ. */
  demarrer(position: THREE.Vector3, cap: number, sol: number): void {
    this.actif = true;
    this.cap = cap;
    this.inclinaison = -0.05;
    this.sol = sol;
    this.yeux = sol + HAUTEUR_YEUX;
    this.pied.set(position.x, position.z);
    this.vitesse.set(0, 0);
    this.touches.clear();
    this.placerCamera();
  }

  arreter(): void {
    this.actif = false;
    this.touches.clear();
    this.glisser = null;
    this.liberer();
  }

  /** Rend la souris (avant d'ouvrir une autre vue, par exemple). */
  liberer(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /**
   * Retour d'une autre vue (inspection d'une baie) : le visiteur est toujours au même endroit.
   * La souris est recapturée si le navigateur l'accepte (le retour vient d'un clic), et un Échap
   * tapé juste après ne met pas fin à la visite.
   */
  reprendre(): void {
    if (!this.actif) return;
    this.touches.clear();
    this.glisser = null;
    this.liberation = performance.now() + 600;
    this.capturer();
  }

  maj(dt: number): void {
    if (!this.actif) return;
    const appui = (n: Set<string>): number => ([...n].some((c) => this.touches.has(c)) ? 1 : 0);

    // Rotation au clavier.
    const rotation = appui(TOURNER_GAUCHE) - appui(TOURNER_DROITE);
    if (rotation !== 0) this.cap += rotation * VITESSE_ROTATION * dt;

    // Vitesse visée dans le plan, puis accélération ou freinage progressifs.
    const av = appui(AVANCER) - appui(RECULER);
    const lat = appui(DROITE) - appui(GAUCHE);
    const cible = new THREE.Vector2();
    if (av !== 0 || lat !== 0) {
      const sin = Math.sin(this.cap);
      const cos = Math.cos(this.cap);
      // Avant : (-sin, -cos) ; droite : (cos, -sin).
      cible.set(-sin * av + cos * lat, -cos * av - sin * lat).normalize();
      cible.multiplyScalar(appui(COURIR) ? VITESSE_COURSE : VITESSE_MARCHE);
    }
    this.vitesse.lerp(cible, 1 - Math.exp(-REACTIVITE * dt));
    if (this.vitesse.lengthSq() < 1e-5) this.vitesse.set(0, 0);
    else {
      const x0 = this.pied.x;
      const z0 = this.pied.y;
      this.deplacer(this.vitesse.x * dt, this.vitesse.y * dt);
      // Un pas tous les 75 cm en marchant, un peu plus allongé en courant.
      this.foulee += Math.hypot(this.pied.x - x0, this.pied.y - z0);
      const longueur = this.vitesse.length() > VITESSE_MARCHE * 1.3 ? 1.05 : 0.75;
      if (this.foulee > longueur) {
        this.foulee = 0;
        this.surPas();
      }
    }

    // Les yeux suivent le sol avec un léger amorti, pour monter l'escalier sans à-coups.
    this.yeux += (this.sol + HAUTEUR_YEUX - this.yeux) * (1 - Math.exp(-12 * dt));
    this.placerCamera();
  }

  /** Avance d'un pas en glissant le long des obstacles et en se recentrant dans les ouvertures. */
  private deplacer(dx: number, dz: number): void {
    const p = this.pied;
    const essayer = (x: number, z: number): boolean => {
      const h = this.surface(p.x + x, p.y + z, this.sol);
      if (h === null) return false;
      p.x += x;
      p.y += z;
      this.sol = h;
      return true;
    };
    if (essayer(dx, dz)) return;
    // Glissement : on garde la composante qui passe (une composante nulle ne compte pas comme un passage).
    const glisseX = Math.abs(dx) > 1e-6 && essayer(dx, 0);
    const glisseZ = Math.abs(dz) > 1e-6 && essayer(0, dz);
    if (glisseX || glisseZ) {
      if (!glisseX) this.vitesse.x *= 0.5;
      if (!glisseZ) this.vitesse.y *= 0.5;
      return;
    }
    // Bloqué de face : on cherche une ouverture de part et d'autre (porte, passage)
    // et l'on s'y décale, ce qui recentre le visiteur dans l'axe sans qu'il ait à viser au centimètre.
    const pas = Math.hypot(dx, dz);
    const px = -dz / pas;
    const pz = dx / pas;
    for (const decalage of DECALAGES) {
      const libre = this.surface(p.x + dx + px * decalage, p.y + dz + pz * decalage, this.sol) !== null;
      if (!libre) continue;
      const glisse = Math.sign(decalage) * Math.min(Math.abs(decalage), pas);
      if (essayer(px * glisse, pz * glisse)) return;
    }
    this.vitesse.set(0, 0);
  }

  /** La caméra est dans les yeux du visiteur. */
  private placerCamera(): void {
    this.camera.position.set(this.pied.x, this.yeux, this.pied.y);
    this.camera.rotation.set(this.inclinaison, this.cap, 0, 'YXZ');
  }

  private tourner(dx: number, dy: number): void {
    this.cap -= dx;
    this.inclinaison = THREE.MathUtils.clamp(this.inclinaison - dy, -INCLINAISON_MAX, INCLINAISON_MAX);
  }

  private capturer(): void {
    try {
      const resultat: unknown = this.canvas.requestPointerLock();
      if (resultat instanceof Promise) {
        resultat.catch(() => {
          // Capture refusée : le regard se pilote au glisser.
          this.clicDeCapture = false;
        });
      }
    } catch {
      this.clicDeCapture = false;
    }
  }
}
