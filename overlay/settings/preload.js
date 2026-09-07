const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bruecke zwischen Einstellungsfenster und Hauptprozess.
 *
 * Dasselbe schmale Muster wie overlay/preload.js und setup/preload.js: Die
 * Seite bekommt keinen Node-Zugriff, sondern genau diese Aufrufe.
 */
contextBridge.exposeInMainWorld('settingsAPI', {
  /** Aktuelle Werte plus die Liste der Bildschirme und der Schluesselstand. */
  laden: () => ipcRenderer.invoke('einst:laden'),

  /**
   * Speichert und wendet sofort an. Gibt die tatsaechlich gespeicherten
   * (also bereinigten) Werte zurueck - das Fenster zeigt danach an, was
   * wirklich gilt, nicht was angefragt wurde.
   */
  speichern: (werte) => ipcRenderer.invoke('einst:speichern', werte),

  /** Setzt alles auf die Vorgabewerte zurueck. */
  zuruecksetzen: () => ipcRenderer.invoke('einst:zuruecksetzen'),

  /** Oeffnet den Dateiauswahldialog fuer einen eigenen Ton. */
  tonWaehlen: () => ipcRenderer.invoke('einst:ton-waehlen'),

  /** Spielt eine Testmeldung ab - aendert nichts am Fortschritt. */
  testMeldung: () => ipcRenderer.invoke('einst:test'),

  /** Oeffnet das Fenster zum Eintragen des Steam-Schluessels. */
  schluesselAendern: () => ipcRenderer.invoke('einst:schluessel'),

  schliessen: () => ipcRenderer.invoke('einst:schliessen'),
});
