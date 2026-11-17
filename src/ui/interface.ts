import { COMPOSANTS, compositionBaie } from '../baies';
import { CATALOGUE, COULEUR_FAMILLE, NOM_VUE } from '../catalog';
import { DESCRIPTION_CIRCUIT, NOM_CIRCUIT, type EtatIncendie } from '../scene/circuits';
import { MOBILE } from '../scene/outils';
import type { Lecture } from '../scenarios/lecteur';
import {
  CIRCUITS,
  estBaie,
  NOMBRES_MODULES,
  SITE_IDS,
  type Affichage,
  type Ambiance,
  type Assemblage,
  type Circuit,
  type CleBooleenne,
  type ComposantKind,
  type Disposition,
  type Eclairage,
  type EquipmentRef,
  type EtatInspection,
  type Famille,
  type ModeEtiquettes,
  type NombreModules,
  type Ombres,
  type RackKind,
  type ReglagesSon,
  type Scenario,
  type SiteId,
  type SiteRole,
  type ViewId,
  type WorldState,
} from '../types';

export interface Actions {
  scenario(scenario: Scenario): void;
  vue(vue: ViewId): void;
  affichage(cle: CleBooleenne, valeur: boolean): void;
  etiquettes(mode: ModeEtiquettes): void;
  circuit(circuit: Circuit): void;
  /** Côte à côte ou en étage, sur les deux sites. */
  disposer(disposition: Disposition): void;
  /** L'interface vient d'être masquée ou réaffichée (la caméra recentre l'image). */
  menu(visible: boolean): void;
  precedent(): void;
  suivant(): void;
  pause(): void;
  arreter(): void;
  /** Ouvre la vue rapprochée d'une baie. */
  inspecter(site: SiteId, module: number, baie: RackKind): void;
  /** Remonte d'un niveau dans l'inspection. */
  retourInspection(): void;
  /** Revient directement au site. */
  quitterInspection(): void;
  /** Serveur ouvert : vue de haut ou de face. */
  vueServeur(vue: 'haut' | 'face'): void;
  /** Éclate ou rassemble la pièce présentée. */
  eclaterComposant(): void;
  /** Soulève ou repose les dissipateurs du serveur ouvert. */
  dissipateurs(): void;
  /** Fixe le nombre de modules d'un site. */
  construire(site: SiteId, modules: NombreModules): void;
  /** Cloisonne ou réunit les modules, sur les deux sites. */
  assembler(mode: Assemblage): void;
  promenade(site: SiteId): void;
  /** Visite à pied directement à l'intérieur d'un module (bouton « Entrer » de la fiche). */
  entrerModule(site: SiteId, module: number): void;
  /** Vue à la première personne, à l'endroit regardé. */
  premierePersonne(): void;
  /** Modifie une partie des réglages de lumière. */
  eclairage(modif: Partial<Eclairage>): void;
  /** Modifie le volume ou coupe le son. */
  son(modif: Partial<ReglagesSon>): void;
  quitterPromenade(): void;
  /** Joystick tactile de la visite : `x` vers la droite, `y` vers l'avant (-1 à 1). */
  joystick(x: number, y: number): void;
  /** Bouton « Ouvrir » de la visite tactile : ouvre l'équipement visé. */
  ouvrirVisee(): void;
}

/* ---------- Pictogrammes (tracés simples, couleur du texte) ---------- */

const ICONES = {
  scenarios: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5z"/>',
  construction: '<rect x="3.5" y="12.5" width="7.5" height="7.5"/><rect x="13" y="12.5" width="7.5" height="7.5"/><rect x="8.2" y="4" width="7.5" height="7.5"/>',
  visite: '<circle cx="12" cy="4.8" r="2"/><path d="M12 7.5v6M12 13.5l-3.2 7M12 13.5l3.2 7M7.5 10.5h9"/>',
  circuits: '<path d="M3 8.5c3-3 6 3 9 0s6-3 9 0M3 15.5c3-3 6 3 9 0s6-3 9 0"/>',
  vues: '<path d="M3.5 8h3.5l2-3h6l2 3h3.5v11.5h-17z"/><circle cx="12" cy="13.2" r="3.4"/>',
  affichage: '<path d="M12 3.5l9 5-9 5-9-5z"/><path d="M3 13.5l9 5 9-5"/>',
  ambiance: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  legende: '<path d="M10 6.5h10.5M10 12h10.5M10 17.5h10.5"/><rect x="3.5" y="5" width="3" height="3"/><rect x="3.5" y="10.5" width="3" height="3"/><rect x="3.5" y="16" width="3" height="3"/>',
  son: '<path d="M4 9.5h3.5L12.5 5.5v13L7.5 14.5H4z"/><path d="M16 9a4.5 4.5 0 0 1 0 6M18.6 6.5a8 8 0 0 1 0 11"/>',
  sonCoupe: '<path d="M4 9.5h3.5L12.5 5.5v13L7.5 14.5H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
  masquer: '<path d="M2.5 12s3.6-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.6 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/><path d="M4 20L20 4"/>',
  oeil: '<path d="M2.5 12s3.6-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.6 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  fermer: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  reduire: '<path d="M6 12h12"/>',
  agrandir: '<path d="M6 9l6 6 6-6"/>',
  retour: '<path d="M19 12H5.5M11 6l-6 6 6 6"/>',
  site: '<path d="M3 11.5l9-7 9 7"/><path d="M5.5 10v10h13V10"/>',
  vueHaut: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M10 10v10"/>',
  vueFace: '<rect x="3" y="8.5" width="18" height="7" rx="1.2"/><path d="M6 12h3M15.5 12h2.5"/>',
  dissipateurs: '<path d="M4.5 19.5h15M7 19.5v-8M10.3 19.5v-10M13.7 19.5v-10M17 19.5v-8"/><path d="M12 6.5V2.5M9.8 4.5L12 2.5l2.2 2"/>',
  eclater: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><rect x="9.5" y="9.5" width="5" height="5"/>',
  remettre: '<path d="M12 3.5v10.5M7.5 9.5L12 14l4.5-4.5"/><path d="M4 19.5h16"/>',
  precedent: '<path d="M6 5v14M18 5.5L9 12l9 6.5z"/>',
  suivant: '<path d="M18 5v14M6 5.5l9 6.5-9 6.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  lecture: '<path d="M7 5l12 7-12 7z"/>',
  arreter: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
} as const;

type Icone = keyof typeof ICONES;

function svg(icone: Icone): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.classList.add('icone');
  s.innerHTML = ICONES[icone];
  return s;
}

/* ---------- Libellés ---------- */

/** Vues rangées par paires DC1 / DC2 pour la grille à deux colonnes. */
const VUES: readonly ViewId[] = [
  'ensemble',
  'dc1',
  'dc2',
  'dc1-interieur',
  'dc2-interieur',
  'dc1-energie',
  'dc2-energie',
  'dc1-salle',
  'dc2-salle',
  'dc1-modules',
  'dc2-modules',
  'fibre',
];

const LIBELLE_AFFICHAGE: Record<CleBooleenne, string> = {
  coupe: 'Vue en coupe (toits escamotés)',
  interconnexions: 'Interconnexions entre modules',
  eclatee: 'Vue éclatée de l’étage',
  reperes: 'Repères dans la scène (sites, fibre, utilisateurs)',
};

const LIBELLE_ETIQUETTES: Record<ModeEtiquettes, string> = {
  aucune: 'Aucune',
  survol: 'Au survol',
  proches: 'Proches',
};

const LIBELLE_DISPOSITION: Record<Disposition, string> = {
  horizontale: 'Côte à côte',
  etage: 'En étage',
};

const LIBELLE_ASSEMBLAGE: Record<Assemblage, string> = {
  cloisonne: 'Cloisonné',
  fusionne: 'Salle unique',
};

const LIBELLE_AMBIANCE: Record<Ambiance, string> = {
  soleil: 'Ensoleillé',
  doux: 'Doux',
  couvert: 'Couvert',
};

const LIBELLE_OMBRES: Record<Ombres, string> = {
  aucune: 'Aucune',
  douces: 'Douces',
  nettes: 'Nettes',
};

const LIBELLE_ROLE: Record<SiteRole, string> = {
  actif: 'ACTIF',
  passif: 'EN ATTENTE',
  sinistre: 'SINISTRE',
};

const LEGENDE: readonly Famille[] = [
  'Réseau',
  'Sécurité',
  'Calcul',
  'Stockage',
  'Sauvegarde',
  'Supervision',
  'Énergie',
  'Refroidissement',
];

/** Volets de la barre d'outils, un seul ouvert à la fois. */
type Outil = 'scenarios' | 'construction' | 'visite' | 'circuits' | 'vues' | 'affichage' | 'ambiance' | 'legende';

const OUTILS: readonly { readonly id: Outil; readonly titre: string; readonly court: string }[] = [
  { id: 'scenarios', titre: 'Scénarios', court: 'Scénarios' },
  { id: 'construction', titre: 'Construction modulaire', court: 'Modules' },
  { id: 'visite', titre: 'Visite à pied', court: 'Visite' },
  { id: 'circuits', titre: 'Circuits techniques', court: 'Circuits' },
  { id: 'vues', titre: 'Points de vue', court: 'Vues' },
  { id: 'affichage', titre: 'Affichage', court: 'Affichage' },
  { id: 'ambiance', titre: 'Lumière et son', court: 'Ambiance' },
  { id: 'legende', titre: 'Légende', court: 'Légende' },
];

const CLE_MENU = 'dc-modulaire.menu';

const AIDE_SITE = MOBILE
  ? 'Toucher : fiche · Deux touchers : entrer ou ouvrir · Un doigt : tourner · Deux doigts : zoomer, déplacer'
  : 'Clic : fiche · Double-clic : entrer ou ouvrir · Glisser : tourner · Molette : zoomer · V : première personne · H : masquer l’interface';

type CleCurseur = 'luminosite' | 'lampe';

interface Curseur {
  readonly cle: CleCurseur;
  readonly entree: HTMLInputElement;
  readonly valeur: HTMLElement;
}

/* ---------- Aides DOM ---------- */

function creer<K extends keyof HTMLElementTagNameMap>(balise: K, classe?: string, texte?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

function bouton(texte: string, action: () => void, classe = 'bouton'): HTMLButtonElement {
  const b = creer('button', classe, texte);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}

/** Bouton à pictogramme, avec une infobulle (et le libellé lisible par les lecteurs d'écran). */
function boutonIcone(icone: Icone, titre: string, action: () => void, classe = 'bouton-icone'): HTMLButtonElement {
  const b = creer('button', classe);
  b.type = 'button';
  b.append(svg(icone));
  b.setAttribute('aria-label', titre);
  b.dataset['titre'] = titre;
  b.addEventListener('click', action);
  return b;
}

/** Bouton d'outil : pictogramme et libellé court. */
function boutonOutil(icone: Icone, texte: string, action: () => void): HTMLButtonElement {
  const b = creer('button', 'bouton-outil');
  b.type = 'button';
  b.append(svg(icone), creer('span', undefined, texte));
  b.addEventListener('click', action);
  return b;
}

/** Carte de la pile de droite : en-tête (surtitre, titre, réduire, fermer) et corps repliable. */
function carte(classe: string): { racine: HTMLElement; entete: HTMLElement; corps: HTMLElement } {
  const racine = creer('section', `carte ${classe}`);
  const entete = creer('header', 'carte-entete');
  const corps = creer('div', 'carte-corps');
  racine.append(entete, corps);
  return { racine, entete, corps };
}

/** Écran étroit (téléphone) : volets et fiches partagent le bas de l'écran. */
function ecranEtroit(): boolean {
  return window.matchMedia('(max-width: 760px)').matches;
}

/* ---------- Interface ---------- */

/**
 * Interface de simulation, superposée à la scène :
 * - barre d'outils verticale (à gauche) qui ouvre un volet à la fois ;
 * - télémétrie des sites et de la fibre (en haut à droite), cartes d'information empilées dessous ;
 * - narration des scénarios ou outils de l'inspection (en bas, au centre) ;
 * - consigne discrète (en bas à gauche) ; tout se masque d'un coup (touche H).
 */
export class Interface {
  private readonly rail = creer('nav', 'rail');
  private readonly volet = creer('aside', 'volet-outil');
  private readonly titreVolet = creer('h2');
  private readonly corpsVolet = creer('div', 'volet-corps');
  private readonly contenus = new Map<Outil, HTMLElement>();
  private readonly boutonsRail = new Map<Outil, HTMLButtonElement>();
  private outilOuvert: Outil | null = null;
  private dernierOutil: Outil = 'scenarios';
  private readonly boutonSonRail: HTMLButtonElement;

  private readonly telemetrie = creer('div', 'telemetrie');
  private signatureTelemetrie = '';
  private readonly pile = creer('div', 'pile-droite');
  private readonly fiche = carte('fiche');
  private readonly panneauCircuit = carte('circuit');

  private readonly narration = creer('section', 'hud-narration');
  private readonly progression = creer('div', 'progression-barre');
  private narrationReduite = false;
  private signatureNarration = '';

  private readonly fil = creer('nav', 'hud-fil');
  private readonly outilsInspection = creer('div', 'hud-outils');
  private readonly survol = creer('div', 'hud-consigne');
  private consigne = AIDE_SITE;
  private readonly barrePromenade = creer('aside', 'volet-promenade');
  private readonly reafficher = creer('button', 'reafficher');

  private sitePromenade: SiteId | null = null;
  private enInspection = false;
  private regardLibre = false;
  private hudVisible = true;
  /** Vrai pendant la construction du volet de la visite : ses commandes sont marquées pour être oubliées ensuite. */
  private dansPromenade = false;

  private readonly boutonsScenario = new Map<string, HTMLButtonElement>();
  private readonly boutonsModules = new Map<string, HTMLButtonElement>();
  private readonly boutonsAssemblage = new Map<Assemblage, HTMLButtonElement>();
  private readonly boutonsDisposition = new Map<Disposition, HTMLButtonElement>();
  private readonly boutonsEtiquettes = new Map<ModeEtiquettes, HTMLButtonElement>();
  private readonly boutonsAmbiance = new Map<Ambiance, HTMLButtonElement>();
  private readonly boutonsOmbres = new Map<Ombres, HTMLButtonElement>();
  /** Boutons de circuit : ceux du volet et ceux de la visite à pied. */
  private readonly boutonsCircuit: { circuit: Circuit; bouton: HTMLButtonElement }[] = [];
  private readonly cases = {} as Record<CleBooleenne, HTMLInputElement>;
  /** Curseurs de luminosité et de lampe : ceux du volet et ceux de la visite à pied. */
  private readonly curseurs: Curseur[] = [];
  private caseAdaptation: HTMLInputElement | null = null;
  private eclairage: Eclairage | null = null;
  private readonly commandesSon: { readonly bouton: HTMLButtonElement; readonly entree: HTMLInputElement; readonly valeur: HTMLElement }[] = [];
  private reglagesSon: ReglagesSon | null = null;
  private circuitAffiche: Circuit = 'aucun';
  /** Valeurs de la centrale incendie, mises à jour à chaque image sans reconstruire la carte. */
  private readonly mesuresIncendie = new Map<keyof EtatIncendie, HTMLElement>();
  private readonly jaugeGaz = creer('i');
  private phaseAffichee = -1;
  private signatureConstruction = '';

  constructor(
    private readonly racine: HTMLElement,
    private readonly actions: Actions,
    scenarios: readonly Scenario[],
  ) {
    // Barre d'outils : un bouton par volet, puis le son et le masquage de l'interface.
    for (const o of OUTILS) {
      const b = boutonIcone(o.id, o.titre, () => this.ouvrirOutil(this.outilOuvert === o.id ? null : o.id), 'bouton-icone rail-bouton');
      b.append(creer('span', 'rail-libelle', o.court));
      this.boutonsRail.set(o.id, b);
      this.rail.append(b);
    }
    this.rail.append(creer('span', 'rail-separateur'));
    this.boutonSonRail = boutonIcone('son', 'Couper ou rétablir le son (N)', () => actions.son({ coupe: !(this.reglagesSon?.coupe ?? false) }), 'bouton-icone rail-bouton');
    const masquer = boutonIcone('masquer', 'Masquer l’interface (H)', () => this.basculerHud(), 'bouton-icone rail-bouton');
    masquer.append(creer('span', 'rail-libelle', 'Masquer'));
    this.rail.append(this.boutonSonRail, masquer);
    racine.classList.toggle('tactile', MOBILE);
    this.construireCommandesTactiles();

    // Volet : en-tête et contenu de l'outil ouvert.
    const enteteVolet = creer('header', 'volet-entete');
    enteteVolet.append(this.titreVolet, boutonIcone('fermer', 'Fermer le volet (M)', () => this.ouvrirOutil(null)));
    this.volet.append(enteteVolet, this.corpsVolet);
    this.volet.id = 'volet-outil';
    this.construireContenus(scenarios);

    // Cartes de la pile de droite.
    this.fiche.racine.hidden = true;
    this.panneauCircuit.racine.hidden = true;
    this.pile.append(this.fiche.racine, this.panneauCircuit.racine);

    this.narration.hidden = true;
    this.fil.hidden = true;
    this.outilsInspection.hidden = true;
    this.barrePromenade.hidden = true;
    this.survol.setAttribute('role', 'status');
    this.survol.textContent = this.consigne;

    this.reafficher.type = 'button';
    this.reafficher.append(svg('oeil'), creer('span', undefined, 'Afficher l’interface'), creer('kbd', undefined, 'H'));
    this.reafficher.addEventListener('click', () => this.basculerHud());

    this.telemetrie.setAttribute('aria-label', 'État des sites');
    racine.append(
      this.rail,
      this.volet,
      this.telemetrie,
      this.pile,
      this.narration,
      this.fil,
      this.outilsInspection,
      this.survol,
      this.barrePromenade,
      this.reafficher,
    );

    let ouvert: Outil | null = 'scenarios';
    try {
      const memo = localStorage.getItem(CLE_MENU);
      if (memo === 'aucun') ouvert = null;
      else if (OUTILS.some((o) => o.id === memo)) ouvert = memo as Outil;
    } catch {
      // Stockage indisponible : le volet des scénarios est ouvert.
    }
    this.ouvrirOutil(ouvert);
  }

  /* ---------- Barre d'outils et volets ---------- */

  private ouvrirOutil(outil: Outil | null): void {
    this.outilOuvert = outil;
    if (outil) this.dernierOutil = outil;
    for (const [id, b] of this.boutonsRail) {
      b.classList.toggle('actif', id === outil);
      b.setAttribute('aria-expanded', String(id === outil));
    }
    this.volet.hidden = outil === null;
    if (outil) {
      this.titreVolet.textContent = OUTILS.find((o) => o.id === outil)?.titre ?? '';
      const contenu = this.contenus.get(outil);
      if (contenu) this.corpsVolet.replaceChildren(contenu);
    }
    this.racine.classList.toggle('volet-ouvert', outil !== null);
    try {
      localStorage.setItem(CLE_MENU, outil ?? 'aucun');
    } catch {
      // Préférence non mémorisée : sans conséquence.
    }
  }

  /** Touche M : ferme le volet ouvert, ou rouvre le dernier. */
  basculerMenu(): void {
    this.ouvrirOutil(this.outilOuvert ? null : this.dernierOutil);
  }

  /** Touche H : masque toute l'interface pour ne garder que la scène, ou la réaffiche. */
  basculerHud(): void {
    this.hudVisible = !this.hudVisible;
    this.racine.classList.toggle('hud-masque', !this.hudVisible);
    this.actions.menu(this.hudVisible);
  }

  private construireContenus(scenarios: readonly Scenario[]): void {
    const a = this.actions;
    const section = (outil: Outil): HTMLElement => {
      const corps = creer('div', 'volet-contenu');
      this.contenus.set(outil, corps);
      return corps;
    };
    const titre = (texte: string): HTMLElement => creer('h3', 'intertitre', texte);

    // Scénarios
    const s = section('scenarios');
    for (const scenario of scenarios) {
      const b = creer('button', 'ligne-scenario');
      b.type = 'button';
      b.append(creer('strong', undefined, scenario.nom), creer('span', undefined, scenario.resume));
      b.addEventListener('click', () => a.scenario(scenario));
      this.boutonsScenario.set(scenario.id, b);
      s.append(b);
    }

    // Construction
    const c = section('construction');
    c.append(titre('Modules par site'));
    for (const site of SITE_IDS) {
      const ligne = creer('div', 'ligne-reglage');
      const segments = creer('div', 'segments');
      for (const n of NOMBRES_MODULES) {
        const b = bouton(String(n), () => a.construire(site, n), 'segment');
        b.setAttribute('aria-label', `${site} : ${n} module${n > 1 ? 's' : ''}`);
        this.boutonsModules.set(`${site}-${n}`, b);
        segments.append(b);
      }
      ligne.append(creer('span', 'libelle', site), segments);
      c.append(ligne);
    }
    const assemblage = creer('div', 'segments');
    for (const mode of ['cloisonne', 'fusionne'] as const) {
      const b = bouton(LIBELLE_ASSEMBLAGE[mode], () => a.assembler(mode), 'segment');
      this.boutonsAssemblage.set(mode, b);
      assemblage.append(b);
    }
    const disposition = creer('div', 'segments');
    for (const d of ['horizontale', 'etage'] as const) {
      const b = bouton(LIBELLE_DISPOSITION[d], () => a.disposer(d), 'segment');
      this.boutonsDisposition.set(d, b);
      disposition.append(b);
    }
    c.append(titre('Assemblage'), assemblage, titre('Disposition'), disposition);

    // Visite à pied
    const v = section('visite');
    const visites = creer('div', 'grille-2');
    for (const site of SITE_IDS) visites.append(bouton(`Visiter ${site}`, () => a.promenade(site)));
    const ici = bouton('Première personne à l’endroit regardé', () => a.premierePersonne(), 'bouton large');
    ici.append(creer('kbd', undefined, 'V'));
    v.append(visites, ici, creer('p', 'aide', 'Double-cliquer sur un module y entre directement ; sur l’escalier, la visite part du pied du site.'));

    // Circuits
    const ci = section('circuits');
    ci.append(this.grilleCircuits(), creer('p', 'aide', 'Chaque circuit s’affiche avec ses étapes numérotées, dans la carte de droite.'));

    // Vues
    const vu = section('vues');
    const grille = creer('div', 'grille-2 grille-vues');
    for (const vue of VUES) grille.append(bouton(NOM_VUE[vue], () => a.vue(vue)));
    vu.append(grille);

    // Affichage
    const af = section('affichage');
    for (const cle of ['reperes', 'coupe', 'interconnexions', 'eclatee'] as const) this.cases[cle] = this.caseACocher(cle, af);
    const etiquettes = creer('div', 'segments');
    for (const mode of ['aucune', 'survol', 'proches'] as const) {
      const b = bouton(LIBELLE_ETIQUETTES[mode], () => a.etiquettes(mode), 'segment');
      this.boutonsEtiquettes.set(mode, b);
      etiquettes.append(b);
    }
    af.append(titre('Étiquettes des équipements'), etiquettes, titre('Interface'));
    const masquer = bouton('Masquer l’interface', () => this.basculerHud(), 'bouton large');
    masquer.append(creer('kbd', undefined, 'H'));
    af.append(masquer);

    // Lumière et son
    const am = section('ambiance');
    am.append(
      titre('Ambiance'),
      this.segmentsChoix(['soleil', 'doux', 'couvert'] as const, LIBELLE_AMBIANCE, this.boutonsAmbiance, (ambiance) => a.eclairage({ ambiance })),
      titre('Ombres'),
      this.segmentsChoix(['aucune', 'douces', 'nettes'] as const, LIBELLE_OMBRES, this.boutonsOmbres, (ombres) => a.eclairage({ ombres })),
      titre('Exposition'),
      this.curseur('luminosite', 'Luminosité'),
      this.curseur('lampe', 'Lampe'),
    );
    const adaptation = creer('label', 'case');
    const caseA = creer('input');
    caseA.type = 'checkbox';
    caseA.addEventListener('change', () => a.eclairage({ adaptation: caseA.checked }));
    this.caseAdaptation = caseA;
    adaptation.append(caseA, creer('span', undefined, 'Adapter la luminosité à l’intérieur'));
    am.append(adaptation, titre('Son'), this.ligneSon());

    // Légende
    const le = section('legende');
    const familles = creer('ul', 'legende');
    for (const f of LEGENDE) {
      const item = creer('li', undefined, f);
      item.style.setProperty('--teinte', COULEUR_FAMILLE[f]);
      familles.append(item);
    }
    const traits = (lignes: readonly (readonly [string, string, string?])[]): HTMLElement => {
      const liste = creer('ul', 'legende traits');
      for (const [texte, couleur, forme] of lignes) {
        const item = creer('li', forme, texte);
        item.style.setProperty('--teinte', couleur);
        liste.append(item);
      }
      return liste;
    };
    le.append(
      titre('Familles d’équipements'),
      familles,
      titre('Liaisons'),
      traits([
        ['Réseau entre modules', '#22d3ee'],
        ['Alimentation des modules', '#ffc400'],
        ['Fibre, voie DC1 → DC2', '#22d3ee'],
        ['Fibre, voie DC2 → DC1', '#a78bfa'],
      ]),
      titre('Machines virtuelles'),
      traits([
        ['Exécutées par les serveurs de calcul', '#22d3ee'],
        ['Disques sur la baie de stockage', '#a78bfa'],
        ['Plaque pâle : réplique en attente', '#9aa6b4', 'plaque'],
      ]),
      titre('Raccourcis'),
      creer('p', 'aide', 'M : volet · H : interface · V : première personne · N : son · Échap : revenir en arrière'),
    );
  }

  /* ---------- Télémétrie ---------- */

  /** Bandeau d'état : un bloc par site et la fibre, cliquables pour y aller. */
  majSimulation(etat: WorldState): void {
    const signature = JSON.stringify(etat);
    if (signature === this.signatureTelemetrie) return;
    this.signatureTelemetrie = signature;
    const blocSite = (id: SiteId): HTMLElement => {
      const s = etat.sites[id];
      const b = creer('button', 'tele-site');
      b.type = 'button';
      b.dataset['role'] = s.role;
      b.title = `Aller à ${id}`;
      b.addEventListener('click', () => this.actions.vue(id === 'DC1' ? 'dc1' : 'dc2'));
      const entete = creer('span', 'tele-entete');
      entete.append(creer('span', 'voyant'), creer('strong', undefined, id), creer('span', 'tele-role', LIBELLE_ROLE[s.role]));
      const jauge = creer('span', 'jauge');
      const remplissage = creer('i');
      remplissage.style.width = `${s.charge}%`;
      jauge.append(remplissage);
      const charge = creer('span', 'tele-mesure');
      charge.append(creer('span', 'tele-libelle', 'CHARGE'), jauge, creer('span', 'tele-valeur', `${s.charge} %`));
      const sources: string[] = [];
      if (s.secteur) sources.push('RÉS');
      if (s.solaire) sources.push('SOL');
      if (s.groupe) sources.push('GE');
      if (s.surBatterie) sources.push('BAT');
      const details = creer('span', 'tele-details');
      details.append(
        creer('span', undefined, s.vmActives > 0 ? `${s.vmActives} VM` : `${s.vmRepliques} rép.`),
        creer('span', undefined, `${s.modules} mod.`),
        creer('span', s.role === 'sinistre' || sources.length === 0 ? 'alerte' : undefined, sources.length > 0 ? sources.join('+') : 'SANS ÉNERGIE'),
      );
      b.append(entete, charge, details);
      return b;
    };
    const { mode, source } = etat.lien;
    const autre: SiteId = source === 'DC1' ? 'DC2' : 'DC1';
    const texteLien: Record<typeof mode, string> = {
      repos: 'au repos',
      replication: `${source} → ${autre}`,
      synchro: 'DC1 ⇄ DC2',
      coupee: 'coupée',
    };
    const lien = creer('button', 'tele-lien');
    lien.type = 'button';
    lien.dataset['mode'] = mode;
    lien.title = 'Aller à la liaison fibre';
    lien.addEventListener('click', () => this.actions.vue('fibre'));
    lien.append(creer('span', 'tele-libelle', 'FIBRE · 100 KM'), creer('span', 'tele-valeur', texteLien[mode]));
    this.telemetrie.replaceChildren(blocSite('DC1'), lien, blocSite('DC2'));
  }

  /* ---------- Affichage, circuits, construction ---------- */

  majAffichage(affichage: Affichage): void {
    for (const cle of Object.keys(this.cases) as CleBooleenne[]) this.cases[cle].checked = affichage[cle];
    for (const [mode, b] of this.boutonsEtiquettes) b.classList.toggle('actif', affichage.etiquettes === mode);
    for (const { circuit, bouton: b } of this.boutonsCircuit) b.classList.toggle('actif', affichage.circuit === circuit);
  }

  /**
   * Carte d'explication du circuit affiché. Pour l'incendie, `incendie` met en valeur l'étape en cours
   * et alimente le tableau de la centrale (temporisation, gaz, oxygène, asservissements).
   */
  majCircuit(circuit: Circuit, incendie: EtatIncendie | null): void {
    const p = incendie?.phase ?? -1;
    if (incendie) this.majMesuresIncendie(incendie);
    if (circuit === this.circuitAffiche && p === this.phaseAffichee) return;
    const change = circuit !== this.circuitAffiche;
    this.circuitAffiche = circuit;
    this.phaseAffichee = p;
    const { racine, entete, corps } = this.panneauCircuit;
    racine.hidden = circuit === 'aucun';
    if (circuit === 'aucun') return;
    const d = DESCRIPTION_CIRCUIT[circuit];
    racine.style.setProperty('--teinte', d.couleur);
    if (change) {
      racine.classList.remove('reduite');
      this.remplirEntete(entete, racine, 'Circuit technique', d.titre, () => this.actions.circuit('aucun'));
    }
    const liste = creer('ol', 'etapes');
    d.etapes.forEach((texte, i) => {
      const item = creer('li', i === p ? 'en-cours' : undefined);
      item.append(creer('span', 'numero', String(i + 1)), creer('span', undefined, texte));
      liste.append(item);
    });
    corps.replaceChildren(liste);
    if (incendie) {
      corps.prepend(this.tableauIncendie());
      this.majMesuresIncendie(incendie);
    }
    corps.append(creer('p', 'aide', 'Les pastilles numérotées de la scène renvoient à ces étapes.'));
  }

  /** Tableau de la centrale incendie : état, temporisation, gaz, oxygène et asservissements. */
  private tableauIncendie(): HTMLElement {
    this.mesuresIncendie.clear();
    const tableau = creer('div', 'tableau-centrale');
    const ligne = (cle: keyof EtatIncendie, libelle: string): void => {
      const valeur = creer('span', 'valeur');
      this.mesuresIncendie.set(cle, valeur);
      tableau.append(creer('span', 'libelle-mesure', libelle), valeur);
    };
    ligne('centrale', 'Centrale');
    ligne('temporisation', 'Temporisation');
    ligne('concentration', 'Gaz inerte');
    const jauge = creer('span', 'jauge jauge-gaz');
    jauge.append(this.jaugeGaz);
    tableau.append(jauge);
    ligne('oxygene', 'Oxygène');
    ligne('climatisation', 'Climatisation');
    ligne('clapetsCoupeFeu', 'Clapets coupe-feu');
    ligne('clapetSurpression', 'Clapet de surpression');
    ligne('supervision', 'Supervision');
    return tableau;
  }

  private majMesuresIncendie(e: EtatIncendie): void {
    const ecrire = (cle: keyof EtatIncendie, texte: string, alerte = false): void => {
      const el = this.mesuresIncendie.get(cle);
      if (!el) return;
      if (el.textContent !== texte) el.textContent = texte;
      el.classList.toggle('alerte', alerte);
    };
    ecrire('centrale', e.centrale, e.phase >= 1 && e.phase <= 4);
    ecrire('temporisation', e.phase === 2 ? `${e.temporisation} s` : e.phase < 2 ? '30 s · en attente' : 'écoulée', e.phase === 2);
    ecrire('concentration', `${e.concentration.toFixed(1).replace('.', ',')} %`);
    ecrire('oxygene', `${e.oxygene.toFixed(1).replace('.', ',')} %`, e.oxygene < 15);
    ecrire('climatisation', e.climatisation);
    ecrire('clapetsCoupeFeu', e.clapetsCoupeFeu);
    ecrire('clapetSurpression', e.clapetSurpression, e.clapetSurpression === 'ouvert');
    ecrire('supervision', e.supervision);
    const largeur = `${(e.concentration / 40) * 100}%`;
    if (this.jaugeGaz.style.width !== largeur) this.jaugeGaz.style.width = largeur;
  }

  /** En-tête d'une carte : surtitre, titre, boutons réduire et fermer. */
  private remplirEntete(entete: HTMLElement, racine: HTMLElement, surtitre: string, titre: string, fermer: () => void, teinte?: string): void {
    const textes = creer('div', 'carte-titres');
    const sur = creer('span', 'surtitre', surtitre);
    if (teinte) sur.style.setProperty('--teinte', teinte);
    textes.append(sur, creer('h2', undefined, titre));
    const reduire = boutonIcone('reduire', 'Réduire ou déplier', () => {
      const reduite = racine.classList.toggle('reduite');
      reduire.replaceChildren(svg(reduite ? 'agrandir' : 'reduire'));
    });
    const actions = creer('div', 'carte-actions');
    actions.append(reduire, boutonIcone('fermer', 'Fermer', fermer));
    entete.replaceChildren(textes, actions);
  }

  private grilleCircuits(): HTMLElement {
    const grille = creer('div', 'grille-circuits');
    for (const c of CIRCUITS) {
      const b = bouton(NOM_CIRCUIT[c], () => this.actions.circuit(c), 'bouton');
      if (this.dansPromenade) b.dataset['visite'] = '1';
      this.boutonsCircuit.push({ circuit: c, bouton: b });
      grille.append(b);
    }
    return grille;
  }

  /** Reflète le nombre de modules, l'assemblage et la disposition. */
  majConstruction(etat: WorldState): void {
    const signature = SITE_IDS.map((s) => `${etat.sites[s].modules}${etat.sites[s].assemblage}${etat.sites[s].disposition}`).join('|');
    if (signature !== this.signatureConstruction) {
      this.signatureConstruction = signature;
      for (const site of SITE_IDS) {
        for (const n of NOMBRES_MODULES) this.boutonsModules.get(`${site}-${n}`)?.classList.toggle('actif', etat.sites[site].modules === n);
      }
      for (const [mode, b] of this.boutonsAssemblage) b.classList.toggle('actif', etat.sites.DC1.assemblage === mode);
      for (const [d, b] of this.boutonsDisposition) b.classList.toggle('actif', etat.sites.DC1.disposition === d);
    }
    this.majSimulation(etat);
  }

  /* ---------- Fiches ---------- */

  afficherFiche(ref: EquipmentRef | null): void {
    const { racine, entete, corps } = this.fiche;
    racine.hidden = ref === null;
    if (!ref) return;
    if (ecranEtroit()) this.ouvrirOutil(null);
    racine.classList.remove('reduite');
    const spec = CATALOGUE[ref.kind];
    const lieu = [ref.site, ref.module ? `module ${ref.module}` : null].filter(Boolean).join(' · ');
    this.remplirEntete(entete, racine, lieu ? `${spec.famille} · ${lieu}` : spec.famille, spec.nom, () => this.afficherFiche(null), COULEUR_FAMILLE[spec.famille]);
    const liste = creer('ul');
    for (const ligne of spec.caracteristiques) liste.append(creer('li', undefined, ligne));
    corps.replaceChildren(creer('p', undefined, spec.role), liste);
    if (estBaie(ref.kind)) {
      const contenu = creer('ul');
      for (const ligne of compositionBaie(ref.kind)) contenu.append(creer('li', undefined, ligne));
      corps.append(creer('h3', 'intertitre', 'Équipements installés'), contenu);
    }
    if (spec.redondance) corps.append(creer('h3', 'intertitre', 'Redondance et continuité'), creer('p', undefined, spec.redondance));
    if (estBaie(ref.kind) && ref.site) {
      const { kind, site } = ref;
      const module = ref.module ?? 1;
      corps.append(bouton('Ouvrir la baie et ses serveurs', () => this.actions.inspecter(site, module, kind), 'bouton principal large'));
    }
    // Module (paroi, porte, aérorefroidisseur) ou escalier : entrer d'un bouton, sans avoir à double-cliquer.
    const { site, module } = ref;
    if (site && module !== undefined && (ref.kind === 'conteneur' || ref.kind === 'controle-acces' || ref.kind === 'aerorefroidisseur')) {
      corps.prepend(bouton(`Entrer dans le module ${module}`, () => this.actions.entrerModule(site, module), 'bouton principal large'));
    } else if (site && ref.kind === 'escalier') {
      corps.prepend(bouton(`Visiter ${site} à pied`, () => this.actions.promenade(site), 'bouton principal large'));
    }
  }

  /** Fiche d'un composant interne, en mode inspection. */
  afficherComposant(kind: ComposantKind | null): void {
    const { racine, entete, corps } = this.fiche;
    racine.hidden = kind === null;
    if (!kind) return;
    if (ecranEtroit()) this.ouvrirOutil(null);
    racine.classList.remove('reduite');
    const spec = COMPOSANTS[kind];
    this.remplirEntete(entete, racine, 'Composant', spec.nom, () => this.afficherComposant(null));
    const liste = creer('ul');
    for (const ligne of spec.caracteristiques) liste.append(creer('li', undefined, ligne));
    corps.replaceChildren(creer('p', undefined, spec.role), liste, creer('p', 'aide', 'Ordres de grandeur courants, variables selon le modèle.'));
  }

  /* ---------- Inspection ---------- */

  /** Fil d'Ariane (en haut à gauche) et outils (en bas) de l'inspection ; `null` quand on revient au site. */
  majInspection(etat: EtatInspection | null, eclatable = false): void {
    this.racine.classList.toggle('mode-inspection', etat !== null);
    this.enInspection = etat !== null;
    this.fil.hidden = etat === null;
    this.outilsInspection.hidden = etat === null;
    this.fil.replaceChildren();
    this.outilsInspection.replaceChildren();
    if (!etat) {
      this.majConsigne();
      return;
    }

    this.fil.append(boutonIcone('retour', 'Revenir d’un niveau (Échap)', () => this.actions.retourInspection()));
    const etapes = creer('ol', 'fil-etapes');
    const etape = (texte: string, courant: boolean): void => {
      etapes.append(creer('li', courant ? 'courant' : undefined, texte));
    };
    etape(`${etat.site} · M${etat.module}`, false);
    etape(CATALOGUE[etat.baie].nom, etat.serveur === null);
    if (etat.serveur) etape(etat.serveur.split(' · ').pop() ?? etat.serveur, etat.examen === null);
    if (etat.examen) etape(etat.examen, true);
    this.fil.append(etapes);

    this.consigne = MOBILE
      ? etat.examen
        ? 'Un doigt : tourner la pièce · Deux doigts : zoomer · Toucher : la remettre en place'
        : etat.serveur
          ? 'Un doigt : se déplacer · Deux doigts : zoomer et tourner · Toucher une pièce : la regarder'
          : 'Toucher un équipement : l’ouvrir · Un doigt : tourner autour · Deux doigts : zoomer'
      : etat.examen
        ? 'Glisser : tourner la pièce · Molette : zoomer · Clic : la remettre en place'
        : etat.serveur
          ? 'Glisser : se déplacer · Clic droit : tourner · Molette : zoomer · Clic sur une pièce : la regarder'
          : 'Survol : marque et modèle · Clic : ouvrir l’équipement · Glisser : tourner autour';
    this.survol.textContent = this.consigne;
    this.survol.classList.remove('actif', 'invite');

    const groupe = (...boutons: HTMLButtonElement[]): HTMLElement => {
      const g = creer('div', 'groupe-outils');
      g.append(...boutons);
      return g;
    };
    const a = this.actions;
    if (etat.examen) {
      const g = groupe(boutonOutil('remettre', 'Remettre en place', () => a.retourInspection()));
      if (eclatable) g.prepend(boutonOutil('eclater', 'Éclater', () => a.eclaterComposant()));
      this.outilsInspection.append(g);
    } else if (etat.serveur) {
      this.outilsInspection.append(
        groupe(
          boutonOutil('vueHaut', 'De haut', () => a.vueServeur('haut')),
          boutonOutil('vueFace', 'De face', () => a.vueServeur('face')),
          boutonOutil('dissipateurs', 'Dissipateurs', () => a.dissipateurs()),
        ),
        groupe(boutonOutil('retour', 'Baie', () => a.retourInspection())),
      );
    }
    this.outilsInspection.append(groupe(boutonOutil('site', 'Site', () => a.quitterInspection())));
  }

  /* ---------- Visite à pied ---------- */

  /** Volet de la visite à pied ; `null` quand la visite se termine. */
  majPromenade(site: SiteId | null): void {
    this.racine.classList.toggle('mode-promenade', site !== null);
    this.sitePromenade = site;
    this.majConsigne();
    this.barrePromenade.hidden = site === null;
    this.barrePromenade.replaceChildren();
    // Les commandes de l'ancien volet de visite ne sont plus dans la page : on les oublie.
    const deVisite = (e: HTMLElement | undefined): boolean => e?.dataset['visite'] === '1';
    for (let i = this.boutonsCircuit.length - 1; i >= 0; i--) if (deVisite(this.boutonsCircuit[i]?.bouton)) this.boutonsCircuit.splice(i, 1);
    for (let i = this.curseurs.length - 1; i >= 0; i--) if (deVisite(this.curseurs[i]?.entree)) this.curseurs.splice(i, 1);
    for (let i = this.commandesSon.length - 1; i >= 0; i--) if (deVisite(this.commandesSon[i]?.bouton)) this.commandesSon.splice(i, 1);
    if (!site) return;

    const entete = creer('header', 'volet-entete');
    const titres = creer('div', 'carte-titres');
    titres.append(creer('span', 'surtitre', 'Visite à pied'), creer('h2', undefined, site));
    const corps = creer('div', 'volet-contenu');
    this.dansPromenade = true;
    const reduire = boutonIcone('reduire', 'Réduire ou déplier', () => {
      const reduit = this.barrePromenade.classList.toggle('reduite');
      reduire.replaceChildren(svg(reduit ? 'agrandir' : 'reduire'));
    });
    const actionsEntete = creer('div', 'carte-actions');
    actionsEntete.append(reduire, boutonIcone('fermer', 'Quitter la visite', () => this.actions.quitterPromenade()));
    entete.append(titres, actionsEntete);

    const touches = creer('ul', 'touches');
    const ligne = (touchesLigne: readonly string[], texte: string): void => {
      const li = creer('li');
      const groupe = creer('span', 'touches-groupe');
      for (const t of touchesLigne) groupe.append(creer('kbd', undefined, t));
      li.append(groupe, creer('span', undefined, texte));
      touches.append(li);
    };
    if (MOBILE) {
      ligne(['Joystick'], 'avancer, se décaler (à fond : courir)');
      ligne(['Glisser'], 'regarder autour de soi');
      ligne(['Toucher'], 'fiche de l’équipement visé');
      ligne(['Ouvrir'], 'ouvrir la baie visée');
    } else {
      ligne(['Z', 'Q', 'S', 'D'], 'avancer, se décaler');
      ligne(['Souris'], 'regarder');
      ligne(['←', '→'], 'tourner');
      ligne(['Maj'], 'courir');
      ligne(['Clic'], 'fiche de l’équipement visé');
      ligne(['E'], 'ouvrir la baie visée');
      ligne(['L'], 'lampe');
      ligne(['V'], 'vue d’ensemble');
      ligne(['Échap'], 'libérer la souris, puis sortir');
    }
    corps.append(
      touches,
      creer('h3', 'intertitre', 'Exposition'),
      this.curseur('luminosite', 'Luminosité'),
      this.curseur('lampe', 'Lampe'),
      creer('h3', 'intertitre', 'Son'),
      this.ligneSon(),
      creer('h3', 'intertitre', 'Circuit technique'),
      this.grilleCircuits(),
    );
    this.dansPromenade = false;
    this.barrePromenade.append(entete, corps);
    // Au doigt, le volet commence replié : la vue et le joystick restent dégagés.
    if (MOBILE) {
      this.barrePromenade.classList.add('reduite');
      reduire.replaceChildren(svg('agrandir'));
    } else {
      this.barrePromenade.classList.remove('reduite');
    }
  }

  majEclairage(e: Eclairage): void {
    this.eclairage = { ...e };
    for (const [a, b] of this.boutonsAmbiance) b.classList.toggle('actif', a === e.ambiance);
    for (const [o, b] of this.boutonsOmbres) b.classList.toggle('actif', o === e.ombres);
    for (const c of this.curseurs) this.afficherCurseur(c);
    if (this.caseAdaptation) this.caseAdaptation.checked = e.adaptation;
  }

  /* ---------- Son ---------- */

  private ligneSon(): HTMLElement {
    const ligne = creer('div', 'ligne-curseur');
    const basculer = bouton('', () => this.actions.son({ coupe: !(this.reglagesSon?.coupe ?? false) }), 'segment seul');
    basculer.title = 'Couper ou rétablir le son (N)';
    const entree = creer('input');
    entree.type = 'range';
    entree.min = '0';
    entree.max = '100';
    entree.step = '5';
    entree.setAttribute('aria-label', 'Volume');
    entree.addEventListener('input', () => this.actions.son({ volume: Number(entree.value) / 100, coupe: false }));
    const valeur = creer('span', 'valeur-curseur');
    ligne.append(basculer, entree, valeur);
    const c = { bouton: basculer, entree, valeur };
    if (this.dansPromenade) basculer.dataset['visite'] = '1';
    this.commandesSon.push(c);
    this.afficherSon(c);
    return ligne;
  }

  majSon(r: ReglagesSon): void {
    this.reglagesSon = { ...r };
    for (const c of this.commandesSon) this.afficherSon(c);
    this.boutonSonRail.replaceChildren(svg(r.coupe ? 'sonCoupe' : 'son'));
    this.boutonSonRail.classList.toggle('eteint', r.coupe);
  }

  private afficherSon(c: (typeof this.commandesSon)[number]): void {
    const r = this.reglagesSon;
    if (!r) return;
    c.bouton.textContent = r.coupe ? 'Coupé' : 'Activé';
    c.bouton.classList.toggle('actif', !r.coupe);
    c.entree.value = String(Math.round(r.volume * 100));
    c.valeur.textContent = r.coupe ? '—' : `${Math.round(r.volume * 100)} %`;
  }

  /* ---------- Contrôles réutilisables ---------- */

  private segmentsChoix<T extends string>(
    valeurs: readonly T[],
    libelles: Record<T, string>,
    carteBoutons: Map<T, HTMLButtonElement>,
    choisir: (v: T) => void,
  ): HTMLElement {
    const segments = creer('div', 'segments');
    for (const v of valeurs) {
      const b = bouton(libelles[v], () => choisir(v), 'segment');
      carteBoutons.set(v, b);
      segments.append(b);
    }
    return segments;
  }

  private curseur(cle: CleCurseur, libelle: string): HTMLElement {
    const ligne = creer('label', 'ligne-curseur');
    const entree = creer('input');
    entree.type = 'range';
    entree.min = cle === 'luminosite' ? '50' : '0';
    entree.max = cle === 'luminosite' ? '160' : '100';
    entree.step = '5';
    const valeur = creer('span', 'valeur-curseur');
    entree.addEventListener('input', () => this.actions.eclairage({ [cle]: Number(entree.value) / 100 }));
    ligne.append(creer('span', 'libelle', libelle), entree, valeur);
    const c: Curseur = { cle, entree, valeur };
    if (this.dansPromenade) entree.dataset['visite'] = '1';
    this.curseurs.push(c);
    this.afficherCurseur(c);
    return ligne;
  }

  private afficherCurseur(c: Curseur): void {
    if (!this.eclairage) return;
    const v = Math.round(this.eclairage[c.cle] * 100);
    c.entree.value = String(v);
    c.valeur.textContent = c.cle === 'lampe' && v === 0 ? 'éteinte' : `${v} %`;
  }

  private caseACocher(cle: CleBooleenne, parent: HTMLElement): HTMLInputElement {
    const etiquette = creer('label', 'case');
    const entree = creer('input');
    entree.type = 'checkbox';
    entree.addEventListener('change', () => this.actions.affichage(cle, entree.checked));
    etiquette.append(entree, creer('span', undefined, LIBELLE_AFFICHAGE[cle]));
    parent.append(etiquette);
    return entree;
  }

  /* ---------- Commandes tactiles de la visite ---------- */

  /** Joystick (en bas à gauche) et boutons « Ouvrir » et « Sortir » (en bas à droite), visibles à pied sur écran tactile. */
  private construireCommandesTactiles(): void {
    const joystick = creer('div', 'joystick');
    const manette = creer('div', 'manette');
    joystick.append(manette);
    joystick.setAttribute('aria-label', 'Joystick de déplacement');
    let doigt: number | null = null;
    const rayon = 46;
    const suivre = (e: PointerEvent): void => {
      const cadre = joystick.getBoundingClientRect();
      let dx = e.clientX - (cadre.left + cadre.width / 2);
      let dy = e.clientY - (cadre.top + cadre.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > rayon) {
        dx = (dx / d) * rayon;
        dy = (dy / d) * rayon;
      }
      manette.style.transform = `translate(${dx}px, ${dy}px)`;
      this.actions.joystick(dx / rayon, -dy / rayon);
    };
    const relacher = (e: PointerEvent): void => {
      if (e.pointerId !== doigt) return;
      doigt = null;
      manette.style.transform = '';
      this.actions.joystick(0, 0);
    };
    joystick.addEventListener('pointerdown', (e) => {
      doigt = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      suivre(e);
    });
    joystick.addEventListener('pointermove', (e) => {
      if (e.pointerId === doigt) suivre(e);
    });
    joystick.addEventListener('pointerup', relacher);
    joystick.addEventListener('pointercancel', relacher);

    const boutons = creer('div', 'boutons-visite');
    boutons.append(
      boutonOutil('remettre', 'Ouvrir', () => this.actions.ouvrirVisee()),
      boutonOutil('site', 'Sortir', () => this.actions.quitterPromenade()),
    );
    this.racine.append(joystick, boutons);
  }

  /* ---------- Consigne et survol ---------- */

  majRegard(libre: boolean): void {
    this.racine.classList.toggle('regard-libre', libre);
    this.regardLibre = libre;
    this.majConsigne();
  }

  majSurvol(nom: string | null): void {
    this.survol.textContent = nom ?? this.consigne;
    this.survol.classList.toggle('actif', nom !== null);
  }

  private majConsigne(): void {
    if (this.enInspection) return;
    const site = this.sitePromenade;
    const invite = site !== null && !this.regardLibre && !MOBILE;
    this.consigne =
      site === null
        ? AIDE_SITE
        : MOBILE
          ? 'Joystick : avancer · Glisser : regarder · Toucher : fiche de l’équipement visé'
          : invite
            ? 'Cliquez dans la scène pour regarder à la souris'
            : 'Échap : libérer la souris';
    this.survol.textContent = this.consigne;
    this.survol.classList.remove('actif');
    this.survol.classList.toggle('invite', invite);
  }

  /* ---------- Narration ---------- */

  majLecture(lecture: Lecture | null): void {
    for (const [id, b] of this.boutonsScenario) b.classList.toggle('actif', lecture?.scenario.id === id);
    this.narration.hidden = lecture === null;
    this.racine.classList.toggle('lecture', lecture !== null);
    if (!lecture) {
      this.signatureNarration = '';
      return;
    }
    this.progression.style.transform = `scaleX(${lecture.progression})`;
    const signature = `${lecture.scenario.id}:${lecture.index}:${lecture.enPause}:${this.narrationReduite}`;
    if (signature === this.signatureNarration) return;
    this.signatureNarration = signature;

    const total = lecture.scenario.etapes.length;
    const a = this.actions;
    const commandes = creer('div', 'narration-commandes');
    const b = (icone: Icone, titre: string, action: () => void, desactive = false): HTMLButtonElement => {
      const el = boutonIcone(icone, titre, action);
      el.disabled = desactive;
      return el;
    };
    commandes.append(
      b('precedent', 'Étape précédente', () => a.precedent(), lecture.index === 0),
      b(lecture.enPause ? 'lecture' : 'pause', lecture.enPause ? 'Reprendre' : 'Pause', () => a.pause()),
      b('suivant', 'Étape suivante', () => a.suivant(), lecture.index === total - 1),
      b('arreter', 'Arrêter le scénario', () => a.arreter()),
      b(this.narrationReduite ? 'agrandir' : 'reduire', this.narrationReduite ? 'Déplier' : 'Réduire', () => {
        this.narrationReduite = !this.narrationReduite;
        this.signatureNarration = '';
        this.majLecture(lecture);
      }),
    );
    const entete = creer('div', 'narration-entete');
    const titres = creer('div', 'narration-titres');
    titres.append(
      creer('span', 'surtitre', `${lecture.scenario.nom} · étape ${lecture.index + 1}/${total}`),
      creer('h2', undefined, lecture.etape.titre),
    );
    entete.append(titres, commandes);
    const piste = creer('div', 'progression');
    piste.append(this.progression);
    this.narration.classList.toggle('reduite', this.narrationReduite);
    this.narration.replaceChildren(piste, entete, creer('p', undefined, lecture.etape.texte));
  }
}
