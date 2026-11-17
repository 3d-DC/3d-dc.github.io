import type { EquipmentKind, EquipmentSpec, Famille, ViewId } from './types';

/** Couleur d'accent de chaque famille (bandeau des racks, pastille des fiches). */
export const COULEUR_FAMILLE: Record<Famille, string> = {
  Réseau: '#3b82f6',
  Sécurité: '#ef4444',
  Calcul: '#a855f7',
  Stockage: '#f59e0b',
  Sauvegarde: '#14b8a6',
  Supervision: '#e5e7eb',
  Énergie: '#facc15',
  Refroidissement: '#38bdf8',
  Infrastructure: '#94a3b8',
  Services: '#22d3ee',
};

/**
 * Fiches descriptives. Le type `Record<EquipmentKind, …>` garantit qu'aucun
 * équipement cliquable n'est laissé sans fiche. Les valeurs chiffrées sont
 * indicatives et reprennent les ordres de grandeur du cahier de caractéristiques.
 */
export const CATALOGUE: Record<EquipmentKind, EquipmentSpec> = {
  conteneur: {
    nom: 'Module préfabriqué 40 pieds double largeur',
    famille: 'Infrastructure',
    role: 'Deux coques au gabarit ISO assemblées côte à côte : la salle informatique, l’énergie et le refroidissement y tiennent sur deux rangées de baies.',
    caracteristiques: [
      'Assemblé et testé en atelier, livré prêt à raccorder',
      'Site requis : une dalle, une alimentation électrique, une connexion réseau',
      'Coque résistante, porte sécurisée',
      'Densité de 20 kW à 250 kW selon la configuration',
    ],
    redondance:
      'Jusqu’à cinq modules côte à côte, ajoutés à chaud (« effet Lego ») : reliés par des passages, ou réunis en une seule salle.',
  },
  'rack-reseau': {
    nom: 'Baie réseau',
    famille: 'Réseau',
    role: 'Interconnecte les équipements du module et raccorde le site à la fibre inter-sites.',
    caracteristiques: ['Switchs d’accès et de cœur', 'Routeurs', 'Arrivée de la fibre optique inter-sites'],
    redondance: 'Équipements doublés, chemins réseau redondants.',
  },
  'rack-securite': {
    nom: 'Baie sécurité',
    famille: 'Sécurité',
    role: 'Filtre et contrôle les flux entrants, sortants et inter-sites.',
    caracteristiques: ['Firewalls', 'Serveurs de sécurité', 'Segmentation des flux'],
    redondance: 'Firewalls en grappe (un nœud prend le relais de l’autre).',
  },
  'rack-calcul': {
    nom: 'Baie de calcul',
    famille: 'Calcul',
    role: 'Héberge les serveurs qui exécutent les machines virtuelles et les services cloud.',
    caracteristiques: [
      'Serveurs de calcul (hyperviseurs) qui font tourner les machines virtuelles',
      'Dont 2 serveurs GPU Dell R760xa (4× NVIDIA A100 chacun), repérés par un liseré vert',
      'Plus de 20 kW par baie possible',
    ],
    redondance: 'Grappe de virtualisation : les VM redémarrent sur un autre serveur en cas de panne.',
  },
  'rack-stockage': {
    nom: 'Baie de stockage',
    famille: 'Stockage',
    role: 'Conserve les données des machines virtuelles et les réplique vers l’autre site.',
    caracteristiques: ['Serveurs et baies de stockage', 'Réplication inter-sites par la fibre'],
    redondance: 'Données protégées localement et répliquées sur le site distant.',
  },
  'rack-sauvegarde': {
    nom: 'Baie de sauvegarde',
    famille: 'Sauvegarde',
    role: 'Garde des copies restaurables des données, indépendantes de la production.',
    caracteristiques: ['Serveurs de sauvegarde', 'Rétention de plusieurs générations de copies'],
    redondance: 'Copies externalisées sur le second site.',
  },
  'rack-supervision': {
    nom: 'Baie de supervision',
    famille: 'Supervision',
    role: 'Surveille l’état des équipements, de l’énergie, de la température et de la sûreté.',
    caracteristiques: ['Serveurs de supervision', 'Collecte des alarmes', 'Enregistrement des caméras'],
    redondance: 'Supervision croisée : chaque site surveille aussi l’autre.',
  },
  inrow: {
    nom: 'Climatisation de proximité (In-Row)',
    famille: 'Refroidissement',
    role: 'Refroidit l’air au plus près des baies, entre l’allée chaude et l’allée froide.',
    caracteristiques: [
      'Unité insérée dans la rangée de baies',
      'Confinement des allées chaude et froide',
      'Freecooling possible selon le climat',
      'Objectif : un PUE très bas',
    ],
    redondance: 'N+1 : une unité peut tomber sans perte de refroidissement.',
  },
  aerorefroidisseur: {
    nom: 'Aérorefroidisseur',
    famille: 'Refroidissement',
    role: 'Rejette à l’extérieur la chaleur captée par les climatisations In-Row.',
    caracteristiques: [
      'Posé sur le toit du module, un par rangée de baies',
      'Ventilateurs à vitesse variable',
      'Freecooling : refroidissement par l’air extérieur quand il fait assez frais',
    ],
    redondance: 'Les deux unités se secourent : une seule suffit à faible charge.',
  },
  escalier: {
    nom: 'Escalier et passerelle',
    famille: 'Infrastructure',
    role: 'Desservent les modules superposés à l’étage.',
    caracteristiques: ['Passerelle le long des portes de l’étage', 'Garde-corps sur tout le parcours'],
    redondance: null,
  },
  'monte-charge': {
    nom: 'Monte-charge',
    famille: 'Infrastructure',
    role: 'Hisse les baies et le matériel jusqu’aux modules de l’étage.',
    caracteristiques: ['Plateforme à la hauteur de la passerelle', 'Portillons de sécurité en haut et en bas'],
    redondance: null,
  },
  onduleur: {
    nom: 'Onduleur',
    famille: 'Énergie',
    role: 'Fournit un courant propre et continu, et prend le relais instantanément en cas de coupure.',
    caracteristiques: ['Alimentation sans interruption', 'Filtre les perturbations du réseau électrique'],
    redondance: 'Architecture N, N+1 ou 2N selon le niveau visé.',
  },
  batteries: {
    nom: 'Armoires de batteries',
    famille: 'Énergie',
    role: 'Stockent l’énergie restituée par l’onduleur pendant une coupure.',
    caracteristiques: ['Autonomie de 30 minutes à plusieurs heures', 'Couvrent le démarrage du groupe électrogène'],
    redondance: 'Plusieurs branches de batteries en parallèle.',
  },
  tableau: {
    nom: 'Tableau de distribution électrique',
    famille: 'Énergie',
    role: 'Reçoit les sources d’énergie et distribue le courant aux baies et au refroidissement.',
    caracteristiques: ['Distribution électrique intégrée au module', 'Bascule automatique entre les sources'],
    redondance: 'Deux voies d’alimentation par baie en architecture 2N.',
  },
  extinction: {
    nom: 'Détection et extinction incendie',
    famille: 'Sécurité',
    role: 'Détecte un départ de feu le plus tôt possible, alerte, met la salle en sécurité puis l’éteint au gaz inerte, sans eau ni résidu.',
    caracteristiques: [
      'Détection précoce par aspiration : l’air est prélevé en continu au plafond et analysé',
      'Détecteurs ponctuels sur deux boucles : l’extinction exige une double détection',
      'Centrale ECS / CMSI : alarme, asservissements (arrêt de la clim, clapets coupe-feu), report à la supervision',
      'Commandes à l’entrée : alarme manuelle, déclenchement manuel, arrêt d’urgence ; temporisation de 30 s',
      'Trois bouteilles d’IG-541 (azote, argon, CO₂) à 300 bar, collecteur, réseau et diffuseurs',
      'Clapet de surpression, flashs et sirènes, panneau « Gaz émis, ne pas entrer », extincteurs CO₂',
    ],
    redondance: 'Double détection avant toute émission ; commande manuelle de secours et arrêt d’urgence ; gaz sans danger pour les équipements.',
  },
  'controle-acces': {
    nom: 'Contrôle d’accès',
    famille: 'Sécurité',
    role: 'Autorise l’entrée aux seules personnes habilitées et trace les passages.',
    caracteristiques: ['Lecteur de badge au portail et à la porte du module', 'Journal des accès'],
    redondance: null,
  },
  camera: {
    nom: 'Caméra de supervision',
    famille: 'Supervision',
    role: 'Surveille en continu le périmètre et l’intérieur du module.',
    caracteristiques: ['Vidéosurveillance du périmètre et de la salle', 'Images enregistrées en baie de supervision'],
    redondance: null,
  },
  groupe: {
    nom: 'Groupe électrogène',
    famille: 'Énergie',
    role: 'Produit l’électricité du site quand le réseau public est indisponible.',
    caracteristiques: ['Démarrage automatique à la coupure', 'Autonomie liée à la réserve de carburant'],
    redondance: 'Source de secours derrière le réseau public et les batteries.',
  },
  solaire: {
    nom: 'Champ solaire',
    famille: 'Énergie',
    role: 'Fournit une énergie d’appoint qui réduit la consommation sur le réseau et le carburant.',
    caracteristiques: ['Panneaux photovoltaïques au sol', 'Production en journée'],
    redondance: 'Source complémentaire, ne remplace pas les autres.',
  },
  secteur: {
    nom: 'Arrivée du réseau électrique',
    famille: 'Énergie',
    role: 'Point de livraison du réseau public, source principale du site.',
    caracteristiques: ['Poste de transformation', 'Source principale en fonctionnement normal'],
    redondance: 'Secourue par l’onduleur, puis par le groupe électrogène.',
  },
  cloture: {
    nom: 'Clôture périmétrique',
    famille: 'Sécurité',
    role: 'Délimite et protège l’emprise du site.',
    caracteristiques: ['Clôture grillagée', 'Portail à contrôle d’accès'],
    redondance: null,
  },
  fibre: {
    nom: 'Liaison fibre optique inter-sites',
    famille: 'Réseau',
    role: 'Relie DC1 et DC2 pour répliquer les données et basculer les services.',
    caracteristiques: ['Distance d’environ 100 km', 'Transporte la réplication et la synchronisation'],
    redondance: 'Un second chemin de fibre distinct est recommandé.',
  },
  vm: {
    nom: 'Machines virtuelles et services cloud',
    famille: 'Services',
    role: 'Une VM est un ordinateur logiciel : l’hyperviseur découpe chaque serveur physique en plusieurs machines isolées, chacune avec son système et son application.',
    caracteristiques: [
      'Plaque lumineuse : VM en service, avec le nom de son application',
      'Faisceau cyan : processeur et mémoire prêtés par les serveurs de la baie de calcul',
      'Faisceau violet : ses disques virtuels sont des fichiers sur la baie de stockage',
      'Plaque pâle : réplique en attente, copiée sur le site de secours et prête à démarrer',
    ],
    redondance: 'Répliquées sur l’autre site pour la reprise après sinistre.',
  },
  utilisateurs: {
    nom: 'Utilisateurs et applications',
    famille: 'Services',
    role: 'Consomment les services hébergés ; leur trafic suit le ou les sites actifs.',
    caracteristiques: ['Trafic redirigé automatiquement lors d’une bascule'],
    redondance: null,
  },
};

export const NOM_VUE: Record<ViewId, string> = {
  ensemble: 'Vue d’ensemble',
  dc1: 'DC1',
  'dc1-interieur': 'DC1 · intérieur',
  'dc1-energie': 'DC1 · énergie',
  'dc1-modules': 'DC1 · modules',
  'dc1-salle': 'DC1 · salle',
  'dc1-toit': 'DC1 · toit',
  dc2: 'DC2',
  'dc2-interieur': 'DC2 · intérieur',
  'dc2-energie': 'DC2 · énergie',
  'dc2-modules': 'DC2 · modules',
  'dc2-salle': 'DC2 · salle',
  'dc2-toit': 'DC2 · toit',
  fibre: 'Liaison fibre',
};
