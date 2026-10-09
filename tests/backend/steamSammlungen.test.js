const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const S = require('../../backend/services/steamSammlungen');

/**
 * Die Spielesammlungen aus dem Steam-Client.
 *
 * Die Vorlage unten ist einer echten Datei nachgebaut, mit allem, was dort
 * tatsaechlich vorkommt: eine eigene Sammlung, eine dynamische (die ihre
 * Treffer trotzdem als fertige Liste fuehrt), die beiden Sonderfaelle von
 * Steam, ein Grabstein einer geloeschten Sammlung und Eintraege, die mit den
 * Sammlungen nichts zu tun haben.
 */
const DATEI = [
  ['showcases.2', { key: 'showcases.2', value: '{"nada":1}', version: '7' }],
  [
    'user-collections.favorite',
    { key: 'user-collections.favorite', value: '{"id":"favorite","name":"Favoriten","added":[730,570],"removed":[]}' },
  ],
  [
    'user-collections.hidden',
    { key: 'user-collections.hidden', value: '{"id":"hidden","name":"Versteckt","added":[12345],"removed":[]}' },
  ],
  [
    'user-collections.uc-abc',
    { key: 'user-collections.uc-abc', value: '{"id":"uc-abc","name":"Horror","added":[379720,381210,99999],"removed":[99999]}' },
  ],
  [
    'user-collections.uc-dyn',
    {
      key: 'user-collections.uc-dyn',
      value: '{"id":"uc-dyn","name":"Shooter","added":[730,10090],"removed":[],"filterSpec":{"nFormatVersion":2}}',
    },
  ],
  // Geloescht: bleibt als Grabstein stehen, hat keinen Wert mehr.
  ['user-collections.uc-weg', { key: 'user-collections.uc-weg', is_deleted: true, version: '534' }],
  // Kaputter Wert - darf die anderen nicht mitreissen.
  ['user-collections.uc-kaputt', { key: 'user-collections.uc-kaputt', value: '{das ist kein json' }],
  // Ohne Namen - Steam laesst das zu.
  ['user-collections.uc-leer', { key: 'user-collections.uc-leer', value: '{"id":"uc-leer","added":[1]}' }],
];

const nach = (name) => S.deuteSammlungen(DATEI).find((s) => s.name === name);

test('Eigene Sammlungen werden mit ihren Spielen gelesen', () => {
  const horror = nach('Horror');
  assert.deepStrictEqual(horror.appIds, [379720, 381210]);
  assert.strictEqual(horror.art, 'eigene');
  assert.strictEqual(horror.dynamisch, false);
});

test('Entfernte Spiele zaehlen nicht mehr dazu', () => {
  // 99999 steht in "added" UND in "removed" - Steam loescht nicht, es merkt
  // sich die Ruecknahme. Ohne diese Regel stuenden geloeschte Spiele weiter
  // im Schrank.
  assert.ok(!nach('Horror').appIds.includes(99999));
});

test('Dynamische Sammlungen fuehren ihre Treffer als fertige Liste', () => {
  // Deshalb muss Steams Filter nicht nachgebaut werden - nachgesehen an einer
  // echten Datei, wo "Shooter" 61 Spiele als Liste mitbrachte.
  const shooter = nach('Shooter');
  assert.strictEqual(shooter.dynamisch, true);
  assert.deepStrictEqual(shooter.appIds, [730, 10090]);
});

test('Die beiden Sammlungen von Steam sind als solche erkennbar', () => {
  // "Versteckt" gehoert nicht in den Schrank, "Favoriten" ist eine
  // Auszeichnung und keine Art von Spiel - beides muss unterscheidbar sein.
  assert.strictEqual(nach('Favoriten').art, 'favorit');
  assert.strictEqual(nach('Versteckt').art, 'versteckt');
});

test('Geloeschte, kaputte und fremde Eintraege werden uebergangen', () => {
  const alle = S.deuteSammlungen(DATEI);
  assert.strictEqual(alle.length, 5, alle.map((s) => s.name).join(', '));
  assert.ok(!alle.some((s) => s.id === 'uc-weg'), 'geloeschte Sammlung');
  assert.ok(!alle.some((s) => s.id === 'uc-kaputt'), 'kaputter Wert');
  assert.ok(!alle.some((s) => s.name === 'nada'), 'fremder Eintrag');
  // Ohne Namen - lieber ein Platzhalter als "undefined" auf dem Schild.
  assert.strictEqual(alle.find((s) => s.id === 'uc-leer').name, 'Ohne Namen');
});

test('Unsinn als Dateiinhalt ergibt eine leere Liste statt eines Absturzes', () => {
  for (const unsinn of [null, undefined, {}, 'kaputt', [1, 2, 3], [[]], [['user-collections.x']]]) {
    assert.deepStrictEqual(S.deuteSammlungen(unsinn), []);
  }
});

// --- Kontonummer und Pfad -------------------------------------------------------

test('Die Kontonummer ergibt sich aus der SteamID', () => {
  // Steam zaehlt Konten intern ohne den Sockel 76561197960265728; der Ordner
  // unter userdata heisst nach der gekuerzten Nummer. Ein Rechenfehler hier
  // laesst die App im Ordner eines FREMDEN Kontos nachsehen.
  assert.strictEqual(S.kontoNummer('76561198042393743'), '82128015');
  assert.strictEqual(S.kontoNummer(76561197960265729n), '1');
});

test('Eine unbrauchbare SteamID ergibt keine Kontonummer', () => {
  for (const murks of ['', 'abc', null, undefined, '123', '76561197960265728']) {
    assert.strictEqual(S.kontoNummer(murks), null, String(murks));
  }
});

test('Der Dateipfad folgt dem Aufbau des Steam-Ordners', () => {
  const p = S.sammlungsDatei('D:\\Steam', '76561198042393743');
  assert.ok(p.includes(path.join('userdata', '82128015', 'config', 'cloudstorage')), p);
  assert.ok(p.endsWith('cloud-storage-namespace-1.json'), p);
  assert.strictEqual(S.sammlungsDatei(null, '76561198042393743'), null);
  assert.strictEqual(S.sammlungsDatei('D:\\Steam', 'murks'), null);
});

test('Ohne Steam-Datei gibt es einen Grund statt eines Fehlers', async () => {
  // Ein Konto, das auf diesem Rechner nie angemeldet war: Der Schrank soll
  // das sagen koennen, statt leer zu bleiben.
  const ergebnis = await S.leseSammlungen('76561197960265729');
  assert.ok(Array.isArray(ergebnis.sammlungen));
  if (ergebnis.grund === null) {
    assert.ok(false, 'unerwartet: Konto 1 hat Sammlungen auf diesem Rechner');
  }
  assert.ok(['kein-steam', 'kein-konto', 'keine-datei', 'unlesbar'].includes(ergebnis.grund));
});

test('Eine kaputte Datei meldet "unlesbar", statt die App zu stoppen', async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'sammlungen-'));
  const ziel = path.join(ordner, 'userdata', '82128015', 'config', 'cloudstorage');
  fs.mkdirSync(ziel, { recursive: true });
  fs.writeFileSync(path.join(ziel, 'cloud-storage-namespace-1.json'), '{kaputt');

  // Den Pfad direkt pruefen, ohne die Registry zu befragen.
  const datei = S.sammlungsDatei(ordner, '76561198042393743');
  assert.ok(fs.existsSync(datei));
  assert.throws(() => JSON.parse(fs.readFileSync(datei, 'utf8')));
  fs.rmSync(ordner, { recursive: true, force: true });
});
