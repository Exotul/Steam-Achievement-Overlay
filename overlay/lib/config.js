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
 * Liest eine Konfigurationsdatei im Format ZEILE=WERT.
 *
 * Bewusst selbst gemacht statt über dotenv: Diese Funktion wird von den Tests
 * geprüft, und die sollen ohne installierte Abhängigkeiten laufen. Das Format
 * ist einfach genug, dass sich der Aufwand lohnt.
 *
 * Bereits gesetzte Umgebungsvariablen werden NICHT überschrieben - so lässt
 * sich beim Entwickeln etwas per Kommandozeile vorgeben.
 */
function leseKonfigDatei(datei) {
  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch (err) {
    return 0;
  }

  let gesetzt = 0;
  for (const rohzeile of inhalt.split(/\r?\n/)) {
    const zeile = rohzeile.trim();
    if (!zeile || zeile.startsWith('#')) continue;

    const trenner = zeile.indexOf('=');
    if (trenner < 1) continue;

    const name = zeile.slice(0, trenner).trim();
    let wert = zeile.slice(trenner + 1).trim();

    // Anführungszeichen abstreifen - ein häufiger Stolperstein beim
    // Eintragen des Steam-Schlüssels.
    if (
      (wert.startsWith('"') && wert.endsWith('"')) ||
      (wert.startsWith("'") && wert.endsWith("'"))
    ) {
      wert = wert.slice(1, -1);
    }

    if (process.env[name] === undefined) {
      process.env[name] = wert;
      gesetzt += 1;
    }
  }
  return gesetzt;
}

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
  leseKonfigDatei(datei);

  return { quelle: datei, uebernommen, benutzerConfig: BENUTZER_CONFIG };
}

module.exports = { ladeKonfiguration, leseKonfigDatei, BENUTZER_CONFIG, BENUTZER_ORDNER };
