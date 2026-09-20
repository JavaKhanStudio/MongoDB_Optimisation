// =====================================================================
//  DB 1 — « Dune » : le chargement de la base NON OPTIMISEE
// =====================================================================
//  Joue par : make dune          (make dune VOLUME=10 pour dix fois plus)
//
//  Le modele est celui que « SQL vers NoSQL » faisait ecrire : le meme
//  document polymorphe, les memes collections. Ce qui change, c'est
//  qu'il y a maintenant de quoi le sentir passer — et qu'il n'y a
//  AUCUN index en dehors de ceux des _id, et AUCUNE reference etendue.
//
//  Ce n'est pas un modele mal fait. C'est un modele qu'on n'a pas encore
//  regarde tourner.
//
//  LES DONNEES NE SONT PAS UN DUMP. Elles se fabriquent ici, a partir
//  d'une graine : meme graine, meme base, sur toutes les machines. On
//  peut donc en demander dix fois plus sans avoir a transporter dix fois
//  plus de fichier.
// =====================================================================

load("/projet/sujets/outils.js");
load("/projet/sujets/1-dune/requetes.js");

const V = (typeof VOLUME === "undefined") ? 1 : VOLUME;
const G = (typeof GRAINE === "undefined") ? 20260920 : GRAINE;
const t = tireur(G);

const NB_COLLECTES =  37500 * V;
const NB_RELEVES   =  62500 * V;
const DEBUT = new Date(Date.UTC(2025, 0, 1));
const FIN   = new Date(Date.UTC(2026, 11, 31));

const base = db.getSiblingDB("dune");
base.dropDatabase();

// =====================================================================
//  1. Le referentiel — petit, stable, et cite partout
// =====================================================================

// Les cinq regions de « SQL vers NoSQL », et sept autres : la carte
// d'Arrakis s'est etendue, les noms qu'on connait sont toujours la.
const REGIONS = [
  ["Bassin de Tuono",    "TUO", "NORD", 3.5], ["Erg Habbanya",      "HAB", "SUD",  8.2],
  ["Plaine Funeste",     "FUN", "NORD", 6.0], ["Depression de Tabr","TAB", "SUD",  2.0],
  ["Muraille-Bouclier",  "MUR", "NORD", 9.4], ["Erg Cielago",       "CIE", "SUD",  7.1],
  ["Bassin de Hagga",    "HAG", "SUD",  5.5], ["Passe du Vent",     "VEN", "NORD", 8.8],
  ["Terre Brisee",       "BRI", "NORD", 4.2], ["Erg Mineur",        "MIN", "SUD",  6.6],
  ["Gorge d Arrakeen",   "ARR", "NORD", 1.8], ["Grand Erg Central", "CEN", "SUD",  9.9]
];

const VERS_CONNUS = ["Shai-Hulud le Vieux", "Gueule de Coriolis", "Le Silencieux",
  "Briseur de Dunes", "Fils du Sable", "Le Boiteux", "Ombre de Tabr"];
const VERS_MORCEAUX = [["Faiseur", "Devoreur", "Gueule", "Ombre", "Fils", "Briseur", "Cri"],
                       ["des Sables", "de Coriolis", "du Nord", "des Dunes", "du Vide",
                        "de l Erg", "des Tempetes", "du Bouclier"]];

const regions = [];
const puits   = [];
let iVer = 0;
for (const [nom, prefixe, hemisphere, indice] of REGIONS) {
  // Les vers : un 1:N BORNE (deux ou trois par region, et ce sera tout).
  // Il reste donc DANS la region — ce n'est pas lui qu'on optimise.
  const vers = [];
  for (let k = 0; k < t.entier(2, 3); k++) {
    const nomVer = iVer < VERS_CONNUS.length ? VERS_CONNUS[iVer++]
                 : t.choix(VERS_MORCEAUX[0]) + " " + t.choix(VERS_MORCEAUX[1]);
    vers.push({ nom: nomVer, statut: t.pondere([["ACTIF", 5], ["DORMANT", 4], ["ABATTU", 1]]) });
  }
  regions.push({ _id: nom, hemisphere: hemisphere, indiceTempete: indice, vers: vers });

  // Les puits : cinq par region, soixante en tout. Une collection a eux,
  // parce que 37 500 collectes les citent et qu'un puits s'epuise.
  for (let k = 1; k <= 5; k++) {
    puits.push({
      _id: prefixe + "-0" + k,
      region: nom,                       // le puits sait ou il est ...
      epuise: t.chance(0.15),
      profondeurM: t.entier(40, 320),
      richesse: t.arrondi(0.4, 1.6, 2)   // sert au generateur : combien il sort
    });
  }
}

const PRENOMS = ["Gurney", "Rabban", "Stilgar", "Duncan", "Piter", "Chani", "Thufir",
  "Jessica", "Leto", "Alia", "Irulan", "Feyd", "Shaddam", "Wellington", "Liet", "Harah",
  "Jamis", "Otheym", "Korba", "Farok", "Shishakli", "Mapes", "Nefud", "Ramallo"];
const PATRONYMES = ["Halleck", "Harkonnen", "Idaho", "de Vries", "Atreides", "Corrino",
  "Fenring", "Hawat", "Kynes", "Mohiam", "Tuek", "Ecaz"];
const MAISONS = ["Atreides", "Harkonnen", "Fremen", "Guilde", "Corrino"];

// Les six contremaitres de « SQL vers NoSQL » restent en tete, avec leur
// maison et leur anciennete. Les autres sont tires — il en faut 240 pour
// qu'une egalite sur le nom soit une VRAIE egalite selective.
const contremaitres = [
  { _id: "Gurney Halleck",   maison: "Atreides",  ancienneteAnnees: 22 },
  { _id: "Rabban Harkonnen", maison: "Harkonnen", ancienneteAnnees: 15 },
  { _id: "Stilgar",          maison: "Fremen",    ancienneteAnnees: 30 },
  { _id: "Duncan Idaho",     maison: "Atreides",  ancienneteAnnees:  9 },
  { _id: "Piter de Vries",   maison: "Harkonnen", ancienneteAnnees:  6 },
  { _id: "Chani",            maison: "Fremen",    ancienneteAnnees:  4 }
];
const dejaVus = new Set(contremaitres.map(c => c._id));
for (const p of PRENOMS) for (const q of PATRONYMES) {
  if (contremaitres.length >= 240) break;
  const nom = p + " " + q;
  if (dejaVus.has(nom)) continue;
  dejaVus.add(nom);
  contremaitres.push({ _id: nom, maison: t.choix(MAISONS), ancienneteAnnees: t.entier(1, 34) });
}

const MODELES_MINAGE = ["Moissonneuse Harkonnen Mk IV", "Moissonneuse Harkonnen Mk V",
  "Moissonneuse Atreides Delta", "Foreuse legere Guilde", "Moissonneuse Ixienne T-3"];
const MODELES_TRANSPORT = ["Porteuse lourde Orni-9", "Porteuse Orni-6",
  "Aile de secours Guilde", "Porteuse Ixienne Kappa"];

const transports = [];
for (let k = 0; k < 40; k++)
  transports.push({ _id: "PT-" + d(1000 + k * 27, 4), modele: t.choix(MODELES_TRANSPORT) });

const minages = [];
for (let k = 0; k < 60; k++)
  minages.push({
    _id: "PM-" + d(400 + k * 19, 4),
    modele: t.choix(MODELES_MINAGE),
    // compatibilite etait une table de liaison PURE : elle tient dans un
    // tableau de matricules, exactement comme dans « SQL vers NoSQL ».
    transports: [t.choix(transports)._id, t.choix(transports)._id]
  });

titre("Le referentiel");
verser(base.regions, regions);              dire(g("regions", 22) + d(regions.length, 8));
verser(base.puits, puits.map(p => ({ _id: p._id, region: p.region,
                                     epuise: p.epuise, profondeurM: p.profondeurM })));
dire(g("puits", 22) + d(puits.length, 8));
verser(base.contremaitres, contremaitres);  dire(g("contremaitres", 22) + d(contremaitres.length, 8));
verser(base.plateformesMinage, minages);    dire(g("plateformesMinage", 22) + d(minages.length, 8));
verser(base.plateformesTransport, transports);
dire(g("plateformesTransport", 22) + d(transports.length, 8));

// =====================================================================
//  2. Les collectes — le gros morceau, et le document polymorphe
// =====================================================================
//  Fabriquees par paquets, et jamais gardees en entier : la reponse
//  attendue des quatre requetes s'accumule au passage, ligne par ligne.
//  C'est ce qui permet de demander VOLUME=10 sans faire exploser mongosh
//  — et c'est aussi ce qui rend la reponse attendue INDEPENDANTE des
//  requetes du sujet. Elle est calculee a partir des donnees, pas en
//  rejouant requetes.js : un etudiant qui reecrit une requete est
//  compare a la verite, pas a lui-meme.
// =====================================================================

const parRegion = new Map(puits.map(p => [p._id, p.region]));
const versParRegion = new Map(regions.map(r => [r._id, r.vers.map(v => v.nom)]));
const CAUSES = [["VER", 35], ["TEMPETE", 30], ["PANNE", 25], ["EMBUSCADE", 10]];

const attR1 = [], attR2 = [], attR3 = new Map();
const LOT = 10000;
let id = 0;

titre("Les collectes");
while (id < NB_COLLECTES) {
  const lot = [];
  const jusqua = Math.min(id + LOT, NB_COLLECTES);
  while (id < jusqua) {
    id++;
    const p  = t.choix(puits);
    const cm = t.choix(contremaitres);
    const c = {
      _id: id,
      debut: t.date(DEBUT, FIN),
      statut: t.pondere([["REUSSIE", 72], ["ECHOUEE", 28]]),
      puits: p._id,                       // ... la collecte, elle, ne sait pas
      contremaitre: cm._id,               //     dans quelle region elle est.
      plateformes: { minage: t.choix(minages)._id, transport: t.choix(transports)._id }
    };
    if (c.statut === "REUSSIE") {
      c.tonnes       = t.arrondi(90 * p.richesse, 320 * p.richesse, 2);
      c.puretePct    = t.arrondi(52, 99, 1);
      c.dureeMinutes = t.entier(120, 300);
    } else {
      c.cause          = t.pondere(CAUSES);
      c.materielPerdu  = t.chance(0.4);
      c.pertesHumaines = t.pondere([[0, 50], [1, 20], [2, 12], [3, 8], [5, 5], [8, 3], [11, 2]]);
      if (c.cause === "VER") c.ver = { nom: t.choix(versParRegion.get(p.region)) };
    }
    lot.push(c);

    // La reponse attendue, accumulee au vol.
    if (c.contremaitre === PARAM.contremaitre) attR1.push(ligneR1(c));
    if (c.puits === PARAM.puitsEchecs && c.statut === "ECHOUEE"
        && c.debut >= PARAM.moisDebut && c.debut < PARAM.moisFin) attR2.push(ligneR2(c));
    if (c.statut === "REUSSIE" && parRegion.get(c.puits) === PARAM.region
        && c.debut >= PARAM.moisDebut && c.debut < PARAM.moisFin) {
      const a = attR3.get(c.puits) || { _id: c.puits, tonnes: 0, n: 0 };
      a.tonnes += c.tonnes; a.n++;
      attR3.set(c.puits, a);
    }
  }
  base.collectes.insertMany(lot, { ordered: false });
  if (id % 40000 === 0) dire(d(n(id), 9) + " collectes");
}
dire(d(n(NB_COLLECTES), 9) + " collectes en tout");

// =====================================================================
//  3. Les releves de vibration — un par heure et par puits, pour toujours
// =====================================================================
//  Le seul 1:N reellement non borne du sujet. Il etait deja dehors dans
//  « SQL vers NoSQL » ; il y reste, et il grossit.

let attR4 = [];
id = 0;
titre("Les releves de vibration");
while (id < NB_RELEVES) {
  const lot = [];
  const jusqua = Math.min(id + LOT, NB_RELEVES);
  while (id < jusqua) {
    id++;
    const p = t.choix(puits);
    const r = {
      _id: id,
      puits: p._id,
      mesureLe: t.date(DEBUT, FIN),
      amplitude: t.arrondi(0.2, 9.9, 3)
    };
    lot.push(r);
    if (r.puits === PARAM.puitsPics) attR4.push(r);
  }
  base.releves.insertMany(lot, { ordered: false });
  if (id % 40000 === 0) dire(d(n(id), 9) + " releves");
  // Le top dix se garde au fil de l'eau : inutile de garder 1 027 releves.
  attR4.sort((a, b) => b.amplitude - a.amplitude || b.mesureLe - a.mesureLe);
  attR4 = attR4.slice(0, 12);
}
dire(d(n(NB_RELEVES), 9) + " releves en tout");

// =====================================================================
//  4. La reponse attendue des quatre requetes
// =====================================================================

base.reference.insertMany([
  { _id: "R1", intitule: "Les collectes d un contremaitre",     lignes: attR1.sort() },
  { _id: "R2", intitule: "Les echecs d un puits, du plus recent", lignes: attR2.sort() },
  { _id: "R3", intitule: "Ce qu une region a sorti sur un mois",
    lignes: [...attR3.values()].map(ligneR3).sort() },
  { _id: "R4", intitule: "Les dix plus fortes secousses d un puits",
    lignes: attR4.slice(0, 10).map(ligneR4).sort() }
]);

// Un ex aequo entre le dixieme et le onzieme releve rendrait R4
// indecidable : deux plans corrects ne sortiraient pas les memes dix
// lignes. On le dit plutot que de le laisser mordre plus tard.
if (attR4.length > 10
    && attR4[9].amplitude === attR4[10].amplitude
    && +attR4[9].mesureLe === +attR4[10].mesureLe) {
  dire("");
  dire("ATTENTION : ex aequo entre le 10e et le 11e releve de " + PARAM.puitsPics
     + " — R4 n est pas decidable avec cette graine. Changer GRAINE.");
}

titre("La base dune est chargee — et n a aucun index");
for (const nomCol of ["regions", "puits", "contremaitres", "plateformesMinage",
                      "plateformesTransport", "collectes", "releves"]) {
  dire(g(nomCol, 22) + d(n(base.getCollection(nomCol).countDocuments()), 10) + " documents");
}
dire("");
dire("index en place (hors _id) : " + (indexPoses(base).length || "aucun"));
dire("");
dire("  l enonce : sujets/1-dune/SUJET.md        les requetes : make dune-mesurer");
print("");
