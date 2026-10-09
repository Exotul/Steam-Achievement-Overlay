/**
 * Ein Fenster zum Desktop-Hintergrund machen.
 *
 * Windows zeichnet den Hintergrund in einem eigenen Fenster (WorkerW). Haengt
 * man sein eigenes Fenster dort hinein, wird es zum Hintergrundbild, und die
 * Desktop-Symbole bleiben davor sichtbar - so macht es auch Wallpaper Engine.
 * Die beiden noetigen Windows-Aufrufe stehen in hintergrundFenster.ps1;
 * warum ueber PowerShell und nicht ueber ein natives Modul, steht dort.
 *
 * WAS MAN DAFUER AUFGIBT: Ein Fenster hinter den Symbolen bekommt keine
 * Mausereignisse mehr - die gehen an den Desktop. Der Schrank braucht sie
 * aber ohnehin nicht: Der Hauptprozess meldet ihm die Zeigerposition.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const logger = require('./logger');

const SKRIPT = path.join(__dirname, 'hintergrundFenster.ps1');

/**
 * Wertet die Antwort des Skripts aus - ohne Prozessaufruf, damit genau das
 * sich pruefen laesst.
 *
 * @param {string} ausgabe
 * @returns {{ok: boolean, workerW: string|null, grund: string|null}}
 */
function deuteAntwort(ausgabe) {
  const zeilen = String(ausgabe || '')
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean);
  // Gezielt nach UNSERER Zeile suchen statt einfach die letzte zu nehmen:
  // PowerShell schiebt auf der Fehlerausgabe gern noch einen
  // Fortschrittsbericht in XML hinterher ("Module werden fuer erstmalige
  // Verwendung vorbereitet"). Der stand sonst am Ende und galt als Antwort -
  // das Umhaengen hatte laengst geklappt, und die App meldete einen Fehler.
  const antwort = [...zeilen].reverse().find((z) => /^(OK\s+\d+|GELOEST|FEHLER\b)/.test(z));
  if (!antwort) return { ok: false, workerW: null, grund: 'keine-antwort' };

  const treffer = antwort.match(/^OK\s+(\d+)$/);
  if (treffer) return { ok: true, workerW: treffer[1], grund: null };
  if (antwort === 'GELOEST') return { ok: true, workerW: null, grund: null };

  const fehler = antwort.match(/^FEHLER\s+(.*)$/);
  return { ok: false, workerW: null, grund: (fehler && fehler[1].trim()) || 'unbekannt' };
}

/**
 * Das Skript ausfuehren.
 *
 * Es wird EINGELESEN und als Text uebergeben, nicht als Datei gestartet: In
 * der installierten Fassung liegt es in app.asar, und daraus kann PowerShell
 * nichts starten - Node dagegen schon. Die Werte gehen ueber die Umgebung,
 * weil ein uebergebener Text keine Parameter kennt.
 */
function rufe(umgebung) {
  return new Promise((fertig) => {
    let skript;
    try {
      skript = fs.readFileSync(SKRIPT, 'utf8');
    } catch (err) {
      fertig({ ok: false, workerW: null, grund: 'skript-fehlt' });
      return;
    }
    // PowerShell erwartet den Text als UTF-16LE in Base64.
    const kodiert = Buffer.from(skript, 'utf16le').toString('base64');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', kodiert],
      { windowsHide: true, timeout: 15000, env: { ...process.env, ...umgebung } },
      (_fehler, stdout, stderr) => fertig(deuteAntwort((stdout || '') + '\n' + (stderr || '')))
    );
  });
}

/**
 * Haengt das Fenster hinter die Desktop-Symbole.
 * @param {Buffer} fensterKennung - aus BrowserWindow.getNativeWindowHandle()
 */
async function nachHinten(fensterKennung) {
  const hwnd = lesbareKennung(fensterKennung);
  if (!hwnd) return { ok: false, workerW: null, grund: 'keine-kennung' };

  const antwort = await rufe({ TS_FENSTER: hwnd, TS_LOESEN: '0' });
  if (!antwort.ok) logger.warn('Hintergrundmodus nicht moeglich: ' + antwort.grund);
  return antwort;
}

/** Nimmt das Fenster wieder aus dem Hintergrund heraus. */
async function zurueck(fensterKennung) {
  const hwnd = lesbareKennung(fensterKennung);
  if (!hwnd) return { ok: false, workerW: null, grund: 'keine-kennung' };
  return rufe({ TS_FENSTER: hwnd, TS_LOESEN: '1' });
}

/** Aus dem Puffer von Electron eine Zahl machen, die PowerShell versteht. */
function lesbareKennung(puffer) {
  try {
    if (!puffer || puffer.length < 4) return null;
    const wert = puffer.length >= 8 ? puffer.readBigUInt64LE(0) : BigInt(puffer.readUInt32LE(0));
    return wert === 0n ? null : wert.toString();
  } catch (err) {
    return null;
  }
}

/**
 * Der Nullpunkt des gesamten Bildschirmverbunds.
 *
 * WARUM DAS NOETIG IST: Nach dem Umhaengen zaehlen die Koordinaten des
 * Fensters nicht mehr vom Hauptbildschirm aus, sondern vom WorkerW - und das
 * deckt ALLE Bildschirme ab, mit Nullpunkt links oben. Wer einen Monitor
 * links vom Hauptbildschirm stehen hat, dessen Bildschirmkoordinaten sind
 * negativ; ohne diese Verschiebung laege der Schrank dann daneben.
 *
 * @param {Array<{bounds: {x: number, y: number}}>} bildschirme
 */
function nullpunkt(bildschirme) {
  return (bildschirme || []).reduce(
    (a, d) => ({ x: Math.min(a.x, d.bounds.x), y: Math.min(a.y, d.bounds.y) }),
    { x: 0, y: 0 }
  );
}

/** Die Lage, die ein Fenster im Hintergrundmodus bekommen muss. */
function lageImHintergrund(bildschirm, bildschirme) {
  const null0 = nullpunkt(bildschirme);
  return {
    x: bildschirm.bounds.x - null0.x,
    y: bildschirm.bounds.y - null0.y,
    width: bildschirm.bounds.width,
    height: bildschirm.bounds.height,
  };
}

module.exports = {
  SKRIPT,
  deuteAntwort,
  lesbareKennung,
  nullpunkt,
  lageImHintergrund,
  nachHinten,
  zurueck,
};
