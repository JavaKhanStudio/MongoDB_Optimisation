// =====================================================================
//  DB 3 — Les bateaux : LA CORRECTION
// =====================================================================
//  Joue par : make bateaux-optimiser   (branche « correction » seulement)
//
//    1. elle remet la base comme au chargement et MESURE — le « avant »
//       est refait a chaque passage, jamais recopie ;
//    2. elle pose les index, ecrit la reference etendue et le champ
//       calcule ;
//    3. elle remesure, verifie que les sept reponses n'ont pas bouge,
//       et met les deux tableaux cote a cote.
//
//  R1 a R4 ne changent pas d'un caractere. R5 a R7 sont REECRITES :
//    R5  le pavillon est dans une AUTRE collection -> reference etendue
//    R6  la date est la, cachee dans une fonction   -> un intervalle
//    R7  le tonnage n'est ECRIT NULLE PART          -> champ calcule
// =====================================================================

load("/projet/sujets/outils.js");
load("/projet/sujets/3-bateaux/requetes.js");

const base = db.getSiblingDB(BASE);

titre("On repart de la base nue");
for (const c of base.getCollectionNames()) {
  if (c === "reference" || c === "optimisations") continue;
  for (const ix of base.getCollection(c).getIndexes())
    if (ix.name !== "_id_") base.getCollection(c).dropIndex(ix.name);
}
base.escales.updateMany({}, { $unset: { pavillon: "", tonnesTotal: "" } });
base.optimisations.drop();
dire("aucun index, aucune copie, aucun champ calcule.");

const avant = banc(base, REQUETES);

// =====================================================================

titre("R1 — une egalite : un index sur un champ");
// 25 lignes sur 94 500 documents, et le serveur les lit toutes. C'est
// le carnet de bord d'un bateau : la requete la plus banale du sujet,
// et l'une des plus gaspilleuses — 3 780 documents lus par ligne rendue.
base.escales.createIndex({ bateau: 1 }, { name: "bateau" });
dire("escales { bateau: 1 }");

titre("R2 — egalite, intervalle, tri : E-S-R");
// Le port est une egalite ; l'arrivee est a la fois l'intervalle et le
// tri. L'egalite d'abord : elle ramene le curseur sur la tranche du
// port, et les dates y sont deja rangees — l'etage TRI disparait.
base.escales.createIndex({ port: 1, arrivee: 1 }, { name: "port-arrivee" });
dire("escales { port: 1, arrivee: 1 }");

titre("R3 — un index multicle sur un tableau de sous-documents");
// La marchandise est dans cargaisons, un TABLEAU de sous-documents. Un
// index sur "cargaisons.marchandise" est multicle : une escale a trois
// cargaisons y met trois cles, une par marchandise. Il se pose comme un
// autre, et l'arrivee vient en seconde cle — egalite, puis intervalle.
//
// Deux cargaisons de GNL dans la meme escale ne font qu'UNE cle pour ce
// couple : le serveur ne rend pas l'escale deux fois, il deduplique.
base.escales.createIndex({ "cargaisons.marchandise": 1, arrivee: 1 },
                         { name: "marchandise-arrivee" });
dire("escales { \"cargaisons.marchandise\": 1, arrivee: 1 }  (multicle)");

titre("R4 — un index qui sert un tri, sans aucun filtre");
// Vingt lignes, et le serveur trie les 94 500 escales pour les trouver.
// Un index sur arrivee les a DEJA rangees : le serveur le lit par la fin,
// prend vingt cles, et s'arrete. Croissant ou decroissant, peu importe
// avec une seule cle de tri — un index se lit dans les deux sens.
//
// L'index de R2 ne sert pas : { port, arrivee } range les dates port par
// port, pas toutes ensemble.
base.escales.createIndex({ arrivee: 1 }, { name: "arrivee" });
dire("escales { arrivee: 1 }");

titre("R5 — la reference etendue : le champ est dans l autre collection");
// R5 filtre sur le PAVILLON. L'escale ne le connait pas : elle connait
// l'imo, et c'est le bateau qui porte le pavillon. Aucun index sur
// escales ne peut servir ce filtre — il n'y a rien a indexer.
//
// On fait donc descendre le pavillon dans l'escale. Le bateau reste la
// collection qui fait autorite ; l'escale en garde une copie du seul
// champ qu'elle interroge.
//
// LE PRIX, et il est reel ici : un bateau CHANGE de pavillon. Le
// depavillonnement est une operation courante, et le jour ou il arrive,
// toutes les escales deja ecrites portent l'ancien pavillon. Est-ce
// grave ? Non — et c'est meme ce qu'on veut : une escale de 2024 a bien
// ete faite sous l'ancien pavillon. La copie n'est pas une copie
// perimee, c'est un FAIT DATE. C'est le meilleur cas d'une reference
// etendue : celui ou la valeur appartient au moment, pas a l'objet.
const t0 = Date.now();
base.escales.aggregate([
  { $lookup: { from: "bateaux", localField: "bateau", foreignField: "_id", as: "b" } },
  { $set:    { pavillon: { $first: "$b.pavillon" } } },
  { $unset:  "b" },
  { $merge:  { into: "escales", on: "_id", whenMatched: "replace", whenNotMatched: "fail" } }
]).toArray();
dire("pavillon recopie dans les escales en " + n(Date.now() - t0) + " ms");

base.escales.createIndex({ pavillon: 1, arrivee: 1 }, { name: "pavillon-arrivee" });
dire("escales { pavillon: 1, arrivee: 1 }");
base.optimisations.insertOne({ collection: "escales", champ: "pavillon",
                               vient_de: "bateaux.pavillon" });

titre("R6 — la date est la, mais cachee dans une fonction");
// R6 filtre sur $year(arrivee) et $month(arrivee). L'index de R2,
// { port: 1, arrivee: 1 }, sert deja le port. Mais la date, le serveur
// ne peut pas la chercher : l'index range des dates, pas des annees ni
// des mois. Il ouvre donc chaque escale du Havre et calcule.
//
// Aucun index de plus : c'est la REQUETE qui change. Aout 2024, c'est
// l'intervalle du 1er aout inclus au 1er septembre exclu.
dire("rien a poser : { port: 1, arrivee: 1 } est deja la, depuis R2");

titre("R7 — le champ calcule : on n indexe pas une somme");
// Le tonnage d'une escale est la somme de ses cargaisons. Il n'existe
// nulle part : il se recalcule a chaque passage, pour les 94 500
// escales, avant qu'on puisse en garder dix. Aucun index ne peut aider —
// on n'indexe pas un nombre que le document ne porte pas.
//
// Alors on l'ecrit. Ce n'est plus une reference etendue (rien n'est
// copie d'ailleurs) : c'est un CHAMP CALCULE, et la regle est la meme —
// il faut le recalculer a chaque fois qu'une cargaison bouge. Ajouter
// une cargaison, c'est donc DEUX changements dans la meme ecriture :
//     db.escales.updateOne({ _id: 35 },
//       { $push: { cargaisons: { marchandise: "...", tonnes: 90000 } },
//         $inc:  { tonnesTotal: 90000 } })
// Un $push seul, et R7 rend un classement faux sans rien dire.
const t1 = Date.now();
base.escales.updateMany({}, [{ $set: { tonnesTotal: { $sum: "$cargaisons.tonnes" } } }]);
dire("tonnesTotal calcule dans les escales en " + n(Date.now() - t1) + " ms");

base.escales.createIndex({ tonnesTotal: -1, _id: 1 }, { name: "tonnesTotal" });
dire("escales { tonnesTotal: -1, _id: 1 }");
base.optimisations.insertOne({ collection: "escales", champ: "tonnesTotal",
                               vient_de: "somme de cargaisons.tonnes" });

// =====================================================================
//  R5, R6 et R7, reecrites — les trois dont le TEXTE change
// =====================================================================

function pipelineR5Optimise() {
  return [
    { $match: { pavillon: PARAM.pavillon,
                arrivee: { $gte: PARAM.recDebut, $lt: PARAM.recFin } } },
    { $group: { _id: "$port", tonnes: { $sum: { $sum: "$cargaisons.tonnes" } }, n: { $sum: 1 } } }
  ];
}

function filtreR6Optimise() {
  return { port: PARAM.portMois,
           arrivee: { $gte: new Date(Date.UTC(PARAM.annee, PARAM.mois - 1, 1)),
                      $lt:  new Date(Date.UTC(PARAM.annee, PARAM.mois, 1)) } };
}

// Le tri et la limite se servent directement dans l'index : dix cles
// lues, dix documents ouverts, et on s'arrete. Plus de $set sur 94 500
// documents, plus de tri en memoire.
function pipelineR7Optimise() {
  return [
    { $sort:  { tonnesTotal: -1, _id: 1 } },
    { $limit: 10 },
    { $set:   { total: "$tonnesTotal" } }
  ];
}

const REECRITES = {
  R5: { jouer:     b => b.escales.aggregate(pipelineR5Optimise()).toArray().map(ligneR5).sort(),
        expliquer: b => b.escales.explain("executionStats").aggregate(pipelineR5Optimise()) },
  R6: { jouer:     b => b.escales.find(filtreR6Optimise()).toArray().map(ligneR6).sort(),
        expliquer: b => b.escales.find(filtreR6Optimise()).explain("executionStats") },
  R7: { jouer:     b => b.escales.aggregate(pipelineR7Optimise()).toArray().map(ligneR7).sort(),
        expliquer: b => b.escales.explain("executionStats").aggregate(pipelineR7Optimise()) }
};
const REQUETES_OPTIMISEES = REQUETES.map(r => !REECRITES[r.code] ? r
  : Object.assign({ code: r.code, intitule: r.intitule }, REECRITES[r.code]));

titre("Les memes sept questions, sur la base optimisee");
const apres = banc(base, REQUETES_OPTIMISEES);

titre("La reponse n a pas change ?");
const bon = verifierReference(base, apres);

titre("Avant / apres");
bancCompare(avant, apres);

// =====================================================================
//  L Exploration — l index qui n indexe qu une partie des documents
// =====================================================================
//  « Les escales pour avarie, de la plus recente. » Elles sont 5 % des
//  escales. Un index ordinaire sur { motif: 1, arrivee: 1 } sert la
//  requete — et range aussi les 95 % dont personne ne demande jamais
//  rien. Un index se paie a l'ecriture et en memoire : celui-la fait
//  vingt fois la taille utile.
//
//  partialFilterExpression dit a MongoDB de n'indexer QUE les documents
//  qui repondent a une condition. Le meme service, pour un vingtieme.
//  Le piege : la requete doit contenir la condition du filtre, sinon le
//  planificateur refuse l'index — il ne peut pas savoir que ce qu'il n'a
//  pas indexe n'aurait rien rendu.

titre("Exploration — l index partiel");
base.escales.createIndex({ motif: 1, arrivee: 1 }, { name: "motif-arrivee" });
const entier = base.escales.stats().indexSizes["motif-arrivee"];
base.escales.dropIndex("motif-arrivee");

base.escales.createIndex({ arrivee: 1 }, { name: "avaries",
  partialFilterExpression: { motif: "AVARIE" } });
const partiel = base.escales.stats().indexSizes["avaries"];

const filtre = { motif: "AVARIE" };
const ex = base.escales.find(filtre).sort({ arrivee: -1 }).explain("executionStats");
dire("escales pour avarie      " + d(n(base.escales.countDocuments(filtre)), 9)
   + " sur " + n(base.escales.countDocuments()));
dire("index ordinaire          " + d(n(entier), 9) + " octets");
dire("index partiel            " + d(n(partiel), 9) + " octets   ("
   + deci(entier / partiel, 1) + " fois plus petit)");
dire("le plan s en sert ?      " + plan(ex) + ", " + n(ex.executionStats.totalKeysExamined)
   + " cles lues");
base.escales.dropIndex("avaries");

titre("Les index poses");
indexPoses(base).forEach(dire);
dire("");
dire("Tout defaire :   make bateaux-remettre");
print("");

quit(bon ? 0 : 1);
