const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');

/**
 * Liegt unter dem Mauszeiger wirklich der Schrank - oder ein fremdes Fenster?
 *
 * WARUM ES DAS GIBT (nachgemessen, nicht vermutet):
 *
 * Der Klickfaenger ist ein gewoehnliches Fenster auf der obersten Ebene. Er
 * lag damit auch ueber einem Browser oder Editor, in dem gerade gearbeitet
 * wurde:
 *
 *     Faenger auf 'screen-saver', darunter ein fokussiertes Arbeitsfenster
 *     -> Faenger bekommt den Doppelklick, das Arbeitsfenster nichts
 *
 * Das ist genau dann passiert: Ein Doppelklick im Arbeitsfenster hat ein Spiel
 * gestartet, das irgendwo dahinter im Schrank stand.
 *
 * Die Abhilfe ist eine einzige Regel: Der Schrank reagiert nur dort, wo er
 * auch zu sehen ist. Dafuer muss man Windows fragen, welches Fenster unter dem
 * Zeiger liegt - und das oft, naemlich bei jeder anderen Packung und danach im
 * Takt, solange der Faenger offen steht.
 *
 * Deshalb ein DAUERLAUFENDES PowerShell-Skript statt eines Starts je Frage:
 * Ein Start kostet rund 200 ms und einen Prozess; so wird einmal gestartet und
 * danach je Zeile geantwortet. Native Module sind in diesem Projekt
 * ausgeschlossen (sie stuerzen unter Electrons Node-Fassung ohne abfangbaren
 * Fehler ab).
 */

const SKRIPT = path.join(__dirname, 'zeigerFenster.ps1');

// Fensterklassen, die zum Desktop gehoeren. Ueber dem Hintergrundbild liegt
// die Symbolliste; sie zaehlt mit, sonst waere der Schrank ausgerechnet dort
// tot, wo die Symbole stehen.
const DESKTOP = new Set(['Progman', 'WorkerW', 'SHELLDLL_DefView', 'SysListView32']);

/**
 * Deutet eine Antwortzeile des Skripts.
 *
 * Eigene Funktion, weil das der Teil ist, der sich ohne Windows pruefen laesst.
 *
 * @param {string} zeile - "<hwnd> <Klasse> <wurzel> <Klasse der Wurzel>"
 * @returns {{hwnd: number, klasse: string, wurzel: number, wurzelKlasse: string}|null}
 */
function deuteZeile(zeile) {
  const teile = String(zeile || '').trim().split(/\s+/);
  if (teile.length < 4) return null;
  const hwnd = Number(teile[0]);
  const wurzel = Number(teile[2]);
  if (!Number.isFinite(hwnd) || !Number.isFinite(wurzel)) return null;
  return { hwnd, klasse: teile[1], wurzel, wurzelKlasse: teile[3] };
}

/**
 * Darf der Schrank an dieser Stelle auf einen Klick warten?
 *
 * @param {object|null} antwort - aus deuteZeile()
 * @param {Array<number>} eigene - Fensternummern, die uns gehoeren (Schrank,
 *   Klickfaenger, das durchklickbare Meldungsfenster)
 * @returns {boolean} false auch bei fehlender oder unverstaendlicher Antwort -
 *   lieber kein Faenger als einer, der fremde Klicks schluckt.
 */
function istSchrankSichtbar(antwort, eigene = []) {
  if (!antwort) return false;
  const unsere = new Set((eigene || []).filter((h) => Number.isFinite(h)));
  if (unsere.has(antwort.hwnd) || unsere.has(antwort.wurzel)) return true;
  return DESKTOP.has(antwort.klasse) || DESKTOP.has(antwort.wurzelKlasse);
}

let prozess = null;
let bereit = false;
let warteschlange = [];
let puffer = '';
let gemeldet = false;
/*
 * Wie viele Antworten noch kommen, auf die niemand mehr wartet.
 *
 * DER FEHLER, DEN DAS BEHEBT: Eine Frage, die in die Zeitgrenze lief, wurde
 * aus der Schlange genommen - ihre Antwort kam aber trotzdem und landete beim
 * NAECHSTEN Frager. Von da an war jede Antwort eine zu alt, und der
 * Klickfaenger entschied anhand einer Zeigerposition von vorhin. Antworten
 * kommen in der Reihenfolge der Fragen, also laesst sich das genau abzaehlen.
 */
let ueberspringen = 0;

function beende() {
  if (prozess) {
    try {
      prozess.kill();
    } catch (err) {
      /* egal */
    }
  }
  prozess = null;
  bereit = false;
  ueberspringen = 0;
  puffer = '';
  // Offene Fragen beantworten, sonst wartet der Aufrufer ewig.
  warteschlange.splice(0).forEach((f) => f(null));
}

// Nach einem Fehlstart nicht sofort wieder versuchen: Sonst startet jede
// Mausbewegung einen neuen Prozess, der ebenfalls scheitert.
const RUHE_NACH_FEHLER_MS = 30 * 1000;
let letzterFehler = 0;

function starte() {
  if (prozess) return;
  if (Date.now() - letzterFehler < RUHE_NACH_FEHLER_MS) return;
  let skript;
  try {
    skript = fs.readFileSync(SKRIPT, 'utf8');
  } catch (err) {
    letzterFehler = Date.now();
    if (!gemeldet) {
      logger.warn('Zeigerpruefung nicht moeglich: ' + err.message);
      gemeldet = true;
    }
    return;
  }

  prozess = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', skript],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  );

  prozess.stdout.setEncoding('utf8');
  prozess.stdout.on('data', (stueck) => {
    puffer += stueck;
    let bruch;
    while ((bruch = puffer.indexOf('\n')) >= 0) {
      const zeile = puffer.slice(0, bruch).trim();
      puffer = puffer.slice(bruch + 1);
      if (!zeile) continue;
      if (zeile === 'BEREIT') {
        bereit = true;
        continue;
      }
      // Die Antwort auf eine Frage, die niemand mehr hoert, wegwerfen - sonst
      // bekaeme sie der naechste Frager, und der fragt nach einer anderen
      // Zeigerposition.
      if (ueberspringen > 0) {
        ueberspringen -= 1;
        continue;
      }
      const naechster = warteschlange.shift();
      if (naechster) naechster(deuteZeile(zeile));
    }
  });

  prozess.on('error', (err) => {
    letzterFehler = Date.now();
    if (!gemeldet) {
      logger.warn('Zeigerpruefung konnte nicht starten: ' + err.message);
      gemeldet = true;
    }
    beende();
  });
  prozess.on('exit', () => beende());
}

/**
 * Fragt, was gerade unter dem Zeiger liegt.
 *
 * @returns {Promise<object|null>} null, wenn die Pruefung nicht laeuft oder
 *   nicht rechtzeitig antwortet.
 */
function unterZeiger() {
  starte();
  if (!prozess || !bereit) return Promise.resolve(null);

  return new Promise((fertig) => {
    let erledigt = false;
    const antworte = (wert) => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(uhr);
      fertig(wert);
    };
    // Eine Antwort, die zu spaet kommt, ist wertlos: Der Zeiger steht dann
    // woanders. Lieber "weiss nicht" - dann geht der Faenger nicht auf.
    const uhr = setTimeout(() => {
      // Den Platz in der Schlange raeumen - und merken, dass noch eine
      // Antwort unterwegs ist, die niemand mehr hoeren will.
      const i = warteschlange.indexOf(antworte);
      if (i >= 0) {
        warteschlange.splice(i, 1);
        ueberspringen += 1;
      }
      antworte(null);
    }, 400);

    warteschlange.push(antworte);
    try {
      prozess.stdin.write('?\n');
    } catch (err) {
      antworte(null);
    }
  });
}

/** Laeuft die Pruefung? Fuer die Diagnose. */
function laeuft() {
  return !!prozess && bereit;
}

module.exports = { DESKTOP, deuteZeile, istSchrankSichtbar, unterZeiger, beende, laeuft };
