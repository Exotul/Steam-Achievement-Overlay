const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Eigener Ordner je Testlauf, damit nichts aus der echten Installation
// gelesen oder überschrieben wird.
const TESTDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trophaenschrank-storage-'));
process.env.DATA_DIR = TESTDIR;
// Protokoll bewusst AUSSERHALB des Testordners: Der wird am Ende gelöscht,
// und die Protokolldatei bleibt noch kurz zum Schreiben geöffnet.
process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const storage = require('../../backend/services/storage');
const history = require('../../backend/services/history');

test.after(() => {
  fs.rmSync(TESTDIR, { recursive: true, force: true });
});

// --- Momentaufnahmen ---------------------------------------------------------

test('Momentaufnahme überlebt einen Neustart', () => {
  storage.speichereSnapshot('probe', { a: 1, b: 'zwei' });
  assert.deepStrictEqual(storage.ladeSnapshot('probe'), { a: 1, b: 'zwei' });
});

test('Fehlende Datei liefert den Standardwert statt eines Fehlers', () => {
  assert.deepStrictEqual(storage.ladeSnapshot('gibtesnicht'), {});
  assert.deepStrictEqual(storage.ladeSnapshot('gibtesnicht', { leer: true }), { leer: true });
});

test('Beschädigte Datei bricht den Start nicht ab', () => {
  fs.writeFileSync(path.join(TESTDIR, 'kaputt.json'), '{ das ist kein JSON', 'utf8');
  assert.deepStrictEqual(storage.ladeSnapshot('kaputt'), {}, 'muss leer starten statt zu werfen');
});

test('Ein Absturz mitten im Schreiben lässt die alte Datei unversehrt', () => {
  // Genau der Fall, für den erst in eine Nebendatei geschrieben und dann
  // umbenannt wird.
  storage.speichereSnapshot('wichtig', { stand: 'gut' });

  // Eine liegengebliebene Nebendatei simulieren, wie sie ein Absturz
  // hinterlassen würde.
  fs.writeFileSync(path.join(TESTDIR, 'wichtig.json.tmp'), '{ halb geschrie', 'utf8');

  assert.deepStrictEqual(
    storage.ladeSnapshot('wichtig'),
    { stand: 'gut' },
    'die eigentliche Datei muss unberührt sein'
  );
});

// --- Ereignisprotokoll -------------------------------------------------------

test('Ereignisse werden angehängt und in Reihenfolge gelesen', () => {
  storage.schreibeEreignis('test-ereignisse', { nr: 1 });
  storage.schreibeEreignis('test-ereignisse', { nr: 2 });
  storage.schreibeEreignis('test-ereignisse', { nr: 3 });

  const gelesen = storage.leseEreignisse('test-ereignisse');
  assert.strictEqual(gelesen.length, 3);
  assert.deepStrictEqual(gelesen.map((e) => e.nr), [1, 2, 3]);
  assert.ok(gelesen[0].ts > 0, 'jedes Ereignis bekommt einen Zeitstempel');
});

test('Eine unvollständige letzte Zeile wird übersprungen, der Rest bleibt lesbar', () => {
  // So sähe die Datei nach einem Absturz mitten im Anhängen aus.
  storage.schreibeEreignis('abbruch', { nr: 1 });
  storage.schreibeEreignis('abbruch', { nr: 2 });
  fs.appendFileSync(path.join(TESTDIR, 'verlauf', 'abbruch.jsonl'), '{"nr":3,"unvoll');

  const gelesen = storage.leseEreignisse('abbruch');
  assert.strictEqual(gelesen.length, 2, 'die beiden heilen Zeilen müssen erhalten bleiben');
  assert.deepStrictEqual(gelesen.map((e) => e.nr), [1, 2]);
});

test('Kürzen behält die jüngsten Einträge', () => {
  for (let i = 1; i <= 50; i++) storage.schreibeEreignis('viele', { nr: i });
  const verbleibend = storage.kuerzeEreignisse('viele', 10);
  assert.strictEqual(verbleibend, 10);

  const gelesen = storage.leseEreignisse('viele');
  assert.strictEqual(gelesen.length, 10);
  assert.strictEqual(gelesen[0].nr, 41, 'die ältesten müssen weg sein');
  assert.strictEqual(gelesen[9].nr, 50);
});

// --- Verlauf -----------------------------------------------------------------

test('Freischaltungen landen im Verlauf, jüngste zuerst', () => {
  const basis = {
    steamId: '765',
    appId: 3419430,
    gameName: 'Bongo Cat',
    level: 12,
  };

  history.achievementFreigeschaltet({
    ...basis,
    achievement: { apiName: 'PET_1', name: 'Erster', category: 'Kupfer', globalPercent: 74 },
    xpZuwachs: 26,
  });
  history.achievementFreigeschaltet({
    ...basis,
    achievement: { apiName: 'PET_10000', name: 'Zehntausend', category: 'Platin', globalPercent: 1.4 },
    xpZuwachs: 394,
  });

  const eintraege = history.verlauf({ limit: 10 });
  assert.strictEqual(eintraege.length, 2);
  assert.strictEqual(eintraege[0].apiName, 'PET_10000', 'jüngstes zuerst');
  assert.strictEqual(eintraege[0].xpZuwachs, 394);
});

test('Verlauf lässt sich nach Spiel filtern', () => {
  history.achievementFreigeschaltet({
    steamId: '765',
    appId: 999999,
    gameName: 'Anderes Spiel',
    achievement: { apiName: 'X', name: 'X', category: 'Gold', globalPercent: 8 },
    xpZuwachs: 276,
    level: 12,
  });

  const nurBongo = history.verlauf({ appId: 3419430 });
  assert.ok(nurBongo.length >= 2);
  assert.ok(
    nurBongo.every((e) => String(e.appId) === '3419430'),
    'es darf nichts aus anderen Spielen dabei sein'
  );
});

test('Tagesübersicht fasst Anzahl, XP und Stufen zusammen', () => {
  const tage = history.proTag({ tage: 30 });
  assert.ok(tage.length >= 1);

  const heute = tage[tage.length - 1];
  assert.ok(heute.anzahl >= 3, 'alle Ereignisse dieses Tests zählen mit');
  assert.ok(heute.xp > 0);
  assert.ok(heute.stufen.Platin >= 1, 'Stufen müssen einzeln gezählt werden');
});
