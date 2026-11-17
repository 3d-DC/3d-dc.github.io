import type { ComposantKind, ComposantSpec, Marque, RackKind, TypeChassis, UniteBaie } from './types';

interface Serie {
  readonly prefixe: string;
  readonly nombre: number;
  readonly type: TypeChassis;
  readonly u: UniteBaie['u'];
  readonly marque: Marque;
  readonly modele: string;
  /** Numéro du premier équipement de la série (1 par défaut). */
  readonly debut?: number;
}

function serie(s: Serie): UniteBaie[] {
  const debut = s.debut ?? 1;
  return Array.from({ length: s.nombre }, (_, i) => ({
    nom: `${s.prefixe} ${String(debut + i).padStart(2, '0')}`,
    type: s.type,
    u: s.u,
    marque: s.marque,
    modele: s.modele,
  }));
}

/**
 * Contenu de chaque baie, du haut vers le bas. Les modèles cités sont des références
 * courantes du marché, choisies pour l'illustration : ils ne constituent pas un dimensionnement.
 */
export const CONTENU_BAIE: Record<RackKind, readonly UniteBaie[]> = {
  'rack-calcul': [
    ...serie({ prefixe: 'Switch de baie', nombre: 2, type: 'reseau', u: 1, marque: 'Cisco', modele: 'Nexus 93180YC-FX' }),
    ...serie({ prefixe: 'Serveur GPU', nombre: 2, type: 'gpu', u: 2, marque: 'Dell', modele: 'PowerEdge R760xa' }),
    ...serie({ prefixe: 'Serveur de calcul', nombre: 4, type: 'calcul', u: 2, marque: 'HPE', modele: 'ProLiant DL380 Gen11' }),
    ...serie({ prefixe: 'Serveur de calcul', nombre: 3, type: 'calcul', u: 2, marque: 'Dell', modele: 'PowerEdge R760', debut: 5 }),
  ],
  'rack-stockage': [
    ...serie({ prefixe: 'Switch de stockage', nombre: 2, type: 'reseau', u: 1, marque: 'Cisco', modele: 'Nexus 93180YC-FX' }),
    ...serie({ prefixe: 'Serveur de stockage', nombre: 4, type: 'stockage', u: 2, marque: 'Dell', modele: 'PowerEdge R760xd2' }),
    ...serie({ prefixe: 'Serveur de stockage', nombre: 4, type: 'stockage', u: 2, marque: 'HPE', modele: 'ProLiant DL380 Gen11 LFF', debut: 5 }),
  ],
  'rack-sauvegarde': [
    ...serie({ prefixe: 'Switch de baie', nombre: 1, type: 'reseau', u: 1, marque: 'Cisco', modele: 'Catalyst 9300-48P' }),
    ...serie({ prefixe: 'Serveur de sauvegarde', nombre: 2, type: 'calcul', u: 2, marque: 'HPE', modele: 'ProLiant DL380 Gen11' }),
    ...serie({ prefixe: 'Baie de disques', nombre: 4, type: 'stockage', u: 2, marque: 'Dell', modele: 'PowerVault ME5024' }),
  ],
  'rack-reseau': [
    ...serie({ prefixe: 'Routeur', nombre: 2, type: 'reseau', u: 2, marque: 'Cisco', modele: 'ISR 4451' }),
    ...serie({ prefixe: 'Switch de cœur', nombre: 2, type: 'reseau', u: 1, marque: 'Cisco', modele: 'Nexus 9336C-FX2' }),
    ...serie({ prefixe: 'Switch d’accès', nombre: 5, type: 'reseau', u: 1, marque: 'Cisco', modele: 'Catalyst 9300-48P' }),
    ...serie({ prefixe: 'Switch d’administration', nombre: 1, type: 'reseau', u: 1, marque: 'Cisco', modele: 'Catalyst 2960-24TT' }),
  ],
  'rack-securite': [
    ...serie({ prefixe: 'Firewall périmétrique', nombre: 2, type: 'pare-feu', u: 2, marque: 'Fortinet', modele: 'FortiGate 1800F' }),
    ...serie({ prefixe: 'Firewall interne', nombre: 2, type: 'pare-feu', u: 1, marque: 'Fortinet', modele: 'FortiGate 600F' }),
    ...serie({ prefixe: 'Serveur de sécurité', nombre: 3, type: 'calcul', u: 1, marque: 'Dell', modele: 'PowerEdge R660' }),
    ...serie({ prefixe: 'Switch de baie', nombre: 1, type: 'reseau', u: 1, marque: 'Cisco', modele: 'Catalyst 9300-48P' }),
  ],
  'rack-supervision': [
    ...serie({ prefixe: 'Switch de baie', nombre: 1, type: 'reseau', u: 1, marque: 'Cisco', modele: 'Catalyst 9300-48P' }),
    ...serie({ prefixe: 'Serveur de supervision', nombre: 4, type: 'calcul', u: 1, marque: 'HPE', modele: 'ProLiant DL360 Gen11' }),
    ...serie({ prefixe: 'Enregistreur vidéo', nombre: 1, type: 'stockage', u: 2, marque: 'Dell', modele: 'PowerEdge R760xd2' }),
  ],
};

/** Libellé court d'un équipement : marque et modèle. */
export function libelleUnite(unite: UniteBaie): string {
  return `${unite.marque} ${unite.modele}`;
}

/** Composition d'une baie, regroupée par modèle : « 5 × HPE ProLiant DL380 Gen11 ». */
export function compositionBaie(kind: RackKind): string[] {
  const comptes = new Map<string, number>();
  for (const unite of CONTENU_BAIE[kind]) {
    const cle = libelleUnite(unite);
    comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
  }
  return [...comptes].map(([libelle, nombre]) => `${nombre} × ${libelle}`);
}

/** Marques présentes dans une baie, dans l'ordre d'apparition. */
export function marquesBaie(kind: RackKind): Marque[] {
  return [...new Set(CONTENU_BAIE[kind].map((unite) => unite.marque))];
}

export interface ArchitectureChassis {
  readonly processeurs: number;
  /** Barrettes mémoire par processeur. */
  readonly barrettes: number;
  /** Disques accessibles en façade (colonnes × rangées). */
  readonly disques: readonly [colonnes: number, rangees: number];
  readonly ventilateurs: number;
  /** Ports réseau en façade (équipements réseau et firewalls). */
  readonly ports: number;
  readonly asic: boolean;
  readonly controleur: boolean;
  readonly carteReseau: boolean;
  /** Cartes graphiques (accélérateurs) installées à l'avant du châssis. */
  readonly gpus: number;
}

export const ARCHITECTURE: Record<TypeChassis, ArchitectureChassis> = {
  calcul: { processeurs: 2, barrettes: 8, disques: [8, 1], ventilateurs: 6, ports: 0, asic: false, controleur: true, carteReseau: true, gpus: 0 },
  gpu: { processeurs: 2, barrettes: 8, disques: [8, 1], ventilateurs: 6, ports: 0, asic: false, controleur: true, carteReseau: true, gpus: 4 },
  stockage: { processeurs: 1, barrettes: 6, disques: [4, 3], ventilateurs: 5, ports: 0, asic: false, controleur: true, carteReseau: true, gpus: 0 },
  reseau: { processeurs: 1, barrettes: 2, disques: [0, 0], ventilateurs: 4, ports: 24, asic: true, controleur: false, carteReseau: false, gpus: 0 },
  'pare-feu': { processeurs: 1, barrettes: 4, disques: [2, 1], ventilateurs: 4, ports: 12, asic: true, controleur: false, carteReseau: false, gpus: 0 },
};

export const NOM_CHASSIS: Record<TypeChassis, string> = {
  calcul: 'Serveur à deux processeurs',
  gpu: 'Serveur à cartes graphiques',
  stockage: 'Serveur à forte capacité disque',
  reseau: 'Équipement de commutation',
  'pare-feu': 'Boîtier de sécurité réseau',
};

/** Fiches des composants internes. Les valeurs chiffrées sont des ordres de grandeur courants. */
export const COMPOSANTS: Record<ComposantKind, ComposantSpec> = {
  chassis: {
    nom: 'Châssis',
    role: 'Boîtier métallique au format baie 19 pouces qui porte et protège tous les composants.',
    caracteristiques: ['Monté sur glissières pour la maintenance', 'Hauteur comptée en unités (1 U = 44,45 mm)'],
  },
  'carte-mere': {
    nom: 'Carte mère',
    role: 'Circuit principal sur lequel se connectent processeurs, mémoire, stockage et cartes d’extension.',
    caracteristiques: ['Relie tous les composants entre eux', 'Intègre un contrôleur de gestion à distance'],
  },
  processeur: {
    nom: 'Processeur',
    role: 'Exécute les calculs. C’est lui qui fait tourner les machines virtuelles.',
    caracteristiques: [
      'Plusieurs dizaines de cœurs, répartis sur plusieurs puces de silicium (chiplets)',
      'Capot métallique (IHS) qui répartit la chaleur vers le dissipateur',
      'Posé sans soudure sur un support à contacts (LGA) de la carte mère',
      'Cliquez dessus : son dissipateur se soulève et il vient se présenter, à tourner dans tous les sens',
    ],
  },
  dissipateur: {
    nom: 'Dissipateur du processeur',
    role: 'Évacue la chaleur du processeur vers le flux d’air des ventilateurs.',
    caracteristiques: [
      'Semelle en cuivre au contact du processeur, avec pâte thermique',
      'Caloducs et ailettes en aluminium',
      'Fixé par quatre vis imperdables',
      'Cliquez dessus pour le sortir et le regarder ; ses ailettes évacuent la chaleur du processeur',
    ],
  },
  gpu: {
    nom: 'Carte graphique NVIDIA A100',
    role: 'Accélérateur de calcul pour l’intelligence artificielle et le calcul scientifique.',
    caracteristiques: [
      'Puce GA100 : environ 54 milliards de transistors',
      '40 ou 80 Go de mémoire HBM2e empilée au plus près de la puce',
      'Refroidissement passif : l’air des ventilateurs du serveur traverse son radiateur',
      'Bus PCIe 4.0 x16, pont NVLink entre cartes voisines',
    ],
  },
  memoire: {
    nom: 'Barrettes de mémoire (RAM)',
    role: 'Mémoire de travail : chaque machine virtuelle en réserve une part.',
    caracteristiques: ['Barrettes réparties de part et d’autre de chaque processeur', 'Mémoire à correction d’erreurs (ECC)'],
  },
  disque: {
    nom: 'Disques',
    role: 'Stockent le système et les données ; remplaçables à chaud depuis la façade.',
    caracteristiques: ['SSD ou disques durs en tiroirs extractibles', 'Regroupés en grappe pour tolérer une panne'],
  },
  alimentation: {
    nom: 'Blocs d’alimentation',
    role: 'Convertissent le courant de la baie pour les composants.',
    caracteristiques: ['Deux blocs : l’un suffit si l’autre tombe', 'Chaque bloc est relié à une voie électrique distincte'],
  },
  ventilateur: {
    nom: 'Ventilateurs',
    role: 'Aspirent l’air de l’allée froide en façade et le rejettent dans l’allée chaude à l’arrière.',
    caracteristiques: ['Remplaçables à chaud', 'Vitesse régulée selon la température'],
  },
  'carte-reseau': {
    nom: 'Carte réseau',
    role: 'Relie le serveur aux switchs de la baie.',
    caracteristiques: ['Plusieurs ports à haut débit', 'Liens doublés vers deux switchs différents'],
  },
  controleur: {
    nom: 'Contrôleur de stockage',
    role: 'Pilote les disques et gère leur regroupement en grappe.',
    caracteristiques: ['Reconstruit les données quand un disque est remplacé'],
  },
  asic: {
    nom: 'Puce de commutation (ASIC)',
    role: 'Puce spécialisée qui traite et aiguille les paquets réseau à très haut débit.',
    caracteristiques: ['Dédiée au traitement des flux', 'Refroidie par un large dissipateur'],
  },
  ports: {
    nom: 'Ports réseau',
    role: 'Reçoivent les câbles cuivre ou les modules optiques des liaisons.',
    caracteristiques: ['Cages alignées en façade', 'Fibre optique pour les liaisons longues'],
  },
};
