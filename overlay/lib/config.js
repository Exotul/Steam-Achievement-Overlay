const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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

/** Platzhalter, an dem die Schlüsselprüfung einen noch leeren Eintrag erkennt. */
const PLATZHALTER_SCHLUESSEL = 'DEIN_STEAM_API_KEY';

/**
 * Legt beim allerersten Start eine Konfiguration an.
 *
 * Warum das sein muss: Eine frisch installierte App hatte bisher GAR KEINE
 * Konfigurationsdatei - der Programmordner enthält bewusst keine `.env`,
 * sonst läge ein Steam-Schlüssel im öffentlichen Installer. Wer die App also
 * nicht selbst entwickelt hat, stand vor einer App, die nicht funktioniert,
 * und einer Fehlermeldung, die auf eine Datei verwies, die es nicht gab.
 *
 * Das Sitzungsgeheimnis wird dabei gleich zufällig erzeugt. Es hat mit Steam
 * nichts zu tun und niemand sollte sich dafür etwas ausdenken müssen - der
 * einzige Handgriff, der übrig bleibt, ist der persönliche Steam-Schlüssel.
 */
function erstelleVorlage() {
  const inhalt = [
    '# Konfiguration des Trophäenschranks.',
    '#',
    '# Diese Datei liegt bewusst AUSSERHALB des Programmordners, damit sie',
    '# ein Update übersteht. Beim Deinstallieren bleibt sie ebenfalls liegen.',
    '',
    '# Dein persönlicher Steam-Schlüssel. Kostenlos und in einer Minute zu',
    '# holen unter: https://steamcommunity.com/dev/apikey',
    '# Danach hier den Platzhalter ersetzen (ohne Anführungszeichen) und die',
    '# App neu starten.',
    `STEAM_API_KEY=${PLATZHALTER_SCHLUESSEL}`,
    '',
    '# Zufällig erzeugt, signiert die lokale Anmeldung. Nichts zu tun.',
    `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    '',
    '# Adresse, unter der Backend und Dashboard laufen.',
    'STEAM_APP_BASE_URL=http://localhost:3000',
    '',
  ].join('\n');

  fs.mkdirSync(BENUTZER_ORDNER, { recursive: true });
  fs.writeFileSync(BENUTZER_CONFIG, inhalt, 'utf8');
}

/** Fehlt der Steam-Schlüssel oder steht dort noch der Platzhalter? */
function schluesselFehlt() {
  const k = process.env.STEAM_API_KEY;
  return !k || k === PLATZHALTER_SCHLUESSEL || k === 'undefined';
}

/**
 * @param {string} programmOrdner - Ordner, in dem die alte .env liegen könnte
 * @returns {{quelle: string, uebernommen: boolean, neuAngelegt: boolean}}
 */
function ladeKonfiguration(programmOrdner) {
  const alteDatei = path.join(programmOrdner, '.env');
  let uebernommen = false;
  let neuAngelegt = false;

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

  // Weder das eine noch das andere: frische Installation.
  if (!fs.existsSync(BENUTZER_CONFIG) && !fs.existsSync(alteDatei)) {
    try {
      erstelleVorlage();
      neuAngelegt = true;
    } catch (err) {
      // Ohne Schreibrechte laeuft die App weiter, nur eben unkonfiguriert.
    }
  }

  const datei = fs.existsSync(BENUTZER_CONFIG) ? BENUTZER_CONFIG : alteDatei;
  leseKonfigDatei(datei);

  return { quelle: datei, uebernommen, neuAngelegt, benutzerConfig: BENUTZER_CONFIG };
}

module.exports = {
  ladeKonfiguration,
  leseKonfigDatei,
  erstelleVorlage,
  schluesselFehlt,
  PLATZHALTER_SCHLUESSEL,
  BENUTZER_CONFIG,
  BENUTZER_ORDNER,
};
