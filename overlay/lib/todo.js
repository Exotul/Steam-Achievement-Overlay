const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Merkliste: was in diesem Spiel noch aussteht.
 *
 * Zwei Arten von Einträgen:
 *
 *  - **Achievements** - über den Haken in der Übersicht gesetzt. Sie
 *    verschwinden von selbst, sobald sie errungen sind.
 *  - **Eigene Einträge** in drei Formen. Sie verschwinden NIE von selbst,
 *    denn niemand außer dem Schreibenden weiß, wann sie erledigt sind. Genau
 *    dafür gibt es sie: Manche Achievements verlangen etwas, das das Spiel
 *    selbst nicht mitzählt ("alle Audionotizen sammeln"), und wer sich dafür
 *    einen Merkzettel macht, will ihn beim nächsten Start wiederfinden.
 *
 *      `notiz`     - eine Zeile Text.
 *      `tracker`   - Text mit Zählerstand, etwa "Audionotizen 12 / 52".
 *                    Für alles, was das Spiel nicht selbst mitzählt.
 *      `abschnitt` - eine Überschrift, um längere Listen zu gliedern.
 *
 * Je Spiel eine eigene Liste - eine gemeinsame wäre nutzlos, weil beides
 * immer nur in seinem Spiel gilt.
 *
 * Die Datei liegt in `~/.trophaenschrank/` und damit AUSSERHALB des
 * Programmordners: Sie übersteht dadurch Updates, das Deinstallieren und
 * landet nie in einem Repository.
 *
 * Bewusst ohne Abhängigkeiten und mit getrennter reiner Logik: Die Datei darf
 * von Hand bearbeitet werden, und ein beschädigter Eintrag darf weder die
 * Einblendung zerlegen noch die App am Starten hindern.
 */

const ORDNER = process.env.DATA_DIR || path.join(os.homedir(), '.trophaenschrank');
const DATEI = path.join(ORDNER, 'merkliste.json');

// Mehr gleichzeitig einzublenden verdeckt das Spiel. Die Grenze ist keine
// Schikane, sondern verhindert, dass jemand versehentlich vierzig Einträge
// anhakt und danach nichts mehr sieht. Sie gilt für beide Arten zusammen.
const MAX_JE_SPIEL = 12;
const MAX_TEXT_LAENGE = 90;

const ARTEN = ['notiz', 'tracker', 'abschnitt'];

// Obergrenze für Zählerstände. Nicht willkürlich: Darüber passt die Zahl
// nicht mehr neben den Text, ohne die Einblendung zu sprengen.
const MAX_ZAHL = 99999;

const leer = () => ({ achievements: [], notizen: [] });

/** Eindeutige, kurze Kennung für eine Notiz. */
function neueId() {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function bereinigeText(roh) {
  // Zeilenumbrüche würden die einzeilige Einblendung sprengen.
  return String(roh == null ? '' : roh)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LAENGE);
}

/** Ganze, nicht negative Zahl in vernünftigen Grenzen - sonst der Ersatzwert. */
function bereinigeZahl(roh, ersatz = 0) {
  const n = Number(roh);
  if (!Number.isFinite(n)) return ersatz;
  return Math.min(MAX_ZAHL, Math.max(0, Math.round(n)));
}

/**
 * Bringt einen einzelnen eigenen Eintrag in Form.
 * Gibt null zurück, wenn nichts Brauchbares übrig bleibt.
 */
function bereinigeNotiz(roh, id) {
  if (!roh || typeof roh !== 'object') return null;

  // Einträge aus einer älteren Fassung haben keine Art - das waren Notizen.
  const art = ARTEN.includes(roh.art) ? roh.art : 'notiz';
  const text = bereinigeText(roh.text);
  if (!text) return null;

  if (art !== 'tracker') return { id, art, text };

  // Ein Ziel von 0 wäre eine Division durch null in der Anzeige und sagt
  // ohnehin nichts aus - dann ist es eine gewöhnliche Notiz.
  const ziel = bereinigeZahl(roh.ziel, 0);
  if (ziel <= 0) return { id, art: 'notiz', text };

  // Der Stand darf nie über dem Ziel liegen; sonst zeigt der Balken mehr als
  // voll und die Zahl widerspricht sich selbst.
  const stand = Math.min(ziel, bereinigeZahl(roh.stand, 0));
  return { id, art, text, stand, ziel };
}

/**
 * Bringt beliebigen Inhalt in die erwartete Form.
 *
 * Nimmt auch das ältere Format entgegen, in dem je Spiel nur eine Liste von
 * API-Namen stand. Es einfach zu verwerfen wäre der bequeme Weg gewesen -
 * aber dann wäre eine mühsam zusammengestellte Merkliste beim Update weg,
 * und das ist genau das, was hier nie passieren soll.
 */
function bereinige(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return {};

  const sauber = {};
  for (const [appId, wert] of Object.entries(roh)) {
    // Älteres Format: nur eine Liste von API-Namen.
    const eintrag = Array.isArray(wert) ? { achievements: wert, notizen: [] } : wert;
    if (!eintrag || typeof eintrag !== 'object') continue;

    const achievements = [];
    if (Array.isArray(eintrag.achievements)) {
      for (const name of eintrag.achievements) {
        if (typeof name !== 'string') continue;
        const sauberName = name.trim();
        if (sauberName && !achievements.includes(sauberName)) achievements.push(sauberName);
      }
    }

    const notizen = [];
    const gesehen = new Set();
    if (Array.isArray(eintrag.notizen)) {
      for (const notiz of eintrag.notizen) {
        if (!notiz || typeof notiz !== 'object') continue;
        // Eine Notiz ohne Kennung bekommt eine - sonst liesse sie sich weder
        // bearbeiten noch gezielt entfernen.
        let id =
          typeof notiz.id === 'string' && notiz.id.trim() ? notiz.id.trim() : neueId();
        while (gesehen.has(id)) id = neueId();

        const sauber = bereinigeNotiz(notiz, id);
        if (!sauber) continue;
        gesehen.add(id);
        notizen.push(sauber);
      }
    }

    if (achievements.length > 0 || notizen.length > 0) {
      sauber[String(appId)] = { achievements, notizen };
    }
  }
  return sauber;
}

/** Der Eintrag eines Spiels - immer vollständig, auch wenn es keinen gibt. */
function fuerSpiel(listen, appId) {
  const alle = bereinige(listen);
  const eintrag = alle[String(appId)];
  return eintrag ? { achievements: [...eintrag.achievements], notizen: [...eintrag.notizen] } : leer();
}

/** Wie viele Einträge insgesamt - beide Arten zusammen. */
function anzahl(listen, appId) {
  const e = fuerSpiel(listen, appId);
  return e.achievements.length + e.notizen.length;
}

function schreibeZurueck(alle, appId, eintrag) {
  const schluessel = String(appId);
  if (eintrag.achievements.length > 0 || eintrag.notizen.length > 0) alle[schluessel] = eintrag;
  else delete alle[schluessel];
  return alle;
}

/**
 * Setzt einen Achievement-Haken oder nimmt ihn weg.
 * @returns {{listen: object, geaendert: boolean, grund: string|null}}
 */
function setze(listen, appId, apiName, angehakt) {
  const alle = bereinige(listen);
  const eintrag = fuerSpiel(alle, appId);
  const name = String(apiName || '').trim();
  if (!name) return { listen: alle, geaendert: false, grund: 'leerer Name' };

  const drin = eintrag.achievements.includes(name);

  if (angehakt) {
    if (drin) return { listen: alle, geaendert: false, grund: null };
    if (anzahl(alle, appId) >= MAX_JE_SPIEL) {
      return {
        listen: alle,
        geaendert: false,
        grund: `Mehr als ${MAX_JE_SPIEL} gleichzeitig würden das Spiel verdecken.`,
      };
    }
    eintrag.achievements.push(name);
  } else {
    if (!drin) return { listen: alle, geaendert: false, grund: null };
    eintrag.achievements.splice(eintrag.achievements.indexOf(name), 1);
  }

  return { listen: schreibeZurueck(alle, appId, eintrag), geaendert: true, grund: null };
}

/**
 * Fügt einen eigenen Eintrag hinzu.
 *
 * @param {object|string} roh - `{ art, text, stand, ziel }`. Ein blosser Text
 *   wird als Notiz verstanden, damit ältere Aufrufe weiter funktionieren.
 * @returns {{listen: object, notiz: object|null, grund: string|null}}
 */
function notizHinzufuegen(listen, appId, roh, id = neueId()) {
  const alle = bereinige(listen);
  const eintrag = fuerSpiel(alle, appId);

  const vorlage = typeof roh === 'string' ? { art: 'notiz', text: roh } : roh;
  const notiz = bereinigeNotiz(vorlage, id);

  if (!notiz) return { listen: alle, notiz: null, grund: 'Der Eintrag ist leer.' };

  // Denselben Text nicht zweimal - das ist fast immer ein Doppelklick.
  // Überschriften sind davon ausgenommen: Dieselbe Gliederung kann in einer
  // langen Liste durchaus mehrfach vorkommen.
  if (
    notiz.art !== 'abschnitt' &&
    eintrag.notizen.some(
      (n) => n.art !== 'abschnitt' && n.text.toLowerCase() === notiz.text.toLowerCase()
    )
  ) {
    return { listen: alle, notiz: null, grund: 'Steht schon auf der Liste.' };
  }

  if (anzahl(alle, appId) >= MAX_JE_SPIEL) {
    return {
      listen: alle,
      notiz: null,
      grund: `Mehr als ${MAX_JE_SPIEL} gleichzeitig würden das Spiel verdecken.`,
    };
  }

  eintrag.notizen.push(notiz);
  return { listen: schreibeZurueck(alle, appId, eintrag), notiz, grund: null };
}

/**
 * Ändert einen bestehenden eigenen Eintrag.
 *
 * Warum überhaupt: Ein Zählerstand ändert sich staendig ("12 von 52
 * gefunden"), und ein Tippfehler in einer Überschrift wäre sonst nur durch
 * Löschen und Neuanlegen zu beheben. Die Kennung bleibt dabei erhalten,
 * damit die Reihenfolge in der Liste stehen bleibt.
 *
 * @returns {{listen: object, notiz: object|null, geaendert: boolean, grund: string|null}}
 */
function notizAendern(listen, appId, id, aenderung) {
  const alle = bereinige(listen);
  const eintrag = fuerSpiel(alle, appId);
  const stelle = eintrag.notizen.findIndex((n) => n.id === id);

  if (stelle === -1) {
    return { listen: alle, notiz: null, geaendert: false, grund: 'Eintrag nicht gefunden.' };
  }

  // Nur die übergebenen Felder ändern - wer den Zählerstand hochsetzt, will
  // nicht seinen Text verlieren.
  const neu = bereinigeNotiz({ ...eintrag.notizen[stelle], ...(aenderung || {}) }, id);
  if (!neu) {
    return { listen: alle, notiz: null, geaendert: false, grund: 'Der Eintrag wäre leer.' };
  }

  eintrag.notizen[stelle] = neu;
  return {
    listen: schreibeZurueck(alle, appId, eintrag),
    notiz: neu,
    geaendert: true,
    grund: null,
  };
}

/** Entfernt eine eigene Notiz - nur von Hand, nie von selbst. */
function notizEntfernen(listen, appId, id) {
  const alle = bereinige(listen);
  const eintrag = fuerSpiel(alle, appId);
  const vorher = eintrag.notizen.length;

  eintrag.notizen = eintrag.notizen.filter((n) => n.id !== id);
  if (eintrag.notizen.length === vorher) return { listen: alle, geaendert: false };

  return { listen: schreibeZurueck(alle, appId, eintrag), geaendert: true };
}

/**
 * Entfernt Achievements, die inzwischen erreicht wurden.
 *
 * Eigene Notizen bleiben ausdrücklich stehen: Ob eine Notiz erledigt ist,
 * weiß nur derjenige, der sie geschrieben hat. Sie automatisch zu entfernen,
 * weil zufällig ein Achievement fiel, würde genau die Arbeit vernichten, die
 * sich jemand gemacht hat.
 */
function entferneErreichte(listen, appId, erreichteApiNames) {
  const alle = bereinige(listen);
  const eintrag = fuerSpiel(alle, appId);
  const erreicht = new Set(erreichteApiNames || []);

  const entfernt = eintrag.achievements.filter((n) => erreicht.has(n));
  eintrag.achievements = eintrag.achievements.filter((n) => !erreicht.has(n));

  return { listen: schreibeZurueck(alle, appId, eintrag), entfernt };
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
  ORDNER,
  MAX_JE_SPIEL,
  MAX_TEXT_LAENGE,
  MAX_ZAHL,
  ARTEN,
  neueId,
  notizAendern,
  bereinige,
  fuerSpiel,
  anzahl,
  setze,
  notizHinzufuegen,
  notizEntfernen,
  entferneErreichte,
  laden,
  speichern,
};
