/* ============================================================================
   PACKAGING LINUX — @electron/packager avec le zip Electron local (cache),
   sans téléchargement. Copie l'app Next construite (.next + node_modules
   utiles) dans dist/ApplyForge-linux-x64/.
   Usage : npm run pack:linux   (require un `npm run build` préalable)
   ========================================================================== */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const mod = require("@electron/packager");
const packager = mod.packager || mod;

const ROOT = path.resolve(__dirname, "..");
const VERSION = require("electron/package.json").version;

async function main() {
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    console.error("ERREUR : .next absent ou incomplet — lance `npm run build` d'abord.");
    process.exit(1);
  }

  const appDir = path.join(ROOT, "dist", "ApplyForge-linux-x64", "resources", "app");

  // Zip Electron : on sert la version exacte depuis le cache local.
  const cacheDir = path.join(os.homedir(), ".cache", "electron");
  let zipDir = null;
  if (fs.existsSync(cacheDir)) {
    for (const entry of fs.readdirSync(cacheDir)) {
      const zip = path.join(cacheDir, entry, `electron-v${VERSION}-linux-x64.zip`);
      if (fs.existsSync(zip)) {
        zipDir = path.join(cacheDir, entry);
        break;
      }
    }
  }

  const ignore = [
    /^\/logs(\/|$)/,
    /^\/dist(\/|$)/,
    /^\/\.freebuff(\/|$)/,
    /^\/\.git(\/|$)/,
    /^\/\.electron-zip(\/|$)/,
    /^\/\.next\/cache(\/|$)/,
    /^\/tsconfig\.tsbuildinfo$/,
    // DevDeps inutiles à l'exécution (l'électron embarqué vient du packager).
    /^\/node_modules\/electron(\/|$)/,
    /^\/node_modules\/@electron(\/|$)/,
    /^\/node_modules\/typescript(\/|$)/,
    /^\/node_modules\/tailwindcss(\/|$)/,
    /^\/node_modules\/@tailwindcss(\/|$)/,
    /^\/node_modules\/postcss(\/|$)/,
    /^\/node_modules\/autoprefixer(\/|$)/,
    /^\/node_modules\/@types(\/|$)/,
    /^\/node_modules\/\.bin(\/|\/typescript|\/tailwindcss|\/next)/,
  ];

  console.log(`Packaging ApplyForge ${VERSION} → dist/ (zip: ${zipDir ?? "téléchargement"} )`);
  const paths = await packager({
    dir: ROOT,
    name: "ApplyForge",
    platform: "linux",
    arch: "x64",
    out: path.join(ROOT, "dist"),
    overwrite: true,
    prune: true,
    // Dossier réel (pas d'asar) : Next.js a besoin d'un vrai filesystem.
    asar: false,
    ignore,
    ...(zipDir ? { electronZipDir: zipDir } : {}),
  });

  console.log("OK :", paths.join("\n"));

  // Copie de l'icône après le packager (qui recrée resources/app/ public/)
  // pour que les scripts de packaging AppImage/Deb puissent la lire.
  const iconSrc = path.join(ROOT, "public", "applyforge.png");
  const iconDst = path.join(appDir, "applyforge.png");
  if (fs.existsSync(iconSrc) && fs.existsSync(appDir)) {
    fs.copyFileSync(iconSrc, iconDst);
    console.log(`[pack:linux] icône copiée → ${iconDst}`);
  } else {
    console.warn("[pack:linux] icône manquante (public/applyforge.png)");
  }
}

main().catch((err) => {
  console.error("PACKAGING ÉCHEC :", err);
  process.exit(1);
});

