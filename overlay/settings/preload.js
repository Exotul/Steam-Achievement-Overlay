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

  /**
   * Spielt die Diamant-Feier zur Ansicht ab.
   *
   * Die echte gibt es pro Spiel genau einmal - ohne das hier koennte man sie
   * weder einstellen noch ueberhaupt einmal in Ruhe ansehen.
   */
  testDiamant: () => ipcRenderer.invoke('einst:test-diamant'),

  // --- aus dem Tray-Menue hierher gezogen ---------------------------------
  // Alle geben den neuen Programmstand zurueck oder true, damit das Fenster
  // nach einem Klick nie einen veralteten Stand anzeigt.

  /** Version, Anmeldung, Autostart, laufende Aufzeichnung. */
  programm: () => ipcRenderer.invoke('einst:programm'),

  autostart: (an) => ipcRenderer.invoke('einst:autostart', an),
  abmelden: () => ipcRenderer.invoke('einst:abmelden'),
  updatesPruefen: () => ipcRenderer.invoke('einst:updates'),
  beenden: () => ipcRenderer.invoke('einst:beenden'),

  /** Prueft, ob die lokale Achievement-Erkennung mit Steam uebereinstimmt. */
  diagnose: () => ipcRenderer.invoke('einst:diagnose'),

  /** Fragt Steam, ob der hinterlegte Schluessel angenommen wird. */
  keycheck: () => ipcRenderer.invoke('einst:keycheck'),

  /** @param {boolean} ordner - true oeffnet den Ordner statt der Datei. */
  protokoll: (ordner) => ipcRenderer.invoke('einst:protokoll', ordner),

  /** Startet die Aufzeichnung von Dateiaenderungen, oder beendet sie. */
  aufzeichnung: () => ipcRenderer.invoke('einst:aufzeichnung'),

  /** Oeffnet das Fenster zum Eintragen des Steam-Schluessels. */
  schluesselAendern: () => ipcRenderer.invoke('einst:schluessel'),

  schliessen: () => ipcRenderer.invoke('einst:schliessen'),
});
