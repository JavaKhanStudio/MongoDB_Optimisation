// =====================================================================
//  Les requetes EN CLAIR disent-elles la meme chose que requetes.js ?
// =====================================================================
//  SUJET.md (section « Les quatre requetes ») et les commentaires de
//  requetes.js montrent chaque requete telle qu'on la tape dans
//  make <sujet>-mongo : db.collectes.find({ ... }), valeurs en dur. Ce
//  texte est recopie a la main a cote du JavaScript ; ce banc-ci le joue
//  et compare ses lignes a celles de requetes.js. Un ecart, et le texte
//  ment a l'etudiant.
//
//  Sur une base chargee, depuis la racine du depot :
//    docker exec optimisation-mongo mongosh --quiet \
//      --eval 'const SUJET = "1-dune"; const BASE = "dune"' \
//      --file /projet/tools/verifier-en-clair.js
//  Sort 0 si les huit textes (4 dans SUJET.md, 4 dans requetes.js)
//  rendent exactement les lignes de requetes.js.
// =====================================================================

load("/projet/sujets/outils.js");
load("/projet/sujets/" + SUJET + "/requetes.js");
const fs = require("fs");
const base = db.getSiblingDB(BASE);

// SUJET.md : les blocs ```js de la section « ## Les quatre requetes »,
// dans l'ordre R1..R4.
function depuisSujet() {
  const md = fs.readFileSync("/projet/sujets/" + SUJET + "/SUJET.md", "utf8");
  const debut = md.search(/^## Les quatre requêtes$/m);
  if (debut < 0) return [];
  const suite = md.slice(debut + 3);
  const section = suite.slice(0, suite.search(/^## /m) < 0 ? undefined : suite.search(/^## /m));
  return [...section.matchAll(/```js\n([\s\S]*?)```/g)].map(m => m[1]);
}

// requetes.js : dans le cartouche de chaque Rn, les lignes a partir de
// celle qui commence par « db. », jusqu'au trait de fin du cartouche.
function depuisRequetes() {
  const js = fs.readFileSync("/projet/sujets/" + SUJET + "/requetes.js", "utf8");
  const textes = [];
  for (const m of js.matchAll(/^\/\/ R\d [\s\S]*?^\/\/ -{10,}$/gm)) {
    const lignes = m[0].split("\n").map(l => l.replace(/^\/\/ {0,6}/, ""));
    const i = lignes.findIndex(l => l.startsWith("db."));
    if (i >= 0) textes.push(lignes.slice(i, -1).join("\n"));
  }
  return textes;
}

// Joue par load(), pas par new Function : seul ce qui passe par le
// chargeur de mongosh voit ses appels attendus, et find(...).sort(...)
// n'existe pas sur une promesse. Le toArray() est DANS le fichier : un
// curseur qui en ressort a deja perdu ses vingt premiers documents.
function jouerTexte(texte) {
  const f = "/tmp/verifier-en-clair.js";
  fs.writeFileSync(f, "globalThis.enClair = ("
    + texte.replace(/^db\./, "db.getSiblingDB(" + JSON.stringify(BASE) + ").")
    + ").toArray();");
  load(f);
  return globalThis.enClair;
}

let faux = 0;
for (const [source, textes] of [["SUJET.md", depuisSujet()], ["requetes.js", depuisRequetes()]]) {
  titre(source);
  if (textes.length !== REQUETES.length) {
    dire(textes.length + " requetes en clair trouvees, " + REQUETES.length + " attendues.");
    faux++;
    continue;
  }
  REQUETES.forEach((req, i) => {
    const attendu = req.jouer(base);
    let obtenu, erreur = "";
    try { obtenu = jouerTexte(textes[i]).map(globalThis["ligne" + req.code]).sort(); }
    catch (e) { erreur = String(e.message || e); }
    const pareil = !erreur && JSON.stringify(obtenu) === JSON.stringify(attendu);
    if (!pareil) faux++;
    dire(req.code + "  " + (pareil ? "pareil" : "DIFFERENT") + "   "
         + (erreur || (obtenu.length + " lignes, " + attendu.length + " attendues")));
  });
}
print("");
quit(faux === 0 ? 0 : 1);
