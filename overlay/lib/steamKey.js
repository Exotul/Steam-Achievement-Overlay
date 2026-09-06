const fs = require('fs');
const path = require('path');
const https = require('https');

const { BENUTZER_CONFIG, BENUTZER_ORDNER, PLATZHALTER_SCHLUESSEL } = require('./config');

/**
 * Entgegennahme und Ablage des persoenlichen Steam-Schluessels.
 *
 * Warum es das gibt: Der Schluessel laesst sich nicht mitliefern - er ist
 * geheim und haengt am Steam-Konto dessen, der ihn geholt hat. Frueher musste
 * ihn jeder von Hand in eine Textdatei schreiben; wer die App nur benutzen
 * und nicht bauen wollte, ist daran gescheitert.
 *
 * WAS HIER MIT DEM SCHLUESSEL PASSIERT - und was ausdruecklich nicht:
 *  - Er wird in EINE Datei geschrieben: ~/.trophaenschrank/config.env,
 *    auf diesem Rechner, im Benutzerordner.
 *  - Er geht an genau eine Adresse: api.steampowered.com, also an Steam
 *    selbst. Dorthin muss er, sonst kann man mit ihm nichts abfragen.
 *  - Er wird nirgends sonst hingeschickt, an keinen Server der App (es gibt
 *    keinen), und er landet nicht im Protokoll: logger.js entfernt
 *    32-stellige Hexfolgen aus jeder Zeile, auch ohne Beschriftung davor.
 *  - Er wird nicht zwischengespeichert. Der Zwischenspeicher der App haelt
 *    Achievement-Daten, keine Zugangsdaten.
 */

const SCHLUESSEL_MUSTER = /^[0-9A-Fa-f]{32}$/;

/** Sieht die Eingabe ueberhaupt wie ein Steam-Schluessel aus? */
function formatPruefen(schluessel) {
  const s = String(schluessel || '').trim();
  if (s.length === 0) return { ok: false, grund: 'Es wurde nichts eingegeben.' };
  if (s === PLATZHALTER_SCHLUESSEL) {
    return { ok: false, grund: 'Das ist noch der Platzhalter, nicht dein Schlüssel.' };
  }
  if (!SCHLUESSEL_MUSTER.test(s)) {
    return {
      ok: false,
      grund:
        `Ein Steam-Schlüssel besteht aus genau 32 Zeichen (0-9 und A-F). ` +
        `Eingegeben wurden ${s.length}. Wurde beim Kopieren etwas mitgenommen ` +
        `oder abgeschnitten?`,
    };
  }
  return { ok: true, schluessel: s };
}

/**
 * Setzt den Schluessel in einen bestehenden Konfigurationstext ein.
 *
 * Bewusst als reine Textfunktion ohne Dateizugriff: So laesst sie sich ohne
 * Abhaengigkeiten pruefen. Alles andere in der Datei bleibt unangetastet -
 * Kommentare, Reihenfolge, andere Einstellungen. Eine Konfiguration ist
 * nichts, das man beim Speichern neu erfinden darf.
 */
function setzeSchluesselInText(text, schluessel) {
  const zeilen = String(text == null ? '' : text).split(/\r?\n/);
  let ersetzt = false;

  const neu = zeilen.map((zeile) => {
    // Nur echte Zuweisungen anfassen, keine auskommentierten Beispiele.
    if (/^\s*STEAM_API_KEY\s*=/.test(zeile)) {
      ersetzt = true;
      return `STEAM_API_KEY=${schluessel}`;
    }
    return zeile;
  });

  if (ersetzt) return neu.join('\n');

  // Keine Zeile vorhanden - anhaengen, ohne eine Leerzeile zu verdoppeln.
  const rumpf = neu.join('\n').replace(/\s+$/, '');
  return `${rumpf}\n\nSTEAM_API_KEY=${schluessel}\n`;
}

/**
 * Schreibt den Schluessel in die Konfiguration.
 *
 * Erst in eine Nebendatei, dann umbenennen - genau wie die uebrige Ablage der
 * App. Ein Absturz mitten im Schreiben laesst dadurch nie eine halbe
 * Konfiguration zurueck, sondern die bisherige unversehrt.
 */
function speichereSchluessel(schluessel, datei = BENUTZER_CONFIG) {
  let vorhanden = '';
  try {
    vorhanden = fs.readFileSync(datei, 'utf8');
  } catch (err) {
    vorhanden = '';
  }

  const inhalt = setzeSchluesselInText(vorhanden, schluessel);

  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, inhalt, 'utf8');
  fs.renameSync(tmp, datei);

  // Damit der gerade gestartete Vorgang ihn ohne Neustart benutzen kann.
  process.env.STEAM_API_KEY = schluessel;
  return datei;
}

/**
 * Fragt Steam, ob der Schluessel akzeptiert wird.
 *
 * Bewusst mit Bordmitteln statt axios: Die Overlay-App hat absichtlich fast
 * keine Abhaengigkeiten, und fuer eine einzelne Anfrage lohnt keine.
 *
 * Der Schluessel geht dabei an Steam - und nur dorthin. Ohne diese Pruefung
 * wuerde ein Tippfehler erst viel spaeter auffallen, naemlich als
 * unverstaendlicher Anmeldefehler.
 */
function beiSteamPruefen(schluessel, { timeoutMs = 8000 } = {}) {
  return new Promise((auf) => {
    const url =
      'https://api.steampowered.com/ISteamWebAPIUtil/GetSupportedAPIList/v1/?key=' +
      encodeURIComponent(schluessel);

    const anfrage = https.get(url, (antwort) => {
      antwort.resume(); // Inhalt interessiert nicht, nur der Statuscode
      const code = antwort.statusCode;
      if (code === 200) return auf({ ok: true });
      if (code === 403) {
        return auf({
          ok: false,
          grund:
            'Steam lehnt diesen Schlüssel ab. Er ist ungültig, wurde ' +
            'zurückgezogen, oder beim Kopieren ist etwas verlorengegangen.',
        });
      }
      auf({ ok: false, grund: `Steam antwortet unerwartet (HTTP ${code}).`, unklar: true });
    });

    anfrage.setTimeout(timeoutMs, () => {
      anfrage.destroy();
      auf({
        ok: false,
        unklar: true,
        grund: 'Steam antwortet nicht. Besteht gerade eine Internetverbindung?',
      });
    });

    anfrage.on('error', (err) => {
      auf({
        ok: false,
        unklar: true,
        grund: `Steam ist nicht erreichbar (${err.code || err.message}).`,
      });
    });
  });
}

module.exports = {
  SCHLUESSEL_MUSTER,
  formatPruefen,
  setzeSchluesselInText,
  speichereSchluessel,
  beiSteamPruefen,
  BENUTZER_CONFIG,
  BENUTZER_ORDNER,
};
