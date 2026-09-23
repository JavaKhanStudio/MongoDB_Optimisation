// =====================================================================
//  DB 2 — Les tortues : le chargement de la base NON OPTIMISEE
// =====================================================================
//  Joue par : make tortues     (make tortues VOLUME=10 pour dix fois plus)
//
//  Le modele part de celui de « SQL vers NoSQL », avec UN changement, et
//  il est assume : les observations ne sont plus DANS la tortue.
//  A 139 tortues et 727 observations, les embarquer etait le bon choix.
//  A 10 000 tortues suivies pendant huit ans, le tableau ne s'arrete
//  jamais de grossir — c'est le 1:N non borne, et il sort.
//
//  Ce qui reste recopie l'est comme avant : l'espece et l'habitat sont
//  dans la tortue, le protocole dans son programme.
//
//  AUCUN index en dehors de ceux des _id. AUCUN champ recopie entre
//  observations et tortues.
//
//  LES DONNEES NE SONT PAS UN DUMP : elles se fabriquent ici, a partir
//  d'une graine. Meme graine, meme base, partout.
// =====================================================================

load("/projet/sujets/outils.js");
load("/projet/sujets/2-tortues/requetes.js");

const V = (typeof VOLUME === "undefined") ? 1 : VOLUME;
const G = (typeof GRAINE === "undefined") ? 20260920 : GRAINE;
const t = tireur(G);

const NB_TORTUES      = 10000 * V;
const NB_OBSERVATIONS = 90000 * V;
const DEBUT = new Date(Date.UTC(2019, 0, 1));
const FIN   = new Date(Date.UTC(2026, 11, 31));

const base = db.getSiblingDB("tortues");
base.dropDatabase();

// =====================================================================
//  1. Le referentiel
// =====================================================================

const HABITATS = [
  ["Récif de Toliara", true], ["Baie de Palawan", true], ["Golfe du Mexique", false],
  ["Grande Barrière de corail", true], ["Archipel des Chagos", true],
  ["Côte des Squelettes", true], ["Mer d'Andaman", false], ["Golfe de Guinée", false],
  ["Îles Galápagos", true], ["Baie de Sepetiba", false], ["Récif de Ningaloo", true],
  ["Côte de Guyane", true], ["Mer de Sulu", false], ["Delta de l'Orénoque", true]
];

// Les seize sites de « SQL vers NoSQL », et de quoi en faire soixante :
// une egalite sur le site doit rester selective.
const SITES_CONNUS = [
  ["Lady Elliot", 3], ["Cairns", 3], ["Anakao", 0], ["Toliara", 0], ["Cabo Rojo", 2],
  ["Padre Island", 2], ["El Nido", 1], ["Heron Island", 3], ["Tecolutla", 2],
  ["Exmouth", 10], ["Coral Bay", 10], ["São Tomé", 7], ["Príncipe", 7],
  ["Awala-Yalimapo", 11], ["Rémire", 11], ["Peros Banhos", 4]
];
const SITES_MORCEAUX = ["Pointe", "Anse", "Plage", "Banc", "Passe", "Baie", "Cap", "Ilot",
  "Lagon", "Barre", "Crique", "Motu"];
const SITES_SUFFIXES = ["Nord", "Sud", "Est", "Ouest", "Neuve", "Rouge", "Blanche",
  "aux Palmes", "des Nids", "du Large", "de Sable", "aux Coraux"];

const habitats = HABITATS.map(h => ({ _id: h[0], aireProtegee: h[1] }));
const sites = SITES_CONNUS.map(s => ({ _id: s[0], habitat: HABITATS[s[1]][0] }));
const vus = new Set(sites.map(s => s._id));
for (const m of SITES_MORCEAUX) for (const s of SITES_SUFFIXES) {
  if (sites.length >= 60) break;
  const nom = m + " " + s;
  if (vus.has(nom)) continue;
  vus.add(nom);
  sites.push({ _id: nom, habitat: t.choix(habitats)._id });
}

// Les six especes, et leur statut UICN. La pondération fait le sujet :
// « en danger critique » doit rester rare, sinon R3 ne trie rien.
const ESPECES = [
  { nomScientifique: "Chelonia mydas",         nomCommun: "Tortue verte",       statutUicn: "EN", poids: 30 },
  { nomScientifique: "Caretta caretta",        nomCommun: "Tortue caouanne",    statutUicn: "VU", poids: 24 },
  { nomScientifique: "Natator depressus",      nomCommun: "Tortue a dos plat",  statutUicn: "DD", poids: 12 },
  { nomScientifique: "Eretmochelys imbricata", nomCommun: "Tortue imbriquee",   statutUicn: "CR", poids:  8 },
  { nomScientifique: "Dermochelys coriacea",   nomCommun: "Tortue luth",        statutUicn: "VU", poids: 14 },
  { nomScientifique: "Lepidochelys olivacea",  nomCommun: "Tortue olivatre",    statutUicn: "VU", poids: 12 }
];
const TIRAGE_ESPECE = ESPECES.map(e => [e, e.poids]);

const ORGANISATIONS = [["CNRS", "France"], ["Ministère de la Transition écologique", "France"],
  ["AIMS", "Australie"], ["WWF México", "Mexique"], ["IUCN", "Thaïlande"],
  ["Ifremer", "France"], ["Charles Darwin Foundation", "Équateur"]];

const PROGRAMMES = [
  ["Argos Océan Indien", "ARGOI", 0, null, "ACTIF", 0], ["Plan national tortue luth", "PNTL", 1, 2030, "ACTIF", 4],
  ["Reef Watch Queensland", "RWQ", 2, null, "ACTIF", 0], ["Golfo Azul", "GAZ", 3, null, "ACTIF", 1],
  ["Turtle Watch Andaman", "TWA", 4, 2027, "ACTIF", 3], ["Sea Turtle Genome Project", "STGP", 0, 2028, "ACTIF", null],
  ["Kélonia Réunion", "KEL", 5, null, "SUSPENDU", null], ["Galápagos Nesting Survey", "GNS", 6, 2024, "TERMINE", 0],
  ["Nesting Beach Watch", "NBW", 2, null, "ACTIF", null], ["Bycatch Observer Network", "BON", 4, 2029, "ACTIF", null],
  ["Sargasso Tracking", "SART", 0, null, "ACTIF", 4], ["Coral Triangle Turtles", "CTT", 2, 2031, "ACTIF", 3]
];
const MARQUAGES = ["Balise Argos SPOT-6", "Marquage PIT + Argos", "Marquage externe titane",
  "Marquage externe inconel", "Photo-identification", "Balise satellite Fastloc"];

const programmes = PROGRAMMES.map(p => {
  const doc = {
    _id: p[1], nom: p[0], statut: p[4],
    organisation: { nom: ORGANISATIONS[p[2]][0], pays: ORGANISATIONS[p[2]][1] },
    protocole: { intervalleJours: t.choix([14, 21, 30, 60, 90]), methodeMarquage: t.choix(MARQUAGES) }
  };
  // NULL = « sans terme » et NULL = « toutes especes » : cote document,
  // le champ est simplement ABSENT.
  if (p[3] !== null) doc.anneeFin = p[3];
  if (p[5] !== null) doc.especeCible = ESPECES[p[5]].nomScientifique;
  return doc;
});

const TAGS = ["balise-argos", "adulte", "juvénile", "pondeuse", "vétérane", "récif",
  "jamais-revue", "capture-accidentelle", "migration-longue", "génotypée", "nid-suivi",
  "réhabilitée", "relachée", "blessure-helice"];

const OBSERVATEURS_CONNUS = ["Aline Roy", "Marc Vidal", "Hery Rakoto", "Lucia Mendez",
  "Tom Baker", "Ana Cruz", "James Okoro", "Ines Duarte", "Naina Andria", "Sophie Lambert"];
const PRENOMS = ["Awa", "Bruno", "Carla", "Diego", "Elena", "Farid", "Gabriela", "Hugo",
  "Iris", "Jonas", "Keiko", "Lena", "Malik", "Nina", "Omar", "Paula", "Quentin", "Rosa",
  "Samir", "Tania", "Ulysse", "Vera", "Wiam", "Yannick"];
const NOMS_FAMILLE = ["Moreau", "Silva", "Okafor", "Nakamura", "Ferreira", "Diallo",
  "Kowalski", "Romero", "Bennani", "Lindqvist", "Tavares", "Rasoa"];

const observateurs = OBSERVATEURS_CONNUS.slice();
const vusObs = new Set(observateurs);
for (const p of PRENOMS) for (const f of NOMS_FAMILLE) {
  if (observateurs.length >= 120) break;
  const nom = p + " " + f;
  if (vusObs.has(nom)) continue;
  vusObs.add(nom);
  observateurs.push(nom);
}

titre("Le referentiel");
verser(base.habitats, habitats);       dire(g("habitats", 16) + d(habitats.length, 8));
verser(base.sites, sites);             dire(g("sites", 16) + d(sites.length, 8));
verser(base.programmes, programmes);   dire(g("programmes", 16) + d(programmes.length, 8));
verser(base.especes, ESPECES.map(e => ({ _id: e.nomScientifique, nomCommun: e.nomCommun,
                                         statutUicn: e.statutUicn })));
dire(g("especes", 16) + d(ESPECES.length, 8));

// =====================================================================
//  2. Les tortues
// =====================================================================
//  L'espece et l'habitat restent RECOPIES dans la tortue : c'etait deja
//  le choix de « SQL vers NoSQL », et il tient. Ce qui manque, c'est
//  l'index sur les tags.

const NOMS_TORTUE = ["Crush", "Goliath", "Squirt", "Kaia", "Nemo", "Ariel", "Bubbles",
  "Coco", "Dune", "Echo", "Flipper", "Gaia", "Haku", "Indigo", "Jade", "Koa", "Luna",
  "Mako", "Nori", "Opale", "Perle", "Quartz", "Reef", "Sable", "Tika", "Ulva", "Vaguelette",
  "Wave", "Xola", "Yara", "Zephyr", "Ambre", "Brise", "Corail", "Dorade", "Ecume"];

// Le statut UICN de chaque tortue, garde a part : c'est tout ce dont la
// reponse attendue de R5 a besoin, et 10 000 chaines coutent moins cher
// que 10 000 documents.
const statutDeTortue = new Array(NB_TORTUES + 1);
const attR3 = [], attR4 = [];

titre("Les tortues");
let id = 0;
const LOT = 10000;
while (id < NB_TORTUES) {
  const lot = [];
  const jusqua = Math.min(id + LOT, NB_TORTUES);
  while (id < jusqua) {
    id++;
    const e = t.pondere(TIRAGE_ESPECE);
    const tags = [];
    for (let k = t.entier(0, 4); k > 0; k--) {
      const lib = t.choix(TAGS);
      if (tags.indexOf(lib) < 0) tags.push(lib);
    }
    const insc = [];
    for (let k = t.entier(0, 2); k > 0; k--) {
      const p = t.choix(programmes);
      if (!insc.some(i => i.acronyme === p._id))
        insc.push({ acronyme: p._id, dateInscription: t.date(DEBUT, FIN) });
    }
    const doc = {
      _id: id,
      nom: t.choix(NOMS_TORTUE) + " " + d(id, 5),
      espece: { nomScientifique: e.nomScientifique, nomCommun: e.nomCommun,
                statutUicn: e.statutUicn },
      mensurations: { longueurDossiereCm: t.arrondi(38, 165, 1), poidsKg: t.arrondi(9, 420, 1) },
      tags: tags,
      programmes: insc
    };
    // Une tortue sur trente n'a pas d'habitat connu : le champ est
    // ABSENT, comme Goliath dans « SQL vers NoSQL ».
    if (!t.chance(1 / 30)) {
      const h = t.choix(habitats);
      doc.habitat = { nom: h._id, aireProtegee: h.aireProtegee };
    }
    statutDeTortue[id] = e.statutUicn;
    lot.push(doc);
    if (doc.mensurations.poidsKg >= PARAM.poidsMin) attR3.push(ligneR3(doc));
    if (doc.tags.indexOf(PARAM.tag) >= 0) attR4.push(ligneR4(doc));
  }
  base.tortues.insertMany(lot, { ordered: false });
  if (id % 20000 === 0) dire(d(n(id), 9) + " tortues");
}
dire(d(n(NB_TORTUES), 9) + " tortues en tout");

// =====================================================================
//  3. Les observations — sorties de la tortue, et sans rien savoir d elle
// =====================================================================

const attR1 = [], attR2 = [], attR5 = new Map(), attR6 = [];
// Le nombre d'observations de chaque tortue : R7 en garde les dix
// premieres. Un entier par tortue, pas un document.
const vuesDe = new Array(NB_TORTUES + 1).fill(0);

titre("Les observations");
id = 0;
while (id < NB_OBSERVATIONS) {
  const lot = [];
  const jusqua = Math.min(id + LOT, NB_OBSERVATIONS);
  while (id < jusqua) {
    id++;
    const o = {
      _id: id,
      tortue: t.entier(1, NB_TORTUES),     // l'observation connait la tortue ...
      site: t.choix(sites)._id,
      observateur: t.choix(observateurs),
      date: t.date(DEBUT, FIN),
      scoreSante: t.entier(1, 10)          // ... mais rien de son espece.
    };
    lot.push(o);

    if (o.observateur === PARAM.observateur) attR1.push(ligneR1(o));
    if (o.site === PARAM.site && o.date >= PARAM.anneeDebut && o.date < PARAM.anneeFin)
      attR2.push(ligneR2(o));
    if (o.date >= PARAM.moisDebut && o.date < PARAM.moisFin
        && statutDeTortue[o.tortue] === PARAM.statutUicn) {
      const a = attR5.get(o.site) || { _id: o.site, somme: 0, n: 0 };
      a.somme += o.scoreSante; a.n++;
      attR5.set(o.site, a);
    }
    if (o.site === PARAM.siteMois && o.date.getUTCFullYear() === PARAM.annee
        && o.date.getUTCMonth() + 1 === PARAM.mois) attR6.push(ligneR6(o));
    vuesDe[o.tortue]++;
  }
  base.observations.insertMany(lot, { ordered: false });
  if (id % 120000 === 0) dire(d(n(id), 9) + " observations");
}
dire(d(n(NB_OBSERVATIONS), 9) + " observations en tout");

// =====================================================================
//  4. La reponse attendue des sept requetes
// =====================================================================

base.reference.insertMany([
  { _id: "R1", intitule: "Les observations d un observateur",       lignes: attR1.sort() },
  { _id: "R2", intitule: "Les observations d un site sur une annee", lignes: attR2.sort() },
  { _id: "R3", intitule: "Les tortues les plus lourdes",            lignes: attR3.sort() },
  { _id: "R4", intitule: "Les tortues portant un tag",              lignes: attR4.sort() },
  { _id: "R5", intitule: "Score moyen des especes en danger critique",
    lignes: [...attR5.values()].map(ligneR5).sort() },
  { _id: "R6", intitule: "Les observations d un site sur un mois",  lignes: attR6.sort() },
  { _id: "R7", intitule: "Les dix tortues les plus observees",
    lignes: vuesDe.map((n, id) => ({ _id: id, n: n })).filter(r => r.n > 0)
                  .sort((a, b) => b.n - a.n || a._id - b._id).slice(0, 10)
                  .map(ligneR7).sort() }
]);

titre("La base tortues est chargee — et n a aucun index");
for (const nomCol of ["habitats", "sites", "especes", "programmes", "tortues", "observations"])
  dire(g(nomCol, 16) + d(n(base.getCollection(nomCol).countDocuments()), 10) + " documents");
dire("");
dire("index en place (hors _id) : " + (indexPoses(base).length || "aucun"));
dire("");
dire("  l enonce : sujets/2-tortues/SUJET.md     les requetes : make tortues-mesurer");
print("");
