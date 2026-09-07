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

  /**
   * Zaehlerstand eines eigenen Eintrags aendern - das Einzige, was sich im
   * Spiel an einer Notiz tun laesst. Alles Weitere braucht eine Tastatur und
   * liegt deshalb im Merklisten-Fenster.
   */
  notizAendern: (id, aenderung) => ipcRenderer.invoke('merkliste:notiz-aendern', id, aenderung),

  /**
   * Meldet, ob die Uebersicht gerade offen ist. Der Hauptprozess schaltet
   * daraufhin den Mausfang des Overlay-Fensters - waere er dauerhaft an,
   * liesse sich das Spiel darunter nicht mehr bedienen.
   */
  panelZustand: (offen) => ipcRenderer.invoke('panel:zustand', offen),

  /**
   * Meldet, ob der Mauszeiger gerade ueber einem bedienbaren Bereich steht.
   * Nur dann nimmt das Overlay-Fenster Klicks an - sonst gehen sie hindurch
   * an Steams Overlay und das Spiel.
   */
  mausUeberBedienbar: (ja) => ipcRenderer.invoke('panel:maus', ja),
});
