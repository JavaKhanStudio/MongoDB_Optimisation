// =====================================================================
//  Les outils du projet. Charge par load() en tete de chaque
//  charger.js, de mesurer.js et de chaque optimiser.js.
// =====================================================================
//  Trois choses vivent ici :
//    1. un tirage aleatoire REPRODUCTIBLE — meme graine, meme base,
//       sur toutes les machines. Les donnees ne sont pas un dump : elles
//       se refabriquent, et elles se refabriquent a l'identique.
//    2. la mise en forme, la meme que « SQL vers NoSQL ».
//    3. LE BANC DE MESURE : il joue une requete, compte ce que le
//       serveur a vraiment lu, et dit avec quel plan.
// =====================================================================

// ---------------------------------------------------------------------
// 1. L'aleatoire reproductible
// ---------------------------------------------------------------------
// mulberry32 : trente-deux bits d'etat, une graine entiere, et la meme
// suite partout. Math.random() n'a pas de graine — il est donc interdit
// dans ce projet : deux etudiants n'auraient pas la meme base, et les
// chiffres de l'enonce seraient faux chez l'un des deux.

function alea(graine) {
  let a = graine >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Un tireur : toutes les formes de tirage dont les generateurs ont besoin.
function tireur(graine) {
  const r = alea(graine);
  return {
    reel:   (a, b) => a + r() * (b - a),
    entier: (a, b) => a + Math.floor(r() * (b - a + 1)),          // bornes incluses
    choix:  t => t[Math.floor(r() * t.length)],
    // pondere([["REUSSIE", 7], ["ECHOUEE", 3]]) rend REUSSIE 7 fois sur 10.
    pondere: pairs => {
      const total = pairs.reduce((s, p) => s + p[1], 0);
      let x = r() * total;
      for (const [v, p] of pairs) { x -= p; if (x < 0) return v; }
      return pairs[pairs.length - 1][0];
    },
    // Une date entre deux dates, a la minute.
    date: (debut, fin) => new Date(debut.getTime()
            + Math.floor(r() * (fin.getTime() - debut.getTime()) / 60000) * 60000),
    // Un reel arrondi a `dec` decimales — pas de 3.0000000000000004 en base.
    arrondi: (a, b, dec) => {
      const f = Math.pow(10, dec);
      return Math.round((a + r() * (b - a)) * f) / f;
    },
    // Vrai une fois sur `1/p`.
    chance: p => r() < p
  };
}

// ---------------------------------------------------------------------
// 2. La mise en forme
// ---------------------------------------------------------------------

function titre(t) { print("\n=== " + t + " " + "=".repeat(Math.max(0, 70 - t.length))); }
function dire(t)  { print("  " + t); }
function g(v, n)  { return String(v).padEnd(n); }
function d(v, n)  { return String(v).padStart(n); }

// 120000 -> "120 000". Un nombre a six chiffres colle est illisible, et
// tout l'exercice consiste a comparer des nombres a six chiffres.
function n(x) { return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

function deci(x, dec) {
  const f = Math.pow(10, dec);
  const e = Math.floor(Math.abs(x) * f + 0.5);
  const s = dec === 0 ? String(e) : Math.floor(e / f) + "." + String(e % f).padStart(dec, "0");
  return (x < 0 ? "-" : "") + s;
}

// La moyenne, arrondie comme le ferait to_char : somme et n sont des
// entiers, l'arrondi est donc exact et ne depend pas du flottant.
function moyenne(somme, nb, dec) {
  const f = Math.pow(10, dec);
  const e = Math.floor((somme * f * 2 + nb) / (2 * nb));
  return Math.floor(e / f) + "." + String(e % f).padStart(dec, "0");
}

function jjmmaaaa(dt) {
  return String(dt.getUTCDate()).padStart(2, "0") + "/"
       + String(dt.getUTCMonth() + 1).padStart(2, "0") + "/"
       + dt.getUTCFullYear();
}

// Inserer des dizaines de milliers de documents d'un coup fait tomber
// le serveur sur la limite des 16 Mo d'une commande. Par paquets, et
// on dit ou on en est : un chargement muet ressemble a un blocage.
function verser(collection, docs, paquet) {
  const taille = paquet || 5000;
  for (let i = 0; i < docs.length; i += taille) {
    collection.insertMany(docs.slice(i, i + taille), { ordered: false });
  }
  return docs.length;
}

// ---------------------------------------------------------------------
// 3. Le banc de mesure
// ---------------------------------------------------------------------
//  Ce qu'on veut montrer, c'est l'ecart entre ce que la requete REND et
//  ce que le serveur a du LIRE pour le rendre. explain() le dit — mais
//  pas au meme endroit selon la forme de la requete : un find le met dans
//  executionStats, un aggregate l'eparpille entre l'etage $cursor, chaque
//  $lookup, et une somme au sommet. Lire le mauvais noeud fait mentir la
//  mesure, et c'est exactement ce qu'un etudiant fera.
//
//  Les compteurs de serverStatus().metrics.queryExecutor, eux, comptent
//  TOUT ce que le moteur a touche, d'un seul nombre et sans dependre du
//  plan. Un seul client, une requete a la fois : la difference entre
//  avant et apres est exactement le prix de la requete. C'est ce
//  chiffre-la que le banc affiche.

function compteurs(base) {
  const q = base.serverStatus().metrics.queryExecutor;
  return { lus: q.scannedObjects, cles: q.scanned };
}

// Le plan, en deux mots. On ne lit pas l'arbre d'explain a l'ecran : on
// releve les etages qui coutent, et on les nomme.
function plan(explication) {
  const vus = new Set();
  (function parcourir(x) {
    if (x === null || typeof x !== "object") return;
    if (Array.isArray(x)) { x.forEach(parcourir); return; }
    if (typeof x.stage === "string") vus.add(x.stage);
    for (const cle of Object.keys(x)) {
      if (cle === "$lookup") vus.add("LOOKUP");
      parcourir(x[cle]);
    }
  })(explication);

  const bouts = [];
  if (vus.has("COLLSCAN"))            bouts.push("COLLSCAN");
  else if (vus.has("IXSCAN"))         bouts.push(vus.has("FETCH") ? "IXSCAN" : "IXSCAN couvrant");
  else if (vus.has("DISTINCT_SCAN"))  bouts.push("DISTINCT_SCAN");
  else if (vus.has("EOF"))            bouts.push("EOF");
  if (vus.has("SORT"))                bouts.push("TRI");
  if (vus.has("LOOKUP"))              bouts.push("LOOKUP");
  return bouts.length ? bouts.join("+") : "?";
}

// Une requete du sujet :
//   { code, intitule, jouer(base) -> tableau de lignes deja mises en forme,
//     expliquer(base) -> l'explication de son etage le plus cher }
// jouer() rend des LIGNES, pas des documents : c'est ce qui permet de
// comparer la reponse d'un etudiant qui a reecrit sa requete a celle
// d'origine. La reponse doit rester la meme ; le chemin, non.
function jouerUne(base, requete) {
  const avant = compteurs(base);
  const t0 = Date.now();
  const lignes = requete.jouer(base);
  const ms = Date.now() - t0;
  const apres = compteurs(base);
  let p = "?";
  try { p = plan(requete.expliquer(base)); } catch (e) { p = "explain KO"; }
  return {
    code: requete.code, intitule: requete.intitule, lignes: lignes,
    rendus: lignes.length, lus: apres.lus - avant.lus, cles: apres.cles - avant.cles,
    ms: ms, plan: p
  };
}

// La largeur des colonnes, une seule fois : l'en-tete et les lignes se
// fabriquent avec les memes appels, sinon elles finissent par glisser.
const COL = { code: 6, intitule: 42, rendus: 7, lus: 11, cles: 11, plan: 15, ms: 6 };

function ligneMesure(code, intitule, rendus, lus, cles, plan, ms) {
  return "  " + g(code, COL.code) + g(String(intitule).slice(0, COL.intitule - 1), COL.intitule)
       + d(rendus, COL.rendus) + d(lus, COL.lus) + d(cles, COL.cles)
       + "  " + g(plan, COL.plan) + d(ms, COL.ms);
}

// Joue toutes les requetes d'un sujet et imprime le tableau.
function banc(base, requetes) {
  const mesures = requetes.map(r => jouerUne(base, r));
  print("");
  print(ligneMesure("code", "ce qu elle demande", "rendus", "lus", "cles", "plan", "ms"));
  mesures.forEach(m => print(ligneMesure(m.code, m.intitule, n(m.rendus), n(m.lus),
                                         n(m.cles), m.plan, n(m.ms))));
  const lus = mesures.reduce((s, m) => s + m.lus, 0);
  const rendus = mesures.reduce((s, m) => s + m.rendus, 0);
  const ms = mesures.reduce((s, m) => s + m.ms, 0);
  print("");
  dire(n(lus) + " documents lus pour " + n(rendus) + " lignes rendues"
     + (rendus ? "  —  " + Math.round(lus / rendus) + " lus pour 1 rendu" : "")
     + ",  " + n(ms) + " ms en tout.");
  return mesures;
}

// Le meme tableau, deux fois : avant, apres, et le facteur gagne.
function bancCompare(avant, apres) {
  const l = (c, i, la, lp, gain, ma, mp) =>
        "  " + g(c, COL.code) + g(String(i).slice(0, COL.intitule - 1), COL.intitule)
      + d(la, 12) + d(lp, 12) + d(gain, 9) + d(ma, 11) + d(mp, 10);
  print("");
  print(l("code", "ce qu elle demande", "lus avant", "lus apres", "gain", "ms avant", "ms apres"));
  for (let i = 0; i < avant.length; i++) {
    const a = avant[i], b = apres[i];
    const gain = b.lus === 0 ? (a.lus === 0 ? "—" : "infini")
               : (a.lus / b.lus >= 10 ? Math.round(a.lus / b.lus) : deci(a.lus / b.lus, 1)) + " x";
    print(l(a.code, a.intitule, n(a.lus), n(b.lus), gain, n(a.ms), n(b.ms)));
  }
  print("");
}

// ---------------------------------------------------------------------
// 4. La reponse de reference
// ---------------------------------------------------------------------
//  Optimiser, c'est changer le chemin sans changer la reponse. Le
//  chargement enregistre donc ce que chaque requete repond sur la base
//  fraiche, et le banc le reverifie a chaque passage. Un index ne change
//  jamais une reponse ; une reference etendue mal recopiee, si.

function enregistrerReference(base, mesures) {
  base.reference.drop();
  base.reference.insertMany(mesures.map(m => ({
    _id: m.code, intitule: m.intitule, lignes: m.lignes.map(String)
  })));
}

function verifierReference(base, mesures) {
  const att = new Map(base.reference.find().toArray().map(r => [r._id, r.lignes]));
  if (att.size === 0) { dire("(pas de reponse de reference : recharger la base)"); return true; }
  let ko = 0;
  for (const m of mesures) {
    const a = att.get(m.code);
    if (!a) continue;
    const o = m.lignes.map(String);
    const bon = a.length === o.length && a.every((l, i) => l === o[i]);
    if (bon) continue;
    ko++;
    print("");
    dire("KO  " + m.code + " ne rend plus la meme reponse qu au chargement :");
    for (let i = 0; i < Math.max(a.length, o.length); i++) {
      if (a[i] === o[i]) continue;
      dire("        au chargement |" + (a[i] === undefined ? "  (pas de ligne)" : a[i]));
      dire("        maintenant    |" + (o[i] === undefined ? "  (pas de ligne)" : o[i]));
    }
  }
  if (ko === 0) dire("Les " + mesures.length + " reponses sont celles du chargement : optimise, pas change.");
  else          dire(ko + " requete(s) ne rendent plus la meme chose : ce n est plus la meme question.");
  return ko === 0;
}

// Les index poses sur la base, _id mis a part.
function indexPoses(base) {
  const l = [];
  for (const c of base.getCollectionNames().sort()) {
    for (const ix of base.getCollection(c).getIndexes()) {
      if (ix.name === "_id_") continue;
      l.push((g(c, 22) + g(ix.name, 30)
           + (ix.partialFilterExpression ? "   partiel" : "")).replace(/\s+$/, ""));
    }
  }
  return l;
}
