# Sujet 3 — Les bateaux

> La flotte civile et militaire de « SQL vers NoSQL », quatre ans de trafic plus
> tard : **4 000 bateaux**, **94 500 escales**. Le modèle n'a pas bougé. Quatre
> requêtes ordinaires lisent **401 508** documents pour en rendre **1 026** — et
> deux d'entre elles ne se règlent avec **aucun index**.

## Référence

- Charger la base : `make bateaux` — `make bateaux VOLUME=10` pour dix fois plus
- Mesurer : `make bateaux-mesurer`
- Les quatre requêtes, en clair : [`requetes.js`](requetes.js)
- Un shell sur la base : `make bateaux-mongo`
- Revenir au point de départ sans recharger : `make bateaux-remettre`
- La correction, quand la vôtre sera faite : `git switch correction`,
  puis `make bateaux-optimiser`

---

## Le modèle

```
  ports        _id = le nom, pays, tirantEauMaxM, quais[]     1:N BORNE -> embarqué

  bateaux      _id = l imo, nom, categorie, pavillon, tirantEauM, portAttache?
               categorie = CIVIL      ->  armateur, typeCivil, portEnLourdT, capaciteEvp?
               categorie = MILITAIRE  ->  marine, classe, equipage, propulsionNucleaire
               une seule collection, deux formes — l heritage de SQL a disparu

  capitaines   _id = le nom, brevet, commandements[{bateau, debut, fin?}]

  escales      _id, arrivee, depart?, motif, bateau, port, quai,
               cargaisons[{marchandise, tonnes}]              1:N ILLIMITE -> dehors
```

| collection | documents |
|---|---|
| `ports` | 24 |
| `bateaux` | 4 000 |
| `capitaines` | 1 500 |
| `escales` | **94 500** |

**Ce qui a changé depuis « SQL vers NoSQL ».** Là-bas, l'escale portait une
**copie** du bateau (nom, imo, catégorie) et du port. Ici elle ne porte que
l'imo et le nom du port : une référence, propre et normale. C'est exactement ce
qu'on va devoir étendre — mais cette fois en sachant ce que ça achète.

`depart` absent veut dire que le bateau est **encore à quai**. Une cargaison
n'existe pas sans son escale : elle est dedans.

**Les données ne sont pas un dump** : elles se fabriquent au chargement à partir
d'une graine (`charger.js`). Même graine, même base, partout. Les chiffres de
cette page sont ceux de `VOLUME=1`.

---

## Ce que les quatre requêtes coûtent aujourd'hui

`make bateaux-mesurer`, sur la base fraîchement chargée :

```
  code  ce qu elle demande                         rendus        lus       cles  plan               ms
  R1    Le carnet de bord d un bateau                  25     94 500          0  COLLSCAN           28
  R2    Les escales d un port sur une annee           967     94 500          0  COLLSCAN+TRI       36
  R3    Le tonnage d un pavillon, port par port        24    118 008     23 508  COLLSCAN+LOOKUP   163
  R4    Les dix plus grosses escales                   10     94 500          0  COLLSCAN           85

  401 508 documents lus pour 1 026 lignes rendues  —  391 lus pour 1 rendu,  312 ms en tout.
```

R1 lit **3 780 documents par ligne rendue**, et R4 **9 450** : c'est le record
du projet.

**`rendus`** est ce que la question demande : il ne bougera pas. **`lus`** est ce
que le serveur a dû parcourir pour le trouver : c'est lui qu'on fait tomber.

`lus` ne sort pas d'`explain()` : il sort des compteurs du serveur, relevés avant
et après la requête. Ils comptent **tout**, d'un seul nombre, quelle que soit la
forme du plan — là où `explain()` éparpille ses comptes dans l'arbre et laisse
lire le mauvais nœud.

**La réponse, elle, ne doit pas changer.** Elle a été calculée au chargement, à
part, à partir des données générées — pas en rejouant ces requêtes-là.

---

## Exercices

Charger la base : `make bateaux`. Ouvrir `make bateaux-mongo` pour écrire. La
base MongoDB s'appelle `bateaux`. Chaque exercice part de la base telle qu'elle
est chargée : aucun ne lit ce qu'un autre a écrit. `make bateaux-remettre` retire
les index et les champs ajoutés sans recharger ; `make bateaux` refait la base.

### Exercice 1

1. Lancer `make bateaux-mesurer` et relever, pour chaque requête, le rapport
   `lus` / `rendus`.
2. Rejouer R1 à la main dans `make bateaux-mongo`, avec
   `.explain("executionStats")`, et relever `totalDocsExamined` et `nReturned`.
3. Compter combien d'escales la base contient, et combien de bateaux.
4. Calculer combien d'escales un bateau a en moyenne, et comparer au nombre que
   R1 rend.
5. Dire, pour chacune des quatre requêtes, si un index suffira — et pour celles
   où il ne suffira pas, dire ce qui manque dans le document.

### Exercice 2

Les index. R1 et R2 se règlent sans toucher au texte de la requête.

1. Poser l'index qui sert R1, relancer `make bateaux-mesurer`, relever `lus`.
2. Pour R2, poser `{ port: 1 }` seul, mesurer, et relever `lus`, `cles` et le
   plan.
3. Poser `{ arrivee: 1, port: 1 }`, mesurer, et relever les mêmes trois.
4. Poser `{ port: 1, arrivee: 1 }`, mesurer, et relever les mêmes trois.
5. Dire lequel des trois a coûté des documents, lequel a coûté des clés, et
   écrire la règle qui décide de l'ordre.
6. Dire pourquoi la direction (`1` ou `-1`) de la dernière clé n'a rien changé
   ici, et donner un tri où elle changerait quelque chose.

### Exercice 3

R3 demande le tonnage **par pavillon**. Une escale ne connaît pas le pavillon du
bateau : elle connaît son imo.

1. Essayer de poser, sur `escales`, un index qui serve le filtre sur le pavillon.
2. Faire descendre le pavillon dans chaque escale, en une seule requête, en
   partant de `bateaux`.
3. Réécrire R3 dans [`requetes.js`](requetes.js) et poser l'index qui va avec.
4. Vérifier que `make bateaux-mesurer` dit toujours que la réponse est celle du
   chargement.
5. Le `Delta Amstel` (`IMO9500233`) est dépavillonné et passe sous pavillon du
   Panama : le changer dans `bateaux`, et nulle part ailleurs.
6. Relancer R3 et dire si la réponse est fausse.
7. Dire ce que la copie raconte que le bateau, lui, ne sait plus dire.

### Exercice 4

R4 demande les dix escales qui ont manipulé le plus de tonnage. Ce tonnage est
la somme des cargaisons de l'escale, et il n'est écrit nulle part.

1. Poser un index sur `cargaisons.tonnes` et mesurer : dire ce qu'il a changé.
2. Écrire le tonnage total dans chaque escale, en une seule requête.
3. Poser l'index qui permet à R4 de rendre dix lignes en lisant dix documents,
   et réécrire R4 pour qu'elle s'en serve.
4. Ajouter une cargaison de 90 000 tonnes à l'escale `35` — avec elle, c'est
   l'escale la plus chargée du fichier — sans toucher au champ que vous venez
   d'écrire.
5. Relancer R4 et dire ce qui est faux.
6. Écrire la requête qui ajoute une cargaison **et** tient le total à jour.

### Exercice 5  (Exploration)

Les escales pour `AVARIE` sont **4 721** sur 94 500. On veut les sortir, de la
plus récente à la plus ancienne, servies par un index qui pèse **moins de
100 000 octets** — l'index ordinaire qui fait le travail en pèse 1 118 208.

1. Poser l'index ordinaire, et relever sa taille avec
   `db.escales.stats().indexSizes`.
2. Obtenir le même service pour moins de 100 000 octets.
3. Relancer la requête sans le filtre sur le motif, et relever le plan.
4. Dire pourquoi le serveur refuse l'index dans ce cas-là.
