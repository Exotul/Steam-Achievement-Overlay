const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Welcher Guide zu welchem Spiel - und wo man darin stehengeblieben ist.
 *
 * DAS IST DER EIGENTLICHE PUNKT DER FUNKTION. Einen Guide zu oeffnen kann
 * jeder Browser. Was keiner kann: Nach drei Monaten wieder genau dort
 * aufmachen, wo man aufgehoert hat - in einem 400 Bildschirmseiten langen
 * Komplettguide ist das der Unterschied zwischen "weiterspielen" und "noch
 * einmal suchen".
 *
 * Gemerkt wird je Spiel:
 *   id        welcher Guide gewaehlt wurde (Steams publishedfileid)
 *   titel     nur zur Anzeige, damit die Auswahl ohne Abfrage benannt ist
 *   stand     wie weit heruntergescrollt war, in Bildpunkten
 *   zuletzt   wann zuletzt geoeffnet
 *
 * Die Datei liegt neben der Merkliste in `~/.trophaenschrank/` und damit
 * AUSSERHALB des Programmordners: Sie uebersteht Updates und das
 * Deinstallieren - und sie laesst sich an einen Freund weitergeben, der
 * dieselben Spiele spielt. Genau deshalb muss sie auch von Hand bearbeitbar
 * sein, und genau deshalb wird hier alles geprueft, was aus ihr kommt.
 *
 * Bewusst ohne Electron: So laesst sich die Pruefung ohne Fenster testen.
 */

const ORDNER = process.env.DATA_DIR || path.join(os.homedir(), '.trophaenschrank');
const DATEI = path.join(ORDNER, 'guides.json');

// Mehr Spiele merkt sich niemand von Hand, und eine Datei mit Zehntausenden
// Eintraegen waere ein Zeichen, dass etwas anderes schiefgelaufen ist.
const MAX_SPIELE = 2000;
// Ein Scrollstand jenseits davon kann nicht stimmen (das waere eine Seite von
// einem Kilometer Hoehe).
const MAX_STAND = 2000000;

/**
 * Macht aus beliebiger Eingabe einen brauchbaren Eintrag - oder null.
 *
 * @param {object} roh
 * @returns {{id: string, titel: string|null, stand: number, zuletzt: string|null}|null}
 */
function bereinigeEintrag(roh) {
  if (!roh || typeof roh !== 'object') return null;
  const id = String(roh.id ?? '').trim();
  // Steams publishedfileid ist eine reine Zahlenfolge. Alles andere koennte
  // in eine URL geraten, und dorthin gehoert nur, was von Steam kommt.
  if (!/^\d{1,20}$/.test(id)) return null;

  const stand = Number(roh.stand);
  const titel = typeof roh.titel === 'string' ? roh.titel.slice(0, 200) : null;
  return {
    id,
    titel: titel && titel.trim() ? titel.trim() : null,
    stand: Number.isFinite(stand) ? Math.max(0, Math.min(MAX_STAND, Math.round(stand))) : 0,
    zuletzt: typeof roh.zuletzt === 'string' ? roh.zuletzt.slice(0, 40) : null,
  };
}

/** Die ganze Zuordnung saeubern. */
function bereinige(roh) {
  const raus = {};
  if (!roh || typeof roh !== 'object') return raus;
  let n = 0;
  for (const [appId, eintrag] of Object.entries(roh)) {
    if (n >= MAX_SPIELE) break;
    if (!/^\d{1,10}$/.test(String(appId))) continue;
    const sauber = bereinigeEintrag(eintrag);
    if (!sauber) continue;
    raus[String(appId)] = sauber;
    n += 1;
  }
  return raus;
}

/** Liest die Zuordnung. Fehlt oder klemmt die Datei: leeres Verzeichnis. */
function laden(datei = DATEI) {
  try {
    return bereinige(JSON.parse(fs.readFileSync(datei, 'utf8')).guides);
  } catch (err) {
    // Weder eine fehlende noch eine beschaedigte Datei ist ein Grund, die App
    // nicht zu starten - dann gibt es eben noch keine gemerkten Guides.
    return {};
  }
}

/**
 * Schreibt die Zuordnung - erst in eine Nebendatei, dann umbenennen, wie die
 * uebrige Ablage der App. So bleibt bei einem Absturz mitten im Schreiben die
 * alte Datei heil.
 */
function speichern(zuordnung, datei = DATEI) {
  const sauber = bereinige(zuordnung);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ guides: sauber }, null, 2), 'utf8');
  fs.renameSync(tmp, datei);
  return sauber;
}

/** Der gemerkte Eintrag eines Spiels, oder null. */
function fuerSpiel(zuordnung, appId) {
  return (zuordnung && zuordnung[String(appId)]) || null;
}

/**
 * Einen Guide merken oder seinen Stand fortschreiben.
 *
 * Wird nur der Stand gemeldet (ohne id), zaehlt er fuer den bereits
 * gemerkten Guide - sonst wuerde Weiterscrollen die Auswahl loeschen.
 *
 * @returns {object} die neue Zuordnung (die uebergebene bleibt unangetastet)
 */
function merke(zuordnung, appId, { id, titel, stand } = {}) {
  const schluessel = String(appId);
  if (!/^\d{1,10}$/.test(schluessel)) return { ...(zuordnung || {}) };

  const vorher = fuerSpiel(zuordnung, appId);
  const neueId = id !== undefined ? String(id) : vorher && vorher.id;
  if (!neueId) return { ...(zuordnung || {}) };

  // Ein ANDERER Guide faengt wieder oben an - ein Stand aus einem anderen
  // Text waere eine zufaellige Stelle.
  const gleicherGuide = vorher && vorher.id === String(neueId);
  const eintrag = bereinigeEintrag({
    id: neueId,
    titel: titel !== undefined ? titel : vorher && vorher.titel,
    stand: stand !== undefined ? stand : gleicherGuide ? vorher.stand : 0,
    zuletzt: new Date().toISOString(),
  });
  if (!eintrag) return { ...(zuordnung || {}) };

  return { ...(zuordnung || {}), [schluessel]: eintrag };
}

module.exports = {
  DATEI,
  MAX_STAND,
  bereinigeEintrag,
  bereinige,
  laden,
  speichern,
  fuerSpiel,
  merke,
};
