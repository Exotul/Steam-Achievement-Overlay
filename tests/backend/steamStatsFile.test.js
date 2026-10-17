const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const M = require('../../overlay/lib/steamStatsFile');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const STATS = path.join(FIXTURES, 'UserGameStats_82128015_3419430.bin');
const SCHEMA = path.join(FIXTURES, 'UserGameStatsSchema_3419430.bin');

const ERWARTET = ['PET_1', 'PET_10', 'PET_100', 'PET_1000', 'PET_10000'];
const ALLE_NAMEN = [...ERWARTET, 'PET_100000'];

/**
 * Diese Tests laufen gegen ECHTE Steam-Dateien. Das Format ist von Valve
 * nicht zugesichert, und mehrere Annahmen darüber waren nachweislich falsch
 * (Namenssuche im Log, Werte auf falscher Ebene). Ohne diese Tests könnte ein
 * späterer Umbau den Parser unbemerkt zerlegen.
 */

test('Schema: alle 28 Achievements mit Bit-Nummern werden gelesen', () => {
  const bits = M.parseSchemaBits(fs.readFileSync(SCHEMA));
  assert.strictEqual(bits.size, 1, 'genau eine Statistik trägt die Achievements');
  const stat = bits.get('2');
  assert.ok(stat, 'Statistik mit der ID 2 muss vorhanden sein');
  assert.strictEqual(stat.size, 28);
  assert.strictEqual(stat.get(0), 'PET_1');
  assert.strictEqual(stat.get(4), 'PET_10000');
});

test('Statusdatei: Werte liegen unter "data", nicht eine Ebene höher', () => {
  const werte = M.parseStatValues(fs.readFileSync(STATS));
  // Genau dieser Fehler hat den Parser lange scheitern lassen.
  assert.strictEqual(werte.get('2'), 31, 'Bitfeld 31 = binär 11111 = fünf Achievements');
});

test('Schema + Status ergeben genau die fünf freigeschalteten Achievements', () => {
  const unlocked = M.readUnlockedViaSchema(STATS, SCHEMA);
  assert.ok(unlocked, 'Auswertung darf nicht fehlschlagen');
  assert.deepStrictEqual([...unlocked].sort(), [...ERWARTET].sort());
});

test('Freischaltzeitpunkte werden gelesen', () => {
  const zeiten = M.parseAchievementTimes(fs.readFileSync(STATS));
  const stat = zeiten.get('2');
  assert.ok(stat, 'AchievementTimes muss vorhanden sein');
  assert.strictEqual(stat.size, 5, 'fünf Zeitstempel, passend zu fünf Achievements');
  assert.ok(stat.get(0) > 1600000000, 'Zeitstempel muss plausibel sein');
});

// --- Bitfeld: die Vorzeichen-Falle -------------------------------------------

/**
 * Steam legt die Achievements einer Statistik als Bits in EINEM Zahlenwert ab.
 * Ab 32 Achievements je Statistik ist Bit 31 im Spiel - und genau dort kommt
 * der Wert als negative Zahl aus dem Parser, weil er als Int32 gelesen wird.
 * Eine frühere Rechnung mit `Math.abs()` hat das verschluckt: Aus -1 (alle
 * Bits gesetzt) wurde 1, womit Bit 31 als gelöscht galt.
 *
 * Folge wäre kein Fehlalarm gewesen, sondern das Gegenteil - ein still
 * fehlendes Achievement. Die Selbstprüfung hätte die Datei dann abgelehnt und
 * die App wäre auf den langsamen Weg über die Web-API zurückgefallen, ohne
 * dass jemand den Grund gesehen hätte.
 */
test('Bit 31 zählt auch dann, wenn der Wert negativ ankommt', () => {
  assert.strictEqual(M.bitGesetzt(-1, 31), true, 'alle Bits gesetzt (-1)');
  assert.strictEqual(M.bitGesetzt(-1, 0), true);
  assert.strictEqual(M.bitGesetzt(-1, 17), true);
  // Nur das oberste Bit gesetzt.
  assert.strictEqual(M.bitGesetzt(-2147483648, 31), true);
  assert.strictEqual(M.bitGesetzt(-2147483648, 30), false);
});

test('Bitfeld der echten Fixture bleibt korrekt', () => {
  // 31 = binär 11111 -> die ersten fünf Achievements.
  for (const bit of [0, 1, 2, 3, 4]) {
    assert.strictEqual(M.bitGesetzt(31, bit), true, `Bit ${bit} muss gesetzt sein`);
  }
  assert.strictEqual(M.bitGesetzt(31, 5), false, 'Bit 5 darf nicht gesetzt sein');
});

test('Unbrauchbare Werte gelten nie als freigeschaltet', () => {
  assert.strictEqual(M.bitGesetzt(undefined, 0), false);
  assert.strictEqual(M.bitGesetzt(NaN, 0), false);
  assert.strictEqual(M.bitGesetzt(0, 0), false);
});

// --- Selbstprüfung: der Schutz gegen Fehlalarme ------------------------------

function mitSteamOrdner(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamtest-'));
  const ziel = path.join(dir, 'appcache', 'stats');
  fs.mkdirSync(ziel, { recursive: true });
  fs.copyFileSync(STATS, path.join(ziel, path.basename(STATS)));
  fs.copyFileSync(SCHEMA, path.join(ziel, path.basename(SCHEMA)));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('Selbstprüfung akzeptiert bei übereinstimmendem Stand', () => {
  mitSteamOrdner((dir) => {
    const r = M.findVerifiedSource(dir, 3419430, new Set(ERWARTET), ALLE_NAMEN);
    assert.ok(r.file, 'muss akzeptiert werden');
    assert.strictEqual(r.method, 'schema');
  });
});

test('Selbstprüfung toleriert bis zu zwei Einträge Vorsprung der lokalen Datei', () => {
  // Tritt nach einem Neustart auf, wenn die Web-API noch hinterherhinkt.
  mitSteamOrdner((dir) => {
    const r = M.findVerifiedSource(dir, 3419430, new Set(ERWARTET.slice(0, 3)), ALLE_NAMEN);
    assert.ok(r.file, 'zwei Einträge Vorsprung müssen toleriert werden');
  });
});

test('Selbstprüfung lehnt bei zu großem Unterschied ab', () => {
  mitSteamOrdner((dir) => {
    const r = M.findVerifiedSource(dir, 3419430, new Set(ERWARTET.slice(0, 2)), ALLE_NAMEN);
    assert.strictEqual(r.file, null, 'drei Einträge Unterschied müssen abgelehnt werden');
  });
});

test('Selbstprüfung lehnt ab, wenn Steam etwas meldet, das lokal fehlt', () => {
  mitSteamOrdner((dir) => {
    const r = M.findVerifiedSource(dir, 3419430, new Set([...ERWARTET, 'PET_100000']), ALLE_NAMEN);
    assert.strictEqual(r.file, null);
  });
});

test('Die Schema-Datei wird NIE als Statusquelle verwendet', () => {
  // Sie enthält alle 28 Namen und sähe aus wie "alles freigeschaltet".
  mitSteamOrdner((dir) => {
    const kandidaten = M.findCandidateFiles(dir, 3419430);
    assert.ok(
      !kandidaten.some((f) => f.includes('Schema')),
      'Schema-Datei darf kein Kandidat sein'
    );
  });
});

/* ============================================================================
   "Noch nichts freigeschaltet" ist ein Ergebnis, kein Fehler
   ============================================================================
   Der Fall, der ein ganzes Spiel vom schnellen Weg ausschloss: Bei Tenebris
   Somnia war die Statusdatei 38 Bytes groß und enthielt keinen einzigen
   Statistikeintrag - weil dort noch nichts freigeschaltet war. Das galt als
   "nicht lesbar", also fiel die App dauerhaft auf die Web-API zurück. Und
   zwar genau zu Spielbeginn, wo jede Trophäe noch aussteht.

   Auf diesem Rechner nachgezählt: von 549 Spielen mit Schema-Datei waren 274
   in genau diesem Zustand.
   ========================================================================== */

/**
 * Die leere Statusdatei, Byte für Byte wie Steam sie schreibt.
 *
 * Bewusst hier zusammengebaut statt als Datei beigelegt: So steht das Format
 * lesbar im Test, statt in einer Binärdatei zu verschwinden.
 */
function leereStatusdatei() {
  const teile = [];
  teile.push(Buffer.from([0x00]), Buffer.from('cache\0', 'latin1')); // Objekt "cache"
  teile.push(Buffer.from([0x02]), Buffer.from('crc\0', 'latin1'), Buffer.alloc(4)); // Int32 = 0
  teile.push(
    Buffer.from([0x02]),
    Buffer.from('PendingChanges\0', 'latin1'),
    Buffer.alloc(4)
  );
  teile.push(Buffer.from([0x08, 0x08])); // Ende cache, Ende Datei
  return Buffer.concat(teile);
}

test('Eine gültige, aber leere Statusdatei wird als solche erkannt', () => {
  const parsed = M.parseBinaryKeyValues(leereStatusdatei());
  assert.strictEqual(M.istLeereStatusdatei(parsed), true);
  // Gegenproben: Ohne den Kopf, den jede Statusdatei hat, gilt sie nicht als
  // leer, sondern als unlesbar - sonst wäre jede kaputte Datei "leer".
  assert.strictEqual(M.istLeereStatusdatei({}), false);
  assert.strictEqual(M.istLeereStatusdatei({ cache: {} }), false, 'cache ohne crc');
  assert.strictEqual(M.istLeereStatusdatei({ irgendwas: { crc: 0 } }), false, 'crc ohne cache');
  assert.strictEqual(M.istLeereStatusdatei(null), false);
});

/** Steam-Ordner mit echtem Schema, aber leerer Statusdatei. */
function mitLeeremStand(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamleer-'));
  const ziel = path.join(dir, 'appcache', 'stats');
  fs.mkdirSync(ziel, { recursive: true });
  fs.copyFileSync(SCHEMA, path.join(ziel, path.basename(SCHEMA)));
  fs.writeFileSync(path.join(ziel, path.basename(STATS)), leereStatusdatei());
  try {
    fn(dir, path.join(ziel, path.basename(STATS)), path.join(ziel, path.basename(SCHEMA)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('Leere Statusdatei ergibt die leere Menge - nicht null', () => {
  mitLeeremStand((dir, stats, schema) => {
    const gelesen = M.readUnlockedViaSchema(stats, schema);
    assert.ok(gelesen instanceof Set, 'muss eine Menge sein, nicht null');
    assert.strictEqual(gelesen.size, 0);
  });
});

test('Die Selbstprüfung nimmt sie an, wenn Steam ebenfalls nichts meldet', () => {
  // Das ist der eigentliche Gewinn: Ab jetzt läuft der schnelle Weg vom
  // ersten Achievement an, statt erst ab dem zweiten Spielstart.
  mitLeeremStand((dir) => {
    const r = M.findVerifiedSource(dir, 3419430, new Set(), ALLE_NAMEN);
    assert.ok(r.file, 'muss angenommen werden');
    assert.strictEqual(r.method, 'schema');
    assert.strictEqual(r.unlocked.size, 0);
  });
});

test('Sie wird abgelehnt, sobald Steam etwas anderes sagt', () => {
  // DIE SICHERUNG. Ohne sie wäre die Änderung gefährlich: Eine Datei, die
  // fälschlich "leer" gelesen wird, obwohl Trophäen errungen sind, darf nie
  // als Quelle gelten.
  mitLeeremStand((dir) => {
    const r = M.findVerifiedSource(dir, 3419430, new Set(['PET_1']), ALLE_NAMEN);
    assert.strictEqual(r.file, null, 'darf nicht angenommen werden');
  });
});

test('Eine wirklich unlesbare Datei bleibt unlesbar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamkaputt-'));
  const ziel = path.join(dir, 'appcache', 'stats');
  fs.mkdirSync(ziel, { recursive: true });
  fs.copyFileSync(SCHEMA, path.join(ziel, path.basename(SCHEMA)));
  // Zufallsbytes - kein KeyValues, kein cache, kein crc.
  fs.writeFileSync(path.join(ziel, path.basename(STATS)), Buffer.from([
    0x7f, 0x41, 0x42, 0x43, 0x00, 0xff, 0xfe, 0x12, 0x34, 0x56, 0x78, 0x9a,
  ]));
  try {
    assert.strictEqual(
      M.readUnlockedViaSchema(path.join(ziel, path.basename(STATS)), path.join(ziel, path.basename(SCHEMA))),
      null
    );
    assert.strictEqual(M.findVerifiedSource(dir, 3419430, new Set(), ALLE_NAMEN).file, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Der Grund steht im Protokoll, auch wenn das Schema-Verfahren scheitert', () => {
  // Vorher stand dort nur "nicht lesbar" vom zweiten Verfahren - der
  // eigentliche Grund fehlte, und die Fehlersuche dauerte entsprechend.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamgrund-'));
  const ziel = path.join(dir, 'appcache', 'stats');
  fs.mkdirSync(ziel, { recursive: true });
  fs.copyFileSync(SCHEMA, path.join(ziel, path.basename(SCHEMA)));
  fs.writeFileSync(path.join(ziel, path.basename(STATS)), Buffer.from([0x7f, 0x41, 0x42, 0x00]));
  try {
    const r = M.findVerifiedSource(dir, 3419430, new Set(), ALLE_NAMEN);
    assert.ok(
      r.attempts.some((a) => /über Schema/.test(a.reason)),
      'das Schema-Verfahren muss seinen Fehlschlag melden: ' + JSON.stringify(r.attempts)
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
