const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * Diese Tests sichern eine Eigenschaft, die man erst bemerkt, wenn sie fehlt:
 * Ein Update ersetzt den Programmordner. Läge die Konfiguration dort, wäre der
 * Steam-API-Schlüssel nach jedem Update weg und müsste neu eingetragen
 * werden.
 */

function frischerOrdner(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `trophaenschrank-${name}-`));
  fs.mkdirSync(path.join(dir, 'programm'), { recursive: true });
  return dir;
}

/** Lädt config.js mit eigenem Datenordner - jedes Mal frisch. */
function ladeModul(datenOrdner) {
  process.env.DATA_DIR = datenOrdner;
  delete require.cache[require.resolve('../../overlay/lib/config')];
  return require('../../overlay/lib/config');
}

test('Eine vorhandene .env aus dem Programmordner wird einmalig übernommen', () => {
  const dir = frischerOrdner('uebernahme');
  const programm = path.join(dir, 'programm');
  fs.writeFileSync(path.join(programm, '.env'), 'STEAM_API_KEY=ABC123\n', 'utf8');

  const config = ladeModul(path.join(dir, 'daten'));
  const ergebnis = config.ladeKonfiguration(programm);

  assert.strictEqual(ergebnis.uebernommen, true, 'die alte Datei muss übernommen werden');
  assert.ok(
    fs.existsSync(path.join(dir, 'daten', 'config.env')),
    'die Konfiguration muss im Benutzerordner liegen'
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Die Konfiguration übersteht ein Update des Programmordners', () => {
  const dir = frischerOrdner('update');
  const programm = path.join(dir, 'programm');
  fs.writeFileSync(path.join(programm, '.env'), 'STEAM_API_KEY=GEHEIM42\n', 'utf8');

  // Erster Start: Übernahme in den Benutzerordner.
  ladeModul(path.join(dir, 'daten')).ladeKonfiguration(programm);

  // Update: Der Programmordner wird ersetzt, die alte .env verschwindet.
  fs.rmSync(path.join(programm, '.env'));
  delete process.env.STEAM_API_KEY;

  // Zweiter Start nach dem Update.
  const ergebnis = ladeModul(path.join(dir, 'daten')).ladeKonfiguration(programm);

  assert.strictEqual(
    ergebnis.quelle,
    path.join(dir, 'daten', 'config.env'),
    'muss aus dem Benutzerordner lesen'
  );
  assert.strictEqual(
    process.env.STEAM_API_KEY,
    'GEHEIM42',
    'der Schlüssel muss das Update überlebt haben'
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine vorhandene Konfiguration wird NIE überschrieben', () => {
  const dir = frischerOrdner('nichtueberschreiben');
  const programm = path.join(dir, 'programm');
  const daten = path.join(dir, 'daten');

  fs.mkdirSync(daten, { recursive: true });
  fs.writeFileSync(path.join(daten, 'config.env'), 'STEAM_API_KEY=MEINER\n', 'utf8');
  // Im Programmordner liegt eine andere (etwa die mitgelieferte Vorlage).
  fs.writeFileSync(path.join(programm, '.env'), 'STEAM_API_KEY=DEIN_STEAM_API_KEY\n', 'utf8');

  delete process.env.STEAM_API_KEY;
  const ergebnis = ladeModul(daten).ladeKonfiguration(programm);

  assert.strictEqual(ergebnis.uebernommen, false, 'es darf nichts übernommen werden');
  assert.strictEqual(process.env.STEAM_API_KEY, 'MEINER', 'die eigene Einstellung muss gewinnen');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Ohne jede Konfiguration bricht nichts ab', () => {
  const dir = frischerOrdner('leer');
  const ergebnis = ladeModul(path.join(dir, 'daten')).ladeKonfiguration(
    path.join(dir, 'programm')
  );
  assert.ok(ergebnis.quelle, 'es muss trotzdem ein Pfad zurückkommen');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Anführungszeichen und Kommentare werden richtig behandelt', () => {
  const dir = frischerOrdner('parser');
  const datei = path.join(dir, 'test.env');
  fs.writeFileSync(
    datei,
    [
      '# Ein Kommentar',
      '',
      'MIT_ANFUEHRUNG="ABC123"',
      "MIT_HOCHKOMMA='DEF456'",
      'MIT_LEERZEICHEN =  GHI789  ',
      'OHNE_WERT=',
      'kein_gleichheitszeichen',
    ].join('\n'),
    'utf8'
  );

  ['MIT_ANFUEHRUNG', 'MIT_HOCHKOMMA', 'MIT_LEERZEICHEN', 'OHNE_WERT'].forEach(
    (n) => delete process.env[n]
  );

  const config = ladeModul(path.join(dir, 'daten'));
  config.leseKonfigDatei(datei);

  // Genau diese Stolpersteine haben beim Steam-Schlüssel schon Ärger gemacht.
  assert.strictEqual(process.env.MIT_ANFUEHRUNG, 'ABC123');
  assert.strictEqual(process.env.MIT_HOCHKOMMA, 'DEF456');
  assert.strictEqual(process.env.MIT_LEERZEICHEN, 'GHI789');
  assert.strictEqual(process.env.OHNE_WERT, '');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Bereits gesetzte Werte werden nicht überschrieben', () => {
  const dir = frischerOrdner('vorrang');
  const datei = path.join(dir, 'test.env');
  fs.writeFileSync(datei, 'SCHON_DA=aus_datei\n', 'utf8');

  process.env.SCHON_DA = 'von_aussen';
  ladeModul(path.join(dir, 'daten')).leseKonfigDatei(datei);

  assert.strictEqual(process.env.SCHON_DA, 'von_aussen');
  delete process.env.SCHON_DA;
  fs.rmSync(dir, { recursive: true, force: true });
});
