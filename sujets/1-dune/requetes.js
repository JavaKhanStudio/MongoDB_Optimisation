// =====================================================================
//  DB 1 — « Dune » : LES QUATRE REQUETES A OPTIMISER
// =====================================================================
//  Ce fichier est A TOI. Les quatre requetes sont ecrites de la facon la
//  plus naturelle : c'est ce qu'on ecrit quand on ne s'est pas encore
//  demande ce que le serveur allait devoir lire.
//
//  make dune-mesurer les joue et dit, pour chacune, combien de documents
//  le serveur a lus pour rendre combien de lignes.
//
//  LA SEULE REGLE : la REPONSE ne change pas. Elle a ete calculee au
//  chargement, a part, a partir des donnees generees — pas en rejouant
//  ces requetes-ci. Le banc la recompare a chaque passage. Le chemin
//  t'appartient, la reponse non.
// =====================================================================

// Les valeurs sur lesquelles les quatre requetes portent. Le chargement
// s'en sert lui aussi pour calculer la reponse attendue : les changer
// ici sans recharger la base ferait mentir la verification.
const PARAM = {
  contremaitre: "Gurney Halleck",
  puitsEchecs:  "HAB-02",
  region:       "Erg Habbanya",
  moisDebut:    new Date(Date.UTC(2026, 6, 1)),    // juillet 2026
  moisFin:      new Date(Date.UTC(2026, 7, 1)),
  puitsPics:    "MUR-01"
};

// ---------------------------------------------------------------------
// R1 — « Tout ce que Gurney Halleck a sorti. »
//      Une egalite sur un champ, et rien d'autre. C'est la requete que
//      SQL servait sans qu'on y pense : la cle etrangere y portait un
//      index, offert avec la contrainte.
//
//      En clair, dans make dune-mongo :
//      db.collectes.find({ contremaitre: "Gurney Halleck" })
// ---------------------------------------------------------------------

function filtreR1() { return { contremaitre: PARAM.contremaitre }; }
function ligneR1(c) {
  return d(c._id, 7) + "  " + jjmmaaaa(c.debut) + "  " + g(c.puits, 9) + g(c.statut, 9)
       + (c.statut === "REUSSIE" ? d(deci(c.tonnes, 2), 8) + " t" : d(c.cause, 10));
}

// ---------------------------------------------------------------------
// R2 — « Les echecs du puits HAB-02 en juillet 2026, du plus recent au
//      plus ancien. »
//      Une egalite, un intervalle, un tri. Trois choses, et l'ordre dans
//      lequel on les met dans un index n'est pas indifferent.
//
//      En clair, dans make dune-mongo :
//      db.collectes.find({
//        puits: "HAB-02",
//        statut: "ECHOUEE",
//        debut: { $gte: ISODate("2026-07-01"), $lt: ISODate("2026-08-01") }
//      }).sort({ debut: -1 })
// ---------------------------------------------------------------------

function filtreR2() {
  return { puits: PARAM.puitsEchecs, statut: "ECHOUEE",
           debut: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } };
}
function ligneR2(c) {
  return jjmmaaaa(c.debut) + "  " + g(c.cause, 11) + d(c.pertesHumaines, 3) + " morts"
       + (c.materielPerdu ? ",  materiel perdu" : "");
}

// ---------------------------------------------------------------------
// R3 — « Ce que la region Erg Habbanya a sorti en juillet 2026, puits
//      par puits. »
//      La region n'est PAS dans la collecte : elle est dans le puits. Il
//      faut donc aller la chercher — pour les 37 500 collectes — avant
//      de pouvoir jeter celles qui ne sont pas de cette region.
//
//      En clair, dans make dune-mongo :
//      db.collectes.aggregate([
//        { $match: { statut: "REUSSIE",
//                    debut: { $gte: ISODate("2026-07-01"), $lt: ISODate("2026-08-01") } } },
//        { $lookup: { from: "puits", localField: "puits", foreignField: "_id", as: "p" } },
//        { $match: { "p.region": "Erg Habbanya" } },
//        { $group: { _id: "$puits", tonnes: { $sum: "$tonnes" }, n: { $sum: 1 } } }
//      ])
// ---------------------------------------------------------------------

function pipelineR3() {
  return [
    { $match: { statut: "REUSSIE", debut: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } } },
    { $lookup: { from: "puits", localField: "puits", foreignField: "_id", as: "p" } },
    { $match: { "p.region": PARAM.region } },
    { $group: { _id: "$puits", tonnes: { $sum: "$tonnes" }, n: { $sum: 1 } } }
  ];
}
function ligneR3(r) {
  return g(r._id, 9) + d(deci(r.tonnes, 2), 11) + " t en " + d(r.n, 4) + " collectes";
}

// ---------------------------------------------------------------------
// R4 — « Les dix plus fortes secousses relevees au puits MUR-01. »
//      Dix lignes en sortie. Le serveur, lui, trie les 1 027 releves du
//      puits — et, pour les trouver, lit les 62 500.
//
//      En clair, dans make dune-mongo :
//      db.releves.find({ puits: "MUR-01" }).sort({ amplitude: -1, mesureLe: -1 }).limit(10)
// ---------------------------------------------------------------------

function filtreR4() { return { puits: PARAM.puitsPics }; }
function triR4()    { return { amplitude: -1, mesureLe: -1 }; }
function ligneR4(r) {
  return jjmmaaaa(r.mesureLe) + "   amplitude " + d(deci(r.amplitude, 3), 6);
}

// =====================================================================
//  Les quatre, mises en forme pour le banc.
//    jouer      la requete, jouee pour de vrai — ce sont ses lignes qui
//               sont comparees a la reponse de reference
//    expliquer  la meme, sans la jouer, pour lire son plan
//  Le .sort() final porte sur les LIGNES, pas sur les documents : il
//  rend la comparaison independante de l'ordre dans lequel le plan a
//  sorti les documents. Le tri qui compte, lui, est dans la requete.
// =====================================================================

const REQUETES = [
  { code: "R1", intitule: "Les collectes d un contremaitre",
    jouer:     base => base.collectes.find(filtreR1()).toArray().map(ligneR1).sort(),
    expliquer: base => base.collectes.find(filtreR1()).explain("executionStats") },

  { code: "R2", intitule: "Les echecs d un puits, du plus recent",
    jouer:     base => base.collectes.find(filtreR2()).sort({ debut: -1 })
                           .toArray().map(ligneR2).sort(),
    expliquer: base => base.collectes.find(filtreR2()).sort({ debut: -1 })
                           .explain("executionStats") },

  { code: "R3", intitule: "Ce qu une region a sorti sur un mois",
    jouer:     base => base.collectes.aggregate(pipelineR3()).toArray().map(ligneR3).sort(),
    expliquer: base => base.collectes.explain("executionStats").aggregate(pipelineR3()) },

  { code: "R4", intitule: "Les dix plus fortes secousses d un puits",
    jouer:     base => base.releves.find(filtreR4()).sort(triR4()).limit(10)
                           .toArray().map(ligneR4).sort(),
    expliquer: base => base.releves.find(filtreR4()).sort(triR4()).limit(10)
                           .explain("executionStats") }
];
