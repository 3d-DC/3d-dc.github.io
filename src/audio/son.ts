import { SITE_IDS, SON_DEFAUT, type ReglagesSon, type SiteId } from '../types';

/**
 * Son entièrement synthétisé (Web Audio) : aucun fichier audio, comme pour la géométrie.
 *
 * - Ambiances : vent dehors, ventilation des serveurs dans une salle (le dehors s'assourdit sous un toit).
 * - Sources spatialisées par site : salle des serveurs, groupe électrogène, poste de livraison, sirène de sinistre.
 * - Démonstration incendie : bips de la centrale, puis souffle du gaz.
 * - Bruitages ponctuels : clics, ouverture d'une baie, tiroir d'un serveur, pièce qui se présente ou se range, pas.
 *
 * Le navigateur n'autorise le son qu'après un geste de l'utilisateur : `demarrer` est appelé au premier clic ou à la
 * première touche ; avant cela, toutes les méthodes sont sans effet.
 */

type Vec = { readonly x: number; readonly y: number; readonly z: number };

/** Positions des sources sonores d'un site (repère monde). */
export interface SourcesSite {
  readonly salle: Vec;
  readonly groupe: Vec;
  readonly poste: Vec;
  readonly alarme: Vec;
}

export interface EtatSonore {
  readonly t: number;
  readonly ecoute: { readonly position: Vec; readonly avant: Vec; readonly haut: Vec };
  /** 0 = dehors, 1 = dans une salle (à pied sous un toit, ou devant une baie ouverte). */
  readonly dedans: number;
  /** Charge des serveurs de la salle où l'on se trouve (0 à 1). */
  readonly chargeIci: number;
  readonly sites: Record<
    SiteId,
    {
      readonly sources: SourcesSite;
      /** Charge des serveurs (0 à 1), nulle si le site n'est pas alimenté. */
      readonly charge: number;
      readonly groupe: boolean;
      readonly secteur: boolean;
      readonly sinistre: boolean;
    }
  >;
  /**
   * Phase de la démonstration incendie, `null` hors de ce circuit : 0 pré-alarme, 1 alarme, 2 temporisation,
   * 3 émission, 4 maintien, 5 retour à la normale.
   */
  readonly incendie: number | null;
}

interface SourcesAudio {
  readonly salle: GainNode;
  readonly groupe: GainNode;
  readonly poste: GainNode;
  readonly sirene: GainNode;
  readonly panners: readonly { readonly panner: PannerNode; readonly cle: keyof SourcesSite }[];
}

interface Graphe {
  readonly ctx: AudioContext;
  readonly maitre: GainNode;
  readonly effets: GainNode;
  /** Sources extérieures : assourdies sous un toit. */
  readonly assourdi: BiquadFilterNode;
  readonly vent: GainNode;
  readonly ventilation: GainNode;
  readonly bips: GainNode;
  readonly gaz: GainNode;
  readonly sites: Record<SiteId, SourcesAudio>;
  readonly bruits: { readonly blanc: AudioBuffer; readonly rose: AudioBuffer; readonly brun: AudioBuffer };
}

const DUREE_BRUIT = 4;

function bruits(ctx: AudioContext): Graphe['bruits'] {
  const n = Math.round(ctx.sampleRate * DUREE_BRUIT);
  const creer = (remplir: (d: Float32Array) => void): AudioBuffer => {
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    remplir(b.getChannelData(0));
    return b;
  };
  const blanc = creer((d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  // Bruit rose (filtre de Paul Kellet) : plus doux, proche d'un souffle de ventilation.
  const rose = creer((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  });
  // Bruit brun : grondement sourd.
  const brun = creer((d) => {
    let dernier = 0;
    for (let i = 0; i < d.length; i++) {
      dernier = (dernier + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = dernier * 3.5;
    }
  });
  return { blanc, rose, brun };
}

export class Son {
  private g: Graphe | null = null;
  private reglages: ReglagesSon = { ...SON_DEFAUT };
  private dedans = 0;
  /** Suspension différée du contexte, le temps que le volume retombe sans claquement. */
  private suspension: number | null = null;

  constructor() {
    // Onglet en arrière-plan : le contexte audio est suspendu (plus aucun son, plus de calcul).
    document.addEventListener('visibilitychange', () => this.appliquerVolume());
  }

  /** Crée le graphe audio au premier geste de l'utilisateur, puis le relance s'il a été suspendu. */
  demarrer(): void {
    if (this.g) {
      this.appliquerVolume();
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    try {
      this.g = this.construire(new AudioContext());
      this.appliquerVolume();
    } catch {
      this.g = null;
    }
  }

  get actif(): boolean {
    return this.g !== null;
  }

  /** Vrai quand rien ne doit sortir : son coupé, volume nul ou onglet masqué. */
  get silencieux(): boolean {
    return this.reglages.coupe || this.reglages.volume <= 0 || document.hidden;
  }

  regler(reglages: ReglagesSon): void {
    this.reglages = { ...reglages };
    this.appliquerVolume();
  }

  /**
   * Son coupé : le volume général retombe en 0,1 s, puis le contexte audio est suspendu, ce qui garantit
   * un silence total (ambiances et sources comprises). Son rétabli : le contexte reprend, puis le volume remonte.
   */
  private appliquerVolume(): void {
    const g = this.g;
    if (!g) return;
    if (this.suspension !== null) {
      window.clearTimeout(this.suspension);
      this.suspension = null;
    }
    const maintenant = g.ctx.currentTime;
    g.maitre.gain.cancelScheduledValues(maintenant);
    g.maitre.gain.setValueAtTime(g.maitre.gain.value, maintenant);
    if (this.silencieux) {
      g.maitre.gain.setTargetAtTime(0, maintenant, 0.03);
      this.suspension = window.setTimeout(() => {
        this.suspension = null;
        if (this.silencieux && g.ctx.state === 'running') void g.ctx.suspend();
      }, 150);
      return;
    }
    const v = this.reglages.volume;
    const monter = (): void => {
      g.maitre.gain.setTargetAtTime(v * v * 0.9, g.ctx.currentTime, 0.05);
    };
    if (g.ctx.state === 'running') monter();
    else void g.ctx.resume().then(monter);
  }

  /* ---------- Construction ---------- */

  private construire(ctx: AudioContext): Graphe {
    const b = bruits(ctx);
    const maitre = ctx.createGain();
    maitre.gain.value = 0;
    const compresseur = ctx.createDynamicsCompressor();
    compresseur.threshold.value = -18;
    compresseur.ratio.value = 4;
    maitre.connect(compresseur).connect(ctx.destination);

    const effets = ctx.createGain();
    effets.connect(maitre);
    const assourdi = ctx.createBiquadFilter();
    assourdi.type = 'lowpass';
    assourdi.frequency.value = 18000;
    assourdi.connect(maitre);

    const gain = (valeur: number, vers: AudioNode | AudioParam): GainNode => {
      const n = ctx.createGain();
      n.gain.value = valeur;
      if (vers instanceof AudioParam) n.connect(vers);
      else n.connect(vers);
      return n;
    };
    const filtre = (type: BiquadFilterType, frequence: number, q: number, vers: AudioNode): BiquadFilterNode => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequence;
      f.Q.value = q;
      f.connect(vers);
      return f;
    };
    const boucle = (buffer: AudioBuffer, vers: AudioNode): void => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.connect(vers);
      s.start(0, Math.random() * DUREE_BRUIT);
    };
    const oscillateur = (type: OscillatorType, frequence: number, vers: AudioNode): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = frequence;
      o.connect(vers);
      o.start();
      return o;
    };
    /** Modulation lente d'un paramètre (souffle du vent, battement d'un moteur, sirène). */
    const moduler = (param: AudioParam, frequence: number, profondeur: number): void => {
      oscillateur('sine', frequence, gain(profondeur, param));
    };

    // Vent : souffle rose, filtré, qui va et vient.
    const vent = gain(0, assourdi);
    const filtreVent = filtre('bandpass', 520, 0.6, vent);
    moduler(filtreVent.frequency, 0.07, 180);
    boucle(b.rose, filtreVent);

    // Ventilation d'une salle : souffle des ventilateurs, grondement de la clim et léger sifflement.
    const ventilation = gain(0, maitre);
    boucle(b.rose, filtre('bandpass', 950, 0.5, gain(0.9, ventilation)));
    boucle(b.brun, filtre('lowpass', 260, 0.7, gain(0.8, ventilation)));
    oscillateur('sine', 3150, gain(0.012, ventilation));
    oscillateur('sine', 120, gain(0.05, ventilation));

    // Démonstration incendie : bips de la centrale, souffle du gaz inerte.
    const bips = gain(0, effets);
    oscillateur('square', 960, filtre('lowpass', 2500, 0.7, bips));
    const gaz = gain(0, effets);
    boucle(b.blanc, filtre('highpass', 2200, 0.5, gaz));

    const sources = (): SourcesAudio => {
      const panners: { panner: PannerNode; cle: keyof SourcesSite }[] = [];
      const spatial = (cle: keyof SourcesSite, reference: number): PannerNode => {
        const p = ctx.createPanner();
        p.panningModel = 'equalpower';
        p.distanceModel = 'inverse';
        p.refDistance = reference;
        p.maxDistance = 500;
        p.rolloffFactor = 1.2;
        p.connect(assourdi);
        panners.push({ panner: p, cle });
        return p;
      };
      // Salle : grondement des serveurs, entendu à travers les parois.
      const salle = gain(0, spatial('salle', 5));
      boucle(b.brun, filtre('lowpass', 420, 0.7, salle));
      oscillateur('sine', 118, gain(0.08, salle));
      // Groupe électrogène : moteur diesel au ralenti, avec son battement.
      const groupe = gain(0, spatial('groupe', 3.5));
      const battement = gain(0.65, groupe);
      moduler(battement.gain, 11, 0.3);
      const moteur = filtre('lowpass', 240, 1.2, battement);
      oscillateur('sawtooth', 31, gain(0.5, moteur));
      oscillateur('square', 62, gain(0.18, moteur));
      boucle(b.brun, filtre('lowpass', 160, 0.7, gain(0.6, groupe)));
      // Poste de livraison : ronflement du transformateur (100 Hz et harmonique).
      const poste = gain(0, spatial('poste', 2.5));
      oscillateur('sine', 100, gain(0.5, poste));
      oscillateur('sine', 200, gain(0.18, poste));
      // Sirène de sinistre : montée et descente, audible de loin.
      const sirene = gain(0, spatial('alarme', 12));
      const voix = oscillateur('sawtooth', 760, filtre('bandpass', 950, 1.1, sirene));
      moduler(voix.frequency, 0.55, 260);
      return { salle, groupe, poste, sirene, panners };
    };
    const sites = { DC1: sources(), DC2: sources() } satisfies Record<SiteId, SourcesAudio>;

    return { ctx, maitre, effets, assourdi, vent, ventilation, bips, gaz, sites, bruits: b };
  }

  /* ---------- Mise à jour à chaque image ---------- */

  maj(dt: number, e: EtatSonore): void {
    const g = this.g;
    if (!g) return;
    const ctx = g.ctx;
    const now = ctx.currentTime;
    const viser = (param: AudioParam, valeur: number, lissage = 0.15): void => {
      param.setTargetAtTime(valeur, now, lissage);
    };

    // Auditeur : la caméra.
    const l = ctx.listener;
    const { position: p, avant: a, haut: h } = e.ecoute;
    if (l.positionX) {
      viser(l.positionX, p.x, 0.03);
      viser(l.positionY, p.y, 0.03);
      viser(l.positionZ, p.z, 0.03);
      viser(l.forwardX, a.x, 0.03);
      viser(l.forwardY, a.y, 0.03);
      viser(l.forwardZ, a.z, 0.03);
      viser(l.upX, h.x, 0.03);
      viser(l.upY, h.y, 0.03);
      viser(l.upZ, h.z, 0.03);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(a.x, a.y, a.z, h.x, h.y, h.z);
    }

    this.dedans += (e.dedans - this.dedans) * (1 - Math.exp(-3 * dt));
    const d = this.dedans;
    // Sous un toit, le dehors s'assourdit ; la ventilation de la salle prend le dessus.
    viser(g.assourdi.frequency, 18000 * Math.pow(900 / 18000, d), 0.2);
    viser(g.vent.gain, 0.22 * (1 - d));
    viser(g.ventilation.gain, 0.42 * d * (0.35 + 0.65 * e.chargeIci));

    for (const id of SITE_IDS) {
      const s = e.sites[id];
      const a2 = g.sites[id];
      for (const { panner, cle } of a2.panners) {
        const v = s.sources[cle];
        viser(panner.positionX, v.x, 0.02);
        viser(panner.positionY, v.y, 0.02);
        viser(panner.positionZ, v.z, 0.02);
      }
      viser(a2.salle.gain, s.charge > 0 ? 0.25 + 0.45 * s.charge : 0, 0.6);
      viser(a2.groupe.gain, s.groupe ? 0.9 : 0, 0.8);
      viser(a2.poste.gain, s.secteur ? 0.22 : 0, 0.3);
      viser(a2.sirene.gain, s.sinistre ? 0.32 : 0, 0.3);
    }

    // Incendie : bip espacé en pré-alarme, alarme rapide pendant l'alarme et la temporisation,
    // puis souffle puissant du gaz pendant l'émission et léger pendant le maintien.
    const ph = e.incendie;
    const bip =
      ph === 0 ? (e.t * 0.5) % 1 < 0.06 : ph === 1 || ph === 2 ? (e.t * 2.4) % 1 < 0.45 : ph === 3 ? (e.t * 1.2) % 1 < 0.3 : false;
    viser(g.bips.gain, bip ? 0.07 : 0, 0.008);
    viser(g.gaz.gain, ph === 3 ? 0.3 : ph === 4 ? 0.04 : 0, 0.4);
  }

  /* ---------- Bruitages ponctuels ---------- */

  /** Bouffée de bruit filtré dont la fréquence glisse de `f0` à `f1`. */
  private souffle(o: {
    duree: number;
    type: BiquadFilterType;
    f0: number;
    f1: number;
    q: number;
    volume: number;
    bruit?: 'blanc' | 'rose' | 'brun';
    attaque?: number;
    decalage?: number;
  }): void {
    const g = this.g;
    if (!g || this.silencieux) return;
    const ctx = g.ctx;
    const t0 = ctx.currentTime + (o.decalage ?? 0);
    const s = ctx.createBufferSource();
    s.buffer = g.bruits[o.bruit ?? 'blanc'];
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q;
    f.frequency.setValueAtTime(o.f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.duree);
    const v = ctx.createGain();
    const attaque = o.attaque ?? 0.01;
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(o.volume, t0 + attaque);
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duree);
    s.connect(f).connect(v).connect(g.effets);
    s.start(t0, Math.random() * (DUREE_BRUIT - o.duree - 0.1));
    s.stop(t0 + o.duree + 0.05);
  }

  /** Note brève dont la hauteur glisse de `f0` à `f1`. */
  private note(o: { f0: number; f1: number; duree: number; type: OscillatorType; volume: number; decalage?: number }): void {
    const g = this.g;
    if (!g || this.silencieux) return;
    const ctx = g.ctx;
    const t0 = ctx.currentTime + (o.decalage ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f0, t0);
    osc.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.duree);
    const v = ctx.createGain();
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(o.volume, t0 + 0.004);
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duree);
    osc.connect(v).connect(g.effets);
    osc.start(t0);
    osc.stop(t0 + o.duree + 0.05);
  }

  /** Clic d'interface ou de sélection. */
  clic(): void {
    this.note({ f0: 1900, f1: 1300, duree: 0.035, type: 'triangle', volume: 0.08 });
  }

  /** Porte de baie qui s'ouvre : glissement puis butée. */
  ouvrir(): void {
    this.souffle({ duree: 0.42, type: 'bandpass', f0: 380, f1: 1300, q: 2.2, volume: 0.22 });
    this.note({ f0: 95, f1: 55, duree: 0.16, type: 'sine', volume: 0.35, decalage: 0.36 });
  }

  /** Retour au site : la porte se referme. */
  fermer(): void {
    this.souffle({ duree: 0.32, type: 'bandpass', f0: 1300, f1: 380, q: 2.2, volume: 0.2 });
    this.note({ f0: 110, f1: 60, duree: 0.14, type: 'sine', volume: 0.4, decalage: 0.28 });
  }

  /** Serveur tiré sur ses rails, ou dissipateurs soulevés. */
  tiroir(): void {
    this.souffle({ duree: 0.48, type: 'bandpass', f0: 600, f1: 1700, q: 3.5, volume: 0.18, attaque: 0.05 });
    this.note({ f0: 2400, f1: 2100, duree: 0.05, type: 'square', volume: 0.03, decalage: 0.45 });
  }

  /** Une pièce sort du serveur et vient se présenter. */
  presenter(): void {
    this.souffle({ duree: 0.7, type: 'bandpass', f0: 260, f1: 2300, q: 1.1, volume: 0.22, attaque: 0.15 });
    this.note({ f0: 420, f1: 880, duree: 0.6, type: 'sine', volume: 0.035 });
  }

  /** La pièce retourne à sa place et s'enclenche. */
  remettre(): void {
    this.souffle({ duree: 0.7, type: 'bandpass', f0: 2300, f1: 260, q: 1.1, volume: 0.2, attaque: 0.1 });
    this.note({ f0: 1500, f1: 900, duree: 0.06, type: 'square', volume: 0.05, decalage: 0.72 });
  }

  /** Un pas : plancher technique à l'intérieur, gravier dehors. */
  pas(dedans: boolean): void {
    const k = 0.85 + Math.random() * 0.3;
    if (dedans) {
      this.note({ f0: 120 * k, f1: 65 * k, duree: 0.09, type: 'sine', volume: 0.3 });
      this.souffle({ duree: 0.05, type: 'highpass', f0: 2600 * k, f1: 2000 * k, q: 0.7, volume: 0.05 });
    } else {
      this.souffle({ duree: 0.16, type: 'bandpass', f0: 1900 * k, f1: 1200 * k, q: 0.9, volume: 0.16, attaque: 0.006 });
    }
  }
}

/** Son de l'application (un seul contexte audio). */
export const son = new Son();
