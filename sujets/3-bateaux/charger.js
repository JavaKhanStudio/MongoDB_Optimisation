// =====================================================================
//  DB 3 — Les bateaux : le chargement de la base NON OPTIMISEE
// =====================================================================
//  Joue par : make bateaux    (make bateaux VOLUME=10 pour dix fois plus)
//
//  Le modele est celui de « SQL vers NoSQL » : une seule collection pour
//  les civils et les militaires, les quais dans leur port, les
//  cargaisons dans leur escale, les commandements dans leur capitaine.
//
//  Ce qui a disparu par rapport a la correction de « SQL vers NoSQL » :
//  la COPIE du bateau et du port dans l'escale. L'escale ne porte plus
//  que l'imo et le nom du port — une reference, propre et normale.
//  C'est exactement ce qu'on va devoir etendre.
//
//  AUCUN index en dehors de ceux des _id.
//
//  LES DONNEES NE SONT PAS UN DUMP : elles se fabriquent ici, a partir
//  d'une graine. Meme graine, meme base, partout.
// =====================================================================

load("/projet/sujets/outils.js");
load("/projet/sujets/3-bateaux/requetes.js");

const V = (typeof VOLUME === "undefined") ? 1 : VOLUME;
const G = (typeof GRAINE === "undefined") ? 20260920 : GRAINE;
const t = tireur(G);

const NB_BATEAUX    =  4000 * V;
const NB_CAPITAINES =  1500 * V;
const NB_ESCALES    = 94500 * V;
const DEBUT = new Date(Date.UTC(2023, 0, 1));
const FIN   = new Date(Date.UTC(2026, 11, 31));

const base = db.getSiblingDB("bateaux");
base.dropDatabase();

// =====================================================================
//  1. Le referentiel
// =====================================================================

const PORTS_CONNUS = [
  ["Le Havre", "France", 16.0], ["Rotterdam", "Pays-Bas", 24.0],
  ["Singapour", "Singapour", 20.0], ["Shanghai", "Chine", 17.5],
  ["Toulon", "France", 12.0], ["Norfolk", "Etats-Unis", 14.0],
  ["Djibouti", "Djibouti", 18.0], ["Brest", "France", 11.0]
];
const PORTS_AUTRES = [
  ["Anvers", "Belgique", 17.0], ["Hambourg", "Allemagne", 15.1],
  ["Valence", "Espagne", 16.0], ["Le Piree", "Grece", 18.0],
  ["Gioia Tauro", "Italie", 18.0], ["Tanger Med", "Maroc", 18.0],
  ["Alger", "Algerie", 12.0], ["Beyrouth", "Liban", 15.5],
  ["Colombo", "Sri Lanka", 18.0], ["Busan", "Coree du Sud", 17.0],
  ["Yokohama", "Japon", 16.0], ["Vancouver", "Canada", 15.5],
  ["Santos", "Bresil", 15.0], ["Durban", "Afrique du Sud", 12.8],
  ["Oslo", "Norvege", 11.0], ["Gdansk", "Pologne", 16.5]
];
const QUAIS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3", "D1", "D2"];

const ports = PORTS_CONNUS.concat(PORTS_AUTRES).map(p => ({
  _id: p[0], pays: p[1], tirantEauMaxM: p[2],
  // 1:N BORNE : un port a quatre a six quais, et il n'en aura pas
  // cinquante. Le tableau reste DANS le port.
  quais: QUAIS.slice(0, t.entier(4, 6))
}));

const PAVILLONS = [["France", 14], ["Pays-Bas", 12], ["Singapour", 12], ["Chine", 12],
  ["Etats-Unis", 10], ["Panama", 12], ["Liberia", 10], ["Malte", 6], ["Grece", 6],
  ["Japon", 6], ["Norvege", 6], ["Djibouti", 4]];

const ARMATEURS = ["Compagnie Havraise", "Delta Maritime", "Straits Lines",
  "Yangtze Freight", "Ocean Cablier", "Nordic Bulk", "Levant Shipping",
  "Austral Carriers", "Hanseatic Lines", "Pacifique Fret"];
const MARINES = ["Marine nationale", "US Navy", "Marine de la RPC", "Koninklijke Marine",
  "Royal Navy", "Marina Militare"];
const TYPES_CIVILS = ["Porte-conteneurs", "Vraquier", "Petrolier", "Chimiquier",
  "Cablier", "Roulier", "Methanier"];
const CLASSES = ["Fregate Horizon", "Destroyer Arleigh Burke", "Corvette Gowind",
  "Patrouilleur Flamant", "Fregate FREMM", "Porte-helicopteres Mistral"];

// Les dix-huit bateaux de « SQL vers NoSQL » gardent leur imo : le
// Delta Amstel (IMO9500233) est celui dont R1 demande le carnet de bord.
const BATEAUX_CONNUS = [
  ["Etoile de Brest", "IMO9412345", "CIVIL", "France", 13.5, "Le Havre"],
  ["Kerguelen Trader", "IMO9455121", "CIVIL", "France", 10.2, "Le Havre"],
  ["Delta Amstel", "IMO9500233", "CIVIL", "Pays-Bas", 15.2, "Rotterdam"],
  ["Delta Maas", "IMO9500234", "CIVIL", "Pays-Bas", 16.0, "Rotterdam"],
  ["Straits Pioneer", "IMO9611002", "CIVIL", "Singapour", 14.5, "Singapour"],
  ["Straits Meridian", "IMO9611003", "CIVIL", "Singapour", 11.0, "Singapour"],
  ["Yangtze Star", "IMO9722441", "CIVIL", "Chine", 16.5, "Shanghai"],
  ["Yangtze Ember", "IMO9722442", "CIVIL", "Chine", 12.8, "Shanghai"],
  ["Petrel du Nord", "IMO9388771", "CIVIL", "Liberia", 14.0, null],
  ["Cablier Aurore", "IMO9199887", "CIVIL", "France", 8.0, "Brest"],
  ["Ouragan", "IMO4501001", "MILITAIRE", "France", 6.5, "Toulon"],
  ["Vigilante", "IMO4501002", "MILITAIRE", "France", 5.4, "Toulon"],
  ["Sillage", "IMO4501003", "MILITAIRE", "France", 4.2, "Brest"],
  ["Endeavour Point", "IMO4602001", "MILITAIRE", "Etats-Unis", 12.0, "Norfolk"],
  ["Chesapeake", "IMO4602002", "MILITAIRE", "Etats-Unis", 6.8, "Norfolk"],
  ["Long March Tide", "IMO4703001", "MILITAIRE", "Chine", 6.0, null],
  ["Zeeland", "IMO4804001", "MILITAIRE", "Pays-Bas", 5.6, null],
  ["Lame de Fond", "IMO4501004", "MILITAIRE", "France", 9.5, "Toulon"]
];

const NOMS_A = ["Etoile", "Petrel", "Albatros", "Mistral", "Sirocco", "Aurore", "Corsaire",
  "Meridien", "Boreal", "Austral", "Cormoran", "Goeland", "Tramontane", "Alize", "Zephyr",
  "Ocean", "Vent", "Lame", "Ecume", "Sillage", "Maree", "Cap", "Phare", "Ancre"];
const NOMS_B = ["du Nord", "de Brest", "des Glenan", "d Ouessant", "du Ponant", "du Levant",
  "de Malte", "d Anvers", "du Cap", "des Sables", "de Mer", "d Argent", "de Fer",
  "du Large", "de Minuit", "d Orient"];

// Le pavillon de chaque bateau, garde a part : c'est tout ce dont la
// reponse attendue de R5 a besoin.
const pavillonDe = new Map();
const bateaux = [];
const imos = [];

function poserBateau(doc) {
  bateaux.push(doc);
  imos.push(doc._id);
  pavillonDe.set(doc._id, doc.pavillon);
}

function garnir(doc) {
  if (doc.categorie === "CIVIL") {
    doc.armateur     = t.choix(ARMATEURS);
    doc.typeCivil    = t.choix(TYPES_CIVILS);
    doc.portEnLourdT = t.entier(3000, 210000);
    // NULL hors porte-conteneurs : le champ est ABSENT, pas vide.
    if (doc.typeCivil === "Porte-conteneurs") doc.capaciteEvp = t.entier(800, 24000);
  } else {
    doc.marine              = t.choix(MARINES);
    doc.classe              = t.choix(CLASSES);
    doc.equipage            = t.entier(40, 1800);
    doc.propulsionNucleaire = t.chance(0.12);
  }
  return doc;
}

for (const b of BATEAUX_CONNUS) {
  const doc = { _id: b[1], nom: b[0], categorie: b[2], pavillon: b[3], tirantEauM: b[4] };
  if (b[5] !== null) doc.portAttache = b[5];
  poserBateau(garnir(doc));
}
let suite = 9000000;
while (bateaux.length < NB_BATEAUX) {
  suite += t.entier(3, 29);
  const doc = {
    _id: "IMO" + suite,
    nom: t.choix(NOMS_A) + " " + t.choix(NOMS_B),
    categorie: t.pondere([["CIVIL", 82], ["MILITAIRE", 18]]),
    pavillon: t.pondere(PAVILLONS),
    tirantEauM: t.arrondi(3.5, 22.0, 1)
  };
  if (!t.chance(0.08)) doc.portAttache = t.choix(ports)._id;
  poserBateau(garnir(doc));
}

titre("Le referentiel");
verser(base.ports, ports);      dire(g("ports", 14) + d(n(ports.length), 9));
verser(base.bateaux, bateaux);  dire(g("bateaux", 14) + d(n(bateaux.length), 9));

// Les capitaines, et leurs commandements dedans : une affectation n'a
// pas d'autre vie que la paire qu'elle relie.
const BREVETS = ["CAPITAINE ILLIMITE", "CAPITAINE 3000", "OFFICIER DE MARINE",
  "CAPITAINE 500", "SECOND CAPITAINE"];
const PRENOMS = ["Helene", "Jan", "Wei", "Aisha", "Marc", "Sarah", "Lim", "Pieter",
  "Nadia", "Tomas", "Yuki", "Karim", "Elsa", "Diego", "Anna", "Olav", "Rania", "Bjorn",
  "Chiara", "Ousmane", "Ingrid", "Rafael", "Mei", "Lukas"];
const PATRONYMES = ["Mercier", "Verhoeven", "Chen", "Farah", "Ollivier", "Whitfield",
  "Boon Hock", "Bakker", "Lindgren", "Moretti", "Da Silva", "Nakagawa", "Haddad",
  "Novak", "Fernandez", "Keita"];

const capitaines = [];
const nomsVus = new Set();
let k = 0;
while (capitaines.length < NB_CAPITAINES) {
  const nom = t.choix(PRENOMS) + " " + t.choix(PATRONYMES) + (k > 380 ? " " + d(++k, 4) : "");
  k++;
  if (nomsVus.has(nom)) continue;
  nomsVus.add(nom);
  const commandements = [];
  for (let j = t.entier(1, 4); j > 0; j--) {
    const imo = t.choix(imos);
    const co = { bateau: imo, debut: t.date(DEBUT, FIN) };
    if (!t.chance(0.25)) co.fin = new Date(co.debut.getTime() + t.entier(90, 900) * 86400000);
    commandements.push(co);      // fin absente = affectation en cours
  }
  capitaines.push({ _id: nom, brevet: t.choix(BREVETS), commandements: commandements });
}
verser(base.capitaines, capitaines); dire(g("capitaines", 14) + d(n(capitaines.length), 9));

// =====================================================================
//  2. Les escales — le gros morceau
// =====================================================================

const MARCHANDISES = ["Conteneurs secs", "Conteneurs refrigeres", "Produits chimiques",
  "Machines-outils", "Cereales", "Minerai de fer", "Voitures", "Bois", "Ciment",
  "Gaz naturel liquefie", "Petrole brut", "Engrais"];
const MOTIFS = [["COMMERCE", 70], ["RELACHE", 12], ["AVITAILLEMENT", 10],
                ["AVARIE", 5], ["TECHNIQUE", 3]];

const attR1 = [], attR2 = [], attR3 = [], attR5 = new Map(), attR6 = [];
let attR4 = [], attR7 = [];
const LOT = 10000;
let id = 0;

titre("Les escales");
while (id < NB_ESCALES) {
  const lot = [];
  const jusqua = Math.min(id + LOT, NB_ESCALES);
  while (id < jusqua) {
    id++;
    const p = t.choix(ports);
    const e = {
      _id: id,
      arrivee: t.date(DEBUT, FIN),
      motif: t.pondere(MOTIFS),
      bateau: t.choix(imos),          // l escale connait l imo ...
      port: p._id,                    // ... et rien du pavillon du bateau.
      quai: t.choix(p.quais),
      cargaisons: []
    };
    // depart absent = le bateau est encore a quai.
    if (!t.chance(0.02))
      e.depart = new Date(e.arrivee.getTime() + t.entier(6, 120) * 3600000);
    if (e.motif === "COMMERCE")
      for (let j = t.entier(1, 3); j > 0; j--)
        e.cargaisons.push({ marchandise: t.choix(MARCHANDISES),
                            tonnes: t.entier(400, 98000) });
    lot.push(e);

    // La reponse attendue, accumulee au vol.
    if (e.bateau === PARAM.imo) attR1.push(ligneR1(e));
    if (e.port === PARAM.port && e.arrivee >= PARAM.anneeDebut && e.arrivee < PARAM.anneeFin)
      attR2.push(ligneR2(e));
    if (e.arrivee >= PARAM.gnlDebut && e.arrivee < PARAM.gnlFin
        && e.cargaisons.some(c => c.marchandise === PARAM.marchandise)) attR3.push(ligneR3(e));
    attR4.push(e);
    const total = e.cargaisons.reduce((s, c) => s + c.tonnes, 0);
    if (e.arrivee >= PARAM.recDebut && e.arrivee < PARAM.recFin
        && pavillonDe.get(e.bateau) === PARAM.pavillon) {
      const a = attR5.get(e.port) || { _id: e.port, tonnes: 0, n: 0 };
      a.tonnes += total; a.n++;
      attR5.set(e.port, a);
    }
    if (e.port === PARAM.portMois && e.arrivee.getUTCFullYear() === PARAM.annee
        && e.arrivee.getUTCMonth() + 1 === PARAM.mois) attR6.push(ligneR6(e));
    attR7.push({ _id: e._id, bateau: e.bateau, port: e.port, total: total });
  }
  base.escales.insertMany(lot, { ordered: false });
  if (id % 50000 === 0) dire(d(n(id), 9) + " escales");
  attR4.sort((a, b) => b.arrivee - a.arrivee);
  attR4 = attR4.slice(0, PARAM.dernieres + 2);
  attR7.sort((a, b) => b.total - a.total || a._id - b._id);
  attR7 = attR7.slice(0, 12);
}
dire(d(n(NB_ESCALES), 9) + " escales en tout");

// =====================================================================
//  3. La reponse attendue des sept requetes
// =====================================================================

base.reference.insertMany([
  { _id: "R1", intitule: "Le carnet de bord d un bateau",       lignes: attR1.sort() },
  { _id: "R2", intitule: "Les escales d un port sur une annee", lignes: attR2.sort() },
  { _id: "R3", intitule: "Le GNL debarque sur un mois",           lignes: attR3.sort() },
  { _id: "R4", intitule: "Les vingt dernieres escales",
    lignes: attR4.slice(0, PARAM.dernieres).map(ligneR4).sort() },
  { _id: "R5", intitule: "Le tonnage d un pavillon, port par port",
    lignes: [...attR5.values()].map(ligneR5).sort() },
  { _id: "R6", intitule: "Les escales d un port sur un mois",     lignes: attR6.sort() },
  { _id: "R7", intitule: "Les dix plus grosses escales",
    lignes: attR7.slice(0, 10).map(ligneR7).sort() }
]);

// R4 ne departage pas deux arrivees a la meme minute : un ex aequo entre
// la 20e et la 21e rendrait la reponse indecidable.
if (attR4.length > PARAM.dernieres
    && +attR4[PARAM.dernieres - 1].arrivee === +attR4[PARAM.dernieres].arrivee) {
  dire("");
  dire("ATTENTION : ex aequo entre la 20e et la 21e escale : R4 n est pas decidable");
  dire("            avec cette graine. Changer GRAINE.");
}
if (attR7.length > 10 && attR7[9].total === attR7[10].total) {
  dire("");
  dire("ATTENTION : ex aequo entre la 10e et la 11e escale : R7 n est pas decidable");
  dire("            avec cette graine. Changer GRAINE.");
}

titre("La base bateaux est chargee — et n a aucun index");
for (const nomCol of ["ports", "bateaux", "capitaines", "escales"])
  dire(g(nomCol, 14) + d(n(base.getCollection(nomCol).countDocuments()), 10) + " documents");
dire("");
dire("index en place (hors _id) : " + (indexPoses(base).length || "aucun"));
dire("");
dire("  l enonce : sujets/3-bateaux/SUJET.md     les requetes : make bateaux-mesurer");
print("");
