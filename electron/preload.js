"use strict";

const { contextBridge } = require("electron");

/* Contexte isolé : l'app web ne reçoit aucun accès Node, seulement ces
   informations en lecture seule (utiles pour le debug). */
contextBridge.exposeInMainWorld("applyforgeDesktop", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
});
