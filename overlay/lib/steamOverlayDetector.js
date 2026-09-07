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

/*
 * Muster fuer "Overlay ist jetzt sichtbar" bzw. "wieder weg".
 *
 * ZWEI FEHLER, die hier schon drinsteckten und echten Schaden angerichtet
 * haben - beide sind der Grund fuer die Wortgrenzen und die Reihenfolge:
 *
 *  1. "enable" als Treffer fuer "sichtbar". Steam schreibt beim Start Zeilen
 *     wie "GameOverlayRenderer enabled" - das heisst nur, dass die FUNKTION
 *     eingeschaltet ist, nicht dass das Overlay offen waere. Die App hielt
 *     das Overlay dadurch von Anfang an fuer geoeffnet.
 *  2. "activated" ohne Wortgrenze. In "deactivated" steckt "activated" -
 *     eine Zeile, die das Schliessen meldet, wurde also als Oeffnen gelesen.
 *     Damit ging das Overlay in der Wahrnehmung der App nie wieder zu.
 *
 * Deshalb: Wortgrenzen ueberall, "enable/disable" gar nicht mehr, und unten
 * wird ZUERST auf "geschlossen" geprueft. Bei einem Muster, das auf beides
 * passt, ist "geschlossen" die harmlosere Annahme - ein faelschlich
 * geschlossenes Overlay kostet einen Tastendruck, ein faelschlich offenes
 * legt die Bedienung lahm.
 */
const ZEIGT_AN = /overlay\b.*\b(shown|showing|activated|opened|visible)\b/i;
const BLENDET_AUS = /overlay\b.*\b(hidden|hiding|deactivated|closed|dismissed)\b/i;

// Zusaetzliche, sehr verbreitete Schreibweise mit Zahlenwert.
const AKTIV_ZAHL = /overlay\b.*\bactive\b\s*[:=]?\s*([01])\b/i;

/**
 * Bewertet eine einzelne Zeile - reine Funktion, damit sich genau das
 * pruefen laesst, was hier schon zweimal falsch war.
 *
 * @returns {'auf'|'zu'|null}
 */
function bewerteZeile(zeile) {
  const text = String(zeile || '');
  if (!/overlay/i.test(text)) return null;

  // Zahlenwert zuerst: Er ist eindeutig, wo die Worte es nicht sind.
  const zahl = text.match(AKTIV_ZAHL);
  if (zahl) return zahl[1] === '1' ? 'auf' : 'zu';

  // "Geschlossen" vor "offen" - siehe Begruendung oben.
  if (BLENDET_AUS.test(text)) return 'zu';
  if (ZEIGT_AN.test(text)) return 'auf';
  return null;
}

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
    const urteil = bewerteZeile(zeile);
    if (urteil === 'auf') {
      this.erkannteEreignisse += 1;
      this._setze(true);
      return;
    }
    if (urteil === 'zu') {
      this.erkannteEreignisse += 1;
      this._setze(false);
      return;
    }
    if (/overlay/i.test(zeile)) {
      // Zeile betrifft das Overlay, passt aber auf kein bekanntes Muster -
      // fuer die spaetere Nachbesserung mitschreiben. Genau so wurde das
      // Dateiformat der Statistikdateien ermittelt: nicht raten, sondern
      // aufzeichnen und nachsehen.
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
module.exports.bewerteZeile = bewerteZeile;
module.exports.ZEIGT_AN = ZEIGT_AN;
module.exports.BLENDET_AUS = BLENDET_AUS;
