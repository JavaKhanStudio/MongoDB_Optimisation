#!/usr/bin/env python3
"""Taper une ligne au clavier de la VM Windows (test-windows-mac/winvm), comme un
etudiant devant l'ecran, et en garder une capture.

La VM n'a pas de TTY par ssh : `.\\make dune-mongo` (mongosh interactif) ne se
verifie qu'a sa console. Ce script envoie les touches par le moniteur QEMU
(sendkey). QEMU nomme les touches selon leur place sur un clavier US, et la
VM a un clavier francais canadien : d'ou la table.

    tools/winvm-taper.py --win r              # Windows+R
    tools/winvm-taper.py 'powershell' --entree
    tools/winvm-taper.py '.\\make dune-mongo' --entree --shot /tmp/ecran.png
"""
import argparse
import os
import pathlib
import socket
import subprocess
import time

HOME = pathlib.Path(os.environ.get("WINVM_HOME", "~/.local/share/atelier/winvm")).expanduser()
MON = HOME / "monitor.sock"

# caractere -> touche QEMU (place US), sur le clavier de la VM : francais CANADIEN
# (lettres et chiffres a leur place US), releve a l'ecran touche par touche
FRCA = {" ": "spc", ".": "dot", ",": "comma", ";": "semicolon", ":": "shift-semicolon",
        "-": "minus", "=": "equal", "_": "shift-minus", "+": "shift-equal",
        "!": "shift-1", '"': "shift-2", "/": "shift-3", "$": "shift-4", "%": "shift-5",
        "?": "shift-6", "&": "shift-7", "*": "shift-8", "(": "shift-9", ")": "shift-0",
        "'": "shift-comma", "é": "slash", "É": "shift-slash", "<": "backslash",
        ">": "shift-backslash", "#": "grave_accent", "|": "shift-grave_accent",
        "\\": "alt_r-grave_accent", "@": "alt_r-2", "[": "alt_r-bracket_left",
        "]": "alt_r-bracket_right", "{": "alt_r-apostrophe", "}": "alt_r-backslash"}


def touche(c):
    if c in FRCA:
        return FRCA[c]
    return "shift-" + c.lower() if c.isupper() else c


def moniteur(cmds):
    s = socket.socket(socket.AF_UNIX)
    s.connect(str(MON))
    s.settimeout(5)
    s.recv(4096)
    for c in cmds:
        s.sendall((c + "\n").encode())
        time.sleep(0.06)
        try:
            s.recv(65536)
        except socket.timeout:
            pass
    s.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("texte", nargs="?", default="")
    ap.add_argument("--entree", action="store_true", help="puis Entree")
    ap.add_argument("--win", help="Windows + cette touche (ex. r)")
    ap.add_argument("--attendre", type=float, default=2, help="secondes avant la capture")
    ap.add_argument("--shot", help="capture PNG de l'ecran, apres --attendre")
    a = ap.parse_args()
    cmds = []
    if a.win:
        cmds.append("sendkey meta_l-" + touche(a.win))
    cmds += ["sendkey " + touche(c) for c in a.texte]
    if a.entree:
        cmds.append("sendkey ret")
    moniteur(cmds)
    if a.shot:
        time.sleep(a.attendre)
        ppm = HOME / "taper.ppm"
        moniteur(["screendump %s" % ppm])
        time.sleep(1)
        subprocess.run(["magick", str(ppm), a.shot], check=True)
        print(a.shot)


if __name__ == "__main__":
    main()
