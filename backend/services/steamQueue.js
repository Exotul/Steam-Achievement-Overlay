const { AsyncLocalStorage } = require('node:async_hooks');
const logger = require('./logger');

/**
 * Zentrale Stelle für ALLE Steam-Aufrufe.
 *
 * Warum es das gibt: Die Komplettierungszeit hat beim Spielstart rund 80
 * Anfragen abgesetzt und dadurch die Achievement-Erkennung ausgebremst. Der
 * konkrete Fall ist behoben - die Ursache war aber, dass jede Funktion
 * ungebremst und ohne Rücksicht auf andere Anfragen stellen konnte. Genau das
 * verhindert diese Warteschlange.
 *
 * Zwei Vorrangstufen:
 *   dringend    - Achievement-Erkennung und Spielstatus. Geht IMMER vor.
 *   hintergrund - Freundesprofile, XP-Erstberechnung, Erscheinungsdaten.
 *
 * Die Stufe wird nicht überall durchgereicht, sondern über einen
 * Ausführungskontext gesetzt (AsyncLocalStorage). Dadurch ist dieselbe
 * Funktion je nach Aufrufer dringend oder Hintergrund, ohne dass ihre
 * Signatur das wissen muss.
 */

const MAX_GLEICHZEITIG = Number(process.env.STEAM_MAX_CONCURRENT) || 8;
const MIN_ABSTAND_MS = Number(process.env.STEAM_MIN_INTERVAL_MS) || 40;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 60000;

const kontext = new AsyncLocalStorage();

const warteschlangen = { dringend: [], hintergrund: [] };
let laufend = 0;
let letzterStart = 0;
let pausiertBis = 0;
let backoffMs = BACKOFF_START_MS;

// Zählwerk für die Stundenübersicht im Protokoll.
let zaehler = { dringend: 0, hintergrund: 0, gedrosselt: 0, seit: Date.now() };

function aktuellePrioritaet() {
  return kontext.getStore()?.prioritaet || 'hintergrund';
}

/** Führt fn() so aus, dass alle Steam-Aufrufe darin die gegebene Stufe haben. */
function mitPrioritaet(prioritaet, fn) {
  return kontext.run({ prioritaet }, fn);
}

function naechsteAufgabe() {
  if (warteschlangen.dringend.length > 0) return warteschlangen.dringend.shift();
  if (warteschlangen.hintergrund.length > 0) return warteschlangen.hintergrund.shift();
  return null;
}

function pruefen() {
  if (laufend >= MAX_GLEICHZEITIG) return;

  const jetzt = Date.now();

  // Nach einer Drosselung durch Steam warten wir, bevor es weitergeht.
  if (jetzt < pausiertBis) {
    setTimeout(pruefen, pausiertBis - jetzt + 10);
    return;
  }

  // Mindestabstand zwischen zwei Starts einhalten.
  const wartezeit = letzterStart + MIN_ABSTAND_MS - jetzt;
  if (wartezeit > 0) {
    setTimeout(pruefen, wartezeit);
    return;
  }

  const aufgabe = naechsteAufgabe();
  if (!aufgabe) return;

  laufend += 1;
  letzterStart = Date.now();
  zaehler[aufgabe.prioritaet] += 1;

  aufgabe
    .fn()
    .then((wert) => {
      // Erfolgreiche Antwort -> Drosselung war offenbar vorbei.
      backoffMs = BACKOFF_START_MS;
      aufgabe.aufloesen(wert);
    })
    .catch((fehler) => {
      const status = fehler?.response?.status;
      if (status === 429 || status === 403) {
        // Steam bremst uns aus. Alles anhalten und die Wartezeit verdoppeln,
        // statt weiter dagegenzulaufen - das macht es sonst nur schlimmer.
        zaehler.gedrosselt += 1;
        pausiertBis = Date.now() + backoffMs;
        logger.warn(
          `Steam drosselt (HTTP ${status}) - Anfragen pausieren ${Math.round(backoffMs / 1000)}s`
        );
        backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      }
      aufgabe.ablehnen(fehler);
    })
    .finally(() => {
      laufend -= 1;
      pruefen();
    });

  pruefen(); // ggf. gleich die nächste starten
}

/**
 * Reiht einen Steam-Aufruf ein. Die Vorrangstufe kommt aus dem
 * Ausführungskontext, kann aber ausdrücklich übergeben werden.
 */
function einreihen(fn, prioritaet = aktuellePrioritaet()) {
  const stufe = prioritaet === 'dringend' ? 'dringend' : 'hintergrund';
  return new Promise((aufloesen, ablehnen) => {
    warteschlangen[stufe].push({ fn, aufloesen, ablehnen, prioritaet: stufe });
    pruefen();
  });
}

function status() {
  return {
    laufend,
    wartendDringend: warteschlangen.dringend.length,
    wartendHintergrund: warteschlangen.hintergrund.length,
    pausiert: Date.now() < pausiertBis,
    zaehler: { ...zaehler },
  };
}

// Einmal pro Stunde eine Übersicht ins Protokoll, damit sich im Nachhinein
// erkennen lässt, ob es an der Last lag.
const uebersichtTimer = setInterval(() => {
  const dauerMin = Math.round((Date.now() - zaehler.seit) / 60000);
  logger.info(
    `Steam-Anfragen der letzten ${dauerMin} Min: ` +
      `${zaehler.dringend} dringend, ${zaehler.hintergrund} Hintergrund, ` +
      `${zaehler.gedrosselt} mal gedrosselt`
  );
  zaehler = { dringend: 0, hintergrund: 0, gedrosselt: 0, seit: Date.now() };
}, 60 * 60 * 1000);
uebersichtTimer.unref?.();

/** Nur für Tests: Zustand zurücksetzen. */
function _zuruecksetzen() {
  warteschlangen.dringend.length = 0;
  warteschlangen.hintergrund.length = 0;
  laufend = 0;
  letzterStart = 0;
  pausiertBis = 0;
  backoffMs = BACKOFF_START_MS;
  zaehler = { dringend: 0, hintergrund: 0, gedrosselt: 0, seit: Date.now() };
}

module.exports = {
  einreihen,
  mitPrioritaet,
  aktuellePrioritaet,
  status,
  _zuruecksetzen,
  MAX_GLEICHZEITIG,
  MIN_ABSTAND_MS,
};
