# Sujet 2 — Les tortues

> Le projet fil rouge, huit ans plus tard : **10 000 tortues** suivies et
> **90 000 observations**. Le modèle est celui de « SQL vers NoSQL », à une
> chose près — les observations ne tiennent plus dans la tortue. Quatre
> requêtes ordinaires en lisent **280 861** pour en rendre **2 318**.

## Référence

- Charger la base : `make tortues` — `make tortues VOLUME=10` pour dix fois plus
- Mesurer : `make tortues-mesurer`
- Les quatre requêtes, en clair : [`requetes.js`](requetes.js)
- Un shell sur la base : `make tortues-mongo`
- Revenir au point de départ sans recharger : `make tortues-remettre`
- La correction, quand la vôtre sera faite : `git switch correction`,
  puis `make tortues-optimiser`

---

## Le modèle

```
  habitats       _id = le nom,  aireProtegee
  sites          _id = le nom,  habitat
  especes        _id = le nom scientifique, nomCommun, statutUicn
  programmes     _id = l acronyme, organisation{}, protocole{}, anneeFin?, especeCible?

  tortues        _id, nom, espece{nomScientifique, nomCommun, statutUicn},
                 mensurations{}, tags[], programmes[{acronyme, dateInscription}],
                 habitat{nom, aireProtegee}          — absent si on ne le connaît pas

  observations   _id, tortue, site, observateur, date, scoreSante
```

| collection | documents |
|---|---|
| `habitats` / `sites` / `especes` / `programmes` | 14 / 60 / 6 / 12 |
| `tortues` | **10 000** |
| `observations` | **90 000** |

**Le seul changement de modèle, et il est assumé.** En « SQL vers NoSQL », les
727 observations étaient **dans** la tortue, et c'était le bon choix : cinq par
document, une campagne par an. À 10 000 tortues suivies pendant huit ans, le
tableau ne s'arrête jamais de grossir. C'est le 1:N non borné, et il sort.

Ce qui était recopié l'est resté : l'espèce et l'habitat sont dans la tortue, le
protocole dans son programme. Ce qui manque, ce sont les **index** — il n'y en a
aucun en dehors de ceux des `_id` — et la copie qui permettrait à une observation
de parler de la tortue qu'elle observe.

**Les données ne sont pas un dump** : elles se fabriquent au chargement à partir
d'une graine (`charger.js`). Même graine, même base, partout. Les chiffres de
cette page sont ceux de `VOLUME=1`.

---

## Les quatre requêtes

Telles qu'on les tape dans `make tortues-mongo`, valeurs en dur. Le banc
joue les mêmes, écrites en JavaScript dans [`requetes.js`](requetes.js). Sous
chacune, les champs qu'elle sollicite : c'est là que le serveur travaille.

**R1 — « Tout ce qu'Aline Roy a observé. »**

```js
db.observations.find({ observateur: "Aline Roy" })
```

Sollicite : `observateur`, en égalité. Rien d'autre.

**R2 — « Les observations faites à Lady Elliot en 2025, de la plus récente à la plus ancienne. »**

```js
db.observations.find({
  site: "Lady Elliot",
  date: { $gte: ISODate("2025-01-01"), $lt: ISODate("2026-01-01") }
}).sort({ date: -1 })
```

Sollicite : `site` en égalité, `date` en intervalle — et `date` encore, pour le tri.

**R3 — « Le score de santé moyen des tortues en danger critique observées en juillet 2026, site par site. »**

```js
db.observations.aggregate([
  { $match: { date: { $gte: ISODate("2026-07-01"), $lt: ISODate("2026-08-01") } } },
  { $lookup: { from: "tortues", localField: "tortue", foreignField: "_id", as: "t" } },
  { $match: { "t.espece.statutUicn": "CR" } },
  { $group: { _id: "$site", somme: { $sum: "$scoreSante" }, n: { $sum: 1 } } }
])
```

Sollicite : `date` en intervalle, dans `observations`. Puis, pour chaque observation gardée, l'`_id` de la collection `tortues`. Puis `espece.statutUicn`, en égalité — mais il est dans `tortues`, pas dans `observations`. Enfin `site` et `scoreSante`, pour le regroupement.

**R4 — « Les tortues marquées migration-longue. »**

```js
db.tortues.find({ tags: "migration-longue" })
```

Sollicite : `tags`, en égalité — sur un champ qui est un tableau.

---

## Ce que les quatre requêtes coûtent aujourd'hui

`make tortues-mesurer`, sur la base fraîchement chargée :

```
  code  ce qu elle demande                         rendus        lus       cles  plan               ms
  R1    Les observations d un observateur             754     90 000          0  COLLSCAN           29
  R2    Les observations d un site sur une annee      179     90 000          0  COLLSCAN+TRI       23
  R3    Score moyen des especes en danger critiqu      41     90 861        861  COLLSCAN+LOOKUP    30
  R4    Les tortues portant un tag                  1 344     10 000          0  COLLSCAN           16

  280 861 documents lus pour 2 318 lignes rendues  —  121 lus pour 1 rendu,  98 ms en tout.
```

**`rendus`** est ce que la question demande : il ne bougera pas. **`lus`** est ce
que le serveur a dû parcourir pour le trouver : c'est lui qu'on fait tomber.

`lus` ne sort pas d'`explain()` : il sort des compteurs du serveur, relevés avant
et après la requête. Ils comptent **tout**, d'un seul nombre, quelle que soit la
forme du plan — là où `explain()` éparpille ses comptes dans l'arbre et laisse
lire le mauvais nœud.

**La réponse, elle, ne doit pas changer.** Elle a été calculée au chargement, à
part, à partir des données générées — pas en rejouant ces requêtes-là. Optimiser,
c'est changer le chemin sans changer la réponse.

---

## Exercices

Charger la base : `make tortues`. Ouvrir `make tortues-mongo` pour écrire. La
base MongoDB s'appelle `tortues`. Chaque exercice part de la base telle qu'elle
est chargée : aucun ne lit ce qu'un autre a écrit. `make tortues-remettre` retire
les index et les copies sans recharger ; `make tortues` refait la base entière.

### Exercice 1

1. Lancer `make tortues-mesurer` et relever, pour chaque requête, le rapport
   `lus` / `rendus`.
2. Rejouer R2 à la main dans `make tortues-mongo`, avec
   `.explain("executionStats")`, et relever `totalDocsExamined`, `nReturned` et
   le nom de chaque étage du plan.
3. Dire à quoi sert l'étage que R2 a en plus de R1, et ce qu'il oblige le serveur
   à faire avant de rendre sa première ligne.
4. Compter combien de valeurs différentes prend le champ `observateur` dans
   `observations`, et combien en prend le champ `scoreSante`.
5. Dire lequel des deux mérite un index, et pourquoi.

### Exercice 2

Les index. R1, R2 et R4 se règlent sans toucher au texte de la requête.

1. Poser l'index qui sert R1, relancer `make tortues-mesurer`, relever `lus`.
2. Pour R2, poser `{ site: 1 }` seul, mesurer, et relever `lus`, `cles` et le
   plan.
3. Poser `{ date: 1, site: 1 }`, mesurer, et relever les mêmes trois.
4. Poser `{ site: 1, date: 1 }`, mesurer, et relever les mêmes trois.
5. Dire lequel des trois a coûté des documents, lequel a coûté des clés, et
   écrire la règle qui décide de l'ordre.
6. Poser l'index qui sert R4 — `tags` est un tableau, et ça ne change rien à la
   façon de le poser.
7. Relever le gain de R4, le comparer à celui de R1, et expliquer l'écart avec
   le nombre de documents que chaque requête rend.
8. Lancer `db.tortues.stats().indexSizes` et dire ce que l'index de R4 a coûté.

### Exercice 3

R3 demande le score des tortues **en danger critique**. Une observation ne sait
pas de quelle espèce est la tortue qu'elle décrit : elle connaît son `_id`.

1. Compter combien d'observations R3 doit ouvrir de tortues avant de pouvoir en
   jeter une seule.
2. Faire descendre le statut UICN dans chaque observation, en une seule requête.
3. Réécrire R3 dans [`requetes.js`](requetes.js) pour qu'elle s'en serve, poser
   l'index qui va avec, et mesurer.
4. Vérifier que `make tortues-mesurer` dit toujours que la réponse est celle du
   chargement.
5. L'UICN reclasse `Eretmochelys imbricata` de `CR` à `EN` : le changer dans
   `especes`, et nulle part ailleurs.
6. Relancer R3, et dire combien d'endroits portent maintenant une valeur périmée.
7. Écrire la ou les requêtes qui remettent les trois collections d'accord.
8. Dire ce qui rend cette copie acceptable malgré ça.

### Exercice 4  (Exploration)

Sortir les tortues inscrites au programme `ARGOI` **depuis le 1er janvier 2024**.
Elles sont **341**.

1. L'écrire de la façon la plus directe, et compter ce que ça rend.
2. Trouver, parmi les tortues rendues en trop, celle qui explique le compte.
3. Corriger la requête pour qu'elle rende 341 tortues.
4. Poser un index sur les deux champs concernés, et relever `totalKeysExamined`
   avant et après correction de la requête.
