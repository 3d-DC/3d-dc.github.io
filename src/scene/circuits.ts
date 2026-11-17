import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Circuit } from '../types';
import { CONDENSEURS, CONTENEUR, PLANCHER } from './conteneur';
import { Bouffees } from './effets';
import { Courants, type Chemin, type PointCircuit } from './flux';
import type { MaterielIncendie, ReperesIncendie } from './incendie';
import { aleatoire, amortir } from './outils';

/* ---------- Textes des circuits, partagés avec l'interface ---------- */

export type CircuitActif = Exclude<Circuit, 'aucun'>;

export const NOM_CIRCUIT: Record<Circuit, string> = {
  aucun: 'Aucun',
  air: 'Air',
  climatisation: 'Climatisation',
  incendie: 'Incendie',
  energie: 'Énergie',
};

export interface DescriptionCircuit {
  readonly titre: string;
  readonly couleur: string;
  /** Une phrase par étape ; les pastilles numérotées de la scène renvoient à ces étapes. */
  readonly etapes: readonly string[];
}

export const DESCRIPTION_CIRCUIT: Record<CircuitActif, DescriptionCircuit> = {
  air: {
    titre: 'Circulation de l’air',
    couleur: '#38bdf8',
    etapes: [
      'La clim In-Row souffle de l’air froid dans l’allée froide, fermée par son toit vitré.',
      'Les serveurs aspirent cet air frais par leur face avant.',
      'L’air réchauffé ressort à l’arrière des baies, dans l’allée chaude.',
      'La clim reprend l’air chaud, le refroidit et le renvoie dans l’allée froide.',
    ],
  },
  climatisation: {
    titre: 'Circuit de climatisation',
    couleur: '#22d3ee',
    etapes: [
      'Dans la clim In-Row, l’air chaud cède sa chaleur à un fluide.',
      'Le fluide réchauffé (en rouge) monte vers l’aérorefroidisseur posé sur le toit.',
      'Les ventilateurs rejettent la chaleur dehors ; par temps frais, c’est le freecooling.',
      'Le fluide refroidi (en bleu) redescend vers la clim, et le cycle recommence.',
    ],
  },
  incendie: {
    titre: 'Détection et extinction incendie',
    couleur: '#ef4444',
    etapes: [
      'Pré-alarme : la détection par aspiration prélève l’air en continu au plafond et repère les premières particules de fumée, bien avant une flamme.',
      'Alarme feu : un détecteur de chaque boucle confirme (double détection). Sirènes et flashs se déclenchent, l’alarme part vers la supervision.',
      'Asservissements et temporisation : la climatisation s’arrête, les clapets coupe-feu se ferment ; 30 s pour évacuer. L’arrêt d’urgence près de la porte peut encore suspendre l’émission.',
      'Émission : les bouteilles libèrent le gaz inerte (IG-541) par les diffuseurs ; le clapet de surpression s’ouvre pour protéger les parois ; dehors, « Gaz émis, ne pas entrer » s’allume.',
      'Extinction et maintien : l’oxygène tombe vers 12,5 % et le feu s’étouffe, sans eau ni résidu ; la concentration est tenue une dizaine de minutes.',
      'Retour à la normale : après la levée de doute, la salle est ventilée, la centrale réarmée et les bouteilles rechargées.',
    ],
  },
  energie: {
    titre: 'Chemin de l’énergie',
    couleur: '#facc15',
    etapes: [
      'Le courant arrive par le poste (réseau public), le groupe électrogène ou le solaire, puis la gaine principale.',
      'Le TGBT le distribue et bascule automatiquement d’une source à l’autre.',
      'Les onduleurs fournissent un courant secouru ; les batteries (en orange) prennent le relais en cas de coupure.',
      'Chaque baie est alimentée par deux voies, au-dessus des rangées.',
    ],
  },
};

/** Durée d'un cycle de la démonstration incendie, en secondes. */
export const CYCLE_INCENDIE = 30;
/** Début de chaque phase après la première : alarme, temporisation, émission, maintien, retour à la normale. */
const BORNES_INCENDIE = [4, 8, 15, 20, 26] as const;

/** Étape courante de la démonstration incendie (0 à 5), qui correspond aux étapes de l'explication. */
export type PhaseIncendie = 0 | 1 | 2 | 3 | 4 | 5;

/** Ce que la centrale affiche à un instant de la démonstration (valeurs réelles, temps de la démo accéléré). */
export interface EtatIncendie {
  readonly phase: PhaseIncendie;
  /** Avancement dans la phase (0 à 1). */
  readonly avancee: number;
  readonly centrale: string;
  /** Temporisation avant émission, en secondes. */
  readonly temporisation: number;
  /** Concentration de gaz inerte dans la salle, en pourcentage du volume. */
  readonly concentration: number;
  readonly oxygene: number;
  readonly climatisation: string;
  readonly clapetsCoupeFeu: string;
  readonly clapetSurpression: string;
  readonly supervision: string;
}

const LIBELLE_PHASE: Record<PhaseIncendie, string> = {
  0: 'PRÉ-ALARME',
  1: 'ALARME FEU',
  2: 'TEMPORISATION',
  3: 'ÉMISSION DU GAZ',
  4: 'MAINTIEN',
  5: 'RÉARMEMENT',
};

/** Concentration de conception pour l'IG-541 et oxygène résiduel correspondant. */
const CONCENTRATION_CIBLE = 40;
const OXYGENE_AIR = 20.9;
const OXYGENE_MAINTIEN = 12.5;

export function etatIncendie(t: number): EtatIncendie {
  const k = ((t % CYCLE_INCENDIE) + CYCLE_INCENDIE) % CYCLE_INCENDIE;
  const bornes = [0, ...BORNES_INCENDIE, CYCLE_INCENDIE];
  let phase = 0;
  while (phase < 5 && k >= (bornes[phase + 1] ?? CYCLE_INCENDIE)) phase++;
  const debut = bornes[phase] ?? 0;
  const fin = bornes[phase + 1] ?? CYCLE_INCENDIE;
  const avancee = (k - debut) / (fin - debut);
  const ph = phase as PhaseIncendie;
  const concentration =
    ph < 3 ? 0 : ph === 3 ? CONCENTRATION_CIBLE * avancee : ph === 4 ? CONCENTRATION_CIBLE : CONCENTRATION_CIBLE * (1 - avancee);
  const asservi = ph >= 1 && ph <= 4;
  return {
    phase: ph,
    avancee,
    centrale: LIBELLE_PHASE[ph],
    temporisation: ph < 2 ? 30 : ph === 2 ? Math.ceil(30 * (1 - avancee)) : 0,
    concentration,
    oxygene: OXYGENE_AIR - ((OXYGENE_AIR - OXYGENE_MAINTIEN) * concentration) / CONCENTRATION_CIBLE,
    climatisation: asservi ? 'arrêtée' : 'en marche',
    clapetsCoupeFeu: asservi ? 'fermés' : 'ouverts',
    clapetSurpression: ph === 3 ? 'ouvert' : 'fermé',
    supervision: ph === 0 ? 'pré-alarme transmise' : ph === 5 ? 'fin d’alarme' : 'alarme transmise',
  };
}

/** Étape courante de la démonstration incendie (0 à 5). */
export function phaseIncendie(t: number): PhaseIncendie {
  return etatIncendie(t).phase;
}

/* ---------- Points des chemins ---------- */

function point(x: number, y: number, z: number, c: number): PointCircuit {
  return { p: new THREE.Vector3(x, y, z), c };
}

/** Pastille numérotée qui renvoie à une étape du panneau d'explication. */
export function pastille(numero: number, couleur: string, position: THREE.Vector3): CSS2DObject {
  const element = document.createElement('div');
  element.className = 'pastille-etape';
  element.style.setProperty('--accent', couleur);
  element.textContent = String(numero);
  const objet = new CSS2DObject(element);
  objet.position.copy(position);
  return objet;
}

/* ---------- Circuits d'un module ---------- */

/** Disposition de la salle utile aux circuits (repère du module). */
export interface GeometrieSalle {
  /** Climatisations In-Row : x, centre de la rangée en z, et côté de l'allée froide (+1 ou -1). */
  readonly inrows: readonly { readonly x: number; readonly z: number; readonly face: 1 | -1 }[];
  /** Abscisses des baies de chaque rangée. */
  readonly baies: readonly number[];
  /** Demi-largeur de l'allée froide et profondeur des baies. */
  readonly demiAllee: number;
  readonly profondeurBaie: number;
  readonly tableau: THREE.Vector3;
  readonly onduleurs: readonly THREE.Vector3[];
  readonly batteries: THREE.Vector3;
  /** Repères du système incendie (réseau d'aspiration, collecteur, diffuseurs, commandes…). */
  readonly incendie: ReperesIncendie;
  /** Point de départ du feu simulé. */
  readonly foyer: THREE.Vector3;
}

export interface CircuitModule {
  readonly groupe: THREE.Group;
  readonly pastilles: CSS2DObject[];
  maj(dt: number, t: number): void;
  /** Remet le circuit dans son état de veille quand il n'est plus affiché. */
  repos?: () => void;
}

const FROID = 0x38bdf8;
const CHAUD = 0xef4444;

function circuitAir(g: GeometrieSalle): CircuitModule {
  const groupe = new THREE.Group();
  const chemins: Chemin[] = [];
  const yBas = PLANCHER + 0.75;
  const yHaut = PLANCHER + 1.55;
  const a = g.demiAllee;
  const p = g.profondeurBaie;
  const zChaude = a + p + 0.35;
  for (const ir of g.inrows) {
    // Côté de l'allée froide vu depuis la rangée : la rangée est en z = ir.z, l'allée en z = 0.
    const s = Math.sign(ir.z);
    const voisines = [...g.baies].sort((u, v) => Math.abs(u - ir.x) - Math.abs(v - ir.x)).slice(0, 2);
    voisines.forEach((xb, i) => {
      const dy = i * 0.25;
      chemins.push({
        points: [
          point(ir.x, yBas + dy, s * a, FROID),
          point(ir.x + (xb - ir.x) * 0.3, yBas + dy, s * 0.22, FROID),
          point(xb, yBas + 0.2 + dy, s * 0.22, FROID),
          point(xb, yBas + 0.25 + dy, s * (a + 0.02), FROID),
          point(xb, yBas + 0.35 + dy, s * (a + p - 0.02), CHAUD),
          point(xb, yHaut + dy, s * zChaude, CHAUD),
          point(ir.x, yHaut + dy, s * zChaude, CHAUD),
          point(ir.x, yHaut - 0.3 + dy, s * (a + p - 0.05), CHAUD),
          point(ir.x, yBas + dy, s * a, FROID),
        ],
      });
    });
  }
  // Courants d'air larges et translucides : on suit l'air froid jusqu'aux faces avant, puis l'air chaud qui revient.
  const air = new Courants(chemins, { rayon: 0.075, vitesse: 1.0, pas: 0.75, fond: 0.32, coude: 0.22 });
  groupe.add(air.mesh);

  // Étapes : sur la première clim de la rangée du fond.
  const ref = g.inrows.find((ir) => ir.z < 0) ?? g.inrows[0];
  const pastilles: CSS2DObject[] = [];
  if (ref) {
    const s = Math.sign(ref.z);
    const xb = g.baies.reduce((m, x) => (Math.abs(x - ref.x) < Math.abs(m - ref.x) ? x : m), g.baies[0] ?? 0);
    const couleur = DESCRIPTION_CIRCUIT.air.couleur;
    pastilles.push(
      pastille(1, couleur, new THREE.Vector3(ref.x, yBas + 0.5, s * (a - 0.1))),
      pastille(2, couleur, new THREE.Vector3(xb, yBas + 0.9, s * (a - 0.15))),
      pastille(3, '#ef4444', new THREE.Vector3(xb, yHaut + 0.45, s * zChaude)),
      pastille(4, '#ef4444', new THREE.Vector3(ref.x, yHaut + 0.45, s * (a + p))),
    );
  }
  for (const p2 of pastilles) groupe.add(p2);
  return { groupe, pastilles, maj: (_dt, t) => air.maj(t) };
}

function circuitClim(g: GeometrieSalle): CircuitModule {
  const groupe = new THREE.Group();
  const chemins: Chemin[] = [];
  const { H } = CONTENEUR;
  const yPlafond = H - 0.22;
  for (const ir of g.inrows) {
    const cond = CONDENSEURS.find((c) => Math.sign(c.z) === Math.sign(ir.z)) ?? CONDENSEURS[0];
    if (!cond) continue;
    const haut = PLANCHER + 2.0;
    const yCond = H + 0.45;
    const aller = [
      new THREE.Vector3(ir.x, haut, ir.z),
      new THREE.Vector3(ir.x, yPlafond, ir.z),
      new THREE.Vector3(cond.x - 0.15, yPlafond, ir.z),
      new THREE.Vector3(cond.x - 0.15, yPlafond, cond.z),
      new THREE.Vector3(cond.x - 0.15, yCond, cond.z),
    ];
    const retour = aller.map((v) => v.clone().add(new THREE.Vector3(0.14, -0.1, 0.1))).reverse();
    // Le fluide chaud monte vers l'aérorefroidisseur, le fluide refroidi redescend : deux canalisations parcourues en continu.
    chemins.push({ points: aller.map((v) => ({ p: v, c: CHAUD })) }, { points: retour.map((v) => ({ p: v, c: FROID })) });
  }
  const fluide = new Courants(chemins, { rayon: 0.045, vitesse: 0.9, pas: 0.6, fond: 0.6, coude: 0.12 });
  groupe.add(fluide.mesh);

  const pastilles: CSS2DObject[] = [];
  const ref = g.inrows.find((ir) => ir.z < 0);
  const cond = CONDENSEURS.find((c) => c.z < 0);
  if (ref && cond) {
    const couleur = DESCRIPTION_CIRCUIT.climatisation.couleur;
    pastilles.push(
      pastille(1, couleur, new THREE.Vector3(ref.x, PLANCHER + 1.4, ref.z + 0.6)),
      pastille(2, '#ef4444', new THREE.Vector3((ref.x + cond.x) / 2, H - 0.05, ref.z)),
      pastille(3, couleur, new THREE.Vector3(cond.x, H + 1.35, cond.z)),
      pastille(4, '#38bdf8', new THREE.Vector3(cond.x + 0.4, H - 0.4, cond.z + 0.4)),
    );
  }
  for (const p of pastilles) groupe.add(p);
  return { groupe, pastilles, maj: (_dt, t) => fluide.maj(t) };
}

function circuitIncendie(g: GeometrieSalle, m: MaterielIncendie): CircuitModule {
  const groupe = new THREE.Group();
  const r = g.incendie;
  const { yReseau, zReseau } = r;

  // Air prélevé par la détection par aspiration : il remonte le réseau jusqu'à l'unité d'analyse.
  const prelevement = new Courants([{ points: r.aspiration.map((p) => ({ p, c: 0xcbd5e1 })) }], {
    rayon: 0.03,
    vitesse: 1.6,
    pas: 0.5,
    fond: 0.2,
    coude: 0.06,
  });
  groupe.add(prelevement.mesh);

  // Gaz : du collecteur des bouteilles, par la montée et le réseau, jusqu'à chaque diffuseur.
  const c = r.collecteur;
  const gaz = new Courants(
    r.diffuseurs.map((d) => ({
      points: [
        point(c.x, c.y, c.z, 0xffffff),
        point(c.x, yReseau, c.z, 0xffffff),
        point(c.x, yReseau, zReseau, 0xffffff),
        point(d.x, yReseau, zReseau, 0xe2e8f0),
        point(d.x, d.y - 0.1, d.z, 0xcbd5e1),
      ],
    })),
    { rayon: 0.06, vitesse: 3.2, pas: 0.7, fond: 0.35, coude: 0.1 },
  );
  groupe.add(gaz.mesh);

  // Nuage de gaz qui envahit la salle depuis les diffuseurs.
  const rnd = aleatoire(77);
  const graines = Array.from({ length: 80 }, () => ({
    d: r.diffuseurs[Math.floor(rnd() * r.diffuseurs.length)] ?? c,
    dir: new THREE.Vector3(rnd() - 0.5, -0.4 - rnd() * 0.8, (rnd() - 0.5) * 1.6).normalize(),
    v: 0.6 + rnd() * 0.8,
  }));
  const matNuage = new THREE.MeshBasicMaterial({ color: 0xe8eef5, transparent: true, opacity: 0, depthWrite: false });
  const nuage = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), matNuage, graines.length);
  nuage.raycast = () => {};
  nuage.frustumCulled = false;
  groupe.add(nuage);

  // Départ de feu dans une baie : fumée et lueur.
  const fumee = new Bouffees(8, 0x4b5563, 0.18, 1.7);
  fumee.groupe.position.copy(g.foyer);
  groupe.add(fumee.groupe);
  const lueur = new THREE.PointLight(0xff5a1f, 0, 3, 2);
  lueur.position.copy(g.foyer);
  groupe.add(lueur);

  const couleur = DESCRIPTION_CIRCUIT.incendie.couleur;
  const pastilles = [
    pastille(1, couleur, r.uniteAspiration.clone().add(new THREE.Vector3(0, 0.45, 0.2))),
    pastille(2, couleur, new THREE.Vector3(g.foyer.x, CONTENEUR.H - 0.3, g.foyer.z)),
    pastille(3, couleur, r.commandes.clone().add(new THREE.Vector3(0.25, 0.1, 0))),
    pastille(4, couleur, new THREE.Vector3(r.diffuseurs[1]?.x ?? 0, yReseau + 0.3, zReseau)),
    pastille(5, '#f59e0b', new THREE.Vector3(g.foyer.x, PLANCHER + 1.1, g.foyer.z + 0.9)),
    pastille(6, '#22c55e', r.clapet.clone().add(new THREE.Vector3(0, 0.45, -0.1))),
  ];
  for (const p of pastilles) groupe.add(p);

  const matrice = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const ech = new THREE.Vector3();
  let ouverture = 0;

  const VERT = 0x22c55e;
  const ROUGE = 0xff2a2a;
  const AMBRE = 0xffa31a;
  const allumer = (mat: THREE.MeshStandardMaterial, couleur: number, intensite: number): void => {
    mat.emissive.setHex(couleur);
    mat.emissiveIntensity = intensite;
  };

  /** Veille : voyants verts, alarmes éteintes, clapet fermé. */
  const repos = (): void => {
    allumer(m.boucleA, VERT, 1);
    allumer(m.boucleB, VERT, 1);
    allumer(m.aspiration, VERT, 1.2);
    allumer(m.feu, ROUGE, 0.05);
    allumer(m.extinction, AMBRE, 0.05);
    allumer(m.flashs, ROUGE, 0.05);
    m.evacuation.emissiveIntensity = 0.08;
    m.gazEmis.emissiveIntensity = 0.08;
    ouverture = 0;
    for (const lame of m.lames) lame.rotation.x = 0;
  };

  return {
    groupe,
    pastilles,
    repos,
    maj: (dt, t) => {
      const e = etatIncendie(t);
      const { phase, avancee } = e;
      const clignote = Math.sin(t * 12) > 0;
      const strobe = (t * 2.2) % 1 < 0.12;

      // Détection : l'aspiration voit la fumée la première (pré-alarme), puis chaque boucle confirme.
      allumer(m.aspiration, phase === 0 ? AMBRE : phase === 5 ? VERT : ROUGE, phase === 0 ? (clignote ? 2.5 : 0.4) : phase === 5 ? 1.2 : 2.2);
      const boucleAEnAlarme = phase >= 1 && phase <= 4;
      const boucleBEnAlarme = (phase === 1 && avancee > 0.5) || (phase >= 2 && phase <= 4);
      allumer(m.boucleA, boucleAEnAlarme ? ROUGE : VERT, boucleAEnAlarme ? (phase === 1 && clignote ? 3 : 2) : 1);
      allumer(m.boucleB, boucleBEnAlarme ? ROUGE : VERT, boucleBEnAlarme ? 2 : 1);

      // Centrale : feu dès l'alarme, extinction clignotante pendant la temporisation puis fixe.
      allumer(m.feu, ROUGE, boucleAEnAlarme ? (phase === 1 && !clignote ? 0.6 : 3) : 0.05);
      allumer(m.extinction, AMBRE, phase === 2 ? (clignote ? 3 : 0.4) : phase === 3 || phase === 4 ? 3 : 0.05);

      // Signalisation : flashs pendant l'alarme et l'émission, panneaux extérieurs.
      allumer(m.flashs, ROUGE, phase >= 1 && phase <= 3 ? (strobe ? 6 : 0.1) : phase === 4 ? ((t * 0.8) % 1 < 0.1 ? 4 : 0.1) : 0.05);
      m.evacuation.emissiveIntensity = phase === 1 || phase === 2 ? (clignote ? 2.4 : 0.6) : phase === 3 || phase === 4 ? 2 : 0.08;
      m.gazEmis.emissiveIntensity = phase === 3 ? (clignote ? 2.6 : 0.8) : phase === 4 ? 2.4 : 0.08;

      // Clapet de surpression : il s'ouvre pendant l'émission pour évacuer la surpression, puis se referme.
      ouverture = amortir(ouverture, phase === 3 ? 1 : 0, 3, dt);
      for (const lame of m.lames) lame.rotation.x = -ouverture * 1.05;

      // Fumée et flamme jusqu'à l'extinction.
      fumee.maj(dt, t, phase <= 3);
      lueur.intensity = phase <= 2 ? 1.5 + Math.sin(t * 17) * 0.6 : phase === 3 ? (1 - avancee) * 1.5 : 0;

      prelevement.mesh.visible = phase <= 4;
      prelevement.maj(t, phase <= 1 ? 1 : 0.35);

      gaz.mesh.visible = phase === 3;
      if (phase === 3) gaz.maj(t);

      // Le nuage grossit pendant l'émission, se maintient, puis se dissipe à la ventilation.
      const portee = phase === 3 ? avancee : phase === 4 ? 1 : phase === 5 ? 1 : 0;
      const densite = phase === 3 ? 0.24 * avancee + 0.04 : phase === 4 ? 0.26 : phase === 5 ? 0.26 * (1 - avancee) : 0;
      matNuage.opacity = densite;
      nuage.visible = densite > 0.01;
      if (nuage.visible) {
        graines.forEach((gr, i) => {
          const rayon = gr.v * portee * 1.8;
          pos.copy(gr.d).addScaledVector(gr.dir, rayon);
          pos.y = Math.max(PLANCHER + 0.2, pos.y);
          ech.setScalar(0.6 + portee * 1.6);
          matrice.compose(pos, quat, ech);
          nuage.setMatrixAt(i, matrice);
        });
        nuage.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

function circuitEnergie(g: GeometrieSalle): CircuitModule {
  const groupe = new THREE.Group();
  const { L } = CONTENEUR;
  const y = PLANCHER + 2.42;
  const JAUNE = 0xffc400;
  const ORANGE = 0xff7a00;
  const [o1, o2] = g.onduleurs;
  const chemins: Chemin[] = [];
  const zEntree = g.tableau.z + 0.2;
  const xAllee = g.baies[0] ?? -3.3;
  const xFin = g.baies[g.baies.length - 1] ?? -1.5;
  if (o1 && o2) {
    // Arrivée par le pignon droit, passage par le TGBT puis par chaque onduleur, et départ vers une rangée.
    for (const [o, zRangee] of [
      [o1, -(g.demiAllee + g.profondeurBaie / 2)],
      [o2, g.demiAllee + g.profondeurBaie / 2],
    ] as const) {
      chemins.push({
        points: [
          point(L / 2 - 0.1, y, zEntree, JAUNE),
          point(g.tableau.x, y, zEntree, JAUNE),
          point(g.tableau.x, g.tableau.y + 0.1, g.tableau.z, JAUNE),
          point(g.tableau.x, y, g.tableau.z, JAUNE),
          point(o.x, y, o.z, JAUNE),
          point(o.x, o.y + 0.1, o.z, JAUNE),
          point(o.x, y, o.z, JAUNE),
          point(o.x, y, zRangee, JAUNE),
          point(xFin, y, zRangee, JAUNE),
          point(xAllee - 0.3, y, zRangee, JAUNE),
        ],
      });
    }
    // Batteries ↔ onduleurs : réserve d'énergie.
    chemins.push({
      points: [
        point(g.batteries.x, g.batteries.y + 0.1, g.batteries.z, ORANGE),
        point(g.batteries.x, y, g.batteries.z, ORANGE),
        point(o2.x, y, g.batteries.z, ORANGE),
        point(o2.x, y, o2.z, ORANGE),
        point(o2.x, o2.y + 0.1, o2.z, ORANGE),
      ],
    });
  }
  const courant = new Courants(chemins, { rayon: 0.045, vitesse: 1.3, pas: 0.8, fond: 0.5, coude: 0.12 });
  groupe.add(courant.mesh);
  const couleur = DESCRIPTION_CIRCUIT.energie.couleur;
  const pastilles: CSS2DObject[] = [pastille(2, couleur, new THREE.Vector3(g.tableau.x, g.tableau.y + 0.75, g.tableau.z))];
  if (o1) pastilles.push(pastille(3, couleur, new THREE.Vector3(o1.x, o1.y + 0.75, o1.z)));
  pastilles.push(pastille(4, couleur, new THREE.Vector3((xAllee + xFin) / 2, y + 0.45, -(g.demiAllee + g.profondeurBaie / 2))));
  for (const p of pastilles) groupe.add(p);
  return { groupe, pastilles, maj: (_dt, t) => courant.maj(t) };
}

/** Construit les quatre circuits d'un module ; seul celui choisi est affiché. */
export function creerCircuits(g: GeometrieSalle, incendie: MaterielIncendie): Record<CircuitActif, CircuitModule> {
  const circuits: Record<CircuitActif, CircuitModule> = {
    air: circuitAir(g),
    climatisation: circuitClim(g),
    incendie: circuitIncendie(g, incendie),
    energie: circuitEnergie(g),
  };
  for (const c of Object.values(circuits)) c.groupe.visible = false;
  circuits.incendie.repos?.();
  return circuits;
}

/** Arrivée de l'énergie, du poste de livraison jusqu'au pignon d'un module (repère du site). */
export function cheminArrivee(points: readonly THREE.Vector3[]): Courants {
  return new Courants([{ points: points.map((p) => ({ p, c: 0xffc400 })) }], { rayon: 0.07, vitesse: 2.2, pas: 1.4, fond: 0.5, coude: 0.3 });
}
