# Sujet 1 — Dune

> L'exploitation de l'épice sur Arrakis, dans le modèle document qu'on lui a
> donné en « SQL vers NoSQL ». Le modèle est le même. Ce qui a changé, c'est
> qu'il y a maintenant **100 000 documents** dedans, et que sept requêtes
> parfaitement ordinaires en lisent **288 585** pour en rendre **341**.

## Référence

- Charger la base : `make dune` — `make dune VOLUME=10` pour dix fois plus
- Mesurer : `make dune-mesurer`
- Les sept requêtes, en clair : [`requetes.js`](requetes.js)
- Un shell sur la base : `make dune-mongo`
- Revenir au point de départ sans recharger : `make dune-remettre`
- La correction, quand la vôtre sera faite : `git switch correction`,
  puis `make dune-optimiser`

---

## Le modèle

Sept collections. C'est celui de « SQL vers NoSQL », document polymorphe compris.

```
  regions        _id = le nom,  et dedans ses vers        1:N BORNE  -> embarqué
  puits          _id = le code, region, epuise, profondeurM
  contremaitres  _id = le nom,  maison, ancienneteAnnees
  plateformesMinage / plateformesTransport

  collectes      _id, debut, statut, puits, contremaitre, plateformes{}
                 statut = REUSSIE  ->  tonnes, puretePct, dureeMinutes
                 statut = ECHOUEE  ->  cause, materielPerdu, pertesHumaines, ver{}
                 les champs de l'autre forme sont ABSENTS, pas vides

  releves        _id, puits, mesureLe, amplitude        1:N ILLIMITE -> dehors
```

| collection | documents |
|---|---|
| `regions` | 12 |
| `puits` | 60 |
| `contremaitres` | 240 |
| `plateformesMinage` / `plateformesTransport` | 60 / 40 |
| `collectes` | **37 500** |
| `releves` | **62 500** |

**Les données ne sont pas un dump.** Elles se fabriquent au chargement à partir
d'une graine (`charger.js`) : même graine, même base, sur toutes les machines.
`make dune VOLUME=10` en met dix fois plus, sans transporter dix fois plus de
fichier. Les chiffres de cette page sont ceux de `VOLUME=1`.

**Ce modèle n'est pas mal fait.** Il est propre : rien n'est embarqué qui
grossisse sans fin, rien n'est dehors qui ne se lise qu'avec son parent. Il n'a
simplement **aucun index** en dehors de ceux des `_id`, et **aucun champ recopié**
d'une collection à l'autre. C'est un modèle qu'on n'a pas encore regardé tourner.

---

## Les sept requêtes

Telles qu'on les tape dans `make dune-mongo`, valeurs en dur. Le banc joue
les mêmes, écrites en JavaScript dans [`requetes.js`](requetes.js). Sous chacune,
les champs qu'elle sollicite : c'est là que le serveur travaille.

### R1 à R4 : un index suffit

Le texte de ces quatre-là ne bouge pas. Tout se joue dans les index qu'on pose.

**R1 : « Tout ce que Gurney Halleck a sorti. »**

```js
db.collectes.find({ contremaitre: "Gurney Halleck" })
```

Sollicite : `contremaitre`, en égalité. Rien d'autre.

**R2 : « Les échecs du puits HAB-02 en juillet 2026, du plus récent au plus ancien. »**

```js
db.collectes.find({
  puits: "HAB-02",
  statut: "ECHOUEE",
  debut: { $gte: ISODate("2026-07-01"), $lt: ISODate("2026-08-01") }
}).sort({ debut: -1 })
```

Sollicite : `puits` et `statut` en égalité, `debut` en intervalle, et `debut` encore pour le tri.

**R3 : « Les collectes perdues à cause de Shai-Hulud le Vieux. »**

```js
db.collectes.find({ "ver.nom": "Shai-Hulud le Vieux" })
```

Sollicite : `ver.nom`, en égalité : un champ dans un sous-document, qui n'existe que dans les collectes échouées à cause d'un ver.

**R4 : « Les dix plus fortes secousses relevées au puits MUR-01. »**

```js
db.releves.find({ puits: "MUR-01" }).sort({ amplitude: -1, mesureLe: -1 }).limit(10)
```

Sollicite : `puits` en égalité, puis `amplitude` et `mesureLe` pour le tri.

### R5 à R7 : l'index ne suffit plus

Aucun index ne sert ces trois-là tant qu'elles restent écrites ainsi. Il faut
l'index **et** changer la requête, ou le document qu'elle lit.

**R5 : « Ce que la région Erg Habbanya a sorti en juillet 2026, puits par puits. »**

```js
db.collectes.aggregate([
  { $match: { statut: "REUSSIE",
              debut: { $gte: ISODate("2026-07-01"), $lt: ISODate("2026-08-01") } } },
  { $lookup: { from: "puits", localField: "puits", foreignField: "_id", as: "p" } },
  { $match: { "p.region": "Erg Habbanya" } },
  { $group: { _id: "$puits", tonnes: { $sum: "$tonnes" }, n: { $sum: 1 } } }
])
```

Sollicite : `statut` en égalité et `debut` en intervalle, dans `collectes`. Puis, pour chaque collecte gardée, l'`_id` de la collection `puits`. Puis `region`, en égalité ; mais `region` est dans `puits`, pas dans `collectes`. Enfin `puits` et `tonnes`, pour le regroupement.

**R6 : « Les collectes du puits TUO-03 en décembre 2025. »**

```js
db.collectes.find({
  puits: "TUO-03",
  $expr: { $and: [ { $eq: [{ $year: "$debut" }, 2025] },
                   { $eq: [{ $month: "$debut" }, 12] } ] }
})
```

Sollicite : `puits` en égalité. Puis `debut`, mais à travers `$year` et `$month` : ce qui est comparé, c'est le résultat du calcul, pas le champ.

**R7 : « Les dix collectes au meilleur rendement : le plus de tonnes par minute. »**

```js
db.collectes.aggregate([
  { $match: { statut: "REUSSIE" } },
  { $set:   { rendement: { $divide: ["$tonnes", "$dureeMinutes"] } } },
  { $sort:  { rendement: -1, _id: 1 } },
  { $limit: 10 }
])
```

Sollicite : `statut` en égalité. Puis `tonnes` et `dureeMinutes`, divisés l'un par l'autre, et le résultat pour le tri : une valeur qui n'est écrite dans aucun document.

---

## Ce que les sept requêtes coûtent aujourd'hui

`make dune-mesurer`, sur la base fraîchement chargée :

```
  code  ce qu elle demande                         rendus        lus       cles  plan               ms
  R1    Les collectes d un contremaitre               169     37 500          0  COLLSCAN           19
  R2    Les echecs d un puits, du plus recent           7     37 500          0  COLLSCAN+TRI       11
  R3    Les collectes perdues a cause d un ver        108     37 500          0  COLLSCAN           15
  R4    Les dix plus fortes secousses d un puits       10     62 500          0  COLLSCAN+TRI       16
  R5    Ce qu une region a sorti sur un mois            5     38 585      1 085  COLLSCAN+LOOKUP    19
  R6    Les collectes d un puits sur un mois           32     37 500          0  COLLSCAN           13
  R7    Les dix collectes au meilleur rendement        10     37 500          0  COLLSCAN           25

  288 585 documents lus pour 341 lignes rendues  —  846 lus pour 1 rendu,  118 ms en tout.
```

Deux colonnes comptent. **`rendus`** est ce que la question demande : il ne
bougera pas. **`lus`** est ce que le serveur a dû parcourir pour le trouver :
c'est lui qu'on fait tomber. Le jour où les deux se ressemblent, la requête est
optimisée.

`lus` ne sort pas d'`explain()` : il sort des compteurs du serveur, relevés avant
et après la requête. Ils comptent **tout**, d'un seul nombre, quelle que soit la
forme du plan — là où `explain()` éparpille ses comptes dans l'arbre et laisse
lire le mauvais nœud.

**La réponse, elle, ne doit pas changer.** Elle a été calculée au chargement, à
part, à partir des données générées — pas en rejouant ces requêtes-là. Le banc la
recompare à chaque passage. Optimiser, c'est changer le chemin sans changer la
réponse ; une requête devenue rapide qui ne répond plus à la question n'est pas
optimisée, elle est fausse.

---

## Exercices

Charger la base : `make dune`. Ouvrir `make dune-mongo` pour écrire. La base
MongoDB s'appelle `dune`. Chaque exercice part de la base telle qu'elle est
chargée : aucun ne lit ce qu'un autre a écrit. `make dune-remettre` retire les
index et les copies sans recharger ; `make dune` refait la base entière.

### Exercice 1

1. Lancer `make dune-mesurer` et relever, pour chaque requête, le rapport
   `lus` / `rendus`.
2. Rejouer R1 à la main dans `make dune-mongo`, avec
   `.explain("executionStats")`, et relever `nReturned`, `totalDocsExamined`,
   `totalKeysExamined` et `executionTimeMillis`.
3. Dire lequel de ces quatre nombres ne changera pas quoi qu'on fasse.
4. Nommer l'étage du plan de R1, et celui que R2 a en plus.
5. Compter combien de documents `releves` contient, et combien R4 en rend.

### Exercice 2

Les index. R1 à R4 se règlent sans toucher au texte de la requête.

1. Poser un index sur `collectes` qui serve R1, relancer `make dune-mesurer`,
   et relever la nouvelle valeur de `lus`.
2. Pour R2, poser d'abord `{ puits: 1, statut: 1 }`, mesurer, et relever `lus`,
   `cles` et le plan.
3. Poser ensuite `{ debut: 1, puits: 1, statut: 1 }`, mesurer, et relever les
   mêmes trois.
4. Poser enfin `{ puits: 1, statut: 1, debut: 1 }`, mesurer, et relever les
   mêmes trois.
5. Dire, pour chacun des trois, ce qui a coûté : les documents ou les clés.
6. Écrire la règle qui décide de l'ordre des clés, à partir de ces trois mesures.
7. Dire ce que l'étage `TRI` obligeait le serveur à faire avant de rendre sa
   première ligne.
8. Poser l'index qui sert R3, mesurer, et relever `lus`.
9. Compter les collectes qui n'ont pas de champ `ver`, et dire ce que l'index de
   R3 range pour elles.
10. Pour R4, poser un index qui fasse disparaître l'étage `TRI` du plan : dix
    lignes rendues doivent finir par dix documents lus.

### Exercice 3

R5 demande ce qu'une **région** a sorti. Une collecte ne sait pas dans quelle
région elle est : elle connaît son puits, et c'est le puits qui connaît la région.

1. Essayer de poser, sur `collectes`, un index qui serve le filtre sur la région.
2. Relancer `make dune-mesurer` et constater ce que `lus` a fait.
3. Faire descendre la région dans chaque collecte, en une seule requête, en
   partant de `puits`.
4. Réécrire R5 dans [`requetes.js`](requetes.js) pour qu'elle s'en serve, et
   poser l'index qui va avec.
5. Vérifier que `make dune-mesurer` dit toujours que la réponse est celle du
   chargement.
6. Déplacer le puits `HAB-02` dans la région `Erg Cielago`, dans la collection
   `puits` et nulle part ailleurs.
7. Relancer R5 et dire laquelle des deux collections ment.
8. Dire quel champ de `puits` on aurait eu tort de recopier, et pourquoi
   `region` ne pose pas ce problème-là.

### Exercice 4

R6 demande les collectes d'un puits sur un mois, et le mois y est écrit comme on
le dit : l'année vaut 2025, le mois vaut 12.

1. Poser un index sur `{ puits: 1, debut: 1 }`, mesurer, et relever `lus`,
   `cles` et `rendus` de R6.
2. Dire quelle partie du filtre l'index a servie, et laquelle il n'a pas pu
   servir.
3. Réécrire R6 dans [`requetes.js`](requetes.js) sans `$expr`, pour la même
   réponse, et mesurer.
4. Vérifier que `make dune-mesurer` dit toujours que la réponse est celle du
   chargement.

### Exercice 5

R7 demande les dix collectes au meilleur rendement. Ce rendement, ce sont les
tonnes divisées par la durée, et il n'est écrit nulle part.

1. Poser un index sur `{ tonnes: -1 }` et mesurer : dire ce qu'il a changé.
2. Écrire le rendement dans chaque collecte réussie, en une seule requête.
3. Poser l'index qui permet à R7 de rendre dix lignes en lisant dix documents,
   et réécrire R7 pour qu'elle s'en serve.
4. La collecte `94` a été mal saisie : elle a duré 60 minutes, pas 129.
   Corriger sa durée sans toucher au champ que vous venez d'écrire.
5. Relancer R7 et dire ce qui est faux.
6. Écrire la requête qui corrige une durée **et** tient le rendement à jour.

### Exercice 6  (Exploration)

Sortir, pour Gurney Halleck, **la date et le puits** de chacune de ses 169
collectes — et obtenir d'`explain("executionStats")` qu'il annonce
`totalDocsExamined: 0`.

1. L'écrire de la façon la plus directe, et relever `totalDocsExamined`.
2. Le faire tomber à `0`, sans perdre une seule des 169 lignes et sans toucher
   aux données.
3. Relever le nom de l'étage qui remplace `FETCH` dans le plan.
4. Dire ce que cette requête ne peut plus rendre, et ce qu'il faudrait pour
   qu'elle le rende aussi.
