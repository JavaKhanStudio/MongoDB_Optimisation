// =====================================================================
//  DB 2 — Les tortues : LA CORRECTION
// =====================================================================
//  Joue par : make tortues-optimiser   (branche « correction » seulement)
//
//    1. elle remet la base comme au chargement et MESURE — le « avant »
//       est refait a chaque passage, jamais recopie ;
//    2. elle pose les index et ecrit la reference etendue ;
//    3. elle remesure, verifie que les quatre reponses n'ont pas bouge,
//       et met les deux tableaux cote a cote.
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
base.optimisations.drop();
dire("aucun index, aucune copie.");

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

titre("R3 — la reference etendue, et le prix d une copie de copie");
// R3 filtre sur le statut UICN. Une observation ne le connait pas : elle
// connait sa tortue, la tortue connait son espece, et c'est l'espece qui
// porte le statut. Il est deja RECOPIE dans la tortue depuis « SQL vers
// NoSQL » — la copie qu'on ajoute ici est donc une copie de copie.
//
// Ce n'est pas une faute, c'est un compte a tenir : le jour ou l'UICN
// reclasse une espece, il y a maintenant TROIS endroits a reecrire —
// especes, tortues, observations — et ils ne le seront pas au meme
// instant. On accepte ca parce qu'une reclassification arrive tous les
// dix ans et que R3 est posee tous les jours.
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

titre("R4 — un index sur un tableau : multicle");
// tags est un tableau. MongoDB indexe alors CHAQUE element separement :
// une tortue a quatre tags produit quatre cles. L'index s'appelle
// multicle, il se pose exactement comme un autre, et il se paie a
// l'ecriture — quatre cles a tenir a jour au lieu d'une.
base.tortues.createIndex({ tags: 1 }, { name: "tags" });
dire("tortues { tags: 1 }  (multicle)");
// Et c'est la requete qui gagne le MOINS des quatre — sept fois, quand
// les autres gagnent cent fois. Ce n'est pas un rate : 1 344 tortues sur
// 10 000 portent ce tag. Un index ne paie que ce qu'il ecarte, et
// celui-ci n'ecarte que huit documents sur dix. Le chiffre qui decide
// s'appelle la SELECTIVITE, et on le regarde avant de poser l'index :
//     db.tortues.distinct("tags").length   contre   10 000 documents.
// Sur un champ a deux valeurs, l'index coute plus qu'il ne rapporte.

// =====================================================================
//  R3, reecrite — la seule des quatre dont le TEXTE change
// =====================================================================

function pipelineR3Optimise() {
  return [
    { $match: { statutUicn: PARAM.statutUicn,
                date: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } } },
    { $group: { _id: "$site", somme: { $sum: "$scoreSante" }, n: { $sum: 1 } } }
  ];
}

const REQUETES_OPTIMISEES = REQUETES.map(r => r.code !== "R3" ? r : {
  code: "R3", intitule: r.intitule,
  jouer:     b => b.observations.aggregate(pipelineR3Optimise()).toArray().map(ligneR3).sort(),
  expliquer: b => b.observations.explain("executionStats").aggregate(pipelineR3Optimise())
});

titre("Les memes quatre questions, sur la base optimisee");
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
