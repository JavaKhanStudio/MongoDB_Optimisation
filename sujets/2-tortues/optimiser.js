// =====================================================================
//  DB 2 — Les tortues : LA CORRECTION
// =====================================================================
//  Joue par : make tortues-optimiser   (branche « correction » seulement)
//
//    1. elle remet la base comme au chargement et MESURE — le « avant »
//       est refait a chaque passage, jamais recopie ;
//    2. elle pose les index, ecrit la reference etendue et le compteur ;
//    3. elle remesure, verifie que les sept reponses n'ont pas bouge,
//       et met les deux tableaux cote a cote.
//
//  R1 a R4 ne changent pas d'un caractere. R5 a R7 sont REECRITES :
//    R5  le statut n'est pas dans l'observation  -> reference etendue
//    R6  la date y est, cachee dans une fonction  -> un intervalle
//    R7  le compte n'est ecrit nulle part         -> un compteur
// =====================================================================

load("/projet/sujets/outils.js");
load("/projet/sujets/2-tortues/requetes.js");

const base = db.getSiblingDB(BASE);

titre("On repart de la base nue");
for (const c of base.getCollectionNames()) {
  if (c === "reference" || c === "optimisations") continue;
  for (const ix of base.getCollection(c).getIndexes())
    if (ix.name !== "_id_") base.getCollection(c).dropIndex(ix.name);
}
base.observations.updateMany({}, { $unset: { statutUicn: "" } });
base.tortues.updateMany({}, { $unset: { nbObservations: "" } });
base.optimisations.drop();
dire("aucun index, aucune copie, aucun compteur.");

const avant = banc(base, REQUETES);

// =====================================================================

titre("R1 — la cle etrangere que SQL indexait toute seule");
// 754 lignes sur 90 000 documents. En SQL, observation.observateur_id
// etait une cle etrangere, et une cle etrangere s'indexe presque
// toujours — souvent sans qu'on ait rien demande. Ici, rien n'est
// automatique : ce qui n'est pas pose n'existe pas.
base.observations.createIndex({ observateur: 1 }, { name: "observateur" });
dire("observations { observateur: 1 }");

titre("R2 — egalite puis intervalle, dans cet ordre");
// E-S-R : le site est une egalite, la date est a la fois l'intervalle et
// le tri. L'egalite d'abord : elle ramene le curseur sur une tranche
// etroite de l'index, et la date y est deja triee — le tri disparait.
base.observations.createIndex({ site: 1, date: 1 }, { name: "site-date" });
dire("observations { site: 1, date: 1 }");

titre("R3 — un intervalle dans un sous-document");
// Le poids est range dans mensurations. L'index se pose sur le chemin,
// point compris, et sert un intervalle comme il sert une egalite : le
// serveur se place sur la premiere cle >= 410 et lit jusqu'au bout.
base.tortues.createIndex({ "mensurations.poidsKg": 1 }, { name: "poids" });
dire("tortues { \"mensurations.poidsKg\": 1 }");

titre("R4 — un index sur un tableau : multicle");
// tags est un tableau. MongoDB indexe alors CHAQUE element separement :
// une tortue a quatre tags produit quatre cles. L'index s'appelle
// multicle, il se pose exactement comme un autre, et il se paie a
// l'ecriture — quatre cles a tenir a jour au lieu d'une.
base.tortues.createIndex({ tags: 1 }, { name: "tags" });
dire("tortues { tags: 1 }  (multicle)");
// Et c'est la requete qui gagne le MOINS des sept — sept fois, quand
// les autres gagnent de quarante a des milliers de fois. Ce n'est pas
// un rate : 1 344 tortues sur 10 000 portent ce tag. Un index ne paie que ce qu'il ecarte, et
// celui-ci n'ecarte que huit documents sur dix. Le chiffre qui decide
// s'appelle la SELECTIVITE, et on le regarde avant de poser l'index :
//     db.tortues.distinct("tags").length   contre   10 000 documents.
// Sur un champ a deux valeurs, l'index coute plus qu'il ne rapporte.

titre("R5 — la reference etendue, et le prix d une copie de copie");
// R5 filtre sur le statut UICN. Une observation ne le connait pas : elle
// connait sa tortue, la tortue connait son espece, et c'est l'espece qui
// porte le statut. Il est deja RECOPIE dans la tortue depuis « SQL vers
// NoSQL » — la copie qu'on ajoute ici est donc une copie de copie.
//
// Ce n'est pas une faute, c'est un compte a tenir : le jour ou l'UICN
// reclasse une espece, il y a maintenant TROIS endroits a reecrire —
// especes, tortues, observations — et ils ne le seront pas au meme
// instant. On accepte ca parce qu'une reclassification arrive tous les
// dix ans et que R5 est posee tous les jours.
//
// En une passe, et $merge repose le resultat la d'ou il sort. Le lookup
// qu'on refusait de payer a chaque lecture est paye une seule fois.
const t0 = Date.now();
base.observations.aggregate([
  { $lookup: { from: "tortues", localField: "tortue", foreignField: "_id", as: "t" } },
  { $set:    { statutUicn: { $first: "$t.espece.statutUicn" } } },
  { $unset:  "t" },
  { $merge:  { into: "observations", on: "_id", whenMatched: "replace", whenNotMatched: "fail" } }
]).toArray();
dire("statutUicn recopie dans les observations en " + n(Date.now() - t0) + " ms");

base.observations.createIndex({ statutUicn: 1, date: 1 }, { name: "statut-date" });
dire("observations { statutUicn: 1, date: 1 }");
base.optimisations.insertOne({ collection: "observations", champ: "statutUicn",
                               vient_de: "tortues.espece.statutUicn" });

titre("R6 — la date est la, mais cachee dans une fonction");
// R6 filtre sur $year(date) et $month(date). L'index de R2,
// { site: 1, date: 1 }, sert deja le site : le serveur y va droit. Mais
// la date, il ne peut pas la chercher : l'index range des dates, pas des
// annees ni des mois. Il ouvre donc chaque observation du site et
// calcule.
//
// Aucun index de plus : c'est la REQUETE qui change. Mars 2024, c'est
// l'intervalle du 1er mars inclus au 1er avril exclu, et cet intervalle,
// la seconde cle de l'index sait le lire.
dire("rien a poser : { site: 1, date: 1 } est deja la, depuis R2");

titre("R7 — le compteur : on n indexe pas un $group");
// Les dix tortues les plus observees : le serveur recompte les 90 000
// observations, les groupe, trie les 10 000 comptes, en garde dix.
// Aucun index ne range un nombre que personne n'a ecrit.
//
// Alors on l'ecrit, dans la tortue : nbObservations. C'est un COMPTEUR,
// un champ calcule qui bouge a CHAQUE observation ajoutee. Le prix est la,
// tout entier : l'ajout d'une observation devient deux ecritures,
//     db.observations.insertOne({ ... tortue: 914 ... })
//     db.tortues.updateOne({ _id: 914 }, { $inc: { nbObservations: 1 } })
// et si la seconde est oubliee, R7 ment sans rien dire.
//
// $merge ecrit le compte dans la tortue sans toucher au reste du document
// (whenMatched: "merge"). Une tortue jamais observee n'a pas de compteur :
// elle se range en queue de l'index, la ou R7 ne va jamais.
const t1 = Date.now();
base.observations.aggregate([
  { $group: { _id: "$tortue", nbObservations: { $sum: 1 } } },
  { $merge: { into: "tortues", on: "_id", whenMatched: "merge", whenNotMatched: "discard" } }
]).toArray();
dire("nbObservations compte dans les tortues en " + n(Date.now() - t1) + " ms");

base.tortues.createIndex({ nbObservations: -1, _id: 1 }, { name: "nbObservations" });
dire("tortues { nbObservations: -1, _id: 1 }");
base.optimisations.insertOne({ collection: "tortues", champ: "nbObservations",
                               vient_de: "compte des observations" });

// =====================================================================
//  R5, R6 et R7, reecrites — les trois dont le TEXTE change
// =====================================================================

function pipelineR5Optimise() {
  return [
    { $match: { statutUicn: PARAM.statutUicn,
                date: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } } },
    { $group: { _id: "$site", somme: { $sum: "$scoreSante" }, n: { $sum: 1 } } }
  ];
}

function filtreR6Optimise() {
  return { site: PARAM.siteMois,
           date: { $gte: new Date(Date.UTC(PARAM.annee, PARAM.mois - 1, 1)),
                   $lt:  new Date(Date.UTC(PARAM.annee, PARAM.mois, 1)) } };
}

// La projection ne demande QUE des champs de l'index (_id et
// nbObservations) : le serveur n'ouvre pas une seule tortue. Dix cles
// lues, zero document — la requete est couverte.
function pipelineR7Optimise() {
  return [
    { $sort:    { nbObservations: -1, _id: 1 } },
    { $limit:   10 },
    { $project: { _id: 1, n: "$nbObservations" } }
  ];
}

const REECRITES = {
  R5: { jouer:     b => b.observations.aggregate(pipelineR5Optimise()).toArray().map(ligneR5).sort(),
        expliquer: b => b.observations.explain("executionStats").aggregate(pipelineR5Optimise()) },
  R6: { jouer:     b => b.observations.find(filtreR6Optimise()).toArray().map(ligneR6).sort(),
        expliquer: b => b.observations.find(filtreR6Optimise()).explain("executionStats") },
  R7: { jouer:     b => b.tortues.aggregate(pipelineR7Optimise()).toArray().map(ligneR7).sort(),
        expliquer: b => b.tortues.explain("executionStats").aggregate(pipelineR7Optimise()) }
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
//  L Exploration — les tortues inscrites a ARGOI depuis 2024
// =====================================================================
//  Le geste naturel :
//      { "programmes.acronyme": "ARGOI",
//        "programmes.dateInscription": { $gte: 2024-01-01 } }
//  Il rend TROP de tortues. MongoDB applique chaque condition au
//  tableau, pas a un MEME element : une tortue inscrite a ARGOI en 2019
//  ET a PNTL en 2025 satisfait les deux, chacune par un element
//  different. $elemMatch est ce qui exige que ce soit le meme.
//
//  Cote index : { "programmes.acronyme": 1, "programmes.dateInscription": 1 }
//  porte deux chemins DU MEME tableau — c'est permis (ce que MongoDB
//  refuse, ce sont deux tableaux paralleles). Sans $elemMatch, le
//  serveur ne peut pas resserrer les bornes sur les deux cles a la fois ;
//  avec, il le peut.

titre("Exploration — le geste naturel, et celui qui repond");
base.tortues.createIndex({ "programmes.acronyme": 1, "programmes.dateInscription": 1 },
                         { name: "programmes-acronyme-date" });

const depuis = new Date(Date.UTC(2024, 0, 1));
const naif = { "programmes.acronyme": "ARGOI", "programmes.dateInscription": { $gte: depuis } };
const juste = { programmes: { $elemMatch: { acronyme: "ARGOI",
                                            dateInscription: { $gte: depuis } } } };

dire("sans $elemMatch  " + d(n(base.tortues.countDocuments(naif)), 7) + " tortues"
   + "   (dont certaines inscrites a ARGOI bien avant 2024)");
dire("avec $elemMatch  " + d(n(base.tortues.countDocuments(juste)), 7) + " tortues");
const exN = base.tortues.find(naif).explain("executionStats").executionStats;
const exJ = base.tortues.find(juste).explain("executionStats").executionStats;
dire("cles lues        " + d(n(exN.totalKeysExamined), 7) + " sans, "
   + n(exJ.totalKeysExamined) + " avec : $elemMatch resserre aussi les bornes de l index.");
base.tortues.dropIndex("programmes-acronyme-date");

titre("Les index poses");
indexPoses(base).forEach(dire);
dire("");
dire("Tout defaire :   make tortues-remettre");
print("");

quit(bon ? 0 : 1);
