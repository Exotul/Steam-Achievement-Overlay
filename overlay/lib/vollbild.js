const { execFile } = require('child_process');

/**
 * Läuft gerade ein Spiel im EXKLUSIVEN Vollbild?
 *
 * WARUM DAS ZÄHLT (nachgemessen, nicht vermutet):
 *
 * Ein Spiel im exklusiven Vollbild besitzt den Bildschirm. Steams Overlay
 * funktioniert dort, weil es in das Spiel selbst eingeklinkt ist. Unsere
 * Fenster sind dagegen gewöhnliche Windows-Fenster. Erscheint eines davon
 * über einem solchen Spiel, verliert das Spiel sein exklusives Vollbild, und
 * Windows löst das durch Minimieren auf.
 *
 * Im Protokoll war das unverkennbar. Derselbe App-Stand, derselbe Tag:
 *
 *     Galaxy Burger (randlos)   Steams Overlay blieb 8,2 s und 5,7 s offen
 *     Dead Space (exklusiv)     elfmal hintereinander nach 0,4 s wieder zu
 *
 * Die 0,4 s sind genau die Zeit, bis unser Übersichtsfenster aufging, das
 * Spiel minimiert wurde und Steams Overlay mit ihm verschwand.
 *
 * WIE: Windows hat dafür eine eigene Abfrage, gedacht genau für Programme,
 * die wissen wollen, ob sie gerade stören dürfen:
 * SHQueryUserNotificationState. Sie meldet 3 (QUNS_RUNNING_D3D_FULL_SCREEN),
 * während Dead Space läuft - auch das an diesem Rechner nachgeprüft.
 *
 * Aufgerufen über PowerShell, weil das ohne native Abhängigkeit geht. Native
 * Module sind in diesem Projekt ausgeschlossen: Sie stürzen unter Electrons
 * eigener Node-Fassung ohne abfangbaren Fehler ab. PowerShell startet
 * unsichtbar (windowsHide) und öffnet kein Fenster - sonst würde genau die
 * Prüfung das auslösen, wovor sie schützen soll.
 */

// Bedeutung der Rückgabewerte laut Windows-Dokumentation.
const ZUSTAND = {
  1: 'gesperrt',
  2: 'vollbild', // Vollbild-Anwendung, aber nicht exklusiv (z. B. randlos, Präsentation)
  3: 'exklusiv', // QUNS_RUNNING_D3D_FULL_SCREEN
  4: 'praesentation',
  5: 'frei',
  6: 'ruhezeit',
  7: 'app',
};

const SKRIPT =
  "Add-Type -Namespace TS -Name Q -MemberDefinition '" +
  '[DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int s);' +
  "'; $s = 0; [void][TS.Q]::SHQueryUserNotificationState([ref]$s); $s";

/**
 * Deutet die Ausgabe der Abfrage.
 *
 * Eigene Funktion, weil das der Teil ist, der sich ohne Windows prüfen lässt -
 * und weil eine unerwartete Ausgabe (Fehlermeldung, leere Zeile) nicht als
 * "frei" durchgehen darf.
 *
 * @param {string} ausgabe - stdout von PowerShell
 * @returns {{code: number|null, zustand: string, exklusiv: boolean}}
 */
function deuteAusgabe(ausgabe) {
  const treffer = String(ausgabe || '').trim().match(/^(\d+)\s*$/m);
  const code = treffer ? Number(treffer[1]) : null;
  const zustand = code !== null && ZUSTAND[code] ? ZUSTAND[code] : 'unbekannt';
  return { code, zustand, exklusiv: code === 3 };
}

/**
 * Fragt Windows nach dem aktuellen Zustand.
 *
 * @returns {Promise<{code, zustand, exklusiv, dauerMs}>} - bei einem Fehler
 *   `zustand: 'unbekannt'` und `exklusiv: false`. Warum nicht vorsichtshalber
 *   true: Dann ginge die Übersicht auf manchen Rechnern nie mehr auf, und
 *   niemand wüsste warum. Ein Fehler hier steht im Protokoll.
 */
function abfragen() {
  const beginn = Date.now();
  return new Promise((fertig) => {
    if (process.platform !== 'win32') {
      fertig({ code: null, zustand: 'unbekannt', exklusiv: false, dauerMs: 0 });
      return;
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SKRIPT],
      { windowsHide: true, timeout: 5000 },
      (fehler, stdout) => {
        const dauerMs = Date.now() - beginn;
        if (fehler) {
          fertig({ code: null, zustand: 'unbekannt', exklusiv: false, dauerMs, fehler: fehler.message });
          return;
        }
        fertig({ ...deuteAusgabe(stdout), dauerMs });
      }
    );
  });
}

// Kurz gemerkt: Die Abfrage kostet einen PowerShell-Start. Wer die Übersicht
// mehrmals kurz hintereinander öffnet, soll nicht jedes Mal darauf warten.
// Eine Minute ist kurz genug, dass ein Umstellen des Anzeigemodus im Spiel
// spätestens beim übernächsten Öffnen greift.
const MERKDAUER_MS = 60 * 1000;
let gemerkt = null;

async function istExklusivesVollbild({ frisch = false } = {}) {
  if (!frisch && gemerkt && Date.now() - gemerkt.zeit < MERKDAUER_MS) return gemerkt.ergebnis;
  const ergebnis = await abfragen();
  gemerkt = { zeit: Date.now(), ergebnis };
  return ergebnis;
}

/** Beim Spielwechsel vergessen - ein anderes Spiel, ein anderer Modus. */
function vergessen() {
  gemerkt = null;
}

module.exports = { istExklusivesVollbild, vergessen, deuteAusgabe, abfragen };
