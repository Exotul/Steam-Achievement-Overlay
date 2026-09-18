const { BrowserWindow } = require('electron');

/**
 * Alle Anfragen ans Backend laufen über ein unsichtbares Fenster, das direkt
 * auf der Backend-Origin geladen ist. Dadurch sind es aus Sicht des Browsers
 * ganz normale Same-Origin-Fetches inkl. Session-Cookie - kein CORS, kein
 * manuelles Cookie-Handling nötig. Dasselbe Fenster wird auch für den
 * Steam-Login genutzt (sichtbar geschaltet), damit beide dieselbe Session
 * teilen.
 */
class SteamClient {
  /**
   * @param {string} baseUrl
   * @param {string} [iconPfad] - Symbol fuer das sichtbare Anmeldefenster.
   */
  constructor(baseUrl, iconPfad) {
    this.baseUrl = baseUrl;
    this.iconPfad = iconPfad;
    this.window = this._neuesFenster();
    this.ready = this.window.loadURL(baseUrl);
  }

  /**
   * Das Fenster ist die meiste Zeit unsichtbar und dient nur als Traeger fuer
   * die Anfragen. Beim Anmelden wird genau dieses Fenster sichtbar geschaltet
   * - und dann sieht man alles, was hier fehlt.
   *
   * Vorher stand hier nur `show: false`. Beim Anmelden ging deshalb ein
   * Fenster mit Electrons Standardsymbol, dem Titel der geladenen Seite und
   * einer Menueleiste (Datei / Bearbeiten / Ansicht) auf. Das sah aus wie ein
   * vergessenes Entwicklerfenster, nicht wie ein Teil des Programms.
   */
  _neuesFenster() {
    const fenster = new BrowserWindow({
      show: false,
      width: 980,
      height: 760,
      title: 'Bei Steam anmelden',
      // Sonst blitzt beim Sichtbarwerden kurz eine weisse Flaeche auf.
      backgroundColor: '#171b23',
      autoHideMenuBar: true,
      icon: this.iconPfad || undefined,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    // Steams Seite setzt ihren eigenen Titel. Ohne das hier stuende in der
    // Fensterleiste die jeweilige Seitenueberschrift statt eines Satzes, der
    // erklaert, warum dieses Fenster gerade offen ist.
    //
    // EINMAL je Fenster, hier beim Anlegen. Vorher stand das in login() und
    // kam bei jeder Anmeldung dazu - dasselbe Fenster sammelte so mit jedem
    // Abmelden und Wiederanmelden einen weiteren Zuhoerer an.
    fenster.webContents.on('page-title-updated', (e) => e.preventDefault());
    return fenster;
  }

  _ensureWindow() {
    if (this.window.isDestroyed()) {
      this.window = this._neuesFenster();
      this.ready = this.window.loadURL(this.baseUrl);
    }
  }

  async _fetch(path) {
    this._ensureWindow();
    await this.ready;
    const script = `
      (async () => {
        const res = await fetch(${JSON.stringify(path)}, { credentials: 'include' });
        if (!res.ok) {
          const err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return await res.json();
      })()
    `;
    return this.window.webContents.executeJavaScript(script);
  }

  async me() {
    try {
      return await this._fetch('/auth/me');
    } catch (err) {
      if (err.message?.includes('401')) return null;
      throw err;
    }
  }

  presence() {
    return this._fetch('/api/presence');
  }

  /** Was zuletzt in diesem Spiel passiert ist - rein lokal, ohne Steam. */
  rueckblick(appId) {
    return this._fetch(`/api/games/${appId}/rueckblick`);
  }

  completionTime(appId) {
    return this._fetch(`/api/games/${appId}/completion-time`);
  }

  keycheck() {
    return this._fetch('/api/keycheck');
  }

  xpSummary(refresh = false) {
    return this._fetch(`/api/xp-summary${refresh ? '?refresh=1' : ''}`);
  }

  /** Meldet eine Freischaltung an den Verlauf (nur Schreiben, ohne Antwortwert). */
  async verlaufMelden(daten) {
    await this.ready;
    const script = `
      fetch('/api/history/achievement', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: ${JSON.stringify(JSON.stringify(daten))}
      }).then(r => r.ok).catch(() => false)
    `;
    return this.window.webContents.executeJavaScript(script);
  }

  gesundheit() {
    return this._fetch('/api/health');
  }

  library() {
    return this._fetch('/api/library');
  }

  /**
   * @param {boolean} fresh - beim aktiven Polling true, damit der
   *   serverseitige Cache umgangen wird und die Reaktionszeit wirklich
   *   vom Poll-Intervall bestimmt wird, nicht von der Cache-Dauer.
   */
  gameAchievements(appId, fresh = false) {
    return this._fetch(`/api/games/${appId}/achievements${fresh ? '?fresh=1' : ''}`);
  }

  /** Zeigt den Login sichtbar an; löst auf, sobald die Session steht. */
  async login() {
    this._ensureWindow();
    this.window.setTitle('Bei Steam anmelden');
    this.window.show();
    return new Promise((resolve, reject) => {
      const check = setInterval(async () => {
        try {
          const user = await this.me();
          if (user) {
            clearInterval(check);
            this.window.hide();
            resolve(user);
          }
        } catch (err) {
          // während des Steam-Login-Flows sind Zwischenzustände normal, weiterprüfen
        }
      }, 1200);

      this.window.once('closed', () => {
        clearInterval(check);
        reject(new Error('Login-Fenster wurde geschlossen.'));
      });

      this.window.loadURL(`${this.baseUrl}/auth/steam`);
    });
  }

  logout() {
    this.window.loadURL(`${this.baseUrl}/auth/logout`).then(() => this.window.loadURL(this.baseUrl));
  }
}

module.exports = SteamClient;
