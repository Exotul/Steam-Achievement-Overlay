const fs = require('fs');
const path = require('path');

/**
 * Liest Steams lokalen Achievement-Zwischenspeicher.
 *
 * Steam legt die Achievement-Daten lokal ab, damit die APIs auch offline
 * funktionieren - das ist dieselbe Information, aus der der Steam-Client
 * sein eigenes Freischaltungs-Fenster speist. Sie steht also zum selben
 * Zeitpunkt zur Verfuegung.
 *
 * Das Dateiformat ist von Valve nicht zugesichert. Deshalb gilt hier eine
 * harte Regel, die den frueheren Fehler (Namenssuche in der Logdatei ->
 * Fehlalarme) strukturell ausschliesst:
 *
 *   Der Parser wird NUR dann als Quelle akzeptiert, wenn sein Ergebnis
 *   zuvor gegen den von der Web-API bestaetigten Stand geprueft wurde und
 *   exakt uebereinstimmt. Schlaegt diese Selbstpruefung fehl, wird das
 *   lokale Lesen automatisch abgeschaltet und es bleibt bei der Web-API.
 *
 * Es wird ausschliesslich gelesen.
 */

// --- Binaeres KeyValues-Format (Valve) --------------------------------------
// Typbytes: 0x00 verschachteltes Objekt, 0x01 Zeichenkette, 0x02 Int32,
// 0x03 Float32, 0x04 Zeiger, 0x05 Wide-String, 0x06 Farbe, 0x07 UInt64,
// 0x08 Ende des aktuellen Objekts.

function readCString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0x00) end += 1;
  if (end >= buf.length) return null;
  return { value: buf.toString('utf8', offset, end), next: end + 1 };
}

function parseBinaryKeyValues(buf, start = 0) {
  const root = {};
  const stack = [root];
  let offset = start;
  let guard = 0;

  while (offset < buf.length && stack.length > 0) {
    if (++guard > 2000000) break; // Sicherheitsnetz gegen Endlosschleifen
    const type = buf[offset];
    offset += 1;

    if (type === 0x08) {
      stack.pop();
      continue;
    }

    const key = readCString(buf, offset);
    if (!key) break;
    offset = key.next;
    const current = stack[stack.length - 1];

    switch (type) {
      case 0x00: {
        const child = {};
        current[key.value] = child;
        stack.push(child);
        break;
      }
      case 0x01: {
        const str = readCString(buf, offset);
        if (!str) return root;
        current[key.value] = str.value;
        offset = str.next;
        break;
      }
      case 0x02:
      case 0x06:
      case 0x04: {
        if (offset + 4 > buf.length) return root;
        current[key.value] = buf.readInt32LE(offset);
        offset += 4;
        break;
      }
      case 0x03: {
        if (offset + 4 > buf.length) return root;
        current[key.value] = buf.readFloatLE(offset);
        offset += 4;
        break;
      }
      case 0x07: {
        if (offset + 8 > buf.length) return root;
        current[key.value] = Number(buf.readBigUInt64LE(offset));
        offset += 8;
        break;
      }
      default:
        // Unbekannter Typ -> Format passt nicht, sauber abbrechen.
        return root;
    }
  }

  return root;
}

/**
 * Sucht rekursiv nach Achievement-Eintraegen. Steam verschachtelt die Daten
 * je nach Version unterschiedlich, deshalb wird nach der Struktur gesucht
 * statt einen festen Pfad anzunehmen.
 */
function collectUnlocked(node, out = new Set(), depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return out;

  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object') {
      // Ein Achievement-Eintrag erkennt man daran, dass er ein
      // "Achieved"-Feld enthaelt (Gross-/Kleinschreibung variiert).
      const achievedKey = Object.keys(value).find((k) => k.toLowerCase() === 'achieved');
      if (achievedKey !== undefined) {
        const achieved = Number(value[achievedKey]);
        if (achieved === 1) out.add(key);
        continue;
      }
      collectUnlocked(value, out, depth + 1);
    }
  }
  return out;
}


/**
 * Zweites, robusteres Leseverfahren.
 *
 * Beobachtung aus einer echten Aufzeichnung: Die Datei
 * appcache/stats/UserGameStats_<konto>_<appid>.bin waechst beim Freischalten
 * jeweils um etwa die Laenge eines Achievement-Namens (+22, +35, +48 Bytes).
 * Das legt nahe, dass dort die API-Namen der freigeschalteten Achievements
 * als Zeichenketten stehen.
 *
 * Statt ein Binaerformat zu unterstellen, werden hier alle lesbaren
 * Zeichenketten aus der Datei geholt und mit den bekannten API-Namen des
 * Spiels abgeglichen. Das ist unempfindlich gegen Formataenderungen.
 *
 * Sicher ist das nur deshalb, weil das Ergebnis anschliessend gegen den von
 * Steam bestaetigten Stand geprueft wird - passt es nicht exakt, wird es
 * verworfen.
 */
function extractStringsUnlocked(buf, knownApiNames) {
  if (!knownApiNames || knownApiNames.length === 0) return null;

  // Alle druckbaren ASCII-Folgen ab 3 Zeichen einsammeln.
  const found = new Set();
  let current = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 0x20 && b <= 0x7e) {
      current.push(b);
    } else {
      if (current.length >= 3) found.add(Buffer.from(current).toString('ascii'));
      current = [];
    }
  }
  if (current.length >= 3) found.add(Buffer.from(current).toString('ascii'));

  // Nur Namen behalten, die tatsaechlich Achievements dieses Spiels sind.
  const unlocked = new Set();
  for (const name of knownApiNames) {
    if (found.has(name)) {
      unlocked.add(name);
      continue;
    }
    // Namen koennen in laengeren Zeichenketten eingebettet sein.
    for (const f of found) {
      if (f.includes(name)) {
        unlocked.add(name);
        break;
      }
    }
  }

  return unlocked.size > 0 ? unlocked : null;
}


/**
 * Drittes Leseverfahren - das voraussichtlich passende.
 *
 * Erkenntnis aus einer echten Diagnose: In
 *   UserGameStatsSchema_<appid>.bin        stehen ALLE Achievement-Namen
 *   UserGameStats_<konto>_<appid>.bin      stehen KEINE Namen
 * Die Statusdatei verweist also ueber Nummern auf das Schema. Steam legt
 * Achievements als "Bits" innerhalb einer Statistik ab: Das Schema ordnet
 * jedem Bit einen API-Namen zu, die Statusdatei haelt den Zahlenwert, in dem
 * die entsprechenden Bits gesetzt sind.
 *
 * Dieses Verfahren liest deshalb beide Dateien zusammen.
 */

/**
 * Ist Bit Nummer `bitIndex` im Zahlenwert `value` gesetzt?
 *
 * Eigene Funktion, damit sich genau das pruefen laesst - der Zahlenwert kommt
 * aus einer Datei, deren Format Valve nicht zusichert, und die Vorzeichen
 * sind hier die Stolperfalle: Ein Int32 mit gesetztem obersten Bit erreicht
 * uns als NEGATIVE Zahl. Die frueher hier benutzte Rechnung mit Math.abs()
 * war dafuer falsch - aus -1 (alle 32 Bits gesetzt) wurde 1, womit Bit 31
 * faelschlich als geloescht galt und ein Achievement stumm verschwand.
 */
function bitGesetzt(value, bitIndex) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  // Negative Werte als vorzeichenlose 32-Bit-Zahl deuten.
  const roh = value < 0 ? value >>> 0 : value;
  if (bitIndex < 32) return ((roh >>> bitIndex) & 1) === 1;
  // Darueber hinaus (UInt64-Statistiken) bleibt nur die Division; bis Bit 52
  // rechnet JavaScript hier noch exakt.
  return Math.floor(roh / Math.pow(2, bitIndex)) % 2 === 1;
}

/** Baut aus der Schema-Datei die Zuordnung statId -> (bitNummer -> apiName). */
function parseSchemaBits(schemaBuf) {
  const parsed = parseBinaryKeyValues(schemaBuf);
  const map = new Map(); // statId (String) -> Map(bitIndex -> apiName)

  function walk(node, statId = null, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 10) return;

    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== 'object') continue;

      // "bits" enthaelt die einzelnen Achievements einer Statistik.
      if (key.toLowerCase() === 'bits' && statId !== null) {
        const bits = new Map();
        for (const [bitIndex, bitNode] of Object.entries(value)) {
          if (!bitNode || typeof bitNode !== 'object') continue;
          const nameKey = Object.keys(bitNode).find((k) => k.toLowerCase() === 'name');
          if (nameKey && typeof bitNode[nameKey] === 'string') {
            bits.set(Number(bitIndex), bitNode[nameKey]);
          }
        }
        if (bits.size > 0) map.set(String(statId), bits);
        continue;
      }

      // Zahlenschluessel auf dieser Ebene sind Statistik-IDs.
      const asNumber = Number(key);
      walk(value, Number.isFinite(asNumber) && key !== '' ? key : statId, depth + 1);
    }
  }

  walk(parsed);
  return map;
}

/**
 * Liest aus der Statusdatei die Zahlenwerte je Statistik-ID.
 *
 * Struktur laut echter Datei (nachgeprueft an einem Spielrechner):
 *   cache -> "<statId>" -> data = <Zahl>
 * Bei Achievement-Statistiken ist diese Zahl ein Bitfeld: Bit N gesetzt
 * bedeutet, dass das Achievement an Bit-Position N freigeschaltet ist.
 * Daneben steht optional AchievementTimes mit den Freischaltzeitpunkten.
 */
function parseStatValues(statsBuf) {
  const parsed = parseBinaryKeyValues(statsBuf);
  const values = new Map(); // statId -> Zahl

  function walk(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 10) return;
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== 'object') continue;

      // Ein Statistik-Eintrag: numerischer Schluessel mit einem "data"-Feld.
      const dataKey = Object.keys(value).find((k) => k.toLowerCase() === 'data');
      if (dataKey !== undefined && key !== '' && Number.isFinite(Number(key))) {
        const num = value[dataKey];
        if (typeof num === 'number') values.set(String(key), num);
      }
      walk(value, depth + 1);
    }
  }

  walk(parsed);
  return values;
}

/**
 * Liest die Freischaltzeitpunkte, falls vorhanden.
 * Struktur: cache -> "<statId>" -> AchievementTimes -> "<bit>" = Zeitstempel
 */
function parseAchievementTimes(statsBuf) {
  const parsed = parseBinaryKeyValues(statsBuf);
  const times = new Map(); // statId -> Map(bit -> Zeitstempel)

  function walk(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 10) return;
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== 'object') continue;
      const timesKey = Object.keys(value).find((k) => k.toLowerCase() === 'achievementtimes');
      if (timesKey !== undefined && Number.isFinite(Number(key))) {
        const inner = new Map();
        for (const [bit, ts] of Object.entries(value[timesKey])) {
          if (typeof ts === 'number') inner.set(Number(bit), ts);
        }
        if (inner.size > 0) times.set(String(key), inner);
      }
      walk(value, depth + 1);
    }
  }

  walk(parsed);
  return times;
}

/**
 * Kombiniert Schema und Status zu einer Menge freigeschalteter API-Namen.
 * Gibt null zurueck, wenn die Dateien nicht zusammenpassen.
 */
function readUnlockedViaSchema(statsFile, schemaFile) {
  let statsBuf;
  let schemaBuf;
  try {
    statsBuf = fs.readFileSync(statsFile);
    schemaBuf = fs.readFileSync(schemaFile);
  } catch (err) {
    return null;
  }

  const bitMap = parseSchemaBits(schemaBuf);
  if (bitMap.size === 0) return null;

  const values = parseStatValues(statsBuf);
  if (values.size === 0) return null;

  const unlocked = new Set();
  for (const [statId, bits] of bitMap.entries()) {
    const value = values.get(statId);
    if (typeof value !== 'number') continue;
    for (const [bitIndex, apiName] of bits.entries()) {
      // Bit gesetzt = Achievement freigeschaltet.
      if (bitGesetzt(value, bitIndex)) unlocked.add(apiName);
    }
  }

  return unlocked.size > 0 ? unlocked : null;
}

/** Findet die zum Spiel gehoerende Schema-Datei. */
function findSchemaFile(steamPath, appId) {
  const dir = path.join(steamPath, 'appcache', 'stats');
  const candidate = path.join(dir, `UserGameStatsSchema_${appId}.bin`);
  return fs.existsSync(candidate) ? candidate : null;
}

/** Kandidaten-Dateien fuer den lokalen Achievement-Zwischenspeicher. */
function findCandidateFiles(steamPath, appId) {
  const candidates = [];

  const appcacheStats = path.join(steamPath, 'appcache', 'stats');
  if (fs.existsSync(appcacheStats)) {
    try {
      fs.readdirSync(appcacheStats)
        // Die Schema-Datei enthaelt ALLE Achievement-Namen des Spiels und ist
        // deshalb kein Status - sie wuerde faelschlich wie "alles
        // freigeschaltet" aussehen. Sie wird separat als Nachschlagewerk
        // genutzt, nicht als Statusquelle.
        .filter((f) => !f.startsWith('UserGameStatsSchema_'))
        .filter((f) => f.includes(`_${appId}.bin`) || f.includes(`_${appId}_`))
        .forEach((f) => candidates.push(path.join(appcacheStats, f)));
    } catch (err) {
      /* egal */
    }
  }

  const userdataRoot = path.join(steamPath, 'userdata');
  if (fs.existsSync(userdataRoot)) {
    try {
      fs.readdirSync(userdataRoot).forEach((account) => {
        const statsDir = path.join(userdataRoot, account, String(appId), 'stats');
        if (!fs.existsSync(statsDir)) return;
        fs.readdirSync(statsDir).forEach((f) => candidates.push(path.join(statsDir, f)));
      });
    } catch (err) {
      /* egal */
    }
  }

  return candidates;
}

/**
 * Versucht, aus einer Datei die Menge der freigeschalteten Achievements zu
 * lesen. Gibt null zurueck, wenn die Datei nicht im erwarteten Format ist.
 */
function readUnlockedFromFile(filePath, knownApiNames = null) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (err) {
    return null;
  }
  if (buf.length < 8) return null;

  // Verfahren 2 zuerst, weil es unempfindlicher gegen Formataenderungen ist.
  if (knownApiNames) {
    const byStrings = extractStringsUnlocked(buf, knownApiNames);
    if (byStrings) return byStrings;
  }

  // Steam stellt den Daten je nach Version einen kurzen Kopf voran. Deshalb
  // mehrere plausible Startpunkte durchprobieren.
  for (const start of [0, 4, 8, 12, 16, 20, 24]) {
    try {
      const parsed = parseBinaryKeyValues(buf, start);
      const unlocked = collectUnlocked(parsed);
      if (unlocked.size > 0) return unlocked;
    } catch (err) {
      /* naechster Startpunkt */
    }
  }
  return null;
}

/**
 * Findet die passende Datei fuer ein Spiel und prueft das Ergebnis gegen den
 * von der Web-API bestaetigten Stand.
 *
 * @param {Set<string>} webUnlocked - von Steam bestaetigte Freischaltungen
 * @returns {{file: string, unlocked: Set<string>}|null} nur bei exakter Uebereinstimmung
 */
function findVerifiedSource(steamPath, appId, webUnlocked, knownApiNames = null) {
  const files = findCandidateFiles(steamPath, appId);
  const schemaFile = findSchemaFile(steamPath, appId);
  const attempts = [];

  // Die lokale Datei muss alles enthalten, was Steam bestaetigt hat.
  // Zusaetzlich darf sie bis zu zwei Eintraege MEHR haben: Direkt nach einem
  // Rechnerneustart ist die (serverseitig zwischengespeicherte) Web-API
  // manchmal noch nicht auf dem Stand der lokalen Datei. Ein Parser-Fehler
  // wuerde dagegen voellig andere Mengen liefern, nicht eine um ein bis zwei
  // Eintraege groessere - deshalb ist diese Toleranz sicher.
  const MAX_VORSPRUNG = 2;

  const pruefen = (unlocked) => {
    if (!unlocked) return false;
    const vorsprung = unlocked.size - webUnlocked.size;
    if (vorsprung < 0 || vorsprung > MAX_VORSPRUNG) return false;
    for (const name of webUnlocked) if (!unlocked.has(name)) return false;
    return true;
  };

  // Verfahren ueber Schema + Status zuerst - das passt zu Steams tatsaechlicher
  // Ablage (Namen im Schema, Zahlenwerte im Status).
  if (schemaFile) {
    for (const file of files) {
      const viaSchema = readUnlockedViaSchema(file, schemaFile);
      if (viaSchema && pruefen(viaSchema)) {
        return { file, schemaFile, unlocked: viaSchema, method: 'schema', attempts };
      }
      if (viaSchema) {
        attempts.push({
          file,
          reason: `über Schema gelesen: ${viaSchema.size} Einträge, Steam bestätigt: ${webUnlocked.size}`,
        });
      }
    }
  } else {
    attempts.push({ file: `UserGameStatsSchema_${appId}.bin`, reason: 'Schema-Datei nicht gefunden' });
  }

  for (const file of files) {
    const unlocked = readUnlockedFromFile(file, knownApiNames);
    if (!unlocked) {
      attempts.push({ file, reason: 'nicht lesbar' });
      continue;
    }

    // Selbstpruefung: Die lokal gelesene Menge MUSS exakt der von Steam
    // bestaetigten entsprechen. Nur dann ist der Parser fuer dieses Format
    // nachweislich korrekt - und nur dann darf er etwas melden.
    if (pruefen(unlocked)) {
      return { file, unlocked, method: 'strings', attempts };
    }
    attempts.push({
      file,
      reason: `gelesen: ${unlocked.size} Einträge, Steam bestätigt: ${webUnlocked.size}`,
    });
  }

  return { file: null, unlocked: null, attempts };
}

module.exports = {
  bitGesetzt,
  parseSchemaBits,
  parseStatValues,
  parseAchievementTimes,
  readUnlockedViaSchema,
  findSchemaFile,
  extractStringsUnlocked,
  parseBinaryKeyValues,
  collectUnlocked,
  findCandidateFiles,
  readUnlockedFromFile,
  findVerifiedSource,
};
