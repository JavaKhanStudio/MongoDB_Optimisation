// =====================================================================
//  DB 1 — « Dune » : LA CORRECTION
// =====================================================================
//  Joue par : make dune-optimiser     (branche « correction » seulement)
//
//  Elle fait trois choses, dans cet ordre :
//    1. elle remet la base comme au chargement — aucun index, aucune
//       copie — et MESURE. C'est le « avant », et il est refait a chaque
//       passage : jamais un chiffre recopie ;
//    2. elle pose ce qu'il faut poser, et ecrit ce qu'il faut recopier ;
//    3. elle remesure, verifie que les quatre reponses n'ont pas bouge,
//       et met les deux tableaux cote a cote.
//
//  TROIS DES QUATRE requetes ne changent pas d'un caractere : seul leur
//  chemin change. La quatrieme, R3, est REECRITE — et c'est la toute la
//  lecon de la reference etendue : on ne peut pas indexer un champ que
//  le document n'a pas.
// =====================================================================

load("/projet/sujets/outils.js");
load("/projet/sujets/1-dune/requetes.js");

const base = db.getSiblingDB(BASE);

// ---------------------------------------------------------------------
// 1. Le « avant », mesure pour de vrai
// ---------------------------------------------------------------------

titre("On repart de la base nue");
for (const c of base.getCollectionNames()) {
  if (c === "reference" || c === "optimisations") continue;
  for (const ix of base.getCollection(c).getIndexes())
    if (ix.name !== "_id_") base.getCollection(c).dropIndex(ix.name);
}
base.collectes.updateMany({}, { $unset: { region: "" } });
base.optimisations.drop();
dire("aucun index, aucune copie.");

const avant = banc(base, REQUETES);

// =====================================================================
//  2. Ce qu'on pose, et pourquoi
// =====================================================================

titre("R1 — une egalite : un index sur un champ");
// 169 lignes sur 37 500 documents. Le serveur n'a aucun moyen de savoir
// ou elles sont : il les lit toutes. Un index sur contremaitre, et il va
// droit aux 169.
//
// Pourquoi pas { contremaitre: 1, debut: 1 } ? Parce que R1 ne trie pas
// et ne filtre pas sur la date. Une cle de plus, c'est une cle de plus a
// tenir a jour a CHAQUE ecriture, pour rien.
base.collectes.createIndex({ contremaitre: 1 }, { name: "contremaitre" });
dire("collectes { contremaitre: 1 }");

titre("R2 — une egalite, un intervalle, un tri : l ordre des cles");
// La regle est E-S-R : d'abord les Egalites, puis le Sort, puis les
// Range. Ici puits et statut sont des egalites ; debut est a la fois
// l'intervalle ET le tri, et il vient donc en dernier.
//
// Mis dans l'autre sens — { debut: 1, puits: 1, statut: 1 } — l'index
// serait bien utilise, mais il faudrait parcourir TOUT l'intervalle de
// dates pour y trouver le puits. Et le tri deviendrait bloquant :
// le serveur ramasse tout, puis trie, avant de rendre la premiere ligne.
//
// La direction, elle, est indifferente tant qu'il n'y a QU'UNE cle de
// tri : le serveur sait lire un index a l'envers.
base.collectes.createIndex({ puits: 1, statut: 1, debut: 1 },
                           { name: "puits-statut-debut" });
dire("collectes { puits: 1, statut: 1, debut: 1 }");

titre("R3 — la reference etendue : on ne peut pas indexer ce qu on n a pas");
// R3 demande les collectes D UNE REGION. Or la collecte ne sait pas dans
// quelle region elle est : elle connait son puits, et c'est le puits qui
// connait la region. Aucun index sur collectes ne peut donc servir ce
// filtre — il n'y a rien a indexer.
//
// La seule sortie est de faire descendre la region DANS la collecte.
// C'est une reference etendue : le puits reste la collection qui fait
// autorite, et la collecte en garde une copie du seul champ qu'elle
// interroge.
//
// LE PRIX. Une copie se paie le jour ou l'original change. Ici il ne
// change jamais : un puits ne se deplace pas d'une region a l'autre. Ce
// n'est pas un hasard — c'est le critere. On etend une reference sur un
// champ stable ; sur un champ qui bouge, on paie l'ecriture partout, et
// on accepte de voir les deux copies diverger entre-temps.
//
// L'ecriture se fait en UNE passe : le $lookup qu'on refusait de payer a
// chaque lecture, on le paie une seule fois, et $merge repose le
// resultat dans la collection d'ou il sort.
const t0 = Date.now();
base.collectes.aggregate([
  { $lookup: { from: "puits", localField: "puits", foreignField: "_id", as: "p" } },
  { $set:    { region: { $first: "$p.region" } } },
  { $unset:  "p" },
  { $merge:  { into: "collectes", on: "_id", whenMatched: "replace", whenNotMatched: "fail" } }
]).toArray();
dire("region recopiee dans les collectes en " + n(Date.now() - t0) + " ms");

// Et maintenant seulement, l'index. Meme regle E-S-R : deux egalites,
// puis l'intervalle de dates.
base.collectes.createIndex({ region: 1, statut: 1, debut: 1 },
                           { name: "region-statut-debut" });
dire("collectes { region: 1, statut: 1, debut: 1 }");

// La liste de ce qui a ete recopie, pour que make dune-remettre sache
// quoi defaire.
base.optimisations.insertOne({ collection: "collectes", champ: "region",
                               vient_de: "puits.region" });

titre("R4 — le tri bloquant : dix lignes, 62 500 documents tries");
// Dix lignes en sortie, et pourtant le serveur lit les 62 500 releves,
// garde les 1 027 du puits, les trie en memoire, et jette 1 017. L'etage
// TRI du plan, c'est ca : il ne peut rien rendre avant d'avoir tout vu.
//
// Un index qui porte DEJA les releves du puits dans l'ordre des
// amplitudes decroissantes supprime le tri : le serveur suit l'index,
// prend les dix premieres cles, et s'arrete. Ici la direction compte :
// il y a deux cles de tri, et elles doivent aller dans le meme sens que
// l'index (ou toutes les deux dans l'autre sens).
base.releves.createIndex({ puits: 1, amplitude: -1, mesureLe: -1 },
                         { name: "puits-amplitude-mesure" });
dire("releves { puits: 1, amplitude: -1, mesureLe: -1 }");

// =====================================================================
//  3. R3, reecrite — la seule des quatre dont le TEXTE change
// =====================================================================

function pipelineR3Optimise() {
  return [
    { $match: { region: PARAM.region, statut: "REUSSIE",
                debut: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } } },
    { $group: { _id: "$puits", tonnes: { $sum: "$tonnes" }, n: { $sum: 1 } } }
  ];
}

const REQUETES_OPTIMISEES = REQUETES.map(r => r.code !== "R3" ? r : {
  code: "R3", intitule: r.intitule,
  jouer:     b => b.collectes.aggregate(pipelineR3Optimise()).toArray().map(ligneR3).sort(),
  expliquer: b => b.collectes.explain("executionStats").aggregate(pipelineR3Optimise())
});

titre("Les memes quatre questions, sur la base optimisee");
const apres = banc(base, REQUETES_OPTIMISEES);

titre("La reponse n a pas change ?");
const bon = verifierReference(base, apres);

titre("Avant / apres");
bancCompare(avant, apres);

// =====================================================================
//  L Exploration — la requete couverte
// =====================================================================
//  « La date et le puits des 169 collectes de Gurney Halleck, sans lire
//  un seul document. »
//
//  Avec { contremaitre: 1 }, le serveur trouve les 169 cles dans l'index
//  puis va CHERCHER les 169 documents, parce que l'index ne contient pas
//  debut ni puits : c'est l'etage FETCH. Un index qui porte les trois
//  champs les contient tous — il n'y a plus rien a aller chercher, et le
//  plan passe en PROJECTION_COVERED.
//
//  Deux conditions, et la seconde est celle qu'on oublie : la projection
//  ne doit demander QUE des champs de l'index. _id en fait partie sans
//  qu'on l'ait demande — il faut donc l'exclure explicitement, sinon le
//  serveur ouvre le document rien que pour lui.
//
//  Ce qu'on y perd : la requete ne peut plus rendre que ce que l'index
//  porte. Vouloir aussi le tonnage, c'est une quatrieme cle dans l'index
//  — a tenir a jour a chaque ecriture, sur 37 500 documents.

titre("Exploration — la requete couverte");
base.collectes.createIndex({ contremaitre: 1, debut: 1, puits: 1 },
                           { name: "couvrant-contremaitre" });

function lus(f) {
  const a = compteurs(base);
  f();
  return compteurs(base).lus - a.lus;
}
const filtre = { contremaitre: PARAM.contremaitre };
const sansProjection = lus(() => base.collectes.find(filtre).toArray());
const avecId         = lus(() => base.collectes.find(filtre, { debut: 1, puits: 1 }).toArray());
const couverte       = lus(() => base.collectes.find(filtre, { _id: 0, debut: 1, puits: 1 }).toArray());
const ex = base.collectes.find(filtre, { _id: 0, debut: 1, puits: 1 }).explain();

dire("sans projection            " + d(n(sansProjection), 6) + " documents lus");
dire("projection avec _id        " + d(n(avecId), 6) + " documents lus");
dire("projection sans _id        " + d(n(couverte), 6) + " documents lus   -> "
   + ex.queryPlanner.winningPlan.stage);
base.collectes.dropIndex("couvrant-contremaitre");

titre("Les index poses");
indexPoses(base).forEach(dire);
dire("");
dire("Tout defaire :   make dune-remettre");
print("");

quit(bon ? 0 : 1);
