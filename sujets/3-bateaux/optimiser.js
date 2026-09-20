// =====================================================================
//  DB 3 — Les bateaux : LA CORRECTION
// =====================================================================
//  Joue par : make bateaux-optimiser   (branche « correction » seulement)
//
//    1. elle remet la base comme au chargement et MESURE — le « avant »
//       est refait a chaque passage, jamais recopie ;
//    2. elle pose les index, ecrit la reference etendue et le champ
//       calcule ;
//    3. elle remesure, verifie que les quatre reponses n'ont pas bouge,
//       et met les deux tableaux cote a cote.
//
//  Ce sujet est celui ou l'on ECRIT le plus : deux des quatre requetes
//  ne se reglent pas avec un index, parce qu'il n'y a rien a indexer.
//  L'une cherche un champ qui est dans une AUTRE collection (R3), l'autre
//  cherche un nombre qui n'est ECRIT NULLE PART (R4).
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

titre("R3 — la reference etendue : le champ est dans l autre collection");
// R3 filtre sur le PAVILLON. L'escale ne le connait pas : elle connait
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

titre("R4 — le champ calcule : on n indexe pas une somme");
// Le tonnage d'une escale est la somme de ses cargaisons. Il n'existe
// nulle part : il se recalcule a chaque passage, pour les 94 500
// escales, avant qu'on puisse en garder dix. Aucun index ne peut aider —
// on n'indexe pas un nombre que le document ne porte pas.
//
// Alors on l'ecrit. Ce n'est plus une reference etendue (rien n'est
// copie d'ailleurs) : c'est un CHAMP CALCULE, et la regle est la meme —
// il faut le recalculer a chaque fois qu'une cargaison bouge. Ici, une
// cargaison ne bouge pas : l'escale est un journal, on l'ecrit une fois.
const t1 = Date.now();
base.escales.updateMany({}, [{ $set: { tonnesTotal: { $sum: "$cargaisons.tonnes" } } }]);
dire("tonnesTotal calcule dans les escales en " + n(Date.now() - t1) + " ms");

base.escales.createIndex({ tonnesTotal: -1, _id: 1 }, { name: "tonnesTotal" });
dire("escales { tonnesTotal: -1, _id: 1 }");
base.optimisations.insertOne({ collection: "escales", champ: "tonnesTotal",
                               vient_de: "somme de cargaisons.tonnes" });

// =====================================================================
//  R3 et R4, reecrites — les deux dont le TEXTE change
// =====================================================================

function pipelineR3Optimise() {
  return [
    { $match: { pavillon: PARAM.pavillon,
                arrivee: { $gte: PARAM.recDebut, $lt: PARAM.recFin } } },
    { $group: { _id: "$port", tonnes: { $sum: "$tonnesTotal" }, n: { $sum: 1 } } }
  ];
}
// Le tri et la limite se servent directement dans l'index : dix cles
// lues, dix documents ouverts, et on s'arrete. Plus de $set sur 94 500
// documents, plus de tri en memoire.
function pipelineR4Optimise() {
  return [
    { $sort:  { tonnesTotal: -1, _id: 1 } },
    { $limit: 10 },
    { $set:   { total: "$tonnesTotal" } }
  ];
}

const REQUETES_OPTIMISEES = REQUETES.map(r => {
  if (r.code === "R3") return { code: "R3", intitule: r.intitule,
    jouer:     b => b.escales.aggregate(pipelineR3Optimise()).toArray().map(ligneR3).sort(),
    expliquer: b => b.escales.explain("executionStats").aggregate(pipelineR3Optimise()) };
  if (r.code === "R4") return { code: "R4", intitule: r.intitule,
    jouer:     b => b.escales.aggregate(pipelineR4Optimise()).toArray().map(ligneR4).sort(),
    expliquer: b => b.escales.explain("executionStats").aggregate(pipelineR4Optimise()) };
  return r;
});

titre("Les memes quatre questions, sur la base optimisee");
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
