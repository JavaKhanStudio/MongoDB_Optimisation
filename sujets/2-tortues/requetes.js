// =====================================================================
//  DB 2 — Les tortues : LES SEPT REQUETES A OPTIMISER
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
  tag:         "migration-longue",
  poidsMin:    410,
  siteMois:    "Anakao",
  annee:       2024,
  mois:        3                                    // mars
};

// ---------------------------------------------------------------------
// R1 — « Tout ce qu Aline Roy a observe. »
//      Une egalite sur un champ. C'est la requete que SQL servait sans
//      qu'on y pense : la cle etrangere vers observateur y portait un
//      index, offert avec la contrainte.
//
//      En clair, dans make tortues-mongo :
//      db.observations.find({ observateur: "Aline Roy" })
// ---------------------------------------------------------------------

function filtreR1() { return { observateur: PARAM.observateur }; }
function ligneR1(o) {
  return d(o._id, 8) + "  " + jjmmaaaa(o.date) + "  " + g(o.site, 18) + d(o.scoreSante, 3);
}

// ---------------------------------------------------------------------
// R2 — « Les observations faites a Lady Elliot en 2025, de la plus
//      recente a la plus ancienne. »
//      Une egalite, un intervalle, un tri.
//
//      En clair, dans make tortues-mongo :
//      db.observations.find({
//        site: "Lady Elliot",
//        date: { $gte: ISODate("2025-01-01"), $lt: ISODate("2026-01-01") }
//      }).sort({ date: -1 })
// ---------------------------------------------------------------------

function filtreR2() {
  return { site: PARAM.site, date: { $gte: PARAM.anneeDebut, $lt: PARAM.anneeFin } };
}
function ligneR2(o) {
  return jjmmaaaa(o.date) + "  " + g(o.observateur, 18) + " score " + d(o.scoreSante, 3);
}

// ---------------------------------------------------------------------
// R3 — « Les tortues de 410 kg et plus. »
//      Un intervalle sur un champ range dans un sous-document.
//
//      En clair, dans make tortues-mongo :
//      db.tortues.find({ "mensurations.poidsKg": { $gte: 410 } })
// ---------------------------------------------------------------------

function filtreR3() { return { "mensurations.poidsKg": { $gte: PARAM.poidsMin } }; }
function ligneR3(t) {
  return d(t._id, 7) + "  " + g(t.nom, 16) + g(t.espece.nomCommun, 20)
       + d(deci(t.mensurations.poidsKg, 1), 7) + " kg";
}

// ---------------------------------------------------------------------
// R4 — « Les tortues marquees migration-longue. »
//      Le tag est dans un TABLEAU. Un index sur un tableau ne se
//      comporte pas tout a fait comme un index sur un champ — mais il
//      existe, et il n'y en a pas.
//
//      En clair, dans make tortues-mongo :
//      db.tortues.find({ tags: "migration-longue" })
// ---------------------------------------------------------------------

function filtreR4() { return { tags: PARAM.tag }; }
function ligneR4(t) {
  return d(t._id, 7) + "  " + g(t.nom, 16) + g(t.espece.nomCommun, 20)
       + (t.habitat ? t.habitat.nom : "(sans habitat)");
}

// ---------------------------------------------------------------------
// R5 — « Le score de sante moyen des tortues EN DANGER CRITIQUE
//      observees en juillet 2026, site par site. »
//      Le statut UICN n'est pas dans l'observation : il est dans
//      l'espece de la tortue, recopie dans la tortue. Il faut donc
//      ouvrir la tortue de chaque observation avant de pouvoir jeter
//      celles qui ne sont pas d'une espece en danger critique.
//
//      En clair, dans make tortues-mongo :
//      db.observations.aggregate([
//        { $match: { date: { $gte: ISODate("2026-07-01"), $lt: ISODate("2026-08-01") } } },
//        { $lookup: { from: "tortues", localField: "tortue", foreignField: "_id", as: "t" } },
//        { $match: { "t.espece.statutUicn": "CR" } },
//        { $group: { _id: "$site", somme: { $sum: "$scoreSante" }, n: { $sum: 1 } } }
//      ])
// ---------------------------------------------------------------------

function pipelineR5() {
  return [
    { $match: { date: { $gte: PARAM.moisDebut, $lt: PARAM.moisFin } } },
    { $lookup: { from: "tortues", localField: "tortue", foreignField: "_id", as: "t" } },
    { $match: { "t.espece.statutUicn": PARAM.statutUicn } },
    { $group: { _id: "$site", somme: { $sum: "$scoreSante" }, n: { $sum: 1 } } }
  ];
}
function ligneR5(r) {
  return g(r._id, 18) + " moyenne " + moyenne(r.somme, r.n, 2)
       + " sur " + d(r.n, 4) + " observations";
}

// ---------------------------------------------------------------------
// R6 — « Les observations faites a Anakao en mars 2024. »
//      Le mois est demande tel qu'on le dit : l'annee vaut 2024, le mois
//      vaut 3. Le serveur doit donc calculer l'annee et le mois de chaque
//      date avant de pouvoir la comparer.
//
//      En clair, dans make tortues-mongo :
//      db.observations.find({
//        site: "Anakao",
//        $expr: { $and: [ { $eq: [{ $year: "$date" }, 2024] },
//                         { $eq: [{ $month: "$date" }, 3] } ] }
//      })
// ---------------------------------------------------------------------

function filtreR6() {
  return { site: PARAM.siteMois,
           $expr: { $and: [ { $eq: [{ $year: "$date" }, PARAM.annee] },
                            { $eq: [{ $month: "$date" }, PARAM.mois] } ] } };
}
function ligneR6(o) {
  return d(o._id, 8) + "  " + jjmmaaaa(o.date) + "  tortue " + d(o.tortue, 5)
       + "  " + g(o.observateur, 18) + " score " + d(o.scoreSante, 3);
}

// ---------------------------------------------------------------------
// R7 — « Les dix tortues les plus observees. »
//      Le nombre d'observations d'une tortue n'est ecrit nulle part : il
//      se recompte, sur les 90 000 observations, a chaque fois.
//
//      En clair, dans make tortues-mongo :
//      db.observations.aggregate([
//        { $group: { _id: "$tortue", n: { $sum: 1 } } },
//        { $sort:  { n: -1, _id: 1 } },
//        { $limit: 10 }
//      ])
// ---------------------------------------------------------------------

function pipelineR7() {
  return [
    { $group: { _id: "$tortue", n: { $sum: 1 } } },
    { $sort:  { n: -1, _id: 1 } },
    { $limit: 10 }
  ];
}
function ligneR7(r) {
  return "tortue " + d(r._id, 7) + d(r.n, 5) + " observations";
}

// =====================================================================
//  Les sept, mises en forme pour le banc.
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

  { code: "R3", intitule: "Les tortues les plus lourdes",
    jouer:     base => base.tortues.find(filtreR3()).toArray().map(ligneR3).sort(),
    expliquer: base => base.tortues.find(filtreR3()).explain("executionStats") },

  { code: "R4", intitule: "Les tortues portant un tag",
    jouer:     base => base.tortues.find(filtreR4()).toArray().map(ligneR4).sort(),
    expliquer: base => base.tortues.find(filtreR4()).explain("executionStats") },

  { code: "R5", intitule: "Score moyen des especes en danger critique",
    jouer:     base => base.observations.aggregate(pipelineR5()).toArray().map(ligneR5).sort(),
    expliquer: base => base.observations.explain("executionStats").aggregate(pipelineR5()) },

  { code: "R6", intitule: "Les observations d un site sur un mois",
    jouer:     base => base.observations.find(filtreR6()).toArray().map(ligneR6).sort(),
    expliquer: base => base.observations.find(filtreR6()).explain("executionStats") },

  { code: "R7", intitule: "Les dix tortues les plus observees",
    jouer:     base => base.observations.aggregate(pipelineR7()).toArray().map(ligneR7).sort(),
    expliquer: base => base.observations.explain("executionStats").aggregate(pipelineR7()) }
];
