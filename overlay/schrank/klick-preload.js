const { contextBridge, ipcRenderer } = require('electron');

/**
 * Der Klickfaenger kennt genau einen Aufruf.
 *
 * Welches Spiel gemeint ist, steht bewusst NICHT hier: Das weiss der
 * Hauptprozess, weil er das Fenster gerade ueber diese Packung gelegt hat.
 * Eine appId aus dem Fenster heraus mitzuschicken hiesse, dem Fenster zu
 * glauben - und dieses Fenster soll so wenig wie moeglich duerfen.
 */
contextBridge.exposeInMainWorld('klickAPI', {
  starten: () => ipcRenderer.send('schrank:starten'),
  /** Rechtsklick: die Achievement-Liste dieses Spiels aufmachen. */
  liste: () => ipcRenderer.send('schrank:liste'),

  /** Mittlere Maustaste: der 100-%-Walkthrough zu diesem Spiel. */
  guide: () => ipcRenderer.send('schrank:guide'),
});
