// =====================================================================
//  LE BANC — joue les quatre requetes d'un sujet et dit ce qu'elles coutent
// =====================================================================
//  Joue par : make <sujet>-mesurer
//  Appele avec  --eval 'const SUJET = "1-dune"; const BASE = "dune"'
//
//  Deux colonnes seulement comptent : « rendus » et « lus ». La premiere
//  est ce que la question demande — elle ne bougera pas. La seconde est
//  ce que le serveur a du parcourir pour la trouver, et c'est elle qu'on
//  fait tomber. Le jour ou les deux se ressemblent, la requete est
//  optimisee.
//
//  « lus » ne sort pas d'explain() : il sort des compteurs du serveur,
//  releves avant et apres la requete. Ils comptent TOUT d'un seul nombre,
//  quelle que soit la forme du plan — la ou explain() eparpille ses
//  comptes dans l'arbre et laisse lire le mauvais noeud.
// =====================================================================

load("/projet/sujets/outils.js");
load("/projet/sujets/" + SUJET + "/requetes.js");

const base = db.getSiblingDB(BASE);

if (base.getCollectionNames().length === 0) {
  print("");
  print("  La base " + BASE + " est vide. La charger d abord :   make " + BASE);
  print("");
  quit(2);
}

titre("Les quatre requetes de " + SUJET + ", sur la base telle qu elle est");
const mesures = banc(base, REQUETES);

titre("La reponse n a pas change ?");
const bon = verifierReference(base, mesures);

const ix = indexPoses(base);
titre("Les index poses (hors _id)");
if (ix.length === 0) dire("aucun.");
else ix.forEach(dire);
print("");

quit(bon ? 0 : 1);
