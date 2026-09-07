const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  onAchievement: (callback) => {
    ipcRenderer.on('achievement-unlocked', (_event, achievement) => callback(achievement));
  },
  onGameDiamond: (callback) => {
    ipcRenderer.on('game-diamond-unlocked', (_event, payload) => callback(payload));
  },
  onGameStarted: (callback) => {
    ipcRenderer.on('game-started', (_event, payload) => callback(payload));
  },
  onCompletionTime: (callback) => {
    ipcRenderer.on('completion-time', (_event, payload) => callback(payload));
  },
  onStatusBadge: (callback) => {
    ipcRenderer.on('status-badge', (_event, payload) => callback(payload));
  },
  onXpLoading: (callback) => {
    ipcRenderer.on('xp-loading', (_event, payload) => callback(payload));
  },
  onWelcome: (callback) => {
    ipcRenderer.on('show-welcome', () => callback());
  },
  onEinstellungen: (callback) => {
    ipcRenderer.on('einstellungen', (_event, werte) => callback(werte));
  },

  /** Vollstaendige Achievement-Liste des laufenden Spiels. */
  onSpielDaten: (callback) => {
    ipcRenderer.on('spiel-daten', (_event, daten) => callback(daten));
  },
  /** Vorschau beim Spielstart abspielen. */
  onParade: (callback) => {
    ipcRenderer.on('parade', (_event, daten) => callback(daten));
  },
  /** Uebersicht ein- oder ausblenden (Tastenkuerzel, Tray, Steam-Overlay). */
  onPanel: (callback) => {
    ipcRenderer.on('panel', (_event, sichtbar) => callback(sichtbar));
  },

  /**
   * Haken in der Uebersicht gesetzt oder entfernt.
   * @returns {Promise<{merkliste: string[], grund: string|null}>}
   */
  merklisteSetzen: (apiName, angehakt) =>
    ipcRenderer.invoke('merkliste:setzen', apiName, angehakt),

  /** Eigener Eintrag - eine frei geschriebene Notiz. */
  notizHinzufuegen: (text) => ipcRenderer.invoke('merkliste:notiz-hinzu', text),
  notizEntfernen: (id) => ipcRenderer.invoke('merkliste:notiz-weg', id),

  /**
   * Meldet, ob die Uebersicht gerade offen ist. Der Hauptprozess schaltet
   * daraufhin den Mausfang des Overlay-Fensters - waere er dauerhaft an,
   * liesse sich das Spiel darunter nicht mehr bedienen.
   */
  panelZustand: (offen) => ipcRenderer.invoke('panel:zustand', offen),
});
