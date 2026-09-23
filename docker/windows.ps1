# =====================================================================
#  Le Makefile, pour Windows : sans make, sans WSL, sans Git Bash.
#  On ne l'appelle pas directement : make.cmd, a la racine, le lance.
#
#      .\make dune                 comme   make dune
#      .\make dune VOLUME=10       comme   make dune VOLUME=10
#      .\make aide
#
# Chaque cible fait EXACTEMENT ce que fait celle du Makefile : les memes
# commandes docker, les memes .js joues dans le conteneur. Une cible qui
# change dans le Makefile change ici aussi.
#
# Ecrit pour Windows PowerShell 5.1 (celui de Windows 10 et 11) :
#   - ce fichier reste en ASCII pur : 5.1 lit un .ps1 sans BOM comme de
#     l'ANSI, et un accent y deviendrait du charabia ;
#   - aucun guillemet double dans un argument passe a docker : 5.1 les
#     avale en route. Le JavaScript de --eval n'utilise que des simples.
# =====================================================================

$Racine  = Split-Path -Parent $PSScriptRoot
$Compose = @('compose', '-f', (Join-Path $Racine 'docker/docker-compose.yml'))
$Conteneur = 'optimisation-mongo'

$Sujets = [ordered]@{ dune = '1-dune'; tortues = '2-tortues'; bateaux = '3-bateaux' }

# VOLUME et GRAINE : memes valeurs par defaut que le Makefile.
$Reglages = @{ VOLUME = '1'; GRAINE = '20260920' }

# Pas nommee Docker : PowerShell ne distingue pas les majuscules, et
# & docker se rappellerait lui-meme.
function Lancer {
    & docker @args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

function Mongo([string]$Eval, [string]$Fichier) {
    Lancer exec $Conteneur mongosh --quiet --eval $Eval --file $Fichier
}

function Aide {
    @'

  Mise en route
    .\make demarrer          - lance MongoDB (27051)
    .\make sujets            - les trois sujets, en une page
    .\make tout              - charge les trois bases

  Un sujet   (<s> = dune | tortues | bateaux)
    .\make <s>               - (re)fabrique la base et la remplit.
                               VOLUME=10 pour dix fois plus de donnees.
    .\make <s>-mesurer       - joue les quatre requetes du sujet et dit,
                               pour chacune, combien de documents le
                               serveur a lus pour rendre combien de lignes
    .\make <s>-mongo         - un mongosh sur la base du sujet
    .\make <s>-remettre      - retire index et copies, sans recharger

  La correction vit sur une branche a elle, << correction >>,
  et on va l'y chercher a la main.
    git switch correction    - puis .\make <s>-optimiser : pose les index,
                               ecrit les references etendues, et remontre
                               le tableau avant / apres
    git switch main          - revenir au sujet seul

    .\make etat              - le serveur repond-il
    .\make arreter           - arrete, conserve les donnees
    .\make purger            - arrete et EFFACE le volume

  L'enonce de chaque sujet : sujets/1-dune/SUJET.md, 2-tortues, 3-bateaux

'@ | Write-Host
}

function Etat {
    $v = & docker exec $Conteneur mongosh --quiet --eval 'print(db.version())' 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Host "  MongoDB     $v" } else { Write-Host '  MongoDB     ARRETE' }
}

function Demarrer {
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host '  Docker ne repond pas. Lancer Docker Desktop, attendre que'
        Write-Host '  la baleine arrete de clignoter, et recommencer.'
        Write-Host ''
        exit 1
    }
    Lancer @Compose up -d
    Write-Host '  attente du serveur...'
    for ($i = 0; $i -lt 60; $i++) {
        & docker exec $Conteneur mongosh --quiet --eval 'db.runCommand({ping:1})' *> $null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
    }
    Etat
}

function Charger([string]$Dossier) {
    Mongo "const VOLUME = $($Reglages.VOLUME); const GRAINE = $($Reglages.GRAINE)" "/projet/sujets/$Dossier/charger.js"
}

function Mesurer([string]$Base, [string]$Dossier) {
    Mongo "const SUJET = '$Dossier'; const BASE = '$Base'" '/projet/sujets/mesurer.js'
}

# La correction n'est pas sur main : les trois optimiser.js n'y existent
# pas, et la cible dit ou aller plutot que de laisser mongosh crier ENOENT.
function Optimiser([string]$Base, [string]$Dossier) {
    if (-not (Test-Path (Join-Path $Racine "sujets/$Dossier/optimiser.js"))) {
        Write-Host ''
        Write-Host "  La correction n'est pas sur cette branche."
        Write-Host '  Elle vit sur la branche << correction >> :'
        Write-Host ''
        Write-Host "      git switch correction     puis   .\make $Base-optimiser"
        Write-Host '      git switch main           pour revenir au sujet seul'
        Write-Host ''
        exit 1
    }
    Mongo "const SUJET = '$Dossier'; const BASE = '$Base'" "/projet/sujets/$Dossier/optimiser.js"
}

function Remettre([string]$Base) {
    Mongo "const BASE = '$Base'" '/projet/sujets/remettre.js'
}

function Jouer([string]$Cible) {
    switch ($Cible) {
        'aide'     { Aide; return }
        'demarrer' { Demarrer; return }
        'etat'     { Etat; return }
        'sujets'   {
            [Console]::OutputEncoding = [Text.Encoding]::UTF8
            Get-Content -Encoding UTF8 (Join-Path $Racine 'sujets/SUJETS.txt') | Write-Host
            return
        }
        'tout'     { foreach ($s in $Sujets.Keys) { Jouer $s }; return }
        'mongo'    { Lancer exec -it $Conteneur mongosh --quiet; return }
        'arreter'  { Lancer @Compose down; return }
        'purger'   { Lancer @Compose down -v; return }
    }
    $base, $action = $Cible -split '-', 2
    if (-not $Sujets.Contains($base)) {
        Write-Host "  Cible inconnue : $Cible   (.\make aide liste tout)"
        exit 2
    }
    $dossier = $Sujets[$base]
    switch ($action) {
        $null       { Charger $dossier }
        'mesurer'   { Mesurer $base $dossier }
        'mongo'     { Lancer exec -it $Conteneur mongosh --quiet $base }
        'optimiser' { Optimiser $base $dossier }
        'remettre'  { Remettre $base }
        default     { Write-Host "  Cible inconnue : $Cible   (.\make aide liste tout)"; exit 2 }
    }
}

# Comme make : les NOM=valeur reglent, le reste sont des cibles jouees
# dans l'ordre. Sans cible, l'aide.
$Cibles = @()
foreach ($a in $args) {
    if ($a -match '^([A-Za-z]+)=(.*)$') {
        # Garder les deux morceaux AVANT le test suivant : un -match reussi
        # remplace $Matches, et VOLUME=10 aurait charge VOLUME vide.
        $nom = $Matches[1].ToUpper()
        $val = $Matches[2]
        if (-not $Reglages.ContainsKey($nom)) { Write-Host "  Reglage inconnu : $nom (VOLUME ou GRAINE)"; exit 2 }
        if ($val -notmatch '^\d+$')           { Write-Host "  $nom doit etre un nombre entier : $val"; exit 2 }
        $Reglages[$nom] = $val
    } else {
        $Cibles += $a
    }
}
if ($Cibles.Count -eq 0) { $Cibles = @('aide') }
foreach ($c in $Cibles) { Jouer $c }
