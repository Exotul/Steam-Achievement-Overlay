const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Lädt die Konfiguration - und zwar bevorzugt aus dem Benutzerordner.
 *
 * Warum: Bisher lag die `.env` im Programmordner. Ein Update ersetzt diesen
 * Ordner, und damit wären Steam-API-Schlüssel und alle Einstellungen weg -
 * bei jedem Update aufs Neue. Die Konfiguration gehört deshalb dorthin, wo
 * auch Sitzungen, Zwischenspeicher und Verlauf liegen:
 *
 *     ~/.trophaenschrank/config.env
 *
 * Reihenfolge:
 *   1. `~/.trophaenschrank/config.env`  (maßgeblich, übersteht Updates)
 *   2. `.env` im Programmordner          (nur noch als Rückfallebene)
 *
 * Beim ersten Start wird eine vorhandene `.env` aus dem Programmordner
 * automatisch übernommen - niemand muss beim Umstieg etwas von Hand machen.
 */

const BENUTZER_ORDNER = process.env.DATA_DIR || path.join(os.homedir(), '.trophaenschrank');
const BENUTZER_CONFIG = path.join(BENUTZER_ORDNER, 'config.env');

/**
 * @param {string} programmOrdner - Ordner, in dem die alte .env liegen könnte
 * @returns {{quelle: string, uebernommen: boolean}}
 */
function ladeKonfiguration(programmOrdner) {
  const alteDatei = path.join(programmOrdner, '.env');
  let uebernommen = false;

  // Einmalige Übernahme: alte .env vorhanden, neue noch nicht.
  if (!fs.existsSync(BENUTZER_CONFIG) && fs.existsSync(alteDatei)) {
    try {
      fs.mkdirSync(BENUTZER_ORDNER, { recursive: true });
      fs.copyFileSync(alteDatei, BENUTZER_CONFIG);
      uebernommen = true;
    } catch (err) {
      // Übernahme fehlgeschlagen - dann eben weiter mit der alten Datei.
    }
  }

  const datei = fs.existsSync(BENUTZER_CONFIG) ? BENUTZER_CONFIG : alteDatei;
  require('dotenv').config({ path: datei, quiet: true });

  return { quelle: datei, uebernommen, benutzerConfig: BENUTZER_CONFIG };
}

module.exports = { ladeKonfiguration, BENUTZER_CONFIG, BENUTZER_ORDNER };
