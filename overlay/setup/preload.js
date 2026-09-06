const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bruecke zwischen Einrichtungsfenster und Hauptprozess.
 *
 * Bewusst schmal gehalten - dasselbe Muster wie overlay/preload.js: Die Seite
 * bekommt keinen Zugriff auf Node, sondern genau diese vier Aufrufe. Der
 * eingegebene Schluessel wandert damit auf einem einzigen, klar benannten Weg
 * in den Hauptprozess, wo er geprueft und gespeichert wird.
 */
contextBridge.exposeInMainWorld('setupAPI', {
  /** Wohin der Schluessel geschrieben wird - wird im Fenster angezeigt. */
  konfigPfad: () => ipcRenderer.invoke('setup:konfig-pfad'),

  /** Oeffnet Steams Schluesselseite im richtigen Browser. */
  schluesselseiteOeffnen: () => ipcRenderer.invoke('setup:schluesselseite'),

  /**
   * Prueft den Schluessel bei Steam und speichert ihn bei Erfolg.
   * @returns {Promise<{ok: boolean, grund?: string, unklar?: boolean}>}
   */
  schluesselSpeichern: (schluessel) => ipcRenderer.invoke('setup:speichern', schluessel),

  /** Einrichtung überspringen - die App laeuft dann unkonfiguriert weiter. */
  spaeter: () => ipcRenderer.invoke('setup:spaeter'),
});
