// =====================================================================
//  DB 2 — Les tortues : LES QUATRE REQUETES A OPTIMISER
// =====================================================================
//  Ce fichier est A TOI. Les quatre requetes sont ecrites de la facon la
//  plus naturelle : c'est ce qu'on ecrit quand on ne s'est pas encore
//  demande ce que le serveur allait devoir lire.
//
//  make tortues-mesurer les joue et dit, pour chacune, combien de
//  documents le serveur a lus pour rendre combien de lignes.
//
//  LA SEULE REGLE : la REPONSE ne change pas. Elle a ete calculee au
//  chargement, a part, a partir des donnees generees — pas en rejouant
//  ces requetes-ci.
// =====================================================================

const PARAM = {
  observateur: "Aline Roy",
  site:        "Lady Elliot",
  anneeDebut:  new Date(Date.UTC(2025, 0, 1)),
  anneeFin:    new Date(Date.UTC(2026, 0, 1)),
  statutUicn:  "CR",                                // en danger critique
  moisDebut:   new Date(Date.UTC(2026, 6, 1)),      // juillet 2026
  moisFin:     new Date(Date.UTC(2026, 7, 1)),
  tag:         "migration-longue"
};

// ---------------------------------------------------------------------
// R1 — « Tout ce qu Aline Roy a observe. »
//      Une egalite sur un champ. C'est la requete que SQL servait sans
//      qu'on y pense : la cle etrangere vers observateur y portait un
//      index, offert avec la contrainte.
// ---------------------------------------------------------------------

function filtreR1() { return { observateur: PARAM.observateur }; }
function ligneR1(o) {
  return d(o._id, 8) + "  " + jjmmaaaa(o.date) + "  " + g(o.site, 18) + d(o.scoreSante, 3);
}

// ---------------------------------------------------------------------
// R2 — « Les observations faites a Lady Elliot en 2025, de la plus
//      recente a la plus ancienne. »
//      Une egalite, un intervalle, un tri.
// ---------------------------------------------------------------------

function filtreR2() {
  return { site: PARAM.site, date: { $gte: PARAM.anneeDebut, $lt: PARAM.anneeFin } };
}
function ligneR2(o) {
  return jjmmaaaa(o.date) + "  " + g(o.observateur, 18) + " score " + d(o.scoreSante, 3);
}

// ---------------------------------------------------------------------
// R3 — « Le score de sante moyen des tortues EN DANGER CRITIQUE
//      observees en juillet 2026, site par site. »
//      Le statut UICN n'est pas dans l'observation : il est dans
//      l'espece de la tortue, recopie dans la tortue. Il faut donc
//      ouvrir la tortue de chaque observation avant de pouvoir jeter
//      celles qui ne sont pas d'une espece en danger critique.
// ---------------------------------------------------------------------

function pipelineR3() {
  return [
    { $match: { date: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } } },
    { $lookup: { from: "tortues", localField: "tortue", foreignField: "_id", as: "t" } },
    { $match: { "t.espece.statutUicn": PARAM.statutUicn } },
    { $group: { _id: "$site", somme: { $sum: "$scoreSante" }, n: { $sum: 1 } } }
  ];
}
function ligneR3(r) {
  return g(r._id, 18) + " moyenne " + moyenne(r.somme, r.n, 2)
       + " sur " + d(r.n, 4) + " observations";
}

// ---------------------------------------------------------------------
// R4 — « Les tortues marquees migration-longue. »
//      Le tag est dans un TABLEAU. Un index sur un tableau ne se
//      comporte pas tout a fait comme un index sur un champ — mais il
//      existe, et il n'y en a pas.
// ---------------------------------------------------------------------

function filtreR4() { return { tags: PARAM.tag }; }
function ligneR4(t) {
  return d(t._id, 7) + "  " + g(t.nom, 16) + g(t.espece.nomCommun, 20)
       + (t.habitat ? t.habitat.nom : "(sans habitat)");
}

// =====================================================================
//  Les quatre, mises en forme pour le banc.
// =====================================================================

const REQUETES = [
  { code: "R1", intitule: "Les observations d un observateur",
    jouer:     base => base.observations.find(filtreR1()).toArray().map(ligneR1).sort(),
    expliquer: base => base.observations.find(filtreR1()).explain("executionStats") },

  { code: "R2", intitule: "Les observations d un site sur une annee",
    jouer:     base => base.observations.find(filtreR2()).sort({ date: -1 })
                           .toArray().map(ligneR2).sort(),
    expliquer: base => base.observations.find(filtreR2()).sort({ date: -1 })
                           .explain("executionStats") },

  { code: "R3", intitule: "Score moyen des especes en danger critique",
    jouer:     base => base.observations.aggregate(pipelineR3()).toArray().map(ligneR3).sort(),
    expliquer: base => base.observations.explain("executionStats").aggregate(pipelineR3()) },

  { code: "R4", intitule: "Les tortues portant un tag",
    jouer:     base => base.tortues.find(filtreR4()).toArray().map(ligneR4).sort(),
    expliquer: base => base.tortues.find(filtreR4()).explain("executionStats") }
];
