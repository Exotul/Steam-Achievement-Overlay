const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

/**
 * Dauerhafte Ablage für Zwischenspeicher, Sitzungen und Verlauf.
 *
 * WARUM NICHT SQLITE (nachgemessen, nicht vermutet):
 * Das Backend läuft als Kindprozess der Overlay-App und damit unter Electrons
 * Node 20. Dort gibt es `node:sqlite` nicht. Die Alternative `better-sqlite3`
 * ist ein nativer Baustein: Wird er beim `npm install` für das System-Node
 * gebaut und danach unter Electrons Node geladen, stürzt der Prozess mit einem
 * Speicherzugriffsfehler ab - und zwar so, dass sich das NICHT mit try/catch
 * abfangen lässt. Das wäre ein Rückschritt bei der Stabilität, nicht ein
 * Fortschritt.
 *
 * Diese Ablage erreicht die eigentlichen Ziele ohne nativen Code:
 *
 *  - **Momentaufnahmen** (Zwischenspeicher, Sitzungen): werden erst in eine
 *    Nebendatei geschrieben und dann umbenannt. Ein Umbenennen ist auf allen
 *    gängigen Dateisystemen unteilbar - ein Absturz mitten im Schreiben
 *    hinterlässt daher nie eine halbe Datei.
 *
 *  - **Verlauf** (freigeschaltete Achievements, XP-Verlauf): wird angehängt,
 *    eine Zeile je Ereignis. Anhängen schreibt die bestehende Datei nicht neu,
 *    ist dadurch schnell und übersteht einen Absturz: Schlimmstenfalls ist die
 *    letzte Zeile unvollständig, und die wird beim Lesen übersprungen.
 *
 * Die Schnittstelle ist bewusst schmal gehalten, damit sich der Unterbau
 * später austauschen ließe, ohne alles andere anzufassen.
 */

const BASIS = process.env.DATA_DIR || path.join(os.homedir(), '.trophaenschrank');

function pfad(...teile) {
  return path.join(BASIS, ...teile);
}

function sicherstellen(datei) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
}

// --- Momentaufnahmen ---------------------------------------------------------

/** Liest eine Momentaufnahme. Bei beschädigter Datei: leeres Ergebnis. */
function ladeSnapshot(name, standard = {}) {
  const datei = pfad(`${name}.json`);
  try {
    return JSON.parse(fs.readFileSync(datei, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Ablage: ${name}.json nicht lesbar (${err.message}) - starte leer`);
    }
    return standard;
  }
}

/**
 * Schreibt eine Momentaufnahme unteilbar: erst in eine Nebendatei, dann
 * umbenennen. Ein Absturz mittendrin lässt die alte Datei unversehrt.
 */
function speichereSnapshot(name, daten) {
  const datei = pfad(`${name}.json`);
  const tmp = `${datei}.tmp`;
  try {
    sicherstellen(datei);
    fs.writeFileSync(tmp, JSON.stringify(daten), 'utf8');
    fs.renameSync(tmp, datei);
    return true;
  } catch (err) {
    logger.error(`Ablage: ${name}.json konnte nicht geschrieben werden - ${err.message}`);
    try {
      fs.unlinkSync(tmp);
    } catch (e) {
      /* egal */
    }
    return false;
  }
}

// --- Anfügendes Ereignisprotokoll --------------------------------------------

/**
 * Hängt ein Ereignis an. Eine Zeile je Ereignis (JSON), damit ein Absturz
 * höchstens die letzte Zeile beschädigt statt der ganzen Datei.
 */
function schreibeEreignis(name, ereignis) {
  const datei = pfad('verlauf', `${name}.jsonl`);
  try {
    sicherstellen(datei);
    fs.appendFileSync(datei, JSON.stringify({ ts: Date.now(), ...ereignis }) + '\n', 'utf8');
    return true;
  } catch (err) {
    logger.error(`Ablage: Ereignis ${name} nicht geschrieben - ${err.message}`);
    return false;
  }
}

/**
 * Liest Ereignisse. Unvollständige Zeilen (etwa nach einem Absturz) werden
 * übersprungen, statt das ganze Lesen scheitern zu lassen.
 */
function leseEreignisse(name, { seit = 0, limit = Infinity } = {}) {
  const datei = pfad('verlauf', `${name}.jsonl`);
  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch (err) {
    return [];
  }

  const ergebnis = [];
  let uebersprungen = 0;

  for (const zeile of inhalt.split('\n')) {
    if (!zeile.trim()) continue;
    let ereignis;
    try {
      ereignis = JSON.parse(zeile);
    } catch (err) {
      uebersprungen += 1;
      continue;
    }
    if (ereignis.ts >= seit) ergebnis.push(ereignis);
  }

  if (uebersprungen > 0) {
    logger.warn(`Ablage: ${uebersprungen} unvollständige Zeile(n) in ${name} übersprungen`);
  }

  return limit === Infinity ? ergebnis : ergebnis.slice(-limit);
}

/**
 * Kürzt ein Ereignisprotokoll auf die jüngsten Einträge. Läuft ebenfalls über
 * Nebendatei und Umbenennen, damit nichts verloren geht.
 */
function kuerzeEreignisse(name, behalten) {
  const ereignisse = leseEreignisse(name);
  if (ereignisse.length <= behalten) return ereignisse.length;

  const datei = pfad('verlauf', `${name}.jsonl`);
  const tmp = `${datei}.tmp`;
  const rest = ereignisse.slice(-behalten);
  try {
    fs.writeFileSync(tmp, rest.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    fs.renameSync(tmp, datei);
    logger.info(`Ablage: ${name} gekürzt auf ${behalten} Einträge`);
  } catch (err) {
    logger.error(`Ablage: ${name} konnte nicht gekürzt werden - ${err.message}`);
  }
  return rest.length;
}

module.exports = {
  BASIS,
  pfad,
  ladeSnapshot,
  speichereSnapshot,
  schreibeEreignis,
  leseEreignisse,
  kuerzeEreignisse,
};
