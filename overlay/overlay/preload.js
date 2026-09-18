const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  onAchievement: (callback) => {
    ipcRenderer.on('achievement-unlocked', (_event, achievement) => callback(achievement));
  },
  onGameDiamond: (callback) => {
    ipcRenderer.on('game-diamond-unlocked', (_event, payload) => callback(payload));
  },
  /** Bilanz am Ende einer Spielsitzung. */
  onBilanz: (callback) => {
    ipcRenderer.on('sitzungsbilanz', (_event, payload) => callback(payload));
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
  /** Level und XP fuer die Begruessung - oder null, wenn keins kommt. */
  onStartLevel: (callback) => {
    ipcRenderer.on('start-level', (_event, stand) => callback(stand));
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
});
