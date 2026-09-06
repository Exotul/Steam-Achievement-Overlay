const { dialog, shell } = require('electron');
const logger = require('./logger');

/**
 * Automatische Updates.
 *
 * Bewusste Entscheidungen:
 *  - **Kein stilles Einspielen.** Ein Update, das sich während einer
 *    Spielsitzung selbst installiert und die App neu startet, würde das
 *    Overlay mitten im Spiel abschalten. Heruntergeladen wird im Hintergrund,
 *    installiert erst nach ausdrücklicher Zustimmung - und der Hinweis kommt
 *    nicht, während gerade gespielt wird.
 *  - **Nur in der installierten Fassung.** In der Entwicklung (npm start)
 *    gibt es nichts zu aktualisieren; der Updater würde dort nur Fehler
 *    melden.
 *  - **Fehler sind kein Drama.** Ist die Update-Quelle nicht erreichbar,
 *    landet das im Protokoll und sonst nirgends. Eine App, die beim Start
 *    Fehlermeldungen über Updates zeigt, ist ärgerlicher als eine, die
 *    einfach weiterläuft.
 */

let autoUpdater = null;
let verfuegbareVersion = null;
let heruntergeladen = false;
let pruefungLaeuft = false;

// Wird von main.js gesetzt: liefert true, wenn gerade ein Spiel läuft.
let spieltGerade = () => false;

function init({ istInstalliert, spielLaeuftPruefung }) {
  if (spielLaeuftPruefung) spieltGerade = spielLaeuftPruefung;

  if (!istInstalliert) {
    logger.info('Updates: Entwicklungsfassung - Prüfung übersprungen');
    return false;
  }

  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (err) {
    logger.warn('Updates: electron-updater nicht verfügbar - ' + err.message);
    return false;
  }

  // Herunterladen ja, installieren nein - das entscheidet der Nutzer.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = {
    info: (m) => logger.info('Updates: ' + m),
    warn: (m) => logger.warn('Updates: ' + m),
    error: (m) => logger.error('Updates: ' + m),
    debug: () => {},
  };

  autoUpdater.on('update-available', (info) => {
    verfuegbareVersion = info?.version || null;
    logger.info(`Update verfügbar: ${verfuegbareVersion}`);
  });

  autoUpdater.on('update-not-available', () => {
    verfuegbareVersion = null;
  });

  autoUpdater.on('update-downloaded', (info) => {
    heruntergeladen = true;
    verfuegbareVersion = info?.version || verfuegbareVersion;
    logger.info(`Update ${verfuegbareVersion} heruntergeladen - wartet auf Zustimmung`);
    hinweisAnbieten();
  });

  autoUpdater.on('error', (err) => {
    // Nicht erreichbare Update-Quelle ist kein Grund, den Nutzer zu behelligen.
    logger.warn('Updates: Prüfung fehlgeschlagen - ' + (err?.message || err));
  });

  return true;
}

/** Fragt nach, sobald es passt - also nicht mitten im Spiel. */
function hinweisAnbieten() {
  if (!heruntergeladen) return;

  if (spieltGerade()) {
    // Später erneut versuchen. Ein Update ist nie so dringend, dass es eine
    // Spielsitzung unterbrechen dürfte.
    logger.info('Updates: Hinweis zurückgestellt, da gerade gespielt wird');
    setTimeout(hinweisAnbieten, 5 * 60 * 1000);
    return;
  }

  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update verfügbar',
      message: `Version ${verfuegbareVersion} ist bereit.`,
      detail:
        'Die neue Fassung wurde heruntergeladen und kann eingespielt werden.\n\n' +
        'Dabei startet die App kurz neu. Anmeldung, Einstellungen und Verlauf\n' +
        'bleiben erhalten - sie liegen außerhalb des Programmordners.',
      buttons: ['Jetzt neu starten', 'Später'],
      defaultId: 0,
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) {
        logger.info('Updates: wird eingespielt, App startet neu');
        autoUpdater.quitAndInstall(false, true);
      } else {
        logger.info('Updates: auf später verschoben');
      }
    });
}

/** Vom Tray-Menü aufgerufen: prüft und meldet immer zurück. */
async function jetztPruefen({ stillWennAktuell = false } = {}) {
  if (!autoUpdater) {
    if (!stillWennAktuell) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Updates',
        message: 'In dieser Fassung nicht verfügbar.',
        detail:
          'Automatische Updates gibt es nur in der installierten Fassung.\n' +
          'Hier läuft die App aus dem Projektordner (npm start).',
        buttons: ['OK'],
      });
    }
    return;
  }

  if (heruntergeladen) {
    hinweisAnbieten();
    return;
  }

  if (pruefungLaeuft) return;
  pruefungLaeuft = true;

  try {
    const ergebnis = await autoUpdater.checkForUpdates();
    const neu = ergebnis?.updateInfo?.version;
    const aktuell = require('electron').app.getVersion();

    if (!neu || neu === aktuell) {
      if (!stillWennAktuell) {
        dialog.showMessageBox({
          type: 'info',
          title: 'Updates',
          message: 'Alles aktuell.',
          detail: `Installierte Version: ${aktuell}`,
          buttons: ['OK'],
        });
      }
    } else if (!stillWennAktuell) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update gefunden',
        message: `Version ${neu} wird im Hintergrund geladen.`,
        detail: 'Sobald sie bereit ist, wird nachgefragt - nicht während des Spielens.',
        buttons: ['OK'],
      });
    }
  } catch (err) {
    if (!stillWennAktuell) {
      dialog.showMessageBox({
        type: 'warning',
        title: 'Updates',
        message: 'Die Prüfung ist fehlgeschlagen.',
        detail: `${err?.message || err}\n\nDetails stehen im Protokoll.`,
        buttons: ['OK'],
      });
    }
  } finally {
    pruefungLaeuft = false;
  }
}

function status() {
  return { verfuegbareVersion, heruntergeladen, aktiv: !!autoUpdater };
}

module.exports = { init, jetztPruefen, status };
