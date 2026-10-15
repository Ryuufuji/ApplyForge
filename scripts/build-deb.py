#!/usr/bin/env python3
"""Construit applyforge_<version>_amd64.deb à partir de dist/ApplyForge-linux-x64.

Un .deb est une archive ar contenant, dans l'ordre :
  debian-binary  ("2.0")
  control.tar.gz (./control, ./postinst éventuels)
  data.tar.xz    (arborescence installée : /opt/ApplyForge, /usr/bin, …)

Usage : python3 scripts/build-deb.py
Sortie : dist/applyforge_<version>_amd64.deb
"""

import os
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "dist", "ApplyForge-linux-x64")
OUT = os.path.join(ROOT, "dist")
NAME = "applyforge"
ARCH = "amd64"


def get_version():
    import json
    try:
        with open(os.path.join(ROOT, "package.json")) as f:
            return json.load(f).get("version", "1.0.0")
    except Exception:
        return "1.0.0"


VERSION = get_version()

DEPENDS = (
    "libc6, libgtk-3-0 | libgtk-3-0t64, libnss3, "
    "libatk-bridge2.0-0 | libatk-bridge2.0-0t64, libasound2 | libasound2t64, "
    "libgbm1, libxkbcommon0, libxcomposite1, libxdamage1, libxrandr2, "
    "libdrm2, libpango-1.0-0, libcairo2"
)

DESCRIPTION = (
    " ApplyForge — recherche d'emploi et postulation automatisée.\n"
    " Dashboard Next.js embarqué dans Electron : analyse d'offres par IA,\n"
    " candidatures 1-clic, relances J+7 et pilote automatique supervisé/autonome.\n"
)


def run(cmd, **kwargs):
    print("+", " ".join(cmd) if isinstance(cmd, list) else cmd)
    result = subprocess.run(cmd, shell=isinstance(cmd, str), **kwargs)
    if result.returncode != 0:
        sys.exit(f"ÉCHEC (exit {result.returncode}) : {cmd}")


def main():
    if not os.path.isdir(SRC):
        sys.exit(f"Dossier source absent : {SRC} — lance d'abord `npm run pack:linux`")

    size_kb = subprocess.run(
        ["du", "-sk", SRC], capture_output=True, text=True, check=True
    ).stdout.split()[0]

    stage = tempfile.mkdtemp(prefix="applyforge-deb-")
    pkg = os.path.join(stage, f"{NAME}_{VERSION}_{ARCH}")
    data = os.path.join(pkg, "DEBIAN")
    opt = os.path.join(pkg, "opt", "ApplyForge")
    os.makedirs(data)
    os.makedirs(os.path.join(pkg, "usr", "bin"))
    os.makedirs(os.path.join(pkg, "usr", "share", "applications"))
    os.makedirs(os.path.join(pkg, "usr", "share", "icons", "hicolor", "512x512", "apps"))

    # --- payload applicatif ------------------------------------------------
    print("copie du payload (664 Mo)…")
    shutil.copytree(SRC, opt, symlinks=True)

    # --- lanceur CLI -------------------------------------------------------
    with open(os.path.join(pkg, "usr", "bin", NAME), "w") as f:
        f.write('#!/bin/sh\nexec /opt/ApplyForge/ApplyForge "$@"\n')
    os.chmod(os.path.join(pkg, "usr", "bin", NAME), 0o755)

    # --- entrée de menu + icône -------------------------------------------
    # Le packager Electron recrée resources/app/ avec public/ dedans ;
    # pack:linux copie aussi l'icône à la racine de resources/app/.
    # On accepte les deux emplacements.
    candidates = [
        os.path.join(SRC, "resources", "app", "applyforge.png"),
        os.path.join(SRC, "resources", "app", "public", "applyforge.png"),
    ]
    icone = next((c for c in candidates if os.path.exists(c)), None)
    if not icone:
        sys.exit(f"icône manquante ({candidates[0]}) — lance d'abord `npm run build` puis `npm run pack:linux`")
    with open(
        os.path.join(pkg, "usr", "share", "applications", f"{NAME}.desktop"), "w"
    ) as f:
        f.write(
            "[Desktop Entry]\n"
            "Type=Application\n"
            "Name=ApplyForge\n"
            "Comment=Recherche d'emploi et postulation automatisée — pilote automatique\n"
            "Exec=/opt/ApplyForge/ApplyForge\n"
            "Icon=applyforge\n"
            "Terminal=false\n"
            "Categories=Office;\n"
            "StartupWMClass=ApplyForge\n"
        )
    shutil.copy(
        icone,
        os.path.join(pkg, "usr", "share", "icons", "hicolor", "512x512", "apps", "applyforge.png"),
    )

    # --- contrôle ----------------------------------------------------------
    with open(os.path.join(data, "control"), "w") as f:
        f.write(
            f"Package: {NAME}\n"
            f"Version: {VERSION}\n"
            f"Architecture: {ARCH}\n"
            f"Installed-Size: {size_kb}\n"
            f"Maintainer: ApplyForge <applyforge@local>\n"
            f"Section: utils\n"
            f"Priority: optional\n"
            f"Depends: {DEPENDS}\n"
            f"Description: ApplyForge — plateforme de recherche d'emploi\n"
            + DESCRIPTION
        )

    # --- archives internes -------------------------------------------------
    work = os.path.join(stage, "work")
    os.makedirs(work)

    control_tar = os.path.join(work, "control.tar.gz")
    run(
        ["tar", "--owner=0", "--group=0", "--numeric-owner", "-czf", control_tar, "-C", data, "."]
    )

    data_tar = os.path.join(work, "data.tar.xz")
    print("compression data.tar.xz (xz multi-thread)…")
    with open(data_tar, "wb") as out:
        listing = subprocess.Popen(
            ["tar", "--owner=0", "--group=0", "--numeric-owner", "-cf", "-",
             "-C", pkg, "opt", "usr"],
            stdout=subprocess.PIPE,
        )
        xz = subprocess.Popen(
            ["xz", "-T0", "-2", "-c"], stdin=listing.stdout, stdout=out
        )
        listing.stdout.close()
        xz.wait()
        if listing.wait() != 0 or xz.returncode != 0:
            sys.exit("ÉCHEC : compression data.tar.xz")

    deb = os.path.join(OUT, f"{NAME}_{VERSION}_{ARCH}.deb")
    if os.path.exists(deb):
        os.remove(deb)
    with open(os.path.join(work, "debian-binary"), "w") as f:
        f.write("2.0\n")

    print("assemblage ar…")
    run(
        ["ar", "rc", deb,
         os.path.join(work, "debian-binary"), control_tar, data_tar]
    )

    run(["chmod", "644", deb])
    print(f"OK : {deb} ({os.path.getsize(deb) / 1e6:.0f} Mo)")
    shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    main()
