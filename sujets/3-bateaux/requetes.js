// =====================================================================
//  DB 3 — Les bateaux : LES SEPT REQUETES A OPTIMISER
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
//  make bateaux-mesurer les joue et dit, pour chacune, combien de
//  documents le serveur a lus pour rendre combien de lignes.
//
//  LA SEULE REGLE : la REPONSE ne change pas. Elle a ete calculee au
//  chargement, a part, a partir des donnees generees — pas en rejouant
//  ces requetes-ci.
// =====================================================================

const PARAM = {
  imo:        "IMO9500233",                         // le Delta Amstel
  port:       "Rotterdam",
  anneeDebut: new Date(Date.UTC(2025, 0, 1)),
  anneeFin:   new Date(Date.UTC(2026, 0, 1)),
  pavillon:   "France",
  recDebut:   new Date(Date.UTC(2026, 0, 1)),       // l annee 2026
  recFin:     new Date(Date.UTC(2027, 0, 1)),
  marchandise: "Gaz naturel liquefie",
  gnlDebut:   new Date(Date.UTC(2026, 0, 1)),       // janvier 2026
  gnlFin:     new Date(Date.UTC(2026, 1, 1)),
  dernieres:  20,
  portMois:   "Le Havre",
  annee:      2024,
  mois:       8                                     // aout
};

// ---------------------------------------------------------------------
// R1 — « Le carnet de bord du Delta Amstel. »
//      Une egalite sur un champ. La cle etrangere de SQL portait un
//      index ; ici, rien n'est automatique.
//
//      En clair, dans make bateaux-mongo :
//      db.escales.find({ bateau: "IMO9500233" })
// ---------------------------------------------------------------------

function filtreR1() { return { bateau: PARAM.imo }; }
function ligneR1(e) {
  return d(e._id, 8) + "  " + jjmmaaaa(e.arrivee) + "  " + g(e.port, 12)
       + "quai " + g(e.quai, 5) + g(e.motif, 12)
       + (e.depart ? "parti le " + jjmmaaaa(e.depart) : "ENCORE A QUAI");
}

// ---------------------------------------------------------------------
// R2 — « Les escales de Rotterdam en 2025, de la plus recente a la plus
//      ancienne. »
//      Une egalite, un intervalle, un tri.
//
//      En clair, dans make bateaux-mongo :
//      db.escales.find({
//        port: "Rotterdam",
//        arrivee: { $gte: ISODate("2025-01-01"), $lt: ISODate("2026-01-01") }
//      }).sort({ arrivee: -1 })
// ---------------------------------------------------------------------

function filtreR2() {
  return { port: PARAM.port, arrivee: { $gte: PARAM.anneeDebut, $lt: PARAM.anneeFin } };
}
function ligneR2(e) {
  return jjmmaaaa(e.arrivee) + "  " + g(e.bateau, 12) + "quai " + g(e.quai, 5) + e.motif;
}

// ---------------------------------------------------------------------
// R3 — « Les escales qui ont debarque du gaz naturel liquefie en janvier
//      2026. »
//      La marchandise est dans un TABLEAU de sous-documents : une escale
//      en porte une, deux ou trois. Une egalite dedans, un intervalle
//      dehors.
//
//      En clair, dans make bateaux-mongo :
//      db.escales.find({
//        "cargaisons.marchandise": "Gaz naturel liquefie",
//        arrivee: { $gte: ISODate("2026-01-01"), $lt: ISODate("2026-02-01") }
//      })
// ---------------------------------------------------------------------

function filtreR3() {
  return { "cargaisons.marchandise": PARAM.marchandise,
           arrivee: { $gte: PARAM.gnlDebut, $lt: PARAM.gnlFin } };
}
function ligneR3(e) {
  return d(e._id, 8) + "  " + jjmmaaaa(e.arrivee) + "  " + g(e.bateau, 12) + e.port;
}

// ---------------------------------------------------------------------
// R4 — « Les vingt dernieres escales enregistrees. »
//      Aucun filtre : un tri, et vingt lignes. Le serveur trie pourtant
//      les 94 500 escales pour les trouver.
//
//      En clair, dans make bateaux-mongo :
//      db.escales.find().sort({ arrivee: -1 }).limit(20)
// ---------------------------------------------------------------------

function triR4() { return { arrivee: -1 }; }
function ligneR4(e) {
  return d(e._id, 8) + "  " + jjmmaaaa(e.arrivee) + "  " + g(e.bateau, 12) + g(e.port, 12) + e.motif;
}

// ---------------------------------------------------------------------
// R5 — « Ce que les bateaux sous pavillon francais ont manipule en 2026,
//      port par port. »
//      Le pavillon n'est PAS dans l'escale : il est dans le bateau. Il
//      faut ouvrir le bateau de chaque escale de l'annee avant de
//      pouvoir jeter celles qui ne sont pas francaises.
//
//      En clair, dans make bateaux-mongo :
//      db.escales.aggregate([
//        { $match: { arrivee: { $gte: ISODate("2026-01-01"), $lt: ISODate("2027-01-01") } } },
//        { $lookup: { from: "bateaux", localField: "bateau", foreignField: "_id", as: "b" } },
//        { $match: { "b.pavillon": "France" } },
//        { $group: { _id: "$port", tonnes: { $sum: { $sum: "$cargaisons.tonnes" } }, n: { $sum: 1 } } }
//      ])
// ---------------------------------------------------------------------

function pipelineR5() {
  return [
    { $match: { arrivee: { $gte: PARAM.recDebut, $lt: PARAM.recFin } } },
    { $lookup: { from: "bateaux", localField: "bateau", foreignField: "_id", as: "b" } },
    { $match: { "b.pavillon": PARAM.pavillon } },
    { $group: { _id: "$port", tonnes: { $sum: { $sum: "$cargaisons.tonnes" } }, n: { $sum: 1 } } }
  ];
}
function ligneR5(r) {
  return g(r._id, 12) + d(deci(r.tonnes, 0), 12) + " t en " + d(r.n, 5) + " escales";
}

// ---------------------------------------------------------------------
// R6 — « Les escales du Havre en aout 2024. »
//      Le mois est demande tel qu'on le dit : l'annee vaut 2024, le mois
//      vaut 8. Le serveur doit donc calculer l'annee et le mois de chaque
//      date avant de pouvoir la comparer.
//
//      En clair, dans make bateaux-mongo :
//      db.escales.find({
//        port: "Le Havre",
//        $expr: { $and: [ { $eq: [{ $year: "$arrivee" }, 2024] },
//                         { $eq: [{ $month: "$arrivee" }, 8] } ] }
//      })
// ---------------------------------------------------------------------

function filtreR6() {
  return { port: PARAM.portMois,
           $expr: { $and: [ { $eq: [{ $year: "$arrivee" }, PARAM.annee] },
                            { $eq: [{ $month: "$arrivee" }, PARAM.mois] } ] } };
}
function ligneR6(e) {
  return d(e._id, 8) + "  " + jjmmaaaa(e.arrivee) + "  " + g(e.bateau, 12) + "quai " + g(e.quai, 5) + e.motif;
}

// ---------------------------------------------------------------------
// R7 — « Les dix escales qui ont manipule le plus de tonnage. »
//      Le tonnage d'une escale, c'est la somme de ses cargaisons. Il
//      n'est ecrit nulle part : il se recalcule a chaque fois, pour les
//      94 500 escales, avant de pouvoir en garder dix.
//
//      En clair, dans make bateaux-mongo :
//      db.escales.aggregate([
//        { $set:   { total: { $sum: "$cargaisons.tonnes" } } },
//        { $sort:  { total: -1, _id: 1 } },
//        { $limit: 10 }
//      ])
// ---------------------------------------------------------------------

function pipelineR7() {
  return [
    { $set:   { total: { $sum: "$cargaisons.tonnes" } } },
    { $sort:  { total: -1, _id: 1 } },
    { $limit: 10 }
  ];
}
function ligneR7(e) {
  return d(e._id, 8) + "  " + g(e.bateau, 12) + g(e.port, 12)
       + d(deci(e.total, 0), 9) + " t";
}

// =====================================================================
//  Les sept, mises en forme pour le banc.
// =====================================================================

const REQUETES = [
  { code: "R1", intitule: "Le carnet de bord d un bateau",
    jouer:     base => base.escales.find(filtreR1()).toArray().map(ligneR1).sort(),
    expliquer: base => base.escales.find(filtreR1()).explain("executionStats") },

  { code: "R2", intitule: "Les escales d un port sur une annee",
    jouer:     base => base.escales.find(filtreR2()).sort({ arrivee: -1 })
                           .toArray().map(ligneR2).sort(),
    expliquer: base => base.escales.find(filtreR2()).sort({ arrivee: -1 })
                           .explain("executionStats") },

  { code: "R3", intitule: "Le GNL debarque sur un mois",
    jouer:     base => base.escales.find(filtreR3()).toArray().map(ligneR3).sort(),
    expliquer: base => base.escales.find(filtreR3()).explain("executionStats") },

  { code: "R4", intitule: "Les vingt dernieres escales",
    jouer:     base => base.escales.find().sort(triR4()).limit(PARAM.dernieres)
                           .toArray().map(ligneR4).sort(),
    expliquer: base => base.escales.find().sort(triR4()).limit(PARAM.dernieres)
                           .explain("executionStats") },

  { code: "R5", intitule: "Le tonnage d un pavillon, port par port",
    jouer:     base => base.escales.aggregate(pipelineR5()).toArray().map(ligneR5).sort(),
    expliquer: base => base.escales.explain("executionStats").aggregate(pipelineR5()) },

  { code: "R6", intitule: "Les escales d un port sur un mois",
    jouer:     base => base.escales.find(filtreR6()).toArray().map(ligneR6).sort(),
    expliquer: base => base.escales.find(filtreR6()).explain("executionStats") },

  { code: "R7", intitule: "Les dix plus grosses escales",
    jouer:     base => base.escales.aggregate(pipelineR7()).toArray().map(ligneR7).sort(),
    expliquer: base => base.escales.explain("executionStats").aggregate(pipelineR7()) }
];
