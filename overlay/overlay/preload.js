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
});
