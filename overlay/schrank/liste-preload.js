const { contextBridge, ipcRenderer } = require('electron');

/**
 * Die Achievement-Liste bekommt ihre Daten vom Hauptprozess und kann sich
 * schliessen - mehr nicht.
 *
 * Welches Spiel gemeint ist, sagt sie NICHT: Das weiss der Hauptprozess, weil
 * er das Fenster fuer diese Packung geoeffnet hat. Ein Fenster, das seine
 * eigene appId mitschickt, waere ein Fenster, dem man glauben muesste.
 */
contextBridge.exposeInMainWorld('listeAPI', {
  onDaten: (fn) => ipcRenderer.on('liste:daten', (_e, daten) => fn(daten)),
  bereit: () => ipcRenderer.send('liste:bereit'),
  /** Den 100-%-Walkthrough zu diesem Spiel aufmachen. */
  guide: () => ipcRenderer.send('liste:guide'),
  schliessen: () => ipcRenderer.send('liste:schliessen'),
});
