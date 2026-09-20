// =====================================================================
//  DB 3 — Les bateaux : LES QUATRE REQUETES A OPTIMISER
// =====================================================================
//  Ce fichier est A TOI. Les quatre requetes sont ecrites de la facon la
//  plus naturelle : c'est ce qu'on ecrit quand on ne s'est pas encore
//  demande ce que le serveur allait devoir lire.
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
  recFin:     new Date(Date.UTC(2027, 0, 1))
};

// ---------------------------------------------------------------------
// R1 — « Le carnet de bord du Delta Amstel. »
//      Une egalite sur un champ. La cle etrangere de SQL portait un
//      index ; ici, rien n'est automatique.
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
// ---------------------------------------------------------------------

function filtreR2() {
  return { port: PARAM.port, arrivee: { $gte: PARAM.anneeDebut, $lt: PARAM.anneeFin } };
}
function ligneR2(e) {
  return jjmmaaaa(e.arrivee) + "  " + g(e.bateau, 12) + "quai " + g(e.quai, 5) + e.motif;
}

// ---------------------------------------------------------------------
// R3 — « Ce que les bateaux sous pavillon francais ont manipule en 2026,
//      port par port. »
//      Le pavillon n'est PAS dans l'escale : il est dans le bateau. Il
//      faut ouvrir le bateau de chaque escale de l'annee avant de
//      pouvoir jeter celles qui ne sont pas francaises.
// ---------------------------------------------------------------------

function pipelineR3() {
  return [
    { $match: { arrivee: { $gte: PARAM.recDebut, $lt: PARAM.recFin } } },
    { $lookup: { from: "bateaux", localField: "bateau", foreignField: "_id", as: "b" } },
    { $match: { "b.pavillon": PARAM.pavillon } },
    { $group: { _id: "$port", tonnes: { $sum: { $sum: "$cargaisons.tonnes" } }, n: { $sum: 1 } } }
  ];
}
function ligneR3(r) {
  return g(r._id, 12) + d(deci(r.tonnes, 0), 12) + " t en " + d(r.n, 5) + " escales";
}

// ---------------------------------------------------------------------
// R4 — « Les dix escales qui ont manipule le plus de tonnage. »
//      Le tonnage d'une escale, c'est la somme de ses cargaisons. Il
//      n'est ecrit nulle part : il se recalcule a chaque fois, pour les
//      94 500 escales, avant de pouvoir en garder dix.
// ---------------------------------------------------------------------

function pipelineR4() {
  return [
    { $set:   { total: { $sum: "$cargaisons.tonnes" } } },
    { $sort:  { total: -1, _id: 1 } },
    { $limit: 10 }
  ];
}
function ligneR4(e) {
  return d(e._id, 8) + "  " + g(e.bateau, 12) + g(e.port, 12)
       + d(deci(e.total, 0), 9) + " t";
}

// =====================================================================
//  Les quatre, mises en forme pour le banc.
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

  { code: "R3", intitule: "Le tonnage d un pavillon, port par port",
    jouer:     base => base.escales.aggregate(pipelineR3()).toArray().map(ligneR3).sort(),
    expliquer: base => base.escales.explain("executionStats").aggregate(pipelineR3()) },

  { code: "R4", intitule: "Les dix plus grosses escales",
    jouer:     base => base.escales.aggregate(pipelineR4()).toArray().map(ligneR4).sort(),
    expliquer: base => base.escales.explain("executionStats").aggregate(pipelineR4()) }
];
