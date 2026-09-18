const { app } = require('electron');

/**
 * Automatischer Start beim Hochfahren.
 *
 * Verwendet die Bordmittel des Betriebssystems (unter Windows den
 * Autostart-Eintrag in der Registrierung, unter macOS die Anmeldeobjekte) -
 * es wird nichts Eigenes ins System geschrieben, und die Einstellung lässt
 * sich jederzeit über die Einstellungen oder in den Systemeinstellungen
 * wieder entfernen.
 *
 * ZWEI FEHLER, DIE HIER LANGE DRINSTECKTEN (beide an der Registrierung
 * nachgemessen, nicht vermutet):
 *
 * 1. `setEnabled` schrieb mit `args: ['--hidden']`, `isEnabled` las OHNE
 *    `args`. Electron vergleicht beim Lesen aber die Argumente mit - die
 *    Abfrage konnte den eigenen Eintrag also nie finden:
 *
 *        nur path              -> openAtLogin = false
 *        path + ['--hidden']   -> openAtLogin = true
 *
 *    Der Schalter stand deshalb immer auf "aus", auch wenn die App beim
 *    Hochfahren startete. Deshalb gibt es jetzt `eintrag()`: eine Stelle,
 *    die beschreibt, wie der Eintrag aussieht - Schreiben und Lesen benutzen
 *    dieselbe.
 *
 * 2. In der Entwicklungsfassung stand im Eintrag
 *
 *        ...\electron\dist\electron.exe --hidden
 *
 *    also blankes Electron OHNE die App, die es laden soll. Beim Hochfahren
 *    ging dadurch Electrons eigenes Standardfenster auf statt des Overlays.
 *    Der Autostart "funktionierte" - nur eben für das falsche Programm.
 */

const SUPPORTED = process.platform === 'win32' || process.platform === 'darwin';

// Ohne eigenen Namen heißt der Eintrag "electron.app.Electron" - so steht er
// dann auch im Autostart-Verzeichnis von Windows, und niemand weiß, wozu er
// gehört.
const EINTRAG_NAME = 'Trophäenschrank';

function isAvailable() {
  return SUPPORTED;
}

/**
 * Die Argumente des Autostart-Eintrags - an genau EINER Stelle.
 *
 * Gepackt genügt `--hidden`: Die Programmdatei weiß selbst, welche App sie
 * lädt. In der Entwicklung ist `electron.exe` ein leerer Wirt und braucht
 * den Pfad zur App, sonst startet es sich selbst.
 */
function autostartArgs() {
  return app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'];
}

function eintrag() {
  return { path: process.execPath, args: autostartArgs(), name: EINTRAG_NAME };
}

/** Wird die App aktuell beim Hochfahren gestartet? */
function isEnabled() {
  if (!SUPPORTED) return false;
  try {
    const stand = app.getLoginItemSettings(eintrag());
    if (stand.openAtLogin === true) return true;

    // In der Entwicklungsfassung steht der Pfad zur App als Positionsargument
    // im Befehl. Electron vergleicht beim Lesen nur Schalter (alles mit
    // führenden Strichen), `openAtLogin` bleibt deshalb dort immer false -
    // nachgemessen mit allen sechs Lesevarianten. Dort zählt die gröbere,
    // aber ehrliche Auskunft: Startet diese Programmdatei beim Anmelden?
    if (!app.isPackaged) return stand.executableWillLaunchAtLogin === true;

    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Entfernt einen Eintrag in der alten Form: Vorgabename, ohne Pfad zur App.
 * Genau der startete blankes Electron beim Hochfahren.
 */
function entferneAlteForm() {
  try {
    app.setLoginItemSettings({
      openAtLogin: false,
      path: process.execPath,
      args: ['--hidden'],
    });
  } catch (err) {
    /* Nicht kritisch - im schlimmsten Fall bleibt ein alter Eintrag stehen. */
  }
}

function setEnabled(enabled) {
  if (!SUPPORTED) return false;
  try {
    // Erst die alte Form weg, sonst stehen zwei Einträge da und beim
    // Hochfahren gingen zwei Programme auf.
    entferneAlteForm();
    app.setLoginItemSettings({ openAtLogin: enabled, ...eintrag() });
    return true;
  } catch (err) {
    console.error('Autostart konnte nicht gesetzt werden:', err.message);
    return false;
  }
}

/**
 * Schreibt einen bereits bestehenden Eintrag in der heutigen Form neu.
 *
 * Für alle, bei denen der Autostart schon eingeschaltet war, als er noch
 * kaputt war: Ohne das hier bliebe der Eintrag auf blankes Electron zeigen,
 * bis jemand den Schalter zufällig zweimal umlegt. Ist nichts eingeschaltet,
 * passiert nichts.
 *
 * @returns {boolean} true, wenn tatsächlich etwas umgeschrieben wurde
 */
function pflegeEintrag() {
  if (!SUPPORTED || !isEnabled()) return false;
  return setEnabled(true);
}

/**
 * Wurde die App gerade DURCH den Autostart hochgefahren?
 * Zwei Wege, weil `wasOpenedAtLogin` nur unter macOS zuverlaessig gefuellt ist.
 */
function wasAutoStarted() {
  if (process.argv.includes('--hidden')) return true;
  if (!SUPPORTED) return false;
  try {
    return app.getLoginItemSettings().wasOpenedAtLogin === true;
  } catch (err) {
    return false;
  }
}

/**
 * Läuft die App gerade aus einer Entwicklungsumgebung heraus (npm start)?
 * Der Autostart zeigt dann auf den Projektordner - das funktioniert, hängt
 * aber daran, dass dieser Ordner liegen bleibt. Deshalb weisen wir darauf hin.
 */
function isDevelopmentBuild() {
  return !app.isPackaged;
}

module.exports = {
  isAvailable,
  isEnabled,
  setEnabled,
  pflegeEintrag,
  wasAutoStarted,
  isDevelopmentBuild,
};
