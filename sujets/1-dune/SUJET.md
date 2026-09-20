# Sujet 1 — Dune

> L'exploitation de l'épice sur Arrakis, dans le modèle document qu'on lui a
> donné en « SQL vers NoSQL ». Le modèle est le même. Ce qui a changé, c'est
> qu'il y a maintenant **100 000 documents** dedans, et que quatre requêtes
> parfaitement ordinaires en lisent **176 085** pour en rendre **191**.

## Référence

- Charger la base : `make dune` — `make dune VOLUME=10` pour dix fois plus
- Mesurer : `make dune-mesurer`
- Les quatre requêtes, en clair : [`requetes.js`](requetes.js)
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

## Ce que les quatre requêtes coûtent aujourd'hui

`make dune-mesurer`, sur la base fraîchement chargée :

```
  code  ce qu elle demande                         rendus        lus       cles  plan               ms
  R1    Les collectes d un contremaitre               169     37 500          0  COLLSCAN           15
  R2    Les echecs d un puits, du plus recent           7     37 500          0  COLLSCAN+TRI       13
  R3    Ce qu une region a sorti sur un mois            5     38 585      1 085  COLLSCAN+LOOKUP    17
  R4    Les dix plus fortes secousses d un puits       10     62 500          0  COLLSCAN+TRI       16

  176 085 documents lus pour 191 lignes rendues  —  922 lus pour 1 rendu,  61 ms en tout.
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

Les index. R1, R2 et R4 se règlent sans toucher au texte de la requête.

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
8. Pour R4, poser un index qui fasse disparaître l'étage `TRI` du plan — dix
   lignes rendues doivent finir par dix documents lus.

### Exercice 3

R3 demande ce qu'une **région** a sorti. Une collecte ne sait pas dans quelle
région elle est : elle connaît son puits, et c'est le puits qui connaît la région.

1. Essayer de poser, sur `collectes`, un index qui serve le filtre sur la région.
2. Relancer `make dune-mesurer` et constater ce que `lus` a fait.
3. Faire descendre la région dans chaque collecte, en une seule requête, en
   partant de `puits`.
4. Réécrire R3 dans [`requetes.js`](requetes.js) pour qu'elle s'en serve, et
   poser l'index qui va avec.
5. Vérifier que `make dune-mesurer` dit toujours que la réponse est celle du
   chargement.
6. Déplacer le puits `HAB-02` dans la région `Erg Cielago`, dans la collection
   `puits` et nulle part ailleurs.
7. Relancer R3 et dire laquelle des deux collections ment.
8. Dire quel champ de `puits` on aurait eu tort de recopier, et pourquoi
   `region` ne pose pas ce problème-là.

### Exercice 4  (Exploration)

Sortir, pour Gurney Halleck, **la date et le puits** de chacune de ses 169
collectes — et obtenir d'`explain("executionStats")` qu'il annonce
`totalDocsExamined: 0`.

1. L'écrire de la façon la plus directe, et relever `totalDocsExamined`.
2. Le faire tomber à `0`, sans perdre une seule des 169 lignes et sans toucher
   aux données.
3. Relever le nom de l'étage qui remplace `FETCH` dans le plan.
4. Dire ce que cette requête ne peut plus rendre, et ce qu'il faudrait pour
   qu'elle le rende aussi.
