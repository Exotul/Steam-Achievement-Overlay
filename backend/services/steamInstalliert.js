/**
 * Welche Spiele sind auf diesem Rechner installiert?
 *
 * Gefragt wird der Steam-Client auf der Platte, nicht das Netz: Steam fuehrt
 * je installiertem Spiel eine Datei
 *
 *     <Bibliothek>/steamapps/appmanifest_<appid>.acf
 *
 * Das kostet keine einzige Steam-Abfrage. Die Web-API kennt diese Angabe
 * ohnehin nicht - ob etwas installiert ist, weiss nur der Rechner selbst.
 *
 * WO DIE BIBLIOTHEKEN STEHEN: Spiele liegen selten alle am selben Ort. Die
 * Liste der Orte steht in <Steam>/steamapps/libraryfolders.vdf. Auf diesem
 * Rechner nachgesehen:
 *
 *     D:\Programme\Steam_Programm\steamapps    85 Manifeste
 *     E:\SteamLibrary\steamapps                94 Manifeste
 *
 * WARUM NICHT EINFACH "DATEI DA = INSTALLIERT": Ein Manifest entsteht auch
 * fuer ein Spiel, das gerade erst heruntergeladen wird - spielbar ist es dann
 * nicht. Massgeblich ist das Feld StateFlags, ein Bitfeld. Bit 4 heisst
 * "vollstaendig installiert". Nachgezaehlt an denselben 179 Manifesten:
 *
 *     StateFlags 4    172x   fertig
 *     StateFlags 6      6x   fertig, Update faellig   (4 + 2)
 *     StateFlags 518    1x   fertig, Update pausiert  (4 + 2 + 512)
 *
 * Alle drei haben Bit 4 - genau danach wird gefragt.
 *
 * Gelesen wird ausschliesslich.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const logger = require('./logger');
const { steamOrdner } = require('./steamSammlungen');

// Bit 4 im Feld StateFlags: StateFullyInstalled.
const FERTIG = 4;

/**
 * Ist dieses Spiel fertig installiert?
 *
 * Eigene Funktion, weil das die eine Entscheidung ist, die sich ohne Steam
 * pruefen laesst - und weil eine fehlende oder unverstaendliche Angabe NICHT
 * als "installiert" durchgehen darf. Ein gruener Balken an einem Spiel, das
 * erst noch geladen werden muss, waere eine Falschaussage.
 *
 * @param {number|string|undefined} flags
 */
function istFertig(flags) {
  const n = Number(flags);
  if (!Number.isFinite(n)) return false;
  return (n & FERTIG) !== 0;
}

/**
 * Die Bibliothekspfade aus libraryfolders.vdf.
 *
 * Bewusst ohne vollstaendigen VDF-Leser: Gebraucht wird genau ein Feld. Die
 * Pfade stehen dort mit verdoppelten Backslashes ("D:\\Programme\\Steam"),
 * weil VDF sie so schreibt.
 *
 * @param {string} inhalt
 * @returns {Array<string>}
 */
function bibliotheken(inhalt) {
  const raus = [];
  for (const treffer of String(inhalt || '').matchAll(/"path"\s*"([^"]+)"/gi)) {
    const pfad = treffer[1].replace(/\\\\/g, '\\').trim();
    if (pfad && !raus.includes(pfad)) raus.push(pfad);
  }
  return raus;
}

/**
 * Liest appid und Zustand aus einem Manifest.
 *
 * @param {string} text
 * @returns {{appId: number, flags: number, name: string|null}|null}
 */
function deuteManifest(text) {
  const t = String(text || '');
  const appId = Number((t.match(/"appid"\s*"(\d+)"/i) || [])[1]);
  if (!Number.isFinite(appId) || appId <= 0) return null;
  return {
    appId,
    flags: Number((t.match(/"StateFlags"\s*"(\d+)"/i) || [])[1]),
    name: (t.match(/"name"\s*"([^"]*)"/i) || [])[1] || null,
  };
}

/** Alle Orte, an denen Manifeste liegen koennen. */
async function manifestOrdner() {
  const steam = await steamOrdner();
  if (!steam) return [];

  const eigener = path.join(steam, 'steamapps');
  const datei = path.join(eigener, 'libraryfolders.vdf');
  let weitere = [];
  try {
    weitere = bibliotheken(await fsp.readFile(datei, 'utf8')).map((p) => path.join(p, 'steamapps'));
  } catch (err) {
    // Keine Datei, keine zweite Bibliothek - der eigene Ordner bleibt.
    logger.debug('libraryfolders.vdf nicht lesbar: ' + err.message);
  }

  /*
   * Der Steam-Ordner selbst steht in der Datei ueblicherweise mit drin - aber
   * nicht unbedingt gleich geschrieben: Die Registry liefert hier
   * "d:\programme\steam_programm", die VDF-Datei "D:\Programme\Steam_Programm".
   * Ein Set ueber die Pfade haette ihn deshalb zweimal gehalten und jedes
   * Manifest dieser Bibliothek doppelt gelesen. Windows unterscheidet keine
   * Gross- und Kleinschreibung in Pfaden, also wird klein verglichen und der
   * erste Schreibweise behalten.
   */
  const gesehen = new Set();
  const raus = [];
  for (const roh of [eigener, ...weitere]) {
    const p = path.normalize(roh);
    const schluessel = p.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    if (fs.existsSync(p)) raus.push(p);
  }
  return raus;
}

/**
 * Die AppIDs aller fertig installierten Spiele.
 *
 * @returns {Promise<Set<number>>} leer, wenn Steam nicht gefunden wird - dann
 *   gibt es eben keine gruenen Balken, aber keinen Fehler.
 */
async function installierteAppIds() {
  const ordner = await manifestOrdner();
  const fertig = new Set();
  let gesehen = 0;

  for (const ort of ordner) {
    let dateien = [];
    try {
      dateien = (await fsp.readdir(ort)).filter((d) => /^appmanifest_\d+\.acf$/i.test(d));
    } catch (err) {
      continue;
    }
    for (const d of dateien) {
      gesehen += 1;
      try {
        const m = deuteManifest(await fsp.readFile(path.join(ort, d), 'utf8'));
        if (m && istFertig(m.flags)) fertig.add(m.appId);
      } catch (err) {
        /* ein unlesbares Manifest ist kein Grund, die uebrigen zu verwerfen */
      }
    }
  }

  logger.debug(
    `Installiert: ${fertig.size} von ${gesehen} Manifesten in ${ordner.length} Bibliothek(en)`
  );
  return fertig;
}

module.exports = {
  FERTIG,
  istFertig,
  bibliotheken,
  deuteManifest,
  manifestOrdner,
  installierteAppIds,
};
