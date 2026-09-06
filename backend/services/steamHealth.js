const logger = require('./logger');

/**
 * Beobachtet, ob die Steam-Web-API erreichbar ist.
 *
 * Zweck: Fällt Steam aus, soll die App nicht stehenbleiben. Die lokale
 * Achievement-Datei liefert weiterhin, WAS freigeschaltet ist; Namen, Symbole
 * und Prozentsätze liegen im Zwischenspeicher. Damit lässt sich der Betrieb
 * eingeschränkt fortsetzen - nur ohne Freundesdaten und ohne frische Werte.
 *
 * Unterschieden wird bewusst zwischen zwei Fehlerarten:
 *   - **Netzwerkfehler** (keine Verbindung, Zeitüberschreitung, DNS) - das
 *     ist ein Ausfall und führt in den eingeschränkten Betrieb.
 *   - **Antworten mit Statuscode** (403, 429, 500) - Steam ist erreichbar,
 *     lehnt aber ab. Das ist kein Ausfall; dafür gibt es die Drosselung in
 *     der Warteschlange und die Schlüsselprüfung.
 * Diese Trennung verhindert, dass ein abgelehnter API-Schlüssel fälschlich
 * als "Steam ist offline" erscheint.
 */

const NETZWERKFEHLER = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNABORTED', // axios bei Zeitüberschreitung
]);

// Erst nach mehreren Fehlschlägen in Folge umschalten - ein einzelner
// Aussetzer soll nicht gleich den Betriebsmodus wechseln.
const FEHLER_BIS_OFFLINE = 3;

let fehlerInFolge = 0;
let offlineSeit = null;
let letzterFehler = null;

function istOffline() {
  return offlineSeit !== null;
}

function status() {
  return {
    steamErreichbar: !istOffline(),
    seit: offlineSeit,
    letzterFehler,
    fehlerInFolge,
  };
}

/** Wird nach jeder erfolgreichen Steam-Antwort aufgerufen. */
function erfolg() {
  if (istOffline()) {
    const dauerSek = Math.round((Date.now() - offlineSeit) / 1000);
    logger.info(`Steam wieder erreichbar (nach ${dauerSek}s eingeschränktem Betrieb)`);
    offlineSeit = null;
    letzterFehler = null;
  }
  fehlerInFolge = 0;
}

/** Wird nach jedem fehlgeschlagenen Steam-Aufruf aufgerufen. */
function fehlschlag(fehler) {
  // Kam eine Antwort mit Statuscode, ist Steam erreichbar - kein Ausfall.
  if (fehler?.response?.status) {
    fehlerInFolge = 0;
    return;
  }

  const code = fehler?.code || 'UNBEKANNT';
  if (!NETZWERKFEHLER.has(code)) {
    // Fehler im eigenen Code o. Ä. - nicht als Ausfall werten.
    return;
  }

  fehlerInFolge += 1;
  letzterFehler = code;

  if (fehlerInFolge >= FEHLER_BIS_OFFLINE && !istOffline()) {
    offlineSeit = Date.now();
    logger.warn(
      `Steam nicht erreichbar (${code}, ${fehlerInFolge} Fehlschläge) - eingeschränkter Betrieb`
    );
  }
}

/** Nur für Tests. */
function _zuruecksetzen() {
  fehlerInFolge = 0;
  offlineSeit = null;
  letzterFehler = null;
}

module.exports = { erfolg, fehlschlag, istOffline, status, _zuruecksetzen, FEHLER_BIS_OFFLINE };
