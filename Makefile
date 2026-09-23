# =====================================================================
#  Optimisation d'une collection — les trois bases, non optimisees.
#  make aide
# =====================================================================
# Sous Podman rootless (Fedora), avant tout :
#   export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock
# Sous Windows, make.cmd joue les memes cibles (docker/windows.ps1) :
# une cible qui change ici change la-bas aussi.

COMPOSE = docker compose -f docker/docker-compose.yml
MONGOSH = docker exec -it optimisation-mongo mongosh --quiet
MONGO   = docker exec    optimisation-mongo mongosh --quiet

# Combien de donnees. VOLUME=1 charge la base de reference — 100 000
# documents par base, celle dont les chiffres de SUJET.md parlent, en
# deux a quatre secondes. VOLUME=10 en met dix fois plus : l'ecart se
# creuse, et le chargement prend une dizaine de secondes.
VOLUME ?= 1
# La graine du tirage. Meme graine, meme base, partout.
GRAINE ?= 20260920

.PHONY: aide demarrer arreter purger etat sujets tout mongo \
        dune dune-mesurer dune-mongo dune-optimiser dune-remettre \
        tortues tortues-mesurer tortues-mongo tortues-optimiser tortues-remettre \
        bateaux bateaux-mesurer bateaux-mongo bateaux-optimiser bateaux-remettre

aide:
	@echo ""
	@echo "  Mise en route"
	@echo "    make demarrer          - lance MongoDB (27051)"
	@echo "    make sujets            - les trois sujets, en une page"
	@echo "    make tout              - charge les trois bases"
	@echo ""
	@echo "  Un sujet   (<s> = dune | tortues | bateaux)"
	@echo "    make <s>               - (re)fabrique la base et la remplit."
	@echo "                             VOLUME=10 pour dix fois plus de donnees."
	@echo "    make <s>-mesurer       - joue les quatre requetes du sujet et dit,"
	@echo "                             pour chacune, combien de documents le"
	@echo "                             serveur a lus pour rendre combien de lignes"
	@echo "    make <s>-mongo         - un mongosh sur la base du sujet"
	@echo ""
	@echo "  La correction vit sur une branche a elle, « correction »,"
	@echo "  et on va l'y chercher a la main."
	@echo "    git switch correction  - puis make <s>-optimiser : pose les index,"
	@echo "                             ecrit les references etendues, et remontre"
	@echo "                             le tableau avant / apres"
	@echo "    git switch main        - revenir au sujet seul"
	@echo ""
	@echo "    make etat              - le serveur repond-il"
	@echo "    make arreter           - arrete, conserve les donnees"
	@echo "    make purger            - arrete et EFFACE le volume"
	@echo ""
	@echo "  L'enonce de chaque sujet : sujets/1-dune/SUJET.md, 2-tortues, 3-bateaux"
	@echo ""

demarrer:
	$(COMPOSE) up -d
	@echo "  attente du serveur..."
	@for i in $$(seq 1 60); do \
	  docker exec optimisation-mongo mongosh --quiet --eval 'db.runCommand({ping:1})' > /dev/null 2>&1 && break; sleep 1; done
	@$(MAKE) --no-print-directory etat

etat:
	@docker exec optimisation-mongo mongosh --quiet --eval \
	  'print("  MongoDB     " + db.version())' 2>/dev/null || echo "  MongoDB     ARRETE"

sujets:
	@cat sujets/SUJETS.txt

tout: dune tortues bateaux

mongo:
	$(MONGOSH)

# --------------------------------------------------------------------
# Charger un sujet : on jette la base et on la refait. Les donnees se
# FABRIQUENT — meme graine, meme base — donc recommencer ne coute qu'un
# peu de temps, et jamais une surprise.
# --------------------------------------------------------------------

define CHARGER
	@$(MONGO) --eval 'const VOLUME = $(VOLUME); const GRAINE = $(GRAINE)' \
	  --file /projet/sujets/$(2)/charger.js
endef

define MESURER
	@$(MONGO) --eval 'const SUJET = "$(2)"; const BASE = "$(1)"' \
	  --file /projet/sujets/mesurer.js
endef

# La correction n'est pas sur main : les trois optimiser.js n'y existent
# pas, et la cible dit ou aller plutot que de laisser mongosh crier ENOENT.
define OPTIMISER
	@test -f sujets/$(2)/optimiser.js || { \
	  echo ""; \
	  echo "  La correction n'est pas sur cette branche."; \
	  echo "  Elle vit sur la branche « correction » :"; \
	  echo ""; \
	  echo "      git switch correction     puis   make $(1)-optimiser"; \
	  echo "      git switch main           pour revenir au sujet seul"; \
	  echo ""; \
	  exit 1; }
	@$(MONGO) --eval 'const SUJET = "$(2)"; const BASE = "$(1)"' \
	  --file /projet/sujets/$(2)/optimiser.js
endef

# Tout defaire : les index tombent, les references etendues s'effacent.
# La base redevient celle du chargement, sans la recharger.
define REMETTRE
	@$(MONGO) --eval 'const BASE = "$(1)"' --file /projet/sujets/remettre.js
endef

dune:            ; $(call CHARGER,dune,1-dune)
tortues:         ; $(call CHARGER,tortues,2-tortues)
bateaux:         ; $(call CHARGER,bateaux,3-bateaux)

dune-mesurer:    ; $(call MESURER,dune,1-dune)
tortues-mesurer: ; $(call MESURER,tortues,2-tortues)
bateaux-mesurer: ; $(call MESURER,bateaux,3-bateaux)

dune-mongo:      ; $(MONGOSH) dune
tortues-mongo:   ; $(MONGOSH) tortues
bateaux-mongo:   ; $(MONGOSH) bateaux

dune-optimiser:    ; $(call OPTIMISER,dune,1-dune)
tortues-optimiser: ; $(call OPTIMISER,tortues,2-tortues)
bateaux-optimiser: ; $(call OPTIMISER,bateaux,3-bateaux)

dune-remettre:    ; $(call REMETTRE,dune)
tortues-remettre: ; $(call REMETTRE,tortues)
bateaux-remettre: ; $(call REMETTRE,bateaux)

arreter:
	$(COMPOSE) down

purger:
	$(COMPOSE) down -v
