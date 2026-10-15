#!/usr/bin/env bash
# Construit dist/ApplyForge-x86_64.AppImage à partir de dist/ApplyForge-linux-x64.
# Usage : npm run pack:appimage   (require un `npm run pack:linux` préalable)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist/ApplyForge-linux-x64"
APPDIR="$ROOT/dist/ApplyForge.AppDir"
TOOL="$ROOT/tools/appimagetool-x86_64.AppImage"
OUT="$ROOT/dist/ApplyForge-x86_64.AppImage"
TOOL_URL="https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"

[ -f "$SRC/ApplyForge" ] || { echo "ERREUR : $SRC absent — lance npm run pack:linux"; exit 1; }

# Le packager Electron recrée resources/app/ avec public/ dedans ;
# pack:linux copie aussi l'icône à la racine de resources/app/.
# On accepte les deux emplacements.
ICON=""
for cand in "$SRC/resources/app/applyforge.png" "$SRC/resources/app/public/applyforge.png"; do
  if [ -f "$cand" ]; then ICON="$cand"; break; fi
done
if [ -z "$ICON" ]; then
  echo "ERREUR : icône introuvable (resources/app/applyforge.png) — lance d'abord \`npm run build\` puis \`npm run pack:linux\`"
  exit 1
fi

# appimagetool (téléchargé une seule fois, hors dépôt)
if [ ! -x "$TOOL" ]; then
  mkdir -p "$ROOT/tools"
  echo "Téléchargement d'appimagetool…"
  curl -sSL -m 120 -o "$TOOL" "$TOOL_URL"
  chmod +x "$TOOL"
fi

# --- AppDir ---------------------------------------------------------------
echo "Construction de l'AppDir…"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/lib" "$APPDIR/usr/bin" \
         "$APPDIR/usr/share/applications" \
         "$APPDIR/usr/share/icons/hicolor/512x512/apps"
cp -a "$SRC" "$APPDIR/usr/lib/ApplyForge"

cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "${0}")")"
exec "$HERE/usr/lib/ApplyForge/ApplyForge" "$@"
EOF
chmod +x "$APPDIR/AppRun"

cat > "$APPDIR/usr/bin/ApplyForge" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "${0}")")"
exec "$HERE/../lib/ApplyForge/ApplyForge" "$@"
EOF
chmod +x "$APPDIR/usr/bin/ApplyForge"

cat > "$APPDIR/applyforge.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=ApplyForge
Comment=Recherche d'emploi et postulation automatisée — pilote automatique
Exec=ApplyForge
Icon=applyforge
Terminal=false
Categories=Office;
StartupWMClass=ApplyForge
EOF

cp "$ICON" "$APPDIR/applyforge.png"
ln -sf applyforge.png "$APPDIR/.DirIcon"
cp "$APPDIR/applyforge.desktop" "$APPDIR/usr/share/applications/applyforge.desktop"
cp "$ICON" "$APPDIR/usr/share/icons/hicolor/512x512/apps/applyforge.png"

# --- AppImage (chemins absolus : le runtime AppImage change de cwd) --------
echo "Assemblage de l'AppImage…"
rm -f "$OUT"
ARCH=x86_64 "$TOOL" --appimage-extract-and-run "$APPDIR" "$OUT"

ls -la "$OUT"
echo "OK : $OUT"
