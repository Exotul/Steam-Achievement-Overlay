const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const T = require('../../overlay/lib/todo');

/**
 * Die Merkliste steht während des ganzen Spiels auf dem Bildschirm. Sie darf
 * deshalb weder zu viel anzeigen (dann verdeckt sie das Spiel) noch etwas
 * anzeigen, das längst erledigt ist - genau in dem Moment, in dem eine
 * Aufgabe erfüllt ist, will man sie verschwinden sehen.
 *
 * Die Datei liegt im Benutzerordner und darf von Hand bearbeitet werden;
 * beschädigter Inhalt darf die Einblendung nicht zerlegen.
 */

// --- Bereinigung -------------------------------------------------------------

test('Aus beliebigem Unsinn wird eine leere, benutzbare Liste', () => {
  for (const eingabe of [undefined, null, 'kaputt', 42, [], [1, 2]]) {
    assert.deepStrictEqual(T.bereinige(eingabe), {}, `bei ${JSON.stringify(eingabe)}`);
  }
});

test('Unbrauchbare Einträge fallen weg, brauchbare bleiben', () => {
  const sauber = T.bereinige({
    '440': ['ACH_A', 42, null, '  ACH_B  ', '', '   '],
    '620': 'keine Liste',
    '730': [],
  });
  assert.deepStrictEqual(sauber, { 440: ['ACH_A', 'ACH_B'] });
});

test('Doppelte Einträge werden zusammengefasst', () => {
  // Sonst stünde derselbe Eintrag zweimal auf dem Bildschirm.
  assert.deepStrictEqual(T.bereinige({ '1': ['A', 'A', 'B', 'A'] }), { 1: ['A', 'B'] });
});

test('Die Obergrenze je Spiel wird eingehalten', () => {
  const viele = Array.from({ length: 40 }, (_, i) => `ACH_${i}`);
  assert.strictEqual(T.bereinige({ '1': viele })['1'].length, T.MAX_JE_SPIEL);
});

// --- Setzen und Entfernen ----------------------------------------------------

test('Ein Haken setzt den Eintrag, ein zweiter nimmt ihn weg', () => {
  const gesetzt = T.setze({}, 440, 'ACH_A', true);
  assert.strictEqual(gesetzt.geaendert, true);
  assert.deepStrictEqual(gesetzt.listen, { 440: ['ACH_A'] });

  const weg = T.setze(gesetzt.listen, 440, 'ACH_A', false);
  assert.strictEqual(weg.geaendert, true);
  assert.deepStrictEqual(weg.listen, {}, 'ein leeres Spiel wird ganz entfernt');
});

test('Zweimal dasselbe setzen ändert nichts und meldet keinen Fehler', () => {
  const einmal = T.setze({}, 1, 'A', true);
  const nochmal = T.setze(einmal.listen, 1, 'A', true);
  assert.strictEqual(nochmal.geaendert, false);
  assert.strictEqual(nochmal.grund, null);
  assert.deepStrictEqual(nochmal.listen, { 1: ['A'] });
});

test('Etwas zu entfernen, das nicht drin ist, ist kein Fehler', () => {
  const r = T.setze({ 1: ['A'] }, 1, 'B', false);
  assert.strictEqual(r.geaendert, false);
  assert.strictEqual(r.grund, null);
});

test('Über der Obergrenze wird abgelehnt - mit Begründung', () => {
  // Ohne Begründung klickt jemand den Haken und nichts passiert; das wäre
  // von außen nicht zu erklären.
  let listen = {};
  for (let i = 0; i < T.MAX_JE_SPIEL; i++) {
    listen = T.setze(listen, 1, `ACH_${i}`, true).listen;
  }
  const zuviel = T.setze(listen, 1, 'EINER_ZUVIEL', true);

  assert.strictEqual(zuviel.geaendert, false);
  assert.ok(zuviel.grund, 'es muss eine Begründung geben');
  assert.ok(zuviel.grund.includes(String(T.MAX_JE_SPIEL)));
  assert.strictEqual(zuviel.listen[1].length, T.MAX_JE_SPIEL);
});

test('Ein leerer Name wird abgelehnt', () => {
  assert.strictEqual(T.setze({}, 1, '   ', true).geaendert, false);
  assert.strictEqual(T.setze({}, 1, null, true).geaendert, false);
});

test('Spiele stören sich nicht gegenseitig', () => {
  let listen = T.setze({}, 440, 'A', true).listen;
  listen = T.setze(listen, 620, 'B', true).listen;
  assert.deepStrictEqual(listen, { 440: ['A'], 620: ['B'] });

  listen = T.setze(listen, 440, 'A', false).listen;
  assert.deepStrictEqual(listen, { 620: ['B'] }, 'das andere Spiel bleibt unberührt');
});

// --- Erledigtes entfernen ----------------------------------------------------

test('Erreichte Achievements verschwinden von der Liste', () => {
  const r = T.entferneErreichte({ 440: ['A', 'B', 'C'] }, 440, ['B']);
  assert.deepStrictEqual(r.listen, { 440: ['A', 'C'] });
  assert.deepStrictEqual(r.entfernt, ['B'], 'das Entfernte muss benannt sein');
});

test('Sind alle erledigt, verschwindet das Spiel ganz aus der Ablage', () => {
  const r = T.entferneErreichte({ 440: ['A', 'B'] }, 440, ['A', 'B']);
  assert.deepStrictEqual(r.listen, {});
  assert.deepStrictEqual(r.entfernt, ['A', 'B']);
});

test('Ein Spiel ohne Merkliste stürzt nicht ab', () => {
  const r = T.entferneErreichte({}, 999, ['A']);
  assert.deepStrictEqual(r.listen, {});
  assert.deepStrictEqual(r.entfernt, []);
});

test('Andere Spiele bleiben beim Aufräumen unberührt', () => {
  const r = T.entferneErreichte({ 440: ['A'], 620: ['A'] }, 440, ['A']);
  assert.deepStrictEqual(r.listen, { 620: ['A'] });
});

// --- Lesen und Schreiben -----------------------------------------------------

function frischeDatei(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `trophaenschrank-todo-${name}-`));
  return { dir, datei: path.join(dir, 'merkliste.json') };
}

test('Gespeichertes kommt unverändert zurück', () => {
  const { dir, datei } = frischeDatei('rundlauf');
  const gespeichert = T.speichern({ 440: ['ACH_A', 'ACH_B'] }, datei);

  assert.deepStrictEqual(T.laden(datei), gespeichert);
  assert.ok(!fs.existsSync(`${datei}.tmp`), 'die Nebendatei muss umbenannt worden sein');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine beschädigte Datei führt zu leeren Listen, nicht zum Absturz', () => {
  const { dir, datei } = frischeDatei('kaputt');
  fs.writeFileSync(datei, '{ kein JSON', 'utf8');

  assert.deepStrictEqual(T.laden(datei), {});

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine fehlende Datei führt zu leeren Listen', () => {
  assert.deepStrictEqual(T.laden(path.join(os.tmpdir(), 'gibt-es-nicht-8123', 'x.json')), {});
});
