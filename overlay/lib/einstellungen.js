const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Einstellungen, die sich zur Laufzeit ändern lassen.
 *
 * Warum eine eigene Datei und nicht `config.env`: Dort stehen Dinge, die beim
 * Start einmal gelesen werden - Schlüssel, Adressen, Abfrageintervalle. Diese
 * hier ändert man im laufenden Betrieb und will die Wirkung sofort sehen. Ein
 * eigenes Format dafür ist ehrlicher als eine Datei, die beides vermischt.
 *
 * Sie liegt im selben Benutzerordner wie alles andere und übersteht damit
 * Updates und das Deinstallieren.
 *
 * `bereinige()` ist bewusst eine reine Funktion ohne Dateizugriff: Die Werte
 * kommen aus einer Datei, die jeder von Hand bearbeiten kann, und aus einem
 * Fenster. Beides kann Unsinn liefern, und ein unsinniger Wert darf die
 * Anzeige nicht zerlegen - eine Größe von 0 macht das Overlay unsichtbar,
 * eine Anzeigedauer von 0 lässt Meldungen nie erscheinen.
 */

const ORDNER = process.env.DATA_DIR || path.join(os.homedir(), '.trophaenschrank');
const DATEI = path.join(ORDNER, 'einstellungen.json');

const POSITIONEN = ['oben-rechts', 'oben-links', 'unten-rechts', 'unten-links'];
const ABZEICHEN = ['steam-overlay', 'spiel', 'aus'];

// Grenzen, innerhalb derer ein Wert noch sinnvoll ist. Sie sind nicht
// Geschmackssache, sondern verhindern eine unbedienbare App.
const GRENZEN = {
  groesse: { min: 0.6, max: 1.6 },
  anzeigeDauerSek: { min: 3, max: 30 },
  spielStartDauerSek: { min: 5, max: 90 },
  lautstaerke: { min: 0, max: 1 },
  merklisteGroesse: { min: 0.6, max: 1.6 },
  abzeichenGroesse: { min: 0.6, max: 1.6 },
};

/**
 * Standardwerte. Wo es früher schon eine Umgebungsvariable gab, gilt sie
 * weiterhin als Vorgabe - sonst würde eine bestehende Einrichtung beim
 * Update stillschweigend andere Werte bekommen.
 */
function standard() {
  return {
    position: 'oben-rechts',
    // null = Hauptbildschirm. Eine feste Kennung wäre falsch: Monitore
    // können abgezogen werden, und dann läge das Overlay im Nirgendwo.
    bildschirm: null,
    groesse: 1,
    anzeigeDauerSek: 8.5,
    spielStartDauerSek: Number(process.env.GAME_TOAST_SECONDS) || 30,
    lautstaerke: 0.22,
    eigenerTon: null,
    statusAbzeichen: (process.env.STATUS_BADGE || 'steam-overlay').toLowerCase(),

    // --- Merkliste ---
    merklisteAktiv: true,
    merklisteGroesse: 1,

    // --- Status-Abzeichen unten rechts ---
    // Es zeigt Spielname, Trophaeenstand und das Tastenkuerzel. Eigene
    // Groesse, weil es eine andere Aufgabe hat als die Merkliste: Es soll im
    // Blick sein, ohne zu stoeren, waehrend die Merkliste lesbar sein muss.
    abzeichenGroesse: 1,

    // --- Achievement-Übersicht ---
    // Tastenkombination, die die Übersicht ein- und ausblendet. Leerer Text
    // schaltet sie ab. Steams eigenes Kürzel (Shift+Tab) lässt sich dafür
    // nicht verwenden - es gehört Steam, und ihm dazwischenzufunken würde
    // das Steam-Overlay selbst stören.
    panelTaste: 'Control+Shift+A',
    // Zusätzlich automatisch aufgehen, wenn Steams Overlay erkannt wird.
    panelBeiSteamOverlay: true,
  };
}

function zahlIn(wert, grenze, ersatz) {
  const n = Number(wert);
  if (!Number.isFinite(n)) return ersatz;
  return Math.min(grenze.max, Math.max(grenze.min, n));
}

/**
 * Macht aus beliebiger Eingabe einen vollständigen, benutzbaren Satz Werte.
 * Unbekannte Felder fallen weg, kaputte Werte werden auf den Standard oder
 * in die erlaubten Grenzen zurückgeholt.
 */
function bereinige(roh) {
  const s = standard();
  const e = roh && typeof roh === 'object' ? roh : {};

  return {
    position: POSITIONEN.includes(e.position) ? e.position : s.position,

    // Eine Bildschirmkennung ist eine Zahl. Alles andere (auch der Text
    // "null" aus einer handgeschriebenen Datei) heißt: Hauptbildschirm.
    bildschirm: Number.isFinite(Number(e.bildschirm)) && e.bildschirm !== null
      ? Number(e.bildschirm)
      : null,

    groesse: zahlIn(e.groesse, GRENZEN.groesse, s.groesse),
    anzeigeDauerSek: zahlIn(e.anzeigeDauerSek, GRENZEN.anzeigeDauerSek, s.anzeigeDauerSek),
    spielStartDauerSek: zahlIn(
      e.spielStartDauerSek,
      GRENZEN.spielStartDauerSek,
      s.spielStartDauerSek
    ),
    lautstaerke: zahlIn(e.lautstaerke, GRENZEN.lautstaerke, s.lautstaerke),

    // Ein leerer Text bedeutet "kein eigener Ton" - sonst würde die App
    // versuchen, eine Datei namens "" abzuspielen.
    eigenerTon:
      typeof e.eigenerTon === 'string' && e.eigenerTon.trim().length > 0
        ? e.eigenerTon.trim()
        : null,

    statusAbzeichen: ABZEICHEN.includes(e.statusAbzeichen) ? e.statusAbzeichen : s.statusAbzeichen,

    merklisteAktiv: e.merklisteAktiv === undefined ? s.merklisteAktiv : !!e.merklisteAktiv,
    merklisteGroesse: zahlIn(e.merklisteGroesse, GRENZEN.merklisteGroesse, s.merklisteGroesse),
    abzeichenGroesse: zahlIn(e.abzeichenGroesse, GRENZEN.abzeichenGroesse, s.abzeichenGroesse),

    // Ein leerer Text heisst ausdruecklich "kein Kuerzel" - deshalb hier
    // nicht auf die Vorgabe zurueckfallen, sonst liesse es sich nie
    // abschalten.
    panelTaste: typeof e.panelTaste === 'string' ? e.panelTaste.trim() : s.panelTaste,
    panelBeiSteamOverlay:
      e.panelBeiSteamOverlay === undefined ? s.panelBeiSteamOverlay : !!e.panelBeiSteamOverlay,
  };
}

/** Liest die Einstellungen. Fehlt oder klemmt die Datei: Standardwerte. */
function laden(datei = DATEI) {
  try {
    return bereinige(JSON.parse(fs.readFileSync(datei, 'utf8')));
  } catch (err) {
    // Weder eine fehlende noch eine beschädigte Datei ist ein Grund,
    // die App nicht zu starten.
    return standard();
  }
}

/**
 * Schreibt die Einstellungen - erst in eine Nebendatei, dann umbenennen,
 * wie die übrige Ablage der App. Gibt die tatsächlich gespeicherten (also
 * bereinigten) Werte zurück, damit das Fenster zeigen kann, was wirklich gilt.
 */
function speichern(werte, datei = DATEI) {
  const sauber = bereinige(werte);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sauber, null, 2), 'utf8');
  fs.renameSync(tmp, datei);
  return sauber;
}

module.exports = {
  DATEI,
  ORDNER,
  POSITIONEN,
  ABZEICHEN,
  GRENZEN,
  standard,
  bereinige,
  laden,
  speichern,
};
