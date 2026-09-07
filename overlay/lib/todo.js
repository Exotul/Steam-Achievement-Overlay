const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Merkliste: Achievements, die dauerhaft eingeblendet bleiben sollen.
 *
 * Je Spiel eine eigene Liste - eine gemeinsame wäre nutzlos, weil ein
 * Achievement immer nur in seinem Spiel erreichbar ist.
 *
 * Bewusst ohne Abhängigkeiten und mit getrennter reiner Logik: Die Datei
 * liegt im Benutzerordner und darf von Hand bearbeitet werden. Ein
 * beschädigter Eintrag darf die Einblendung nicht zerlegen und schon gar
 * nicht die App am Starten hindern.
 */

const ORDNER = process.env.DATA_DIR || path.join(os.homedir(), '.trophaenschrank');
const DATEI = path.join(ORDNER, 'merkliste.json');

// Mehr als das sinnvoll gleichzeitig einzublenden verdeckt das Spiel. Die
// Grenze ist keine Schikane, sondern verhindert, dass jemand versehentlich
// vierzig Einträge anhakt und danach nichts mehr sieht.
const MAX_JE_SPIEL = 12;

/**
 * Bringt beliebigen Inhalt in die Form { "<appId>": ["API_NAME", ...] }.
 * Alles, was nicht passt, fällt weg statt einen Fehler auszulösen.
 */
function bereinige(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};

  const sauber = {};
  for (const [appId, liste] of Object.entries(roh)) {
    if (!Array.isArray(liste)) continue;
    const namen = [];
    for (const eintrag of liste) {
      if (typeof eintrag !== 'string') continue;
      const name = eintrag.trim();
      // Doppelte still zusammenfassen - sie würden sonst doppelt erscheinen.
      if (name.length > 0 && !namen.includes(name)) namen.push(name);
      if (namen.length >= MAX_JE_SPIEL) break;
    }
    if (namen.length > 0) sauber[String(appId)] = namen;
  }
  return sauber;
}

/**
 * Setzt einen Eintrag oder entfernt ihn - reine Funktion, damit sich das
 * Verhalten an den Rändern (voll, doppelt, unbekannt) prüfen lässt.
 *
 * @returns {{listen: object, geaendert: boolean, grund: string|null}}
 */
function setze(listen, appId, apiName, angehakt) {
  const alle = bereinige(listen);
  const schluessel = String(appId);
  const name = String(apiName || '').trim();
  if (name.length === 0) return { listen: alle, geaendert: false, grund: 'leerer Name' };

  const liste = alle[schluessel] ? [...alle[schluessel]] : [];
  const drin = liste.includes(name);

  if (angehakt) {
    if (drin) return { listen: alle, geaendert: false, grund: null };
    if (liste.length >= MAX_JE_SPIEL) {
      return {
        listen: alle,
        geaendert: false,
        grund: `Mehr als ${MAX_JE_SPIEL} gleichzeitig würden das Spiel verdecken.`,
      };
    }
    liste.push(name);
  } else {
    if (!drin) return { listen: alle, geaendert: false, grund: null };
    liste.splice(liste.indexOf(name), 1);
  }

  if (liste.length > 0) alle[schluessel] = liste;
  else delete alle[schluessel];

  return { listen: alle, geaendert: true, grund: null };
}

/**
 * Entfernt Einträge, die inzwischen erreicht wurden.
 *
 * Sonst stünde eine erledigte Aufgabe für immer auf dem Bildschirm - und
 * genau in dem Moment, in dem sie erfüllt ist, will man sie verschwinden
 * sehen.
 */
function entferneErreichte(listen, appId, erreichteApiNames) {
  const alle = bereinige(listen);
  const schluessel = String(appId);
  const liste = alle[schluessel];
  if (!liste) return { listen: alle, entfernt: [] };

  const erreicht = new Set(erreichteApiNames || []);
  const bleibt = liste.filter((n) => !erreicht.has(n));
  const entfernt = liste.filter((n) => erreicht.has(n));

  if (bleibt.length > 0) alle[schluessel] = bleibt;
  else delete alle[schluessel];

  return { listen: alle, entfernt };
}

/** Liest die Merklisten. Fehlt oder klemmt die Datei: leere Listen. */
function laden(datei = DATEI) {
  try {
    return bereinige(JSON.parse(fs.readFileSync(datei, 'utf8')));
  } catch (err) {
    return {};
  }
}

/** Schreibt über eine Nebendatei, wie die übrige Ablage der App. */
function speichern(listen, datei = DATEI) {
  const sauber = bereinige(listen);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(sauber, null, 2), 'utf8');
  fs.renameSync(tmp, datei);
  return sauber;
}

module.exports = {
  DATEI,
  MAX_JE_SPIEL,
  bereinige,
  setze,
  entferneErreichte,
  laden,
  speichern,
};
