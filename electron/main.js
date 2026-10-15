/* ============================================================================
   APPLYFORGE — processus principal Electron (Linux)
   L'app embarque le serveur Next de production dans le processus principal :
   1. démarre le serveur Next sur 127.0.0.1 (port libre ou APPLYFORGE_PORT)
   2. attend qu'il réponde
   3. ouvre la fenêtre sur cette URL
   Mode dev : APPLYFORGE_DEV_URL=http://127.0.0.1:3000 charge un serveur
   `npm run dev` déjà lancé, sans rien embarquer.
   ========================================================================== */

"use strict";

const { app, BrowserWindow, dialog, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Racine de l'application : dossier `app` copié par @electron/packager,
// ou racine du projet quand on lance `npm run electron`.
const APP_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.resolve(__dirname, "..");

const DEV_URL = process.env.APPLYFORGE_DEV_URL || null;

let server = null;
let mainWindow = null;

const log = (...args) => console.log("[applyforge]", ...args);

log("démarrage — packagé:", app.isPackaged, "— APP_DIR:", APP_DIR, "— dev:", DEV_URL ?? "non");

/** Attend que l'URL réponde 2xx/3xx/4xx (simple sondage HTTP borné). */
function waitForHttp(url, timeoutMs = 45_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Serveur non prêt après ${timeoutMs} ms : ${url}`));
        } else {
          setTimeout(attempt, 400);
        }
      });
      req.setTimeout(4000, () => req.destroy());
    };
    attempt();
  });
}

/** Démarre Next (production) dans le processus principal, port libre. */
async function startEmbeddedNextServer() {
  const buildId = path.join(APP_DIR, ".next", "BUILD_ID");
  if (!fs.existsSync(buildId)) {
    throw new Error(
      "Build de production absent. Lance d'abord `npm run build` (puis `npm run pack:linux`)."
    );
  }
  const nextFactory = require(require.resolve("next", { paths: [APP_DIR] }));
  const nextApp = nextFactory({ dev: false, dir: APP_DIR });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  server = http.createServer((req, res) => handle(req, res));
  const port = Number(process.env.APPLYFORGE_PORT || 0);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  log("serveur Next embarqué sur", url);
  return url;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#080a0e",
    title: "ApplyForge",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(url);

  // Tout lien externe s'ouvre dans le navigateur par défaut.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady()
    .then(async () => {
      try {
        let url = DEV_URL;
        if (!url) {
          url = await startEmbeddedNextServer();
        } else {
          log("mode dev — chargement de", url);
        }
        await waitForHttp(url);
        createWindow(url);
        log("prêt :", url);
      } catch (err) {
        dialog.showErrorBox(
          "ApplyForge — démarrage impossible",
          err && err.stack ? String(err.stack) : String(err)
        );
        app.quit();
      }
    })
    .catch((err) => {
      log("erreur fatale", err);
      app.quit();
    });

  app.on("window-all-closed", () => {
    if (server) server.close();
    app.quit();
  });
  app.on("before-quit", () => {
    if (server) server.close();
  });
}
