import type { Scenario, SiteState, WorldState } from '../types';

function siteNominal(): SiteState {
  return {
    role: 'actif',
    charge: 60,
    secteur: true,
    surBatterie: false,
    groupe: false,
    solaire: true,
    vmActives: 6,
    vmRepliques: 0,
    modules: 1,
    assemblage: 'cloisonne',
    disposition: 'horizontale',
  };
}

/** État de référence : DC1 en production, DC2 en secours, réplication DC1 → DC2. */
export function etatInitial(): WorldState {
  return {
    sites: {
      DC1: siteNominal(),
      DC2: { ...siteNominal(), role: 'passif', charge: 0, vmActives: 0, vmRepliques: 6 },
    },
    lien: { mode: 'replication', source: 'DC1' },
    trafic: { DC1: 1, DC2: 0 },
  };
}

function sinistrer(site: SiteState): void {
  site.role = 'sinistre';
  site.charge = 0;
  site.vmActives = 0;
  site.vmRepliques = 0;
  site.secteur = false;
  site.solaire = false;
  site.groupe = false;
  site.surBatterie = false;
}

const visite: Scenario = {
  id: 'visite',
  nom: 'Visite guidée',
  resume: 'Tour des deux sites et de leurs équipements.',
  etapes: [
    {
      titre: 'Deux sites, une liaison',
      texte:
        'Deux datacenters modulaires, DC1 et DC2, sont reliés par une fibre optique d’environ 100 km. La distance met les deux sites à l’abri d’un même sinistre.',
      duree: 9,
      vue: 'ensemble',
      affichage: { coupe: false, circuit: 'aucun' },
    },
    {
      titre: 'Un module préfabriqué',
      texte:
        'Chaque site tient dans un module préfabriqué de 40 pieds, en double largeur, assemblé et testé en atelier. Sur place, il suffit d’une dalle, d’une alimentation électrique et d’une connexion réseau.',
      duree: 10,
      vue: 'dc1',
    },
    {
      titre: 'Une énergie redondante',
      texte:
        'Trois sources alimentent le site : le réseau public, le groupe électrogène et le champ solaire. L’onduleur et ses batteries assurent la continuité entre elles.',
      duree: 10,
      vue: 'dc1-energie',
    },
    {
      titre: 'La salle informatique',
      texte:
        'Huit baies, sur deux rangées en vis-à-vis, regroupent le réseau, la sécurité, le calcul, le stockage, la sauvegarde et la supervision. Au fond du module, le tableau électrique, les onduleurs et les batteries ; près de l’entrée, l’extinction incendie.',
      duree: 12,
      vue: 'dc1-interieur',
      affichage: { coupe: true },
    },
    {
      titre: 'Un refroidissement de proximité',
      texte:
        'Quatre climatisations In-Row encadrent les rangées. L’allée froide centrale (bleue), confinée sous son toit vitré, alimente la face avant des baies ; l’air chaud (rouge) est rejeté à l’arrière de chaque rangée.',
      duree: 10,
      vue: 'dc1-interieur',
      affichage: { coupe: true, circuit: 'air' },
    },
    {
      titre: 'Le site de secours',
      texte:
        'DC2 est identique à DC1. Il reçoit en continu les données répliquées et se tient prêt à reprendre les services.',
      duree: 9,
      vue: 'dc2',
      affichage: { coupe: false, circuit: 'aucun' },
    },
  ],
};

const actifPassif: Scenario = {
  id: 'actif-passif',
  nom: 'Reprise actif-passif',
  resume: 'DC1 produit, DC2 attend et prend le relais après un sinistre.',
  etapes: [
    {
      titre: 'Situation nominale',
      texte:
        'DC1 porte toute la production et reçoit tout le trafic des utilisateurs. DC2 est en attente, avec des répliques des machines virtuelles.',
      duree: 9,
      vue: 'ensemble',
      affichage: { coupe: false, circuit: 'aucun' },
    },
    {
      titre: 'Réplication continue',
      texte:
        'Les données de DC1 sont répliquées vers DC2 par la fibre. L’écart entre les deux copies détermine la perte de données maximale en cas de sinistre (RPO).',
      duree: 9,
      vue: 'fibre',
    },
    {
      titre: 'Sinistre sur DC1',
      texte:
        'DC1 est perdu : plus d’énergie, plus de machines virtuelles, la réplication s’arrête. Le service est interrompu pour les utilisateurs.',
      duree: 9,
      vue: 'dc1',
      action: (e) => {
        sinistrer(e.sites.DC1);
        e.lien.mode = 'coupee';
        e.trafic.DC1 = 0;
      },
    },
    {
      titre: 'Décision de bascule',
      texte:
        'La supervision de DC2 constate la perte de DC1. La bascule est déclenchée ; sa durée fixe le temps d’interruption du service (RTO).',
      duree: 8,
      vue: 'ensemble',
    },
    {
      titre: 'Activation de DC2',
      texte:
        'Les répliques sont démarrées sur DC2 à partir des dernières données reçues. Le trafic des utilisateurs est redirigé vers DC2.',
      duree: 9,
      vue: 'dc2',
      action: (e) => {
        const dc2 = e.sites.DC2;
        dc2.role = 'actif';
        dc2.vmActives = 6;
        dc2.vmRepliques = 0;
        dc2.charge = 60;
        e.trafic.DC2 = 1;
      },
    },
    {
      titre: 'Retour à la normale',
      texte:
        'DC1 est remis en état puis resynchronisé. Il devient à son tour le site de secours : la réplication repart, cette fois de DC2 vers DC1.',
      duree: 10,
      vue: 'ensemble',
      action: (e) => {
        const dc1 = e.sites.DC1;
        dc1.role = 'passif';
        dc1.secteur = true;
        dc1.solaire = true;
        dc1.vmRepliques = 6;
        e.lien = { mode: 'replication', source: 'DC2' };
      },
    },
  ],
};

const actifActif: Scenario = {
  id: 'actif-actif',
  nom: 'Reprise actif-actif',
  resume: 'Les deux sites produisent ; l’un absorbe la charge de l’autre.',
  etapes: [
    {
      titre: 'Deux sites en production',
      texte:
        'DC1 et DC2 servent tous deux les utilisateurs : le trafic est réparti à parts égales et chaque site tourne à mi-charge.',
      duree: 9,
      vue: 'ensemble',
      affichage: { coupe: false, circuit: 'aucun' },
      action: (e) => {
        for (const site of [e.sites.DC1, e.sites.DC2]) {
          site.role = 'actif';
          site.vmActives = 6;
          site.vmRepliques = 0;
          site.charge = 50;
        }
        e.lien = { mode: 'synchro', source: 'DC1' };
        e.trafic = { DC1: 0.5, DC2: 0.5 };
      },
    },
    {
      titre: 'Synchronisation bidirectionnelle',
      texte:
        'Les données circulent dans les deux sens sur la fibre. Chaque site dispose en permanence d’une copie à jour.',
      duree: 9,
      vue: 'fibre',
    },
    {
      titre: 'Sinistre sur DC2',
      texte:
        'DC2 est perdu. Le trafic se reporte aussitôt sur DC1, déjà en production : les utilisateurs ne subissent pas d’interruption.',
      duree: 9,
      vue: 'dc2',
      action: (e) => {
        sinistrer(e.sites.DC2);
        e.lien.mode = 'coupee';
        e.trafic = { DC1: 1, DC2: 0 };
        e.sites.DC1.charge = 100;
      },
    },
    {
      titre: 'DC1 absorbe toute la charge',
      texte:
        'DC1 passe à pleine charge. C’est la contrainte de ce mode : chaque site doit être dimensionné pour porter seul la totalité des services.',
      duree: 9,
      vue: 'dc1',
    },
    {
      titre: 'Retour à la normale',
      texte:
        'DC2 est remis en état et resynchronisé, puis le trafic est de nouveau réparti entre les deux sites.',
      duree: 9,
      vue: 'ensemble',
      action: (e) => {
        const dc2 = e.sites.DC2;
        dc2.role = 'actif';
        dc2.secteur = true;
        dc2.solaire = true;
        dc2.vmActives = 6;
        dc2.charge = 50;
        e.sites.DC1.charge = 50;
        e.lien.mode = 'synchro';
        e.trafic = { DC1: 0.5, DC2: 0.5 };
      },
    },
  ],
};

const coupure: Scenario = {
  id: 'coupure',
  nom: 'Coupure du réseau électrique',
  resume: 'Relais par onduleur, puis par le groupe électrogène.',
  etapes: [
    {
      titre: 'Alimentation normale',
      texte:
        'DC1 est alimenté par le réseau public, avec le champ solaire en appoint. Les batteries de l’onduleur sont chargées.',
      duree: 8,
      vue: 'dc1-energie',
      affichage: { coupe: false, circuit: 'aucun' },
    },
    {
      titre: 'Coupure du réseau',
      texte:
        'Le réseau public disparaît. L’onduleur prend le relais instantanément sur ses batteries : les baies ne voient aucune interruption.',
      duree: 9,
      vue: 'dc1-energie',
      action: (e) => {
        e.sites.DC1.secteur = false;
        e.sites.DC1.surBatterie = true;
      },
    },
    {
      titre: 'Démarrage du groupe électrogène',
      texte:
        'Le groupe démarre automatiquement et reprend la charge. Les batteries n’ont servi que le temps du démarrage et se rechargent.',
      duree: 9,
      vue: 'dc1-energie',
      action: (e) => {
        e.sites.DC1.groupe = true;
        e.sites.DC1.surBatterie = false;
      },
    },
    {
      titre: 'Fonctionnement en secours',
      texte:
        'Le site tient tant qu’il y a du carburant. En journée, le champ solaire réduit la consommation du groupe. Les services restent actifs sur DC1 : aucune bascule vers DC2 n’est nécessaire.',
      duree: 10,
      vue: 'dc1',
    },
    {
      titre: 'Retour du réseau',
      texte: 'Le réseau public revient. La charge lui est retransférée, puis le groupe électrogène s’arrête.',
      duree: 8,
      vue: 'dc1-energie',
      action: (e) => {
        e.sites.DC1.secteur = true;
        e.sites.DC1.groupe = false;
      },
    },
  ],
};

const evolutivite: Scenario = {
  id: 'evolutivite',
  nom: 'Évolutivité à chaud',
  resume: 'Ajout d’un second module sans arrêter l’existant.',
  etapes: [
    {
      titre: 'Le besoin augmente',
      texte:
        'La charge de DC1 approche de sa capacité. Un emplacement est déjà réservé sur la dalle pour un second module.',
      duree: 8,
      vue: 'dc1',
      affichage: { coupe: false, circuit: 'aucun' },
      action: (e) => {
        e.sites.DC1.charge = 90;
      },
    },
    {
      titre: 'Livraison du module 2',
      texte:
        'Le nouveau module arrive assemblé et testé en atelier. Il est posé sur la dalle pendant que le module 1 continue de produire.',
      duree: 9,
      vue: 'dc1',
      action: (e) => {
        e.sites.DC1.modules = 2;
      },
    },
    {
      titre: 'Mise en service',
      texte:
        'Le module 2 est raccordé à l’énergie et au réseau du site, puis de nouvelles machines virtuelles y sont déployées. La charge se répartit sur les deux modules.',
      duree: 9,
      vue: 'dc1',
      action: (e) => {
        e.sites.DC1.vmActives = 12;
        e.sites.DC1.charge = 55;
      },
    },
    {
      titre: 'Le site de secours suit',
      texte:
        'Pour que la reprise après sinistre reste possible, DC2 reçoit lui aussi un second module et les répliques correspondantes.',
      duree: 9,
      vue: 'ensemble',
      action: (e) => {
        e.sites.DC2.modules = 2;
        e.sites.DC2.vmRepliques = 12;
      },
    },
  ],
};

const construction: Scenario = {
  id: 'construction',
  nom: 'Construction modulaire',
  resume: 'De un à cinq modules, côte à côte ou en étage, interconnectés.',
  etapes: [
    {
      titre: 'Un premier module',
      texte:
        'Le site démarre avec un seul module : le cœur de réseau, la sécurité, le calcul et le stockage y tiennent sur deux rangées de baies. Les emplacements suivants sont tracés au sol.',
      duree: 9,
      vue: 'dc1-modules',
      affichage: { coupe: true, circuit: 'aucun', interconnexions: true },
    },
    {
      titre: 'Un deuxième module, côte à côte',
      texte:
        'Le module 2 est posé contre le premier. Un passage est ouvert dans la paroi commune, sa baie réseau est reliée au cœur du module 1 par deux liens (en bleu) et la gaine électrique l’alimente (en jaune).',
      duree: 10,
      vue: 'dc1-modules',
      action: (e) => {
        e.sites.DC1.modules = 2;
      },
    },
    {
      titre: 'Montée en puissance',
      texte:
        'Le module 3 rejoint les deux premiers. Pour tenir la nouvelle charge, un deuxième groupe électrogène est installé : l’énergie suit la croissance de la salle.',
      duree: 10,
      vue: 'dc1-modules',
      action: (e) => {
        e.sites.DC1.modules = 3;
      },
    },
    {
      titre: 'Cinq modules',
      texte:
        'Les modules 4 et 5 complètent la dalle. Chaque extension apporte ses baies, sa climatisation, ses onduleurs et ses batteries ; un troisième groupe électrogène sécurise l’ensemble.',
      duree: 10,
      vue: 'dc1-modules',
      action: (e) => {
        e.sites.DC1.modules = 5;
        e.sites.DC1.vmActives = 12;
      },
    },
    {
      titre: 'Une seule salle',
      texte:
        'Les parois communes sont retirées : les cinq modules forment une seule salle informatique continue, toujours raccordée au même cœur de réseau.',
      duree: 10,
      vue: 'dc1-modules',
      action: (e) => {
        e.sites.DC1.modules = 5;
        e.sites.DC1.vmActives = 12;
        e.sites.DC1.assemblage = 'fusionne';
      },
    },
    {
      titre: 'Ou bien en étage',
      texte:
        'Quand la dalle manque de place, les modules se superposent sur deux niveaux. Un escalier, une passerelle et un monte-charge desservent l’étage ; le réseau et l’énergie montent par des colonnes extérieures. L’option « Vue éclatée de l’étage » soulève le niveau du haut pour montrer celui du bas.',
      duree: 12,
      vue: 'dc1-modules',
      action: (e) => {
        e.sites.DC1.assemblage = 'cloisonne';
        e.sites.DC1.disposition = 'etage';
      },
    },
    {
      titre: 'À vous de la parcourir',
      texte:
        'Lancez la « Visite à pied » de DC1 dans le panneau Construction : entrez par la porte du module 1, passez d’un module à l’autre et montez à l’étage par l’escalier.',
      duree: 10,
      vue: 'dc1-interieur',
      affichage: { coupe: true, interconnexions: false },
    },
  ],
};

export const SCENARIOS: readonly Scenario[] = [visite, actifPassif, actifActif, coupure, evolutivite, construction];

/** Rejoue les actions depuis l'état initial jusqu'à l'étape `index` incluse. */
export function calculerEtat(scenario: Scenario, index: number): WorldState {
  const etat = etatInitial();
  for (let i = 0; i <= index; i++) {
    scenario.etapes[i]?.action?.(etat);
  }
  return etat;
}
