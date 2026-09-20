// =====================================================================
//  REMETTRE LA BASE COMME ELLE ETAIT — sans la recharger
// =====================================================================
//  Joue par : make <sujet>-remettre
//  Appele avec  --eval 'const BASE = "dune"'
//
//  Tous les index tombent, _id mis a part. Et si la correction est
//  passee, les champs qu'elle a recopies s'effacent : elle a laisse la
//  liste dans la collection `optimisations`.
//
//  A quoi ca sert : mesurer deux fois de suite dans les memes conditions.
//  Un index pose reste pose ; sans ce bouton, la seule facon de revenir
//  au point de depart serait de tout recharger.
// =====================================================================

load("/projet/sujets/outils.js");

const base = db.getSiblingDB(BASE);

titre("On remet la base " + BASE + " comme elle etait");

let tombes = 0;
for (const c of base.getCollectionNames()) {
  if (c === "optimisations" || c === "reference") continue;
  for (const ix of base.getCollection(c).getIndexes()) {
    if (ix.name === "_id_") continue;
    base.getCollection(c).dropIndex(ix.name);
    dire("index tombe     " + g(c, 22) + ix.name);
    tombes++;
  }
}
if (tombes === 0) dire("aucun index a retirer.");

if (base.getCollectionNames().indexOf("optimisations") >= 0) {
  for (const o of base.optimisations.find().toArray()) {
    const r = base.getCollection(o.collection).updateMany({}, { $unset: { [o.champ]: "" } });
    dire("copie effacee   " + g(o.collection, 22) + g(o.champ, 20)
       + d(n(r.modifiedCount), 9) + " documents");
  }
  base.optimisations.drop();
}

dire("");
dire("La base est celle du chargement.   make " + BASE + "-mesurer");
print("");
