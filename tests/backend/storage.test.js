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

// --- Was passiert, wenn eine Datei kaputt ist --------------------------------

/**
 * Am 11. September ist genau das passiert: `cache.json` lag mit dem richtigen
 * Namen und der richtigen Größe da, aber halb gefüllt mit NUL-Bytes. Grund war
 * ein fehlendes fsync - `writeFileSync` kehrt zurück, sobald die Daten im
 * Puffer des Betriebssystems liegen, und das anschließende Umbenennen machte
 * eine Datei offiziell, deren Inhalt noch gar nicht geschrieben war.
 *
 * Die App hat das fünf Tage lang stillschweigend hingenommen und bei jedem
 * Start leer angefangen. Nach außen sah das nur so aus, als sei sie langsam
 * geworden. Diese Tests halten fest, dass beides nicht mehr passiert.
 */

function frischerAblageordner(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `trophaenschrank-ablage-${name}-`));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../../backend/services/storage')];
  return { dir, storage: require('../../backend/services/storage') };
}

test('Nach dem Schreiben bleibt keine Nebendatei liegen', () => {
  const { dir, storage } = frischerAblageordner('nebendatei');
  storage.speichereSnapshot('probe', { a: 1 });

  const reste = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
  assert.deepStrictEqual(reste, [], `übrig geblieben: ${reste.join(', ')}`);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Die vorherige Fassung wird als Sicherung aufgehoben', () => {
  const { dir, storage } = frischerAblageordner('sicherung');
  storage.speichereSnapshot('probe', { stand: 'alt' });
  storage.speichereSnapshot('probe', { stand: 'neu' });

  const bak = JSON.parse(fs.readFileSync(path.join(dir, 'probe.json.bak'), 'utf8'));
  assert.strictEqual(bak.stand, 'alt', 'die Sicherung muss die VORHERIGE Fassung enthalten');
  assert.strictEqual(storage.ladeSnapshot('probe').stand, 'neu');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine beschädigte Datei wird aus der Sicherung wiederhergestellt', () => {
  const { dir, storage } = frischerAblageordner('wiederherstellen');
  storage.speichereSnapshot('probe', { wichtig: 'behalten' });
  storage.speichereSnapshot('probe', { wichtig: 'auch das' });

  // Genau der beobachtete Schaden: halber Inhalt, Rest NUL-Bytes.
  const datei = path.join(dir, 'probe.json');
  fs.writeFileSync(datei, '{"wichtig":"auch d\u0000\u0000\u0000\u0000', 'utf8');

  assert.strictEqual(
    storage.ladeSnapshot('probe').wichtig,
    'behalten',
    'statt leer zu starten muss die letzte gute Fassung greifen'
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Die beschädigte Datei wird zur Seite gelegt, nicht überschrieben', () => {
  // Sie ist der einzige Beleg dafür, WAS schiefging - beim nächsten
  // Schreibvorgang wäre sie sonst weg.
  const { dir, storage } = frischerAblageordner('beweis');
  storage.speichereSnapshot('probe', { a: 1 });
  fs.writeFileSync(path.join(dir, 'probe.json'), '{kaputt', 'utf8');

  storage.ladeSnapshot('probe');

  assert.ok(
    fs.existsSync(path.join(dir, 'probe.json.kaputt')),
    'die beschädigte Fassung muss erhalten bleiben'
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Ohne Sicherung führt eine beschädigte Datei zu leeren Werten, nicht zum Absturz', () => {
  const { dir, storage } = frischerAblageordner('ohne-sicherung');
  fs.writeFileSync(path.join(dir, 'probe.json'), 'weder JSON noch sonst was', 'utf8');

  assert.deepStrictEqual(storage.ladeSnapshot('probe'), {});
  assert.deepStrictEqual(storage.ladeSnapshot('probe', { standard: true }), { standard: true });

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine fehlende Datei ist kein Schaden und hinterlässt keine .kaputt', () => {
  const { dir, storage } = frischerAblageordner('fehlend');
  assert.deepStrictEqual(storage.ladeSnapshot('gibtesnicht'), {});
  assert.ok(!fs.existsSync(path.join(dir, 'gibtesnicht.json.kaputt')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Auch große Inhalte kommen vollständig zurück', () => {
  // Der Schaden trat bei einer 19 MB großen Datei auf; bei kleinen Dateien
  // schreibt das Betriebssystem oft schnell genug, dass nichts auffällt.
  const { dir, storage } = frischerAblageordner('gross');
  const gross = {};
  for (let i = 0; i < 4000; i++) {
    gross[`schluessel-${i}`] = { text: 'x'.repeat(200), nummer: i };
  }

  assert.strictEqual(storage.speichereSnapshot('gross', gross), true);
  const zurueck = storage.ladeSnapshot('gross');

  assert.strictEqual(Object.keys(zurueck).length, 4000);
  assert.strictEqual(zurueck['schluessel-3999'].nummer, 3999);

  fs.rmSync(dir, { recursive: true, force: true });
});
