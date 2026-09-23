# Optimisation d'une collection

> Les trois modèles document écrits en « SQL vers NoSQL », remplis cette fois
> de **300 000 documents**, et les requêtes qui vont avec. Le modèle est propre.
> Ce qui manque, ce sont les index — et les champs qui permettraient de ne pas
> aller chercher ailleurs ce qu'on filtre. Accompagne la slide « Optimisation
> d'une collection » du deck MongoDB.

---

## Récupérer le projet

```bash
git clone https://github.com/JavaKhanStudio/MongoDB_Optimisation.git
cd MongoDB_Optimisation
```

La correction n'est pas sur cette branche. Elle vit sur la branche `correction`,
qu'il faut aller chercher à la main — c'est voulu :

```bash
git switch correction    # ajoute les corrections et `make <sujet>-optimiser`
git switch main          # les retire de nouveau
```

---

## Démarrage

```bash
make demarrer    # MongoDB 8.0 sur 27051
make sujets      # les trois sujets, en une page
make dune        # fabrique et charge la premiere base ; puis tortues, puis bateaux
make dune-mesurer
```

Sous Podman rootless (Fedora) :
`export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock` avant `make`.

`make aide` liste tout. Sous Windows, voir [la section suivante](#sous-windows).

---

## Sous Windows

Pas besoin de `make`, ni de WSL. Il faut **Docker Desktop**, installé et lancé,
et **Git**. Dans PowerShell :

```powershell
git clone https://github.com/JavaKhanStudio/MongoDB_Optimisation.git
cd MongoDB_Optimisation
.\make demarrer
.\make dune
.\make dune-mesurer
```

`.\make` remplace `make` dans **toutes** les commandes de ce README, réglages
compris : `.\make dune VOLUME=10`, `.\make aide`. Dans l'invite de commandes
(`cmd`), `make dune` suffit.

C'est `make.cmd`, à la racine, qui lance `docker/windows.ps1` : les mêmes
commandes `docker` que le `Makefile`, cible pour cible. Il passe outre la
politique d'exécution de PowerShell, qu'on n'a donc pas à toucher.

---

## Les trois sujets

| sujet | documents | ce qu'on y apprend |
|---|---|---|
| [`1-dune`](sujets/1-dune/SUJET.md) | 100 000 | l'index simple · l'ordre des clés d'un index composé · **la référence étendue** · le tri bloquant · *(exploration)* la requête couverte |
| [`2-tortues`](sujets/2-tortues/SUJET.md) | 100 000 | la clé étrangère que SQL indexait tout seul · l'index **multiclé** sur un tableau · la copie de copie · la **sélectivité** · *(exploration)* `$elemMatch` et les bornes d'un index multiclé |
| [`3-bateaux`](sujets/3-bateaux/SUJET.md) | 100 000 | deux requêtes sur quatre qu'**aucun index** ne peut servir · la référence étendue · le **champ calculé** · *(exploration)* l'index **partiel** |

Les trois sont indépendants : n'importe quel ordre, et on peut s'arrêter après
un seul. Ils partent des corrections de
[`MongoDB_SQLversNoSQL`](https://github.com/JavaKhanStudio/MongoDB_SQLversNoSQL) —
mêmes collections, mêmes noms, même document polymorphe.

**« Non optimisé » ne veut pas dire mal modélisé.** Rien n'est embarqué qui
grossisse sans fin, rien n'est dehors qui ne se lise qu'avec son parent. Ce sont
les index qui manquent, et les copies. Un seul modèle a bougé, et c'est dit dans
son sujet : à 10 000 tortues suivies pendant huit ans, les observations ne
tiennent plus dans la tortue.

---

## Les données ne sont pas dans le dépôt

Elles se **fabriquent** au chargement, à partir d'une graine :

```bash
make dune                       # 100 000 documents en 2 s
make dune VOLUME=10             # 1 000 000 documents en 11 s
make dune GRAINE=1234           # une autre base, tout aussi reproductible
```

Même graine, même base, sur toutes les machines. Aucun dump à transporter, et
`VOLUME=10` ne coûte rien à personne d'autre que la machine qui charge. À
`VOLUME=10`, `make dune-mesurer` lit 1 761 402 documents pour rendre 1 670
lignes — le rapport ne bouge pas (922 lus pour 1 rendu à `VOLUME=1`, 1 055 à
`VOLUME=10`), c'est ce qu'il y a derrière qui grossit.

Les chiffres des `SUJET.md` sont ceux de `VOLUME=1`, graine par défaut.

---

## Ce qu'on fait sur un sujet

`<sujet>` vaut `dune`, `tortues` ou `bateaux`.

| commande | ce qu'elle donne |
|---|---|
| `make <sujet>` | jette la base et la refait. Rejouable autant qu'on veut. |
| `make <sujet>-mesurer` | **le banc** : joue les quatre requêtes et dit, pour chacune, combien de documents le serveur a lus pour rendre combien de lignes |
| `make <sujet>-mongo` | un `mongosh` sur la base |
| `make <sujet>-remettre` | retire les index et les champs ajoutés, **sans recharger** : de quoi mesurer deux fois dans les mêmes conditions |
| `make <sujet>-optimiser` | **la correction**, sur la branche `correction` — `git switch correction` d'abord. Elle remet la base à nu, mesure, pose les index, écrit les copies, remesure, et met les deux tableaux côte à côte |

L'énoncé de chaque sujet est son `SUJET.md` : le modèle, ce que les quatre
requêtes coûtent aujourd'hui, et les exercices.

### Comment on mesure

Deux colonnes comptent.

```
  code  ce qu elle demande                         rendus        lus       cles  plan               ms
  R1    Les collectes d un contremaitre               169     37 500          0  COLLSCAN           15
```

**`rendus`** est ce que la question demande : il ne bougera pas. **`lus`** est ce
que le serveur a dû parcourir pour le trouver : c'est lui qu'on fait tomber. Le
jour où les deux se ressemblent, la requête est optimisée.

`lus` et `cles` ne sortent **pas** d'`explain()`. Ils sortent des compteurs du
serveur — `serverStatus().metrics.queryExecutor` — relevés avant et après la
requête. Ils comptent **tout**, y compris ce qu'un `$lookup` va chercher tout
seul, qu'`explain()` ne montre pas.

### La réponse ne change pas

Optimiser, c'est changer le chemin sans changer la réponse. La réponse attendue
des quatre requêtes est calculée **au chargement**, à part, à partir des données
générées — *pas* en rejouant les requêtes du sujet. Le banc la recompare à chaque
passage :

```
=== La reponse n a pas change ? ===========================================
  Les 4 reponses sont celles du chargement : optimise, pas change.
```

Un étudiant qui réécrit une requête est donc comparé à la vérité, pas à
lui-même. Et une requête devenue rapide qui ne répond plus à la question n'est
pas optimisée : elle est fausse.

---

## Où est la correction

Sur une branche à elle, `correction`, qu'on va chercher à la main :

```bash
git switch correction    # les trois optimiser.js apparaissent
make dune-optimiser      # la correction du premier sujet se joue
git switch main          # ils disparaissent ; le sujet reste
```

Trois fichiers font la différence entre les deux branches —
`sujets/<n>-<sujet>/optimiser.js`. Tout le reste, `Makefile` compris, est
identique : le projet ne se corrige qu'une fois. Sur `main`,
`make <sujet>-optimiser` existe toujours, et dit où aller.

Ce que la correction imprime, sur `dune` :

```
  code  ce qu elle demande                           lus avant   lus apres     gain   ms avant  ms apres
  R1    Les collectes d un contremaitre                 37 500         169    222 x         14         6
  R2    Les echecs d un puits, du plus recent           37 500           7   5357 x         10         3
  R3    Ce qu une region a sorti sur un mois            38 585         101    382 x         17         2
  R4    Les dix plus fortes secousses d un puits        62 500          10   6250 x         15         5
```

Le « avant » n'est **pas un chiffre recopié** : la correction commence par
remettre la base à nu et le mesurer, à chaque passage.

---

## Arborescence

```
docker/docker-compose.yml   mongo:8.0 (27051), depot monte en /projet.
                            Le cache WiredTiger est FIXE a 1 Go, et pas laisse
                            au defaut : le defaut est la moitie de la RAM, et
                            les chiffres des SUJET.md ne seraient pas les memes
                            d'un poste a l'autre.
Makefile                    make aide
make.cmd                    le meme, sous Windows : .\make aide
docker/windows.ps1          ce que make.cmd lance, cible pour cible
sujets/SUJETS.txt           la page que `make sujets` affiche
sujets/outils.js            le tirage reproductible, la mise en forme, et LE
                            BANC DE MESURE
sujets/mesurer.js           make <sujet>-mesurer
sujets/remettre.js          make <sujet>-remettre
sujets/<n>-<sujet>/
    SUJET.md                l'enonce : le modele, les chiffres, les exercices
    charger.js              fabrique les donnees, les charge, et calcule la
                            reponse attendue des quatre requetes
    requetes.js             LES QUATRE REQUETES — le fichier de l'etudiant
    optimiser.js            LA CORRECTION (branche correction)
```

`make arreter` conserve les données, `make purger` efface le volume.

---

## Ce que l'exécution a appris

| constat | où |
|---|---|
| `mongo:8.0` refuse de démarrer sur un noyau Linux ≥ 6.19 (SERVER-121912). Le contournement est `GLIBC_TUNABLES: glibc.pthread.rseq=1` dans l'environnement du service — le même que `MongoDB_ACID` et `MongoDB_SQLversNoSQL`. | `docker/docker-compose.yml` |
| L'`explain` d'un `aggregate` éparpille `totalDocsExamined` dans l'arbre : sur R3 de `dune`, l'étage `$cursor` en annonce 37 500 et le `$lookup` 1 085, et seul le sommet porte la somme. Lire le mauvais nœud fait mentir la mesure d'un facteur qui dépend du plan. Les compteurs de `serverStatus().metrics.queryExecutor`, eux, donnent le même nombre quelle que soit la forme de la requête — c'est d'eux que sort la colonne `lus`. | `sujets/outils.js` |
| Un index dont la clé de tête est un **intervalle** sert quand même le tri et ne lit pas un document de trop — mais il lit **toutes les clés de l'intervalle** : 23 239 au lieu de 967 sur R2 de `bateaux`. La faute ne se voit que dans la colonne `cles`. | `sujets/3-bateaux/SUJET.md` |
| `partialFilterExpression` n'accepte pas `$exists: false` : les index partiels du projet portent tous sur une égalité. | `sujets/3-bateaux/optimiser.js` |
| Brider le cache WiredTiger pour rendre un balayage lent est un mauvais calcul : dès que les données dépassent le cache, c'est l'**écriture** qui s'effondre aussi. À 256 Mo, un chargement de 3,2 millions de documents a mis **deux heures** ; à 1 Go, **32 secondes** — les mêmes documents. Et le bridage ne servait à rien : `lus`, la colonne qu'on regarde, ne dépend pas du cache. | `docker/docker-compose.yml` |
| `Math.random()` n'a pas de graine, et deux étudiants n'auraient pas la même base. Tous les tirages passent par `tireur(graine)` (mulberry32). | `sujets/outils.js` |
| Un `insertMany` de plusieurs dizaines de milliers de documents dépasse les 16 Mo d'une commande. `verser()` découpe en paquets de 5 000. | `sujets/outils.js` |
| La réponse attendue est accumulée **pendant** la génération, jamais en gardant les documents : `VOLUME=10` charge 9 millions de documents sans faire enfler `mongosh`. | `sujets/*/charger.js` |
