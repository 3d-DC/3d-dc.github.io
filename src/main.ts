import './style.css';
import { son } from './audio/son';
import { Monde } from './scene/monde';
import { Lecteur } from './scenarios/lecteur';
import { etatInitial, SCENARIOS } from './scenarios/scenarios';
import { etatIncendie } from './scene/circuits';
import {
  ECLAIRAGE_DEFAUT,
  estBaie,
  SON_DEFAUT,
  SITE_IDS,
  type Affichage,
  type Eclairage,
  type EquipmentRef,
  type ReglagesSon,
  type SiteId,
  type ViewId,
  type WorldState,
} from './types';
import { Interface } from './ui/interface';

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const trouve = document.getElementById(id);
  if (!(trouve instanceof type)) throw new Error(`Élément #${id} introuvable ou de type inattendu`);
  return trouve;
}

const monde = new Monde(
  element('scene', HTMLCanvasElement),
  element('etiquettes', HTMLDivElement),
  element('etiquettes-inspection', HTMLDivElement),
);

let affichage: Affichage = { coupe: false, circuit: 'aucun', interconnexions: false, etiquettes: 'survol', eclatee: false, reperes: true };
/** Site regardé en dernier, pour cadrer les circuits techniques. */
let siteCourant: SiteId = 'DC1';
let etat: WorldState = etatInitial();

const lecteur = new Lecteur((nouvelleEtape) => {
  const lecture = lecteur.lecture();
  if (nouvelleEtape) {
    etat = lecture ? lecture.etat : etatInitial();
    if (lecture?.etape.vue) monde.allerA(lecture.etape.vue);
    if (lecture?.etape.affichage) {
      affichage = { ...affichage, ...lecture.etape.affichage };
      ui.majAffichage(affichage);
    }
  }
  ui.majLecture(lecture);
});

/** Met en pause le scénario en cours, le temps d'une inspection ou d'une visite. */
function suspendreScenario(): void {
  const lecture = lecteur.lecture();
  if (lecture && !lecture.enPause) lecteur.basculerPause();
}

/** La construction manuelle prend la main : un scénario en cours est arrêté. */
function prendreLaMain(): void {
  if (lecteur.lecture()) lecteur.arreter();
}

function changerAffichage(modif: Partial<Affichage>): void {
  affichage = { ...affichage, ...modif };
  ui.majAffichage(affichage);
}

const CLE_ECLAIRAGE = 'dc-modulaire.eclairage';
/** Dernière intensité de lampe non nulle, rallumée par la touche L. */
let lampeAllumee = ECLAIRAGE_DEFAUT.lampe;

/** Applique et mémorise les réglages de lumière. */
function reglerEclairage(modif: Partial<Eclairage>): void {
  const e: Eclairage = { ...monde.reglagesEclairage, ...modif };
  e.luminosite = Math.min(1.6, Math.max(0.5, e.luminosite));
  e.lampe = Math.min(1, Math.max(0, e.lampe));
  if (e.lampe > 0) lampeAllumee = e.lampe;
  monde.reglerEclairage(e);
  ui.majEclairage(e);
  try {
    localStorage.setItem(CLE_ECLAIRAGE, JSON.stringify(e));
  } catch {
    // Préférence non mémorisée : sans conséquence.
  }
}

/** Relit les réglages de lumière mémorisés, en écartant toute valeur invalide. */
function eclairageMemorise(): Partial<Eclairage> {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE_ECLAIRAGE) ?? '{}');
    if (typeof brut !== 'object' || brut === null) return {};
    const o = brut as Record<string, unknown>;
    const modif: Partial<Eclairage> = {};
    const ambiance = o['ambiance'];
    if (ambiance === 'soleil' || ambiance === 'doux' || ambiance === 'couvert') modif.ambiance = ambiance;
    const ombres = o['ombres'];
    if (ombres === 'aucune' || ombres === 'douces' || ombres === 'nettes') modif.ombres = ombres;
    if (typeof o['luminosite'] === 'number') modif.luminosite = o['luminosite'];
    if (typeof o['lampe'] === 'number') modif.lampe = o['lampe'];
    if (typeof o['adaptation'] === 'boolean') modif.adaptation = o['adaptation'];
    return modif;
  } catch {
    return {};
  }
}

const CLE_SON = 'dc-modulaire.son';
let reglagesSon: ReglagesSon = { ...SON_DEFAUT };

/** Applique et mémorise les réglages du son. */
function reglerSon(modif: Partial<ReglagesSon>): void {
  reglagesSon = { ...reglagesSon, ...modif };
  reglagesSon.volume = Math.min(1, Math.max(0, reglagesSon.volume));
  son.regler(reglagesSon);
  ui.majSon(reglagesSon);
  try {
    localStorage.setItem(CLE_SON, JSON.stringify(reglagesSon));
  } catch {
    // Préférence non mémorisée : sans conséquence.
  }
}

/** Relit les réglages du son mémorisés, en écartant toute valeur invalide. */
function sonMemorise(): Partial<ReglagesSon> {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE_SON) ?? '{}');
    if (typeof brut !== 'object' || brut === null) return {};
    const o = brut as Record<string, unknown>;
    const modif: Partial<ReglagesSon> = {};
    if (typeof o['volume'] === 'number') modif.volume = o['volume'];
    if (typeof o['coupe'] === 'boolean') modif.coupe = o['coupe'];
    return modif;
  } catch {
    return {};
  }
}

/** Prépare l'interface à la vue à la première personne (scénario en pause, toits remis). */
function entrerEnPremierePersonne(demarrer: () => SiteId): void {
  suspendreScenario();
  ui.afficherFiche(null);
  const site = demarrer();
  ui.majPromenade(site);
  changerAffichage({ coupe: false });
}

/** Visite à pied d'un site, depuis la porte du premier module ou directement dans le module donné. */
function lancerPromenade(site: SiteId, module?: number): void {
  entrerEnPremierePersonne(() => {
    monde.demarrerPromenade(site, module);
    return site;
  });
}

/** Vue à la première personne à l'endroit regardé (touche V ou bouton du menu). */
function premierePersonneIci(): void {
  entrerEnPremierePersonne(() => monde.demarrerPromenadeIci());
}

/** Ouvre une baie dans la vue rapprochée, en mettant le scénario en pause. */
function ouvrirBaie(ref: EquipmentRef): boolean {
  if (!estBaie(ref.kind) || !ref.site) return false;
  suspendreScenario();
  ui.afficherFiche(null);
  monde.inspecter(ref.site, ref.module ?? 1, ref.kind);
  return true;
}

function quitterPromenade(): void {
  if (!monde.enPromenade) return;
  monde.arreterPromenade();
  ui.majPromenade(null);
  ui.majRegard(false);
  changerAffichage({ coupe: true });
}

const ui = new Interface(
  element('ui', HTMLDivElement),
  {
    scenario: (scenario) => lecteur.demarrer(scenario),
    vue: (vue) => {
      if (vue.startsWith('dc2')) siteCourant = 'DC2';
      else if (vue.startsWith('dc1')) siteCourant = 'DC1';
      // Entrer dans un module n'a de sens qu'en vue en coupe.
      if (vue.endsWith('interieur') || vue.endsWith('modules') || vue.endsWith('salle')) changerAffichage({ coupe: true });
      monde.allerA(vue);
    },
    affichage: (cle, valeur) => {
      // La vue éclatée de l'étage se regarde toit escamoté.
      changerAffichage(cle === 'eclatee' && valeur ? { eclatee: true, coupe: true } : { [cle]: valeur });
    },
    etiquettes: (mode) => changerAffichage({ etiquettes: mode }),
    circuit: (circuit) => {
      if (circuit === 'aucun' || monde.enPromenade) {
        changerAffichage({ circuit });
        return;
      }
      // Chaque circuit a son meilleur point de vue, toit escamoté.
      const vues: Record<Exclude<typeof circuit, 'aucun'>, ViewId> = {
        air: siteCourant === 'DC1' ? 'dc1-salle' : 'dc2-salle',
        climatisation: siteCourant === 'DC1' ? 'dc1-toit' : 'dc2-toit',
        incendie: siteCourant === 'DC1' ? 'dc1-salle' : 'dc2-salle',
        energie: siteCourant === 'DC1' ? 'dc1-energie' : 'dc2-energie',
      };
      changerAffichage({ circuit, coupe: true });
      monde.allerA(vues[circuit]);
    },
    disposer: (disposition) => {
      prendreLaMain();
      for (const site of SITE_IDS) etat.sites[site].disposition = disposition;
      changerAffichage({ coupe: true, interconnexions: true });
      monde.allerA(siteCourant === 'DC1' ? 'dc1-modules' : 'dc2-modules');
    },
    menu: (visible) => monde.definirPanneau(visible),
    precedent: () => lecteur.precedent(),
    suivant: () => lecteur.suivant(),
    pause: () => lecteur.basculerPause(),
    arreter: () => lecteur.arreter(),
    inspecter: (site, module, baie) => {
      suspendreScenario();
      ui.afficherFiche(null);
      monde.inspecter(site, module, baie);
    },
    retourInspection: () => monde.inspection.retour(),
    quitterInspection: () => monde.inspection.fermer(),
    vueServeur: (vue) => monde.inspection.vueServeur(vue),
    eclaterComposant: () => monde.inspection.basculerEclatement(),
    dissipateurs: () => monde.inspection.basculerDissipateurs(),
    construire: (site, modules) => {
      prendreLaMain();
      etat.sites[site].modules = modules;
      if (modules > 1) {
        changerAffichage({ coupe: true, interconnexions: true });
        monde.allerA(site === 'DC1' ? 'dc1-modules' : 'dc2-modules');
      }
    },
    assembler: (mode) => {
      prendreLaMain();
      for (const site of SITE_IDS) etat.sites[site].assemblage = mode;
    },
    promenade: (site: SiteId) => lancerPromenade(site),
    premierePersonne: () => premierePersonneIci(),
    eclairage: (modif) => reglerEclairage(modif),
    son: (modif) => reglerSon(modif),
    joystick: (x, y) => monde.deplacementTactile(x, y),
    ouvrirVisee: () => monde.actionPromenade(),
    quitterPromenade,
  },
  SCENARIOS,
);
ui.majAffichage(affichage);
reglerEclairage(eclairageMemorise());
reglerSon(sonMemorise());

// Le navigateur n'autorise le son qu'après un geste de l'utilisateur : premier clic ou première touche.
for (const evenement of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(evenement, () => son.demarrer(), { capture: true });
}
// Petit clic sonore sur les boutons de l'interface.
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && e.target.closest('button')) son.clic();
});

monde.surSelection = (ref) => ui.afficherFiche(ref);
monde.surSortiePromenade = quitterPromenade;
monde.surRegard = (libre) => ui.majRegard(libre);
monde.surOuvrir = (ref) => {
  // Touche E pendant la visite : une baie s'ouvre, les autres équipements affichent leur fiche.
  if (!ouvrirBaie(ref)) ui.afficherFiche(ref);
};
monde.surEntrer = (ref, objet) => {
  // Double-clic : on entre dans ce qui contient d'autres éléments, on s'approche du reste.
  if (ouvrirBaie(ref)) return;
  const entrees: readonly EquipmentRef['kind'][] = ['conteneur', 'controle-acces', 'aerorefroidisseur'];
  if (ref.site && ref.module !== undefined && entrees.includes(ref.kind)) {
    lancerPromenade(ref.site, ref.module);
    return;
  }
  if (ref.site && ref.kind === 'escalier') {
    lancerPromenade(ref.site);
    return;
  }
  ui.afficherFiche(ref);
  // Un équipement de la salle ne se voit qu'avec le toit escamoté.
  if (ref.module !== undefined) changerAffichage({ coupe: true });
  monde.cadrerSur(objet);
};
monde.inspection.surComposant = (kind) => ui.afficherComposant(kind);
monde.inspection.surSurvol = (nom) => ui.majSurvol(nom);
monde.inspection.surNavigation = (etatInspection) => {
  ui.majInspection(etatInspection, monde.inspection.eclatable);
  if (!etatInspection) {
    ui.afficherComposant(null);
    monde.reprendre();
  }
};

let horloge = 0;
function etape(dt: number): void {
  horloge += dt;
  lecteur.maj(dt);
  const lecture = lecteur.lecture();
  if (lecture) ui.majLecture(lecture);
  ui.majConstruction(etat);
  ui.majCircuit(affichage.circuit, affichage.circuit === 'incendie' ? etatIncendie(horloge) : null);
  monde.maj(dt, horloge, etat, affichage);
}

let precedent = performance.now();
function boucle(maintenant: number): void {
  // Le pas est borné pour éviter un saut après un onglet mis en arrière-plan.
  etape(Math.min(0.1, (maintenant - precedent) / 1000));
  precedent = maintenant;
  requestAnimationFrame(boucle);
}
requestAnimationFrame(boucle);

// Raccourcis : M replie ou déplie le menu, V passe en première personne à l'endroit regardé et en ressort.
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target instanceof HTMLInputElement) return;
  // H masque ou réaffiche toute l'interface, dans tous les modes.
  if (e.code === 'KeyH') {
    ui.basculerHud();
    return;
  }
  // N coupe ou rétablit le son, dans tous les modes (inspection comprise).
  if (e.code === 'KeyN') {
    reglerSon({ coupe: !reglagesSon.coupe });
    return;
  }
  // Dans l'inspection, Échap remonte d'un niveau (pièce remise en place, retour à la baie, puis au site).
  if (monde.inspection.actif) {
    if (e.code === 'Escape') monde.inspection.retour();
    return;
  }
  if (e.code === 'KeyM' && !monde.enPromenade) ui.basculerMenu();
  if (e.code === 'KeyL' && monde.enPromenade) reglerEclairage({ lampe: monde.reglagesEclairage.lampe > 0 ? 0 : lampeAllumee });
  if (e.code === 'KeyV') {
    if (monde.enPromenade) quitterPromenade();
    else premierePersonneIci();
  }
});

// En développement : la scène est accessible depuis la console, et `avancer(s)` fait progresser
// l'animation de `s` secondes même quand l'onglet est masqué (vérifications automatisées).
if (import.meta.env.DEV) {
  Object.assign(window, {
    monde,
    son,
    avancer: (secondes: number) => {
      for (let t = 0; t < secondes; t += 0.05) etape(0.05);
    },
  });
}
