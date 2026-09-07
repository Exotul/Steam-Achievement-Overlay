const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bruecke fuer das Merklisten-Fenster.
 *
 * Dasselbe schmale Muster wie die uebrigen Fenster: kein Node-Zugriff in der
 * Seite, nur diese Aufrufe. Jeder gibt den vollstaendigen, gerade gueltigen
 * Stand zurueck - so muss die Seite nie raten, was gespeichert wurde.
 */
contextBridge.exposeInMainWorld('merkAPI', {
  /** Spiele mit Liste, das gerade verfolgte, und dessen Achievements. */
  laden: (appId) => ipcRenderer.invoke('merk:laden', appId),

  setzeHaken: (appId, apiName, angehakt) =>
    ipcRenderer.invoke('merk:haken', appId, apiName, angehakt),

  notizHinzufuegen: (appId, daten) => ipcRenderer.invoke('merk:notiz-hinzu', appId, daten),
  notizAendern: (appId, id, aenderung) =>
    ipcRenderer.invoke('merk:notiz-aendern', appId, id, aenderung),
  notizEntfernen: (appId, id) => ipcRenderer.invoke('merk:notiz-weg', appId, id),

  schliessen: () => ipcRenderer.invoke('merk:schliessen'),
});
