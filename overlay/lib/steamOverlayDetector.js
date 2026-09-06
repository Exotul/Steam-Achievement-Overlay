const fs = require('fs');
const path = require('path');

/**
 * Versucht zu erkennen, ob Steams eigenes Overlay (Shift+Tab) gerade offen ist.
 *
 * WICHTIG - was hier moeglich ist und was nicht:
 * In Steams Overlay hineinzuzeichnen ist ausgeschlossen. Steam injiziert es
 * direkt in die Grafikausgabe des Spiels; von aussen kommt man da nicht ran.
 * Unser eigenes Fenster liegt aber darueber, sodass eine eigene Einblendung
 * auch bei geoeffnetem Steam-Overlay sichtbar ist.
 *
 * Ob das Overlay gerade offen ist, laesst sich nur indirekt erkennen: Steam
 * schreibt beim Ein- und Ausblenden in logs/gameoverlay_renderer.txt. Das
 * Format ist von Valve nicht zugesichert, deshalb arbeitet die Erkennung
 * tolerant und meldet ueber `onUnknownLine`, was sie nicht zuordnen konnte -
 * damit laesst sich gezielt nachbessern, statt zu raten.
 *
 * Findet die Erkennung ueberhaupt keine passenden Zeilen, faellt die App auf
 * die zuverlaessige Betriebsart zurueck: Abzeichen anzeigen, solange ein
 * Spiel verfolgt wird.
 */

// Bewusst breit gefasst, weil Valve die Formulierung aendern kann.
const ZEIGT_AN = /overlay.*(shown|showing|activated|opened|visible|enable)/i;
const BLENDET_AUS = /overlay.*(hidden|hiding|deactivated|closed|dismissed|disable)/i;

class SteamOverlayDetector {
  constructor({ steamPath, onChange, onUnknownLine }) {
    this.logPath = path.join(steamPath, 'logs', 'gameoverlay_renderer.txt');
    this.onChange = onChange;
    this.onUnknownLine = onUnknownLine;
    this.offset = 0;
    this.timer = null;
    this.isOpen = false;
    this.erkannteEreignisse = 0;
    this.unbekannteZeilen = [];
  }

  start() {
    if (!fs.existsSync(this.logPath)) return false;
    try {
      this.offset = fs.statSync(this.logPath).size;
    } catch (err) {
      this.offset = 0;
    }
    this.timer = setInterval(() => this._read(), 400);
    return true;
  }

  _read() {
    let size;
    try {
      size = fs.statSync(this.logPath).size;
    } catch (err) {
      return;
    }
    if (size < this.offset) this.offset = 0; // Datei wurde neu angelegt
    if (size === this.offset) return;

    let text = '';
    try {
      const fd = fs.openSync(this.logPath, 'r');
      const laenge = size - this.offset;
      const buf = Buffer.alloc(laenge);
      fs.readSync(fd, buf, 0, laenge, this.offset);
      fs.closeSync(fd);
      text = buf.toString('utf8');
    } catch (err) {
      return;
    }
    this.offset = size;

    text
      .split(/\r?\n/)
      .map((z) => z.trim())
      .filter(Boolean)
      .forEach((zeile) => this._bewerte(zeile));
  }

  _bewerte(zeile) {
    if (ZEIGT_AN.test(zeile)) {
      this.erkannteEreignisse += 1;
      this._setze(true);
    } else if (BLENDET_AUS.test(zeile)) {
      this.erkannteEreignisse += 1;
      this._setze(false);
    } else if (/overlay/i.test(zeile)) {
      // Zeile betrifft das Overlay, passt aber auf kein bekanntes Muster -
      // fuer die spaetere Nachbesserung mitschreiben.
      if (this.unbekannteZeilen.length < 40) this.unbekannteZeilen.push(zeile);
      this.onUnknownLine?.(zeile);
    }
  }

  _setze(offen) {
    if (this.isOpen === offen) return;
    this.isOpen = offen;
    this.onChange?.(offen);
  }

  /** Hat die Erkennung in dieser Sitzung ueberhaupt etwas zuordnen koennen? */
  funktioniert() {
    return this.erkannteEreignisse > 0;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = SteamOverlayDetector;
