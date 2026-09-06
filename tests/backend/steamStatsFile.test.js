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
