const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const E = require('../../overlay/lib/einstellungen');

/**
 * Diese Werte kommen aus zwei Quellen, denen man nicht trauen kann: einer
 * Datei im Benutzerordner, die jeder von Hand bearbeiten darf, und einem
 * Fenster. Ein unsinniger Wert darf die Anzeige nicht zerlegen - eine Größe
 * von 0 macht das Overlay unsichtbar, eine Anzeigedauer von 0 lässt
 * Meldungen nie erscheinen. Beides wäre von außen kaum als Ursache zu
 * erkennen.
 */

// --- Vollständigkeit ---------------------------------------------------------

test('Aus beliebigem Unsinn wird ein vollständiger Satz Werte', () => {
  for (const eingabe of [undefined, null, {}, 'kaputt', 42, []]) {
    const w = E.bereinige(eingabe);
    assert.deepStrictEqual(
      Object.keys(w).sort(),
      Object.keys(E.standard()).sort(),
      `unvollständig bei ${JSON.stringify(eingabe)}`
    );
  }
});

test('Unbekannte Felder werden nicht durchgereicht', () => {
  const w = E.bereinige({ position: 'oben-links', schadcode: 'egal', groesse: 1 });
  assert.strictEqual(w.schadcode, undefined);
});

// --- Position und Aufzählungen -----------------------------------------------

test('Alle vier Ecken werden angenommen', () => {
  for (const p of E.POSITIONEN) {
    assert.strictEqual(E.bereinige({ position: p }).position, p);
  }
});

test('Eine unbekannte Position fällt auf die Vorgabe zurück', () => {
  assert.strictEqual(E.bereinige({ position: 'mitte' }).position, 'oben-rechts');
  assert.strictEqual(E.bereinige({ position: 42 }).position, 'oben-rechts');
});

test('Unbekannte Abzeichen-Betriebsart fällt zurück', () => {
  assert.strictEqual(E.bereinige({ statusAbzeichen: 'immer' }).statusAbzeichen, 'steam-overlay');
  assert.strictEqual(E.bereinige({ statusAbzeichen: 'aus' }).statusAbzeichen, 'aus');
});

// --- Zahlen in Grenzen -------------------------------------------------------

test('Größe wird in die erlaubten Grenzen geholt', () => {
  assert.strictEqual(E.bereinige({ groesse: 0 }).groesse, E.GRENZEN.groesse.min);
  assert.strictEqual(E.bereinige({ groesse: -5 }).groesse, E.GRENZEN.groesse.min);
  assert.strictEqual(E.bereinige({ groesse: 99 }).groesse, E.GRENZEN.groesse.max);
  assert.strictEqual(E.bereinige({ groesse: 1.2 }).groesse, 1.2);
});

test('Eine Größe von 0 kann niemals herauskommen', () => {
  // Sonst wäre das Overlay unsichtbar und niemand käme darauf, warum.
  for (const wert of [0, -1, '0', null, NaN, Infinity]) {
    assert.ok(E.bereinige({ groesse: wert }).groesse >= E.GRENZEN.groesse.min);
  }
});

test('Anzeigedauer bleibt in sinnvollen Grenzen', () => {
  assert.strictEqual(E.bereinige({ anzeigeDauerSek: 0 }).anzeigeDauerSek, E.GRENZEN.anzeigeDauerSek.min);
  assert.strictEqual(E.bereinige({ anzeigeDauerSek: 999 }).anzeigeDauerSek, E.GRENZEN.anzeigeDauerSek.max);
  assert.strictEqual(E.bereinige({ anzeigeDauerSek: 12 }).anzeigeDauerSek, 12);
});

test('Lautstärke 0 bleibt 0 - das ist "stumm", kein fehlender Wert', () => {
  assert.strictEqual(E.bereinige({ lautstaerke: 0 }).lautstaerke, 0);
  assert.strictEqual(E.bereinige({ lautstaerke: 1 }).lautstaerke, 1);
  assert.strictEqual(E.bereinige({ lautstaerke: 5 }).lautstaerke, 1);
  assert.strictEqual(E.bereinige({ lautstaerke: -1 }).lautstaerke, 0);
});

test('Text statt Zahl wird abgefangen', () => {
  assert.strictEqual(E.bereinige({ groesse: 'groß' }).groesse, E.standard().groesse);
  assert.strictEqual(E.bereinige({ lautstaerke: 'laut' }).lautstaerke, E.standard().lautstaerke);
});

// --- Bildschirm --------------------------------------------------------------

test('Kein Bildschirm gewählt heißt Hauptbildschirm', () => {
  assert.strictEqual(E.bereinige({}).bildschirm, null);
  assert.strictEqual(E.bereinige({ bildschirm: null }).bildschirm, null);
  // Aus einer handgeschriebenen Datei kann der Text "null" kommen.
  assert.strictEqual(E.bereinige({ bildschirm: 'null' }).bildschirm, null);
  assert.strictEqual(E.bereinige({ bildschirm: 'egal' }).bildschirm, null);
});

test('Eine Bildschirmkennung wird als Zahl behalten', () => {
  assert.strictEqual(E.bereinige({ bildschirm: 2528732444 }).bildschirm, 2528732444);
  assert.strictEqual(E.bereinige({ bildschirm: '77' }).bildschirm, 77);
});

// --- Eigener Ton -------------------------------------------------------------

test('Ein leerer Tonpfad bedeutet "kein eigener Ton"', () => {
  // Sonst versucht die App, eine Datei namens "" abzuspielen.
  assert.strictEqual(E.bereinige({ eigenerTon: '' }).eigenerTon, null);
  assert.strictEqual(E.bereinige({ eigenerTon: '   ' }).eigenerTon, null);
  assert.strictEqual(E.bereinige({ eigenerTon: 123 }).eigenerTon, null);
});

test('Ein Tonpfad wird behalten und getrimmt', () => {
  assert.strictEqual(E.bereinige({ eigenerTon: ' C:\\ton.mp3 ' }).eigenerTon, 'C:\\ton.mp3');
});

// --- Lesen und Schreiben -----------------------------------------------------

function frischeDatei(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `trophaenschrank-einst-${name}-`));
  return { dir, datei: path.join(dir, 'einstellungen.json') };
}

test('Gespeicherte Werte kommen unverändert zurück', () => {
  const { dir, datei } = frischeDatei('rundlauf');

  const gespeichert = E.speichern(
    { position: 'unten-links', groesse: 1.3, lautstaerke: 0, anzeigeDauerSek: 6 },
    datei
  );
  const gelesen = E.laden(datei);

  assert.deepStrictEqual(gelesen, gespeichert);
  assert.strictEqual(gelesen.position, 'unten-links');
  assert.strictEqual(gelesen.groesse, 1.3);
  assert.strictEqual(gelesen.lautstaerke, 0, 'stumm muss stumm bleiben');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Speichern gibt die bereinigten Werte zurück, nicht die angefragten', () => {
  // Das Fenster zeigt danach an, was wirklich gilt - nicht, was gewünscht war.
  const { dir, datei } = frischeDatei('bereinigt');
  const antwort = E.speichern({ groesse: 99, position: 'quatsch' }, datei);

  assert.strictEqual(antwort.groesse, E.GRENZEN.groesse.max);
  assert.strictEqual(antwort.position, 'oben-rechts');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine beschädigte Datei führt zu Standardwerten, nicht zum Absturz', () => {
  const { dir, datei } = frischeDatei('kaputt');
  fs.writeFileSync(datei, '{ das ist kein JSON', 'utf8');

  assert.deepStrictEqual(E.laden(datei), E.standard());

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine fehlende Datei führt zu Standardwerten', () => {
  assert.deepStrictEqual(
    E.laden(path.join(os.tmpdir(), 'gibt-es-nicht-4711', 'einstellungen.json')),
    E.standard()
  );
});

test('Speichern legt fehlende Ordner an und lässt keine Nebendatei zurück', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trophaenschrank-einst-ordner-'));
  const datei = path.join(dir, 'tief', 'einstellungen.json');

  E.speichern({ groesse: 1 }, datei);

  assert.ok(fs.existsSync(datei));
  assert.ok(!fs.existsSync(`${datei}.tmp`), 'die Nebendatei muss umbenannt worden sein');

  fs.rmSync(dir, { recursive: true, force: true });
});
