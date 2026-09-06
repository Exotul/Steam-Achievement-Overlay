const path = require('path');
const { app } = require('electron');

/**
 * Automatischer Start beim Hochfahren.
 *
 * Verwendet die Bordmittel des Betriebssystems (unter Windows den
 * Autostart-Eintrag in der Registrierung, unter macOS die Anmeldeobjekte) -
 * es wird nichts Eigenes ins System geschrieben, und die Einstellung lässt
 * sich jederzeit über das Tray-Menü oder in den Systemeinstellungen wieder
 * entfernen.
 *
 * Der Schalter `--hidden` sorgt dafür, dass die App beim Systemstart direkt
 * ins Tray geht, ohne Fenster aufzupoppen.
 */

const SUPPORTED = process.platform === 'win32' || process.platform === 'darwin';

function isAvailable() {
  return SUPPORTED;
}

/** Wird die App aktuell beim Hochfahren gestartet? */
function isEnabled() {
  if (!SUPPORTED) return false;
  try {
    return app.getLoginItemSettings({ path: process.execPath }).openAtLogin === true;
  } catch (err) {
    return false;
  }
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

function setEnabled(enabled) {
  if (!SUPPORTED) return false;
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // Beim Systemstart still ins Tray statt mit sichtbarem Fenster.
      args: enabled ? ['--hidden'] : [],
      // Unter Windows ist der Pfad zur ausfuehrbaren Datei noetig, damit der
      // Eintrag auch nach einem Update noch stimmt.
      path: process.platform === 'win32' ? process.execPath : undefined,
    });
    return true;
  } catch (err) {
    console.error('Autostart konnte nicht gesetzt werden:', err.message);
    return false;
  }
}

/**
 * Läuft die App gerade aus einer Entwicklungsumgebung heraus (npm start)?
 * Dann würde der Autostart-Eintrag auf die Electron-Hilfsdatei zeigen statt
 * auf ein richtiges Programm - das funktioniert zwar, ist aber nicht das,
 * was man erwartet. Deshalb weisen wir darauf hin.
 */
function isDevelopmentBuild() {
  return !app.isPackaged;
}

module.exports = { isAvailable, isEnabled, setEnabled, wasAutoStarted, isDevelopmentBuild };
