const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bruecke zwischen Anmeldefenster und Hauptprozess.
 *
 * Dasselbe schmale Muster wie die uebrigen preloads: Die Seite bekommt keinen
 * Node-Zugriff, sondern genau diese drei Aufrufe.
 */
contextBridge.exposeInMainWorld('loginAPI', {
  /** Wo die Anmeldung abgelegt wird - fuer den Hinweis im Fenster. */
  ablagePfad: () => ipcRenderer.invoke('anmeldung:pfad'),

  /**
   * Oeffnet Steams Anmeldefenster und wartet, bis die Sitzung steht.
   *
   * @returns {Promise<{ok: boolean, name?: string, grund?: string}>}
   *   Bei Erfolg der angezeigte Name, sonst ein Satz, der erklaert was
   *   schiefging - das Fenster soll nie nur "Fehler" anzeigen muessen.
   */
  anmelden: () => ipcRenderer.invoke('anmeldung:starten'),

  /** Fenster schliessen, ohne sich anzumelden. */
  spaeter: () => ipcRenderer.invoke('anmeldung:spaeter'),
});
