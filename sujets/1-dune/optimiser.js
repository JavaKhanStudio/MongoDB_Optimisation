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
//    3. elle remesure, verifie que les sept reponses n'ont pas bouge,
//       et met les deux tableaux cote a cote.
//
//  R1 a R4 ne changent pas d'un caractere : seul leur chemin change.
//  R5 a R7 sont REECRITES, et chacune pour une raison differente :
//    R5  le champ filtre n'est pas dans le document  -> reference etendue
//    R6  le champ y est, mais cache dans une fonction -> un intervalle
//    R7  la valeur n'est ecrite nulle part            -> champ calcule
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
base.collectes.updateMany({}, { $unset: { region: "", rendement: "" } });
base.optimisations.drop();
dire("aucun index, aucune copie, aucun champ calcule.");

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

titre("R3 — un champ dans un sous-document, absent de la plupart");
// Le ver n'existe que dans une collecte ECHOUEE, et seulement quand c'est
// lui qui l'a fait echouer. Un index se pose sur "ver.nom" exactement
// comme sur un champ du premier niveau : le point descend dans le
// sous-document, et c'est tout.
//
// Ce que l'index range pour les collectes SANS ver : une cle null, une
// par document. Elles sont les trois quarts, et elles ne servent a rien
// a R3. { sparse: true } les laisserait dehors — un index plus petit,
// mais que le serveur refuse pour toute requete qui chercherait les
// collectes sans ver ({ "ver.nom": null }). On le laisse ordinaire.
base.collectes.createIndex({ "ver.nom": 1 }, { name: "ver-nom" });
dire("collectes { \"ver.nom\": 1 }");

titre("R4 — le tri bloquant : dix lignes, 1 027 documents tries");
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

titre("R5 — la reference etendue : on ne peut pas indexer ce qu on n a pas");
// R5 demande les collectes D UNE REGION. Or la collecte ne sait pas dans
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

titre("R6 — le champ est la, mais cache dans une fonction");
// R6 filtre sur $year(debut) et $month(debut). Un index sur debut range
// des DATES, pas des annees ni des mois : le serveur ne peut pas y
// chercher « 2025 » ni « 12 ». Il se sert de l'index pour le puits, puis
// ouvre chaque collecte du puits et calcule son annee et son mois.
//
// La meme question s'ecrit comme un INTERVALLE sur la date elle-meme :
// du 1er decembre 2025 inclus au 1er janvier 2026 exclu. Meme reponse,
// et cette fois les deux cles de l'index servent. E-S-R, encore : le
// puits est l'egalite, la date l'intervalle.
//
// Pourquoi pas l'index de R2 ? { puits, statut, debut } : R6 ne dit rien
// du statut, et sans lui la date n'est plus rangee dans l'index — elle
// l'est statut par statut.
base.collectes.createIndex({ puits: 1, debut: 1 }, { name: "puits-debut" });
dire("collectes { puits: 1, debut: 1 }");

titre("R7 — le champ calcule : on n indexe pas une division");
// Le rendement, c'est tonnes / dureeMinutes. Il n'est ecrit nulle part :
// R7 le recalcule pour les 27 000 collectes reussies, les trie toutes en
// memoire, et en garde dix. Un index sur tonnes ne sert a rien — l'ordre
// des tonnes n'est pas celui du rendement.
//
// Alors on l'ecrit, dans les seules collectes reussies (une collecte
// echouee n'a pas de tonnes). C'est un CHAMP CALCULE : rien n'est copie
// d'ailleurs, mais la regle est celle de la copie — le jour ou tonnes ou
// dureeMinutes change, le rendement doit etre reecrit dans la meme
// ecriture, sinon il ment.
const t1 = Date.now();
base.collectes.updateMany({ statut: "REUSSIE" },
  [{ $set: { rendement: { $divide: ["$tonnes", "$dureeMinutes"] } } }]);
dire("rendement calcule dans les collectes en " + n(Date.now() - t1) + " ms");

// _id en seconde cle : c'est le second critere du tri de R7. Sans lui,
// deux rendements egaux laisseraient le serveur trier en memoire.
base.collectes.createIndex({ rendement: -1, _id: 1 }, { name: "rendement" });
dire("collectes { rendement: -1, _id: 1 }");
base.optimisations.insertOne({ collection: "collectes", champ: "rendement",
                               vient_de: "tonnes / dureeMinutes" });

// =====================================================================
//  3. R5, R6 et R7, reecrites — les trois dont le TEXTE change
// =====================================================================

function pipelineR5Optimise() {
  return [
    { $match: { region: PARAM.region, statut: "REUSSIE",
                debut: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } } },
    { $group: { _id: "$puits", tonnes: { $sum: "$tonnes" }, n: { $sum: 1 } } }
  ];
}

// Le mois, ecrit comme un intervalle de dates : ce que l'index sait lire.
function filtreR6Optimise() {
  return { puits: PARAM.puitsMois,
           debut: { $gte: new Date(Date.UTC(PARAM.annee, PARAM.mois - 1, 1)),
                    $lt:  new Date(Date.UTC(PARAM.annee, PARAM.mois, 1)) } };
}

// Plus de $match sur le statut : seules les collectes reussies portent
// un rendement, et les autres se rangent en queue de l'index. Plus de
// $set, plus de tri en memoire : le serveur suit l'index et s'arrete a
// la dixieme cle.
function pipelineR7Optimise() {
  return [
    { $sort:  { rendement: -1, _id: 1 } },
    { $limit: 10 }
  ];
}

const REECRITES = {
  R5: { jouer:     b => b.collectes.aggregate(pipelineR5Optimise()).toArray().map(ligneR5).sort(),
        expliquer: b => b.collectes.explain("executionStats").aggregate(pipelineR5Optimise()) },
  R6: { jouer:     b => b.collectes.find(filtreR6Optimise()).toArray().map(ligneR6).sort(),
        expliquer: b => b.collectes.find(filtreR6Optimise()).explain("executionStats") },
  R7: { jouer:     b => b.collectes.aggregate(pipelineR7Optimise()).toArray().map(ligneR7).sort(),
        expliquer: b => b.collectes.explain("executionStats").aggregate(pipelineR7Optimise()) }
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
