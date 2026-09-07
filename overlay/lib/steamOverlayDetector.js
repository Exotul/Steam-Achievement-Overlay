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
 * AN ECHTEN DATEN GEMESSEN, nicht geraten. So schreibt Steam es wirklich
 * (aufgezeichnet auf einem Spielrechner, gameoverlay_renderer.txt):
 *
 *   ... - Detected hot-key via base input, now requesting overlay enable
 *   ... - Showing overlay and saving cursor show count: -7
 *   ... - Detected hot-key via base input, now requesting overlay disable
 *   ... - Hiding overlay and restoring cursor show count: -7
 *
 * DREI FEHLER steckten hier nacheinander drin, alle mit spuerbaren Folgen:
 *
 *  1. "enable" galt als "sichtbar". Steam schreibt beim Start aber Zeilen
 *     wie "GameOverlayRenderer enabled" - das heisst nur, dass die FUNKTION
 *     eingeschaltet ist. Die App hielt das Overlay dadurch immer fuer offen.
 *  2. "activated" ohne Wortgrenze matcht auch "deactivated" - ausgerechnet
 *     die Zeile, die das Schliessen meldet, wurde als Oeffnen gelesen.
 *  3. Das Muster verlangte "overlay" VOR dem Zustandswort. Steam schreibt
 *     aber "Showing overlay ..." - genau andersherum. Damit wurde ueberhaupt
 *     nichts erkannt.
 *
 * Deshalb jetzt: Reihenfolge egal, Wortgrenzen ueberall, "enable/disable"
 * nur in der eindeutigen Form "requesting overlay enable". Und unten wird
 * ZUERST auf "geschlossen" geprueft - bei einer Zeile, die auf beides passt,
 * ist das die harmlosere Annahme. Ein faelschlich geschlossenes Overlay
 * kostet einen Tastendruck, ein faelschlich offenes blendet dauerhaft etwas
 * ein, das niemand angefordert hat.
 */

// Die tatsaechliche Zustandsmeldung. Reihenfolge der Worte ist offen,
// deshalb getrennt von der Pruefung auf "overlay".
const AUF_WORTE = /\b(showing|shown|activated|opened|visible)\b/i;
const ZU_WORTE = /\b(hiding|hidden|deactivated|closed|dismissed)\b/i;

// Die Anforderung, die der Zustandsmeldung unmittelbar vorausgeht. Bewusst
// eng gefasst: "enabled" allein waere die Startzeile und damit falsch.
const ANFORDERUNG = /requesting\s+overlay\s+(enable|disable)\b/i;

// Verbreitete Schreibweise mit Zahlenwert - eindeutig, wo Worte es nicht sind.
const AKTIV_ZAHL = /overlay\b.*\bactive\b\s*[:=]?\s*([01])\b/i;

/**
 * Bewertet eine einzelne Zeile - reine Funktion, damit sich genau das
 * pruefen laesst, was hier schon dreimal falsch war.
 *
 * @returns {'auf'|'zu'|null}
 */
function bewerteZeile(zeile) {
  const text = String(zeile || '');
  if (!/overlay/i.test(text)) return null;

  // Eindeutiges zuerst.
  const zahl = text.match(AKTIV_ZAHL);
  if (zahl) return zahl[1] === '1' ? 'auf' : 'zu';

  const anforderung = text.match(ANFORDERUNG);
  if (anforderung) return anforderung[1].toLowerCase() === 'enable' ? 'auf' : 'zu';

  // "Geschlossen" vor "offen" - siehe Begruendung oben.
  if (ZU_WORTE.test(text)) return 'zu';
  if (AUF_WORTE.test(text)) return 'auf';
  return null;
}

// Namen aus Ruecksicht auf bestehende Aufrufe erhalten.
const ZEIGT_AN = AUF_WORTE;
const BLENDET_AUS = ZU_WORTE;

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
