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

/**
 * Der Erststart auf einem fremden Rechner. Vorher gab es hier gar nichts:
 * Wer die App installierte statt sie selbst zu bauen, bekam keine
 * Konfigurationsdatei - und eine Fehlermeldung, die auf eine Datei im
 * Programmordner verwies, die dort nie lag. Die App war damit unbenutzbar
 * für jeden, der sie nicht selbst entwickelt hatte.
 */
test('Erststart ohne alles legt eine Konfiguration mit Platzhalter an', () => {
  const dir = frischerOrdner('erststart');
  const daten = path.join(dir, 'daten');

  const config = ladeModul(daten);
  delete process.env.STEAM_API_KEY;
  delete process.env.SESSION_SECRET;
  const ergebnis = config.ladeKonfiguration(path.join(dir, 'programm'));

  assert.strictEqual(ergebnis.neuAngelegt, true, 'eine Vorlage muss entstehen');
  const datei = path.join(daten, 'config.env');
  assert.ok(fs.existsSync(datei), 'die Datei muss im Benutzerordner liegen');

  const inhalt = fs.readFileSync(datei, 'utf8');
  assert.ok(inhalt.includes('DEIN_STEAM_API_KEY'), 'Platzhalter muss erkennbar sein');
  assert.ok(
    inhalt.includes('steamcommunity.com/dev/apikey'),
    'die Datei muss sagen, wo der Schlüssel herkommt'
  );

  // Das Sitzungsgeheimnis erzeugt die App selbst - dafür soll sich niemand
  // etwas ausdenken müssen. Es muss zufällig und lang genug sein.
  const geheim = inhalt.match(/SESSION_SECRET=(.+)/)[1].trim();
  assert.ok(geheim.length >= 32, `Sitzungsgeheimnis zu kurz: ${geheim.length}`);
  assert.notStrictEqual(geheim, 'DEIN_STEAM_API_KEY');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Zwei Erststarts erzeugen verschiedene Sitzungsgeheimnisse', () => {
  const lies = (name) => {
    const dir = frischerOrdner(name);
    const daten = path.join(dir, 'daten');
    ladeModul(daten).ladeKonfiguration(path.join(dir, 'programm'));
    const inhalt = fs.readFileSync(path.join(daten, 'config.env'), 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return inhalt.match(/SESSION_SECRET=(.+)/)[1].trim();
  };
  assert.notStrictEqual(lies('zufall-a'), lies('zufall-b'), 'darf nicht fest verdrahtet sein');
});

test('Eine vorhandene Konfiguration wird beim Erststart NIE überschrieben', () => {
  const dir = frischerOrdner('nicht-ueberschreiben');
  const daten = path.join(dir, 'daten');
  fs.mkdirSync(daten, { recursive: true });
  fs.writeFileSync(path.join(daten, 'config.env'), 'STEAM_API_KEY=MEINECHTER\n', 'utf8');

  const config = ladeModul(daten);
  const ergebnis = config.ladeKonfiguration(path.join(dir, 'programm'));

  assert.strictEqual(ergebnis.neuAngelegt, false, 'nichts anlegen, wenn schon etwas da ist');
  assert.strictEqual(
    fs.readFileSync(path.join(daten, 'config.env'), 'utf8').trim(),
    'STEAM_API_KEY=MEINECHTER',
    'der bestehende Schlüssel muss unangetastet bleiben'
  );

  fs.rmSync(dir, { recursive: true, force: true });
});

test('schluesselFehlt erkennt Platzhalter und Leerwerte', () => {
  const dir = frischerOrdner('erkennung');
  const config = ladeModul(path.join(dir, 'daten'));

  delete process.env.STEAM_API_KEY;
  assert.strictEqual(config.schluesselFehlt(), true, 'gar kein Schlüssel');

  process.env.STEAM_API_KEY = 'DEIN_STEAM_API_KEY';
  assert.strictEqual(config.schluesselFehlt(), true, 'noch der Platzhalter');

  // Der Text "undefined" entsteht, wenn Windows eine leere Variable weiterreicht.
  process.env.STEAM_API_KEY = 'undefined';
  assert.strictEqual(config.schluesselFehlt(), true, 'als Text weitergereichtes undefined');

  process.env.STEAM_API_KEY = '0123456789abcdef0123456789abcdef';
  assert.strictEqual(config.schluesselFehlt(), false, 'echter Schlüssel');

  delete process.env.STEAM_API_KEY;
  fs.rmSync(dir, { recursive: true, force: true });
});

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
