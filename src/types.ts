/** Types partagés par la scène, les scénarios et l'interface. */

export type SiteId = 'DC1' | 'DC2';
export const SITE_IDS: readonly SiteId[] = ['DC1', 'DC2'];

export function autreSite(id: SiteId): SiteId {
  return id === 'DC1' ? 'DC2' : 'DC1';
}

export type Famille =
  | 'Réseau'
  | 'Sécurité'
  | 'Calcul'
  | 'Stockage'
  | 'Sauvegarde'
  | 'Supervision'
  | 'Énergie'
  | 'Refroidissement'
  | 'Infrastructure'
  | 'Services';

export type EquipmentKind =
  | 'conteneur'
  | 'rack-reseau'
  | 'rack-securite'
  | 'rack-calcul'
  | 'rack-stockage'
  | 'rack-sauvegarde'
  | 'rack-supervision'
  | 'inrow'
  | 'aerorefroidisseur'
  | 'escalier'
  | 'monte-charge'
  | 'onduleur'
  | 'batteries'
  | 'tableau'
  | 'extinction'
  | 'controle-acces'
  | 'camera'
  | 'groupe'
  | 'solaire'
  | 'secteur'
  | 'cloture'
  | 'fibre'
  | 'vm'
  | 'utilisateurs';

export interface EquipmentSpec {
  readonly nom: string;
  readonly famille: Famille;
  readonly role: string;
  readonly caracteristiques: readonly string[];
  /** `null` quand la notion de redondance ne s'applique pas. */
  readonly redondance: string | null;
}

/** Référence posée sur un objet 3D cliquable. */
export interface EquipmentRef {
  readonly kind: EquipmentKind;
  /** `null` pour les éléments communs aux deux sites (fibre, utilisateurs). */
  readonly site: SiteId | null;
  /** Numéro du module (à partir de 1) pour les équipements situés dans un module. */
  readonly module?: number;
}

export type SiteRole = 'actif' | 'passif' | 'sinistre';

export interface SiteState {
  role: SiteRole;
  /** Charge informatique en pourcentage (0 à 100). */
  charge: number;
  secteur: boolean;
  /** Vrai quand l'onduleur alimente la charge sur ses batteries. */
  surBatterie: boolean;
  groupe: boolean;
  solaire: boolean;
  vmActives: number;
  vmRepliques: number;
  /** Nombre de modules posés sur la dalle. */
  modules: NombreModules;
  /** Modules séparés par des cloisons à porte, ou réunis en une seule salle. */
  assemblage: Assemblage;
  /** Modules alignés côte à côte, ou superposés par deux niveaux. */
  disposition: Disposition;
}

export type Disposition = 'horizontale' | 'etage';

export type NombreModules = 1 | 2 | 3 | 4 | 5;
export const NOMBRES_MODULES: readonly NombreModules[] = [1, 2, 3, 4, 5];

export type Assemblage = 'cloisonne' | 'fusionne';

export type LinkMode = 'repos' | 'replication' | 'synchro' | 'coupee';

export interface WorldState {
  sites: Record<SiteId, SiteState>;
  lien: { mode: LinkMode; source: SiteId };
  /** Part du trafic utilisateur dirigée vers chaque site (0 à 1). */
  trafic: Record<SiteId, number>;
}

export interface Affichage {
  /** Vue en coupe : toit et paroi avant escamotés. */
  coupe: boolean;
  /** Circuit technique animé dans les modules. */
  circuit: Circuit;
  /** Liaisons réseau et énergie entre les modules d'un site. */
  interconnexions: boolean;
  /** En étage, soulève les modules du haut pour montrer ceux du bas (vue éclatée). */
  eclatee: boolean;
  /** Repères flottants de la scène : étiquettes des sites, de la fibre et des utilisateurs. */
  reperes: boolean;
  /** Étiquettes flottantes au-dessus des équipements de la salle. */
  etiquettes: ModeEtiquettes;
}

export type Circuit = 'aucun' | 'air' | 'climatisation' | 'incendie' | 'energie';
export const CIRCUITS: readonly Circuit[] = ['aucun', 'air', 'climatisation', 'incendie', 'energie'];

/** Aucune étiquette, seulement celle de l'équipement survolé, ou toutes celles proches du point de vue. */
export type ModeEtiquettes = 'aucune' | 'survol' | 'proches';

/** Ambiance lumineuse : plein soleil, lumière adoucie ou ciel couvert (ombres légères, aucun éblouissement). */
export type Ambiance = 'soleil' | 'doux' | 'couvert';
export type Ombres = 'aucune' | 'douces' | 'nettes';

export interface Eclairage {
  ambiance: Ambiance;
  ombres: Ombres;
  /** Multiplicateur de l'exposition, de 0,5 à 1,6. */
  luminosite: number;
  /** Lampe portée par le visiteur à pied, de 0 (éteinte) à 1. */
  lampe: number;
  /** Éclaircit l'image à l'intérieur des modules et l'assombrit dehors, à la manière de l'œil. */
  adaptation: boolean;
}

export const ECLAIRAGE_DEFAUT: Eclairage = {
  ambiance: 'soleil',
  ombres: 'douces',
  luminosite: 1,
  lampe: 0.6,
  adaptation: true,
};

/** Réglages du son, mémorisés dans le navigateur. */
export interface ReglagesSon {
  /** Volume général, de 0 à 1. */
  volume: number;
  coupe: boolean;
}

export const SON_DEFAUT: ReglagesSon = { volume: 0.7, coupe: false };

/** Réglages d'affichage qui se commandent par une case à cocher. */
export type CleBooleenne = { [K in keyof Affichage]: Affichage[K] extends boolean ? K : never }[keyof Affichage];

export type ViewId =
  | 'ensemble'
  | 'dc1'
  | 'dc1-interieur'
  | 'dc1-energie'
  | 'dc1-modules'
  | 'dc1-salle'
  | 'dc1-toit'
  | 'dc2'
  | 'dc2-interieur'
  | 'dc2-energie'
  | 'dc2-modules'
  | 'dc2-salle'
  | 'dc2-toit'
  | 'fibre';

export type ScenarioId = 'visite' | 'actif-passif' | 'actif-actif' | 'coupure' | 'evolutivite' | 'construction';

export interface Step {
  readonly titre: string;
  readonly texte: string;
  /** Durée d'affichage en secondes avant passage automatique. */
  readonly duree: number;
  readonly vue?: ViewId;
  readonly affichage?: Partial<Affichage>;
  /** Mutation appliquée à l'état, cumulée avec celles des étapes précédentes. */
  readonly action?: (etat: WorldState) => void;
}

export interface Scenario {
  readonly id: ScenarioId;
  readonly nom: string;
  readonly resume: string;
  readonly etapes: readonly Step[];
}

/* ---------- Inspection d'une baie et de ses serveurs ---------- */

export type RackKind = Extract<EquipmentKind, `rack-${string}`>;

export function estBaie(kind: EquipmentKind): kind is RackKind {
  return kind.startsWith('rack-');
}

/** Architecture interne d'un châssis. */
export type TypeChassis = 'calcul' | 'gpu' | 'stockage' | 'reseau' | 'pare-feu';

export type Marque = 'HPE' | 'Dell' | 'Cisco' | 'Fortinet';

export interface UniteBaie {
  readonly nom: string;
  readonly type: TypeChassis;
  readonly marque: Marque;
  readonly modele: string;
  /** Hauteur en unités de baie (1 U = 44,45 mm). */
  readonly u: 1 | 2 | 4;
}

export type ComposantKind =
  | 'chassis'
  | 'carte-mere'
  | 'processeur'
  | 'memoire'
  | 'disque'
  | 'alimentation'
  | 'ventilateur'
  | 'carte-reseau'
  | 'controleur'
  | 'asic'
  | 'ports'
  | 'dissipateur'
  | 'gpu';

export interface ComposantSpec {
  readonly nom: string;
  readonly role: string;
  readonly caracteristiques: readonly string[];
}

/** Position courante dans l'inspection ; `serveur` vaut `null` au niveau de la baie. */
export interface EtatInspection {
  readonly site: SiteId;
  readonly module: number;
  readonly baie: RackKind;
  /** Libellé de l'équipement ouvert, `null` au niveau de la baie. */
  readonly serveur: string | null;
  /** Composant examiné sous tous les angles, `null` sinon. */
  readonly examen: string | null;
}
