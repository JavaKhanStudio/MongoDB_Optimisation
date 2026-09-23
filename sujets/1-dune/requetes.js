// =====================================================================
//  DB 1 — « Dune » : LES SEPT REQUETES A OPTIMISER
// =====================================================================
//  Ce fichier est A TOI. Les sept requetes sont ecrites de la facon la
//  plus naturelle : c'est ce qu'on ecrit quand on ne s'est pas encore
//  demande ce que le serveur allait devoir lire.
//
//  Deux series :
//    R1 a R4   un INDEX suffit. Le texte de la requete ne bouge pas.
//    R5 a R7   aucun index ne suffit tant que la requete reste ecrite
//              ainsi : il faut l'index ET changer la requete (ou le
//              document qu'elle lit).
//
//  make dune-mesurer les joue et dit, pour chacune, combien de documents
//  le serveur a lus pour rendre combien de lignes.
//
//  LA SEULE REGLE : la REPONSE ne change pas. Elle a ete calculee au
//  chargement, a part, a partir des donnees generees — pas en rejouant
//  ces requetes-ci. Le banc la recompare a chaque passage. Le chemin
//  t'appartient, la reponse non.
// =====================================================================

// Les valeurs sur lesquelles les sept requetes portent. Le chargement
// s'en sert lui aussi pour calculer la reponse attendue : les changer
// ici sans recharger la base ferait mentir la verification.
const PARAM = {
  contremaitre: "Gurney Halleck",
  puitsEchecs:  "HAB-02",
  region:       "Erg Habbanya",
  moisDebut:    new Date(Date.UTC(2026, 6, 1)),    // juillet 2026
  moisFin:      new Date(Date.UTC(2026, 7, 1)),
  puitsPics:    "MUR-01",
  ver:          "Shai-Hulud le Vieux",
  puitsMois:    "TUO-03",
  annee:        2025,
  mois:         12                                  // decembre
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
// R3 — « Les collectes perdues a cause de Shai-Hulud le Vieux. »
//      Le ver n'existe que dans une collecte ECHOUEE, et seulement si
//      c'est lui qui l'a fait echouer : un champ dans un sous-document,
//      absent de la plupart des documents.
//
//      En clair, dans make dune-mongo :
//      db.collectes.find({ "ver.nom": "Shai-Hulud le Vieux" })
// ---------------------------------------------------------------------

function filtreR3() { return { "ver.nom": PARAM.ver }; }
function ligneR3(c) {
  return d(c._id, 7) + "  " + jjmmaaaa(c.debut) + "  " + g(c.puits, 9)
       + d(c.pertesHumaines, 3) + " morts" + (c.materielPerdu ? ",  materiel perdu" : "");
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

// ---------------------------------------------------------------------
// R5 — « Ce que la region Erg Habbanya a sorti en juillet 2026, puits
//      par puits. »
//      La region n'est PAS dans la collecte : elle est dans le puits. Il
//      faut donc aller la chercher — pour les 37 500 collectes — avant
//      de pouvoir jeter celles qui ne sont pas de cette region. Aucun
//      index sur collectes ne peut servir un champ qui n'y est pas.
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

function pipelineR5() {
  return [
    { $match: { statut: "REUSSIE", debut: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } } },
    { $lookup: { from: "puits", localField: "puits", foreignField: "_id", as: "p" } },
    { $match: { "p.region": PARAM.region } },
    { $group: { _id: "$puits", tonnes: { $sum: "$tonnes" }, n: { $sum: 1 } } }
  ];
}
function ligneR5(r) {
  return g(r._id, 9) + d(deci(r.tonnes, 2), 11) + " t en " + d(r.n, 4) + " collectes";
}

// ---------------------------------------------------------------------
// R6 — « Les collectes du puits TUO-03 en decembre 2025. »
//      Le mois est demande tel qu'on le dit : l'annee vaut 2025, le mois
//      vaut 12. Le serveur doit donc calculer l'annee et le mois de
//      chaque date avant de pouvoir la comparer.
//
//      En clair, dans make dune-mongo :
//      db.collectes.find({
//        puits: "TUO-03",
//        $expr: { $and: [ { $eq: [{ $year: "$debut" }, 2025] },
//                         { $eq: [{ $month: "$debut" }, 12] } ] }
//      })
// ---------------------------------------------------------------------

function filtreR6() {
  return { puits: PARAM.puitsMois,
           $expr: { $and: [ { $eq: [{ $year: "$debut" }, PARAM.annee] },
                            { $eq: [{ $month: "$debut" }, PARAM.mois] } ] } };
}
function ligneR6(c) {
  return d(c._id, 7) + "  " + jjmmaaaa(c.debut) + "  " + g(c.statut, 9) + g(c.contremaitre, 22);
}

// ---------------------------------------------------------------------
// R7 — « Les dix collectes au meilleur rendement : le plus de tonnes par
//      minute. »
//      Le rendement, c'est tonnes / dureeMinutes. Il n'est ecrit nulle
//      part : il se recalcule pour les 27 000 collectes reussies, a
//      chaque fois, avant de pouvoir en garder dix.
//
//      En clair, dans make dune-mongo :
//      db.collectes.aggregate([
//        { $match: { statut: "REUSSIE" } },
//        { $set:   { rendement: { $divide: ["$tonnes", "$dureeMinutes"] } } },
//        { $sort:  { rendement: -1, _id: 1 } },
//        { $limit: 10 }
//      ])
// ---------------------------------------------------------------------

function pipelineR7() {
  return [
    { $match: { statut: "REUSSIE" } },
    { $set:   { rendement: { $divide: ["$tonnes", "$dureeMinutes"] } } },
    { $sort:  { rendement: -1, _id: 1 } },
    { $limit: 10 }
  ];
}
// Le rendement se recalcule ici a partir des deux champs : une ligne est
// la meme, que la requete l'ait lu dans un champ ecrit ou non.
function ligneR7(c) {
  return d(c._id, 7) + "  " + g(c.puits, 9) + d(deci(c.tonnes, 2), 8) + " t en "
       + d(c.dureeMinutes, 3) + " min   " + d(deci(c.tonnes / c.dureeMinutes, 3), 6) + " t/min";
}

// =====================================================================
//  Les sept, mises en forme pour le banc.
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

  { code: "R3", intitule: "Les collectes perdues a cause d un ver",
    jouer:     base => base.collectes.find(filtreR3()).toArray().map(ligneR3).sort(),
    expliquer: base => base.collectes.find(filtreR3()).explain("executionStats") },

  { code: "R4", intitule: "Les dix plus fortes secousses d un puits",
    jouer:     base => base.releves.find(filtreR4()).sort(triR4()).limit(10)
                           .toArray().map(ligneR4).sort(),
    expliquer: base => base.releves.find(filtreR4()).sort(triR4()).limit(10)
                           .explain("executionStats") },

  { code: "R5", intitule: "Ce qu une region a sorti sur un mois",
    jouer:     base => base.collectes.aggregate(pipelineR5()).toArray().map(ligneR5).sort(),
    expliquer: base => base.collectes.explain("executionStats").aggregate(pipelineR5()) },

  { code: "R6", intitule: "Les collectes d un puits sur un mois",
    jouer:     base => base.collectes.find(filtreR6()).toArray().map(ligneR6).sort(),
    expliquer: base => base.collectes.find(filtreR6()).explain("executionStats") },

  { code: "R7", intitule: "Les dix collectes au meilleur rendement",
    jouer:     base => base.collectes.aggregate(pipelineR7()).toArray().map(ligneR7).sort(),
    expliquer: base => base.collectes.explain("executionStats").aggregate(pipelineR7()) }
];
