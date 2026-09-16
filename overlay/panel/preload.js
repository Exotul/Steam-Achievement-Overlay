const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bruecke zwischen dem Uebersichtsfenster und dem Hauptprozess.
 *
 * Dasselbe schmale Muster wie die uebrigen preloads: Die Seite bekommt
 * keinen Node-Zugriff, sondern genau diese Aufrufe.
 */
contextBridge.exposeInMainWorld('panelAPI', {
  /** Vollstaendige Achievement-Liste des laufenden Spiels samt Merkliste. */
  onSpielDaten: (callback) => {
    ipcRenderer.on('spiel-daten', (_event, daten) => callback(daten));
  },

  /**
   * Ein einzelnes Achievement wurde gerade freigeschaltet.
   *
   * Eigene Nachricht statt der vollen Liste: Zwischen Freischaltung und dem
   * naechsten `spiel-daten` liegen Sekunden, und in genau diesen Sekunden
   * soll es hier nicht mehr als "offen" stehen.
   */
  onErreicht: (callback) => {
    ipcRenderer.on('achievement-erreicht', (_event, apiName) => callback(apiName));
  },

  /** Haken setzen oder entfernen. Antwort enthaelt den gueltigen Stand. */
  merklisteSetzen: (apiName, angehakt) =>
    ipcRenderer.invoke('merkliste:setzen', apiName, angehakt),

  /**
   * Zaehlerstand eines eigenen Eintrags aendern - das Einzige, was sich im
   * Spiel an einer Notiz tun laesst. Alles Weitere braucht eine Tastatur und
   * liegt deshalb im Merklisten-Fenster.
   */
  notizAendern: (id, aenderung) => ipcRenderer.invoke('merkliste:notiz-aendern', id, aenderung),

  schliessen: () => ipcRenderer.invoke('panel:schliessen'),
});
