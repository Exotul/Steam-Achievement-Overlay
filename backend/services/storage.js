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
 *    Nebendatei geschrieben, geprüft, auf die Platte gezwungen und dann
 *    umbenannt. Ein Umbenennen ist auf allen gängigen Dateisystemen
 *    unteilbar - ein Absturz mitten im Schreiben hinterlässt daher nie eine
 *    halbe Datei.
 *
 *    DAS ALLEIN REICHT NICHT, und das wurde teuer gelernt: `writeFileSync`
 *    kehrt zurück, sobald die Daten im Puffer des Betriebssystems liegen -
 *    nicht, wenn sie auf der Platte stehen. Das anschließende Umbenennen
 *    macht dann eine Datei offiziell, deren Inhalt noch gar nicht
 *    geschrieben ist. Endet der Prozess vorher, bleibt der Rest als
 *    NUL-Bytes stehen: Die Datei hat den richtigen Namen, die richtige
 *    Größe, und ist unlesbar. Genau so ist einmal ein 19 MB großer
 *    Zwischenspeicher verlorengegangen. Deshalb wird jetzt vor dem
 *    Umbenennen `fsync` gerufen.
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
/**
 * Liest eine Momentaufnahme.
 *
 * Ist die Datei beschaedigt, wird die letzte gute Fassung (.bak) genommen
 * und die kaputte zur Seite gelegt statt ueberschrieben - sonst ist die
 * Ursache beim naechsten Schreibvorgang unwiederbringlich weg.
 *
 * Frueher wurde in diesem Fall stillschweigend leer gestartet. Das ist
 * technisch harmlos (alles laesst sich neu holen), aber es verschweigt den
 * Vorfall: Ein Zwischenspeicher war fuenf Tage lang kaputt, und nach aussen
 * sah es nur so aus, als sei die App langsam geworden.
 */
function ladeSnapshot(name, standard = {}) {
  const datei = pfad(`${name}.json`);

  try {
    return JSON.parse(fs.readFileSync(datei, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return standard;

    logger.error(`Ablage: ${name}.json ist beschädigt (${err.message})`);

    // Die kaputte Fassung aufheben - sie ist der einzige Beleg dafuer, WAS
    // schiefging, und beim naechsten Schreiben waere sie weg.
    try {
      fs.renameSync(datei, `${datei}.kaputt`);
      logger.warn(`Ablage: beschädigte Datei gesichert als ${name}.json.kaputt`);
    } catch (e) {
      /* nicht kritisch */
    }

    try {
      const aus = JSON.parse(fs.readFileSync(`${datei}.bak`, 'utf8'));
      logger.info(`Ablage: ${name}.json aus der letzten guten Fassung wiederhergestellt`);
      return aus;
    } catch (e) {
      logger.warn(`Ablage: keine brauchbare Sicherung für ${name}.json - starte leer`);
      return standard;
    }
  }
}

/**
 * Schreibt eine Momentaufnahme unteilbar: erst in eine Nebendatei, dann
 * umbenennen. Ein Absturz mittendrin lässt die alte Datei unversehrt.
 */
// Fortlaufend, damit zwei Schreibvorgaenge im selben Prozess sich nicht in
// dieselbe Nebendatei draengen.
let schreibZaehler = 0;

/**
 * Benennt um und wiederholt es bei den Windows-typischen Sperren.
 *
 * Unter Windows scheitert `rename` mit EPERM oder EBUSY, solange ein anderer
 * Prozess die Zieldatei offen haelt - ein Virenscanner, die Indizierung, ein
 * Sicherungsprogramm. Das dauert Millisekunden. Frueher ging der Schreibvorgang
 * in diesem Fall schlicht verloren; im Protokoll standen dafuer drei
 * Fehlermeldungen zu `sessions.json`, und die Anmeldung war danach weg.
 */
function benenneUm(von, nach, versuche = 5) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(von, nach);
      return;
    } catch (err) {
      const sperre = err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES';
      if (!sperre || i >= versuche) throw err;
      // Kurz warten, ohne den Ablauf zu verlassen - das hier ist ein
      // Schreibvorgang, der abgeschlossen sein muss, bevor es weitergeht.
      const bis = Date.now() + 40 * (i + 1);
      while (Date.now() < bis) {
        /* absichtlich blockierend */
      }
    }
  }
}

/**
 * Schreibt eine Momentaufnahme.
 *
 * Fuenf Schritte, jeder davon aus einem konkreten Schaden entstanden:
 *   1. In eine EIGENE Nebendatei je Schreibvorgang - ein zweiter Prozess
 *      (oder ein zweiter Aufruf) darf nicht in dieselbe schreiben.
 *   2. Auf die Platte zwingen (fsync), bevor sie offiziell wird.
 *   3. Gegenlesen: Was nicht wieder einlesbar ist, wird nicht uebernommen.
 *   4. Die bisherige Fassung als .bak behalten - eine einzelne kaputte Datei
 *      kostet dann nicht alles.
 *   5. Umbenennen mit Wiederholung, siehe benenneUm().
 */
function speichereSnapshot(name, daten) {
  const datei = pfad(`${name}.json`);
  const tmp = `${datei}.${process.pid}.${schreibZaehler++}.tmp`;

  try {
    sicherstellen(datei);
    const inhalt = JSON.stringify(daten);

    // Schreiben und auf die Platte zwingen.
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, inhalt, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // Gegenlesen. Ein stiller Schreibfehler ist schlimmer als ein lauter:
    // Er faellt erst Tage spaeter auf, wenn die Datei gebraucht wird.
    const zurueck = fs.readFileSync(tmp, 'utf8');
    if (zurueck.length !== inhalt.length) {
      throw new Error(
        `Gegenlesen fehlgeschlagen: ${zurueck.length} statt ${inhalt.length} Zeichen`
      );
    }

    // Die bisherige Fassung aufheben, bevor sie ersetzt wird.
    if (fs.existsSync(datei)) {
      try {
        fs.copyFileSync(datei, `${datei}.bak`);
      } catch (e) {
        /* ohne Sicherung weitermachen ist besser als gar nicht zu schreiben */
      }
    }

    benenneUm(tmp, datei);
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

/**
 * Benennt eine Momentaufnahme um - für einmalige Umstellungen des Formats.
 *
 * Die alte Datei wird dabei nicht gelöscht, sondern beiseitegelegt: Geht bei
 * der Übernahme etwas schief, ist sie noch da.
 */
function benenneSnapshotUm(von, nach) {
  try {
    benenneUm(pfad(`${von}.json`), pfad(`${nach}.json`));
    return true;
  } catch (err) {
    logger.warn(`Ablage: ${von}.json konnte nicht umbenannt werden - ${err.message}`);
    return false;
  }
}

module.exports = {
  BASIS,
  pfad,
  ladeSnapshot,
  speichereSnapshot,
  benenneSnapshotUm,
  schreibeEreignis,
  leseEreignisse,
  kuerzeEreignisse,
};
