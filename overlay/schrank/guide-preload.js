const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bruecke des Walkthrough-Fensters.
 *
 * Welches Spiel gemeint ist, sagt das Fenster NIE mit: Das weiss der
 * Hauptprozess, weil er das Fenster fuer diese Packung geoeffnet hat. Ein
 * Fenster, das seine eigene appId mitschickt, waere ein Fenster, dem man
 * glauben muesste - und hier laeuft eine fremde Webseite daneben.
 */
contextBridge.exposeInMainWorld('guideAPI', {
  onDaten: (fn) => ipcRenderer.on('guide:daten', (_e, daten) => fn(daten)),
  bereit: () => ipcRenderer.send('guide:bereit'),

  /** Einen anderen Guide waehlen - wird je Spiel gemerkt. */
  waehle: (id, titel) => ipcRenderer.send('guide:waehle', { id, titel }),

  /** Wie weit heruntergescrollt war. Nur von hier aus zu holen. */
  stand: (id, stand) => ipcRenderer.send('guide:stand', { id, stand }),

  /** Einen Haken in der Merkliste setzen oder wegnehmen. */
  merkliste: (apiName, angehakt) => ipcRenderer.invoke('guide:merkliste', apiName, angehakt),

  /** Dieselbe Seite im richtigen Browser oeffnen. */
  imBrowser: (url) => ipcRenderer.send('guide:browser', url),

  schliessen: () => ipcRenderer.send('guide:schliessen'),
});
