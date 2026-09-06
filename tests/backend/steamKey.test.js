const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * Der Steam-Schlüssel ist das einzige Geheimnis, das die App überhaupt
 * anfasst. Diese Tests sichern zweierlei ab:
 *
 *  1. Beim Speichern darf nichts anderes in der Konfiguration verlorengehen.
 *     Eine Konfiguration ist nichts, das man beim Schreiben neu erfinden darf
 *     - wer die Datei angepasst hat, würde seine Einstellungen sonst stumm
 *     verlieren.
 *  2. Offensichtlich falsche Eingaben werden erkannt, BEVOR Steam gefragt
 *     wird. Sonst kommt eine unverständliche Fehlermeldung von Steam zurück,
 *     obwohl schon an der Eingabe erkennbar war, was schiefging.
 *
 * Der Netzzugriff (beiSteamPruefen) ist hier bewusst nicht geprüft - diese
 * Tests sollen ohne Internet und ohne Steam-Zugang laufen.
 */

process.env.DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'trophaenschrank-keytest');
const K = require('../../overlay/lib/steamKey');

const ECHT = '0123456789ABCDEF0123456789ABCDEF';

// --- Formatprüfung -----------------------------------------------------------

test('Ein gültiger Schlüssel wird angenommen', () => {
  const r = K.formatPruefen(ECHT);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.schluessel, ECHT);
});

test('Umschließende Leerzeichen stören nicht', () => {
  // Beim Kopieren aus dem Browser hängt gern ein Leerzeichen dran. Das ist
  // kein Fehler des Benutzers und darf keine Fehlermeldung erzeugen.
  assert.strictEqual(K.formatPruefen(`  ${ECHT}  `).ok, true);
});

test('Leere Eingabe, Platzhalter und falsche Länge werden abgelehnt', () => {
  assert.strictEqual(K.formatPruefen('').ok, false);
  assert.strictEqual(K.formatPruefen('   ').ok, false);
  assert.strictEqual(K.formatPruefen('DEIN_STEAM_API_KEY').ok, false);
  assert.strictEqual(K.formatPruefen(ECHT.slice(0, 31)).ok, false, 'ein Zeichen zu kurz');
  assert.strictEqual(K.formatPruefen(ECHT + 'A').ok, false, 'ein Zeichen zu lang');
});

test('Nicht-Hex-Zeichen werden abgelehnt', () => {
  // Ein Steam-Schlüssel besteht nur aus 0-9 und A-F. Ein "G" heisst fast
  // immer: da wurde etwas anderes kopiert.
  assert.strictEqual(K.formatPruefen('G'.repeat(32)).ok, false);
});

test('Die Fehlermeldung nennt die tatsächliche Länge', () => {
  // Ohne diese Angabe raet man beim Suchen des Fehlers.
  const r = K.formatPruefen('ABC');
  assert.ok(r.grund.includes('3'), `Länge fehlt in: ${r.grund}`);
});

// --- Einsetzen in den Konfigurationstext ------------------------------------

test('Ein vorhandener Schlüssel wird ersetzt, alles andere bleibt stehen', () => {
  const vorher = [
    '# Meine Konfiguration',
    'STEAM_API_KEY=ALTERSCHLUESSEL',
    'SESSION_SECRET=abc123',
    '',
    '# Eigener Kommentar',
    'ACHIEVEMENT_POLL_INTERVAL_MS=2000',
  ].join('\n');

  const nachher = K.setzeSchluesselInText(vorher, ECHT);

  assert.ok(nachher.includes(`STEAM_API_KEY=${ECHT}`), 'neuer Schlüssel muss drin sein');
  assert.ok(!nachher.includes('ALTERSCHLUESSEL'), 'alter Schlüssel muss weg sein');
  assert.ok(nachher.includes('SESSION_SECRET=abc123'), 'Sitzungsgeheimnis muss bleiben');
  assert.ok(nachher.includes('# Eigener Kommentar'), 'Kommentare müssen bleiben');
  assert.ok(nachher.includes('ACHIEVEMENT_POLL_INTERVAL_MS=2000'), 'Einstellungen müssen bleiben');
});

test('Fehlt die Zeile, wird sie angehängt', () => {
  const nachher = K.setzeSchluesselInText('SESSION_SECRET=xyz', ECHT);
  assert.ok(nachher.includes('SESSION_SECRET=xyz'));
  assert.ok(nachher.includes(`STEAM_API_KEY=${ECHT}`));
});

test('Auch aus einer leeren Datei wird etwas Brauchbares', () => {
  assert.ok(K.setzeSchluesselInText('', ECHT).includes(`STEAM_API_KEY=${ECHT}`));
  assert.ok(K.setzeSchluesselInText(null, ECHT).includes(`STEAM_API_KEY=${ECHT}`));
});

test('Auskommentierte Beispielzeilen werden nicht angefasst', () => {
  // Sonst würde der Schlüssel in eine Zeile geschrieben, die gar nicht gilt -
  // und die App fände ihn anschliessend nicht.
  const vorher = '# STEAM_API_KEY=BEISPIEL\nSESSION_SECRET=x';
  const nachher = K.setzeSchluesselInText(vorher, ECHT);

  assert.ok(nachher.includes('# STEAM_API_KEY=BEISPIEL'), 'Kommentar bleibt Kommentar');
  assert.ok(
    /^STEAM_API_KEY=/m.test(nachher),
    'eine echte, nicht auskommentierte Zeile muss entstehen'
  );
});

test('Zeilenenden nach Windows-Art zerstören die Datei nicht', () => {
  const vorher = 'STEAM_API_KEY=ALT\r\nSESSION_SECRET=abc\r\n';
  const nachher = K.setzeSchluesselInText(vorher, ECHT);
  assert.ok(nachher.includes(`STEAM_API_KEY=${ECHT}`));
  assert.ok(nachher.includes('SESSION_SECRET=abc'));
  assert.ok(!nachher.includes('\r'), 'einheitlich auf Zeilenumbrüche vereinheitlicht');
});

// --- Schreiben auf die Platte ------------------------------------------------

test('Speichern schreibt die Datei und lässt keine Nebendatei zurück', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trophaenschrank-speichern-'));
  const datei = path.join(dir, 'unterordner', 'config.env');

  K.speichereSchluessel(ECHT, datei);

  assert.ok(fs.existsSync(datei), 'die Datei muss angelegt werden, auch samt Ordner');
  assert.ok(fs.readFileSync(datei, 'utf8').includes(`STEAM_API_KEY=${ECHT}`));
  assert.ok(!fs.existsSync(`${datei}.tmp`), 'die Nebendatei muss umbenannt worden sein');

  // Der laufende Vorgang soll ihn ohne Neustart benutzen können.
  assert.strictEqual(process.env.STEAM_API_KEY, ECHT);

  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.STEAM_API_KEY;
});

test('Zweimal speichern hinterlässt genau eine Schlüsselzeile', () => {
  // Sonst stünden nach jedem Wechsel mehr Zeilen in der Datei, und es wäre
  // nicht mehr absehbar, welche davon gilt.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trophaenschrank-zweimal-'));
  const datei = path.join(dir, 'config.env');

  K.speichereSchluessel(ECHT, datei);
  const zweiter = 'FEDCBA9876543210FEDCBA9876543210';
  K.speichereSchluessel(zweiter, datei);

  const inhalt = fs.readFileSync(datei, 'utf8');
  const zeilen = inhalt.split(/\r?\n/).filter((z) => /^STEAM_API_KEY=/.test(z));

  assert.strictEqual(zeilen.length, 1, `genau eine Zeile erwartet, gefunden: ${zeilen.length}`);
  assert.strictEqual(zeilen[0], `STEAM_API_KEY=${zweiter}`);

  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.STEAM_API_KEY;
});
