const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Einheitliche Protokollierung für Backend und Overlay.
 *
 * Warum es das gibt: Bei den bisherigen Fehlersuchen (Verzögerungen,
 * Fehlalarme, abgelehnter API-Schlüssel) haben wir jeweils mehrere Runden
 * gebraucht, weil nichts mitgeschrieben wurde und wir auf Vermutungen
 * angewiesen waren. Mit dieser Datei lässt sich hinterher nachlesen, was
 * tatsächlich passiert ist.
 *
 * Bewusst NICHT protokolliert werden: der Steam-API-Schlüssel, Sitzungs-
 * kennungen und vollständige Cookie-Werte. Sie werden vor dem Schreiben
 * unkenntlich gemacht - eine Protokolldatei soll man weitergeben können.
 */

const LOG_DIR = process.env.LOG_DIR || path.join(os.homedir(), '.trophaenschrank', 'logs');
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, dann wird umgeschichtet
const ALTE_DATEIEN = 2;

let bereich = 'app';
let stream = null;
let aktuelleGroesse = 0;

// Muster, die nie in der Datei landen dürfen. Jedes Muster bringt seinen
// eigenen Ersatztext mit - `$1` erhält dabei den erkennenden Teil, damit man
// im Protokoll noch sieht, WAS entfernt wurde.
const GEHEIM = [
  { muster: /(\bkey=)[0-9A-Za-z]+/gi, ersatz: '$1<entfernt>' },
  { muster: /(\bSTEAM_API_KEY[=:]\s*)\S+/gi, ersatz: '$1<entfernt>' },
  { muster: /(connect\.sid=)[^;\s]+/gi, ersatz: '$1<entfernt>' },
  // Schlüssel-Format, auch ohne Beschriftung davor.
  { muster: /\b[0-9A-Fa-f]{32}\b/g, ersatz: '<entfernt>' },
];

function entschaerfen(text) {
  let out = String(text);
  GEHEIM.forEach(({ muster, ersatz }) => {
    out = out.replace(muster, ersatz);
  });
  return out;
}

function dateiPfad(index = 0) {
  return path.join(LOG_DIR, index === 0 ? 'trophaenschrank.log' : `trophaenschrank.${index}.log`);
}

function oeffnen() {
  if (stream) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const pfad = dateiPfad(0);
    aktuelleGroesse = fs.existsSync(pfad) ? fs.statSync(pfad).size : 0;
    stream = fs.createWriteStream(pfad, { flags: 'a' });
  } catch (err) {
    stream = null; // ohne Protokoll läuft alles weiter
  }
}

function umschichten() {
  try {
    if (stream) {
      stream.end();
      stream = null;
    }
    for (let i = ALTE_DATEIEN; i >= 1; i--) {
      const von = dateiPfad(i - 1);
      const nach = dateiPfad(i);
      if (fs.existsSync(von)) fs.renameSync(von, nach);
    }
    aktuelleGroesse = 0;
    oeffnen();
  } catch (err) {
    /* nicht kritisch */
  }
}

function schreiben(stufe, nachricht, daten) {
  oeffnen();

  const zeit = new Date().toISOString().replace('T', ' ').slice(0, 23);
  let zeile = `${zeit} [${bereich}] ${stufe.padEnd(5)} ${nachricht}`;
  if (daten !== undefined) {
    try {
      zeile += ` ${typeof daten === 'string' ? daten : JSON.stringify(daten)}`;
    } catch (err) {
      /* nicht serialisierbar - weglassen */
    }
  }
  zeile = entschaerfen(zeile) + '\n';

  if (stream) {
    stream.write(zeile);
    aktuelleGroesse += Buffer.byteLength(zeile);
    if (aktuelleGroesse > MAX_BYTES) umschichten();
  }

  // Zusätzlich auf die Konsole, damit man beim Entwickeln nichts verpasst.
  const ausgabe = stufe === 'ERROR' || stufe === 'WARN' ? console.error : console.log;
  ausgabe(zeile.trimEnd());
}

const logger = {
  /** Legt fest, welcher Programmteil schreibt - erscheint in jeder Zeile. */
  setBereich(name) {
    bereich = name;
  },
  logDir: LOG_DIR,
  logFile: dateiPfad(0),
  info: (nachricht, daten) => schreiben('INFO', nachricht, daten),
  warn: (nachricht, daten) => schreiben('WARN', nachricht, daten),
  error: (nachricht, daten) => schreiben('ERROR', nachricht, daten),
  debug: (nachricht, daten) => {
    if (process.env.LOG_DEBUG === '1') schreiben('DEBUG', nachricht, daten);
  },

  /**
   * Eigener Eintrag für Steam-Aufrufe: Endpunkt, Statuscode, Dauer.
   * Genau diese drei Angaben haben bei der Verzögerungssuche gefehlt.
   */
  steam(endpunkt, status, dauerMs, zusatz) {
    const langsam = dauerMs > 2000 ? ' LANGSAM' : '';
    schreiben(
      status >= 400 ? 'WARN' : 'INFO',
      `steam ${endpunkt} -> ${status} in ${dauerMs}ms${langsam}`,
      zusatz
    );
  },

  entschaerfen,
};

module.exports = logger;
