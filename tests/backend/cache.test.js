const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Vor dem ersten require: Das Protokoll gehört in einen Wegwerfordner, nicht
// in den des Benutzers.
process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

/**
 * Der Zwischenspeicher lag bis hierher in EINER Datei. Die war auf 19 MB
 * angewachsen, wurde bei jedem Start vollständig geparst und bei jeder
 * Änderung vollständig neu geschrieben - und als sie einmal beschädigt war,
 * kostete das alles auf einmal.
 *
 * Diese Tests halten die drei Eigenschaften fest, die dagegen helfen:
 * Aufteilung nach Art, Schreiben nur der geänderten Art, und dass eine
 * beschädigte Datei nur ihre eigene Art kostet.
 */

const LANG = 24 * 60 * 60 * 1000;
const MODULE = ['cache', 'storage', 'logger'].map((m) =>
  path.resolve(__dirname, '..', '..', 'backend', 'services', `${m}.js`)
);

/** Lädt den Zwischenspeicher frisch mit eigenem Datenordner. */
function frisch(name, ordner = null) {
  const dir = ordner || fs.mkdtempSync(path.join(os.tmpdir(), `trophaenschrank-cache-${name}-`));
  process.env.DATA_DIR = dir;
  MODULE.forEach((m) => delete require.cache[require.resolve(m)]);
  return { dir, cache: require(MODULE[0]) };
}

/** Nur die eigentlichen Ablagedateien - .bak und .kaputt sind Beiwerk. */
const dateienIn = (dir) => {
  try {
    return fs
      .readdirSync(path.join(dir, 'cache'))
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch (e) {
    return [];
  }
};

// --- Aufteilung nach Art -----------------------------------------------------

test('Jede Art bekommt ihre eigene Datei', () => {
  const { dir, cache } = frisch('aufteilung');
  cache.set('schema:440', { a: 1 }, LANG);
  cache.set('globalpct:440', { p: 2 }, LANG);
  cache.set('xpsummary:v2:ich', { level: 52 }, LANG);
  cache._speichern();

  assert.deepStrictEqual(dateienIn(dir), ['globalpct.json', 'schema.json', 'xpsummary.json']);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine Änderung schreibt nur die betroffene Art neu', () => {
  // Das ist der ganze Zweck der Aufteilung: Beim Öffnen des Dashboards wurden
  // vorher mehrfach hintereinander 19 MB geschrieben.
  const { dir, cache } = frisch('nur-betroffene');
  cache.set('schema:1', { a: 1 }, LANG);
  cache.set('globalpct:1', { p: 1 }, LANG);
  cache._speichern();

  const pfadVon = (f) => path.join(dir, 'cache', f);
  const vorher = dateienIn(dir).map((f) => fs.statSync(pfadVon(f)).mtimeMs);

  const bis = Date.now() + 30;
  while (Date.now() < bis) {
    /* kurz warten, damit sich die Zeitstempel unterscheiden können */
  }

  cache.set('globalpct:2', { p: 2 }, LANG);
  cache._speichern();

  const dateien = dateienIn(dir);
  const nachher = dateien.map((f) => fs.statSync(pfadVon(f)).mtimeMs);
  const angefasst = dateien.filter((f, i) => nachher[i] !== vorher[i]);

  assert.deepStrictEqual(angefasst, ['globalpct.json'], 'nur die geänderte Art darf neu geschrieben werden');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Schlüssel ohne Art landen gesammelt in einer Datei', () => {
  const { cache } = frisch('sonstiges');
  assert.strictEqual(cache._artVon('ohnedoppelpunkt'), 'sonstiges');
  assert.strictEqual(cache._artVon('schema:440'), 'schema');
  assert.strictEqual(cache._artVon('achievements-letzter:1:2'), 'achievements-letzter');
});

// --- Kurzlebiges bleibt flüchtig ---------------------------------------------

test('Kurzlebige Einträge landen nicht auf der Platte', () => {
  const { dir, cache } = frisch('fluechtig');
  cache.set('presence:ich', { inGame: true }, 5000);
  cache._speichern();

  assert.deepStrictEqual(dateienIn(dir), [], 'nichts Kurzlebiges gehört in eine Datei');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Ausdrücklich flüchtige Einträge bleiben es auch bei langer Laufzeit', () => {
  // Die Achievement-Listen aller Spiele würden die Dateien vervielfachen,
  // obwohl sie nach Minuten wertlos sind.
  const { dir, cache } = frisch('ausdruecklich');
  cache.set('spielerach:1:2', { gross: true }, LANG, { persistent: false });
  cache._speichern();

  assert.deepStrictEqual(dateienIn(dir), []);

  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Übernahme der alten Ablage ----------------------------------------------

test('Eine alte cache.json wird übernommen statt weggeworfen', () => {
  // Bei einer großen Bibliothek ist ein gewachsener Zwischenspeicher hunderte
  // Steam-Abfragen wert.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trophaenschrank-cache-uebernahme-'));
  const gueltigBis = Date.now() + LANG;
  fs.writeFileSync(
    path.join(dir, 'cache.json'),
    JSON.stringify({
      'schema:440': { value: { name: 'behalten' }, expiresAt: gueltigBis },
      'globalpct:440': { value: { p: 7 }, expiresAt: gueltigBis },
      'schema:620': { value: { name: 'abgelaufen' }, expiresAt: Date.now() - 1000 },
    }),
    'utf8'
  );

  const { cache } = frisch('uebernahme', dir);

  assert.strictEqual(cache.get('schema:440').name, 'behalten');
  assert.strictEqual(cache.get('globalpct:440').p, 7);
  assert.strictEqual(cache.get('schema:620'), undefined, 'Abgelaufenes wird nicht übernommen');
  assert.ok(
    fs.existsSync(path.join(dir, 'cache.uebernommen.json')),
    'die alte Datei wird beiseitegelegt, nicht gelöscht'
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Ohne alte Datei passiert bei der Übernahme nichts', () => {
  const { dir, cache } = frisch('keine-alte');
  assert.strictEqual(cache.get('schema:1'), undefined);
  assert.ok(!fs.existsSync(path.join(dir, 'cache.uebernommen.json')));
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- DIE zentrale Zusicherung ------------------------------------------------

test('Eine beschädigte Datei kostet nur ihre eigene Art', () => {
  // Genau der Schaden vom 11. September, nur auf eine Art begrenzt: Vorher
  // lag alles in einer Datei, und ein einziges falsches Byte hat den ganzen
  // Zwischenspeicher gekostet.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trophaenschrank-cache-kaputt-'));

  let { cache } = frisch('kaputt', dir);
  cache.set('schema:1', { a: 1 }, LANG);
  cache.set('globalpct:1', { p: 1 }, LANG);
  cache._speichern();

  // Halber Inhalt, Rest NUL-Bytes - so sah die echte Datei aus.
  fs.writeFileSync(path.join(dir, 'cache', 'schema.json'), '{"schema:1":{"val\u0000\u0000', 'utf8');

  ({ cache } = frisch('kaputt', dir));

  assert.strictEqual(cache.get('schema:1'), undefined, 'die kaputte Art ist weg');
  assert.deepStrictEqual(cache.get('globalpct:1'), { p: 1 }, 'die anderen Arten müssen überleben');
  assert.ok(
    fs.existsSync(path.join(dir, 'cache', 'schema.json.kaputt')),
    'die beschädigte Datei bleibt als Beleg erhalten'
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Grundverhalten ----------------------------------------------------------

test('Abgelaufene Einträge werden nicht mehr herausgegeben', () => {
  const { dir, cache } = frisch('ablauf');
  cache.set('schema:1', { a: 1 }, -1);
  assert.strictEqual(cache.get('schema:1'), undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('remember ruft die Funktion nur beim ersten Mal auf', () => {
  const { dir, cache } = frisch('remember');
  let aufrufe = 0;
  const holen = async () => {
    aufrufe += 1;
    return { wert: 42 };
  };

  return cache
    .remember('schema:1', LANG, holen)
    .then(() => cache.remember('schema:1', LANG, holen))
    .then((zweites) => {
      assert.strictEqual(aufrufe, 1);
      assert.deepStrictEqual(zweites, { wert: 42 });
      fs.rmSync(dir, { recursive: true, force: true });
    });
});
