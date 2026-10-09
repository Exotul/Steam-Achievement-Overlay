const { contextBridge, ipcRenderer } = require('electron');

/**
 * Der Schrank bekommt seine Daten ausschliesslich vom Hauptprozess.
 *
 * Er koennte das Backend auch selbst fragen - aber dann braeuchte dieses
 * Fenster die Anmeldung samt Sitzungszeugnis. Der Hauptprozess hat beides
 * ohnehin, also holt er die Daten und schiebt sie herein. Dasselbe Vorgehen
 * wie bei der Uebersicht im Steam-Overlay.
 */
contextBridge.exposeInMainWorld('schrankAPI', {
  onDaten: (fn) => ipcRenderer.on('schrank:daten', (_e, daten) => fn(daten)),
  onRuhe: (fn) => ipcRenderer.on('schrank:ruhe', (_e, ruhe) => fn(ruhe)),
  onStand: (fn) => ipcRenderer.on('schrank:stand', (_e, stand) => fn(stand)),
  onSpiel: (fn) => ipcRenderer.on('schrank:spiel', (_e, spiel) => fn(spiel)),
  // Der Schrank liegt im Hintergrund und bekommt deshalb keine Mausereignisse
  // vom Fenstersystem; der Hauptprozess meldet die Zeigerposition.
  onZeiger: (fn) => ipcRenderer.on('schrank:zeiger', (_e, punkt) => fn(punkt)),
  farbenMerken: (farben) => ipcRenderer.send('schrank:farben', farben),
  bereit: () => ipcRenderer.send('schrank:bereit'),
});
