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
 *  - **Eigene Einträge** - frei geschriebene Notizen. Sie verschwinden NIE
 *    von selbst, denn niemand außer dem Schreibenden weiß, wann sie erledigt
 *    sind. Genau dafür gibt es sie: Manche Achievements verlangen etwas, das
 *    das Spiel selbst nicht mitzählt ("alle Audionotizen sammeln"), und wer
 *    sich dafür einen Merkzettel macht, will ihn beim nächsten Start
 *    wiederfinden und nicht neu schreiben.
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
        const text = bereinigeText(notiz.text);
        if (!text) continue;
        // Eine Notiz ohne Kennung bekommt eine - sonst liesse sie sich nicht
        // gezielt wieder entfernen.
        let id = typeof notiz.id === 'string' && notiz.id.trim() ? notiz.id.trim() : neueId();
        while (gesehen.has(id)) id = neueId();
        gesehen.add(id);
        notizen.push({ id, text });
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
 * Fügt eine eigene Notiz hinzu.
 * @returns {{listen: object, notiz: object|null, grund: string|null}}
 */
function notizHinzufuegen(listen, appId, text, id = neueId()) {
  const alle = bereinige(listen);
  const eintrag = fuerSpiel(alle, appId);
  const sauber = bereinigeText(text);

  if (!sauber) return { listen: alle, notiz: null, grund: 'Der Eintrag ist leer.' };

  // Denselben Text nicht zweimal - das ist fast immer ein Doppelklick.
  if (eintrag.notizen.some((n) => n.text.toLowerCase() === sauber.toLowerCase())) {
    return { listen: alle, notiz: null, grund: 'Steht schon auf der Liste.' };
  }

  if (anzahl(alle, appId) >= MAX_JE_SPIEL) {
    return {
      listen: alle,
      notiz: null,
      grund: `Mehr als ${MAX_JE_SPIEL} gleichzeitig würden das Spiel verdecken.`,
    };
  }

  const notiz = { id, text: sauber };
  eintrag.notizen.push(notiz);
  return { listen: schreibeZurueck(alle, appId, eintrag), notiz, grund: null };
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
  neueId,
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
