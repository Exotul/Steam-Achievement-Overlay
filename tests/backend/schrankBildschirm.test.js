const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { waehleBildschirm } = require(
  path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'schrankBildschirm.js')
);

/**
 * Auf welchem Bildschirm der Schrank steht - oder auf keinem.
 *
 * DER FALL, DER DAS AUSGELÖST HAT: Der zweite Monitor war aus. Der Schrank
 * wich auf den Hauptbildschirm aus und lag dort hinter Browser, Discord und
 * Spielfenster — unsichtbar, aber er rechnete mit.
 *
 * Irrt die Entscheidung in die eine Richtung, baut sich ein Hintergrundbild
 * auf, das niemand zu sehen bekommt. Irrt sie in die andere, bleibt der
 * Schrank weg, obwohl ein Bildschirm frei wäre. Beide Richtungen stehen hier.
 */

const HAUPT = { id: 1, name: 'Hauptbildschirm' };
const ZWEITER = { id: 2, name: 'Zweiter' };

// --- Automatisch (die Vorgabe) ----------------------------------------------

test('Mit zwei Bildschirmen nimmt er den, auf dem keine Meldungen erscheinen', () => {
  assert.deepStrictEqual(waehleBildschirm([HAUPT, ZWEITER], null, 1), ZWEITER);
  // Und umgekehrt, wenn die Meldungen auf dem zweiten liegen.
  assert.deepStrictEqual(waehleBildschirm([HAUPT, ZWEITER], null, 2), HAUPT);
});

test('Mit nur einem Bildschirm bleibt der Schrank zu', () => {
  // Genau der gemeldete Fall: zweiter Monitor aus. Vorher landete der Schrank
  // auf dem Hauptbildschirm und lag dort unsichtbar hinter allem.
  assert.strictEqual(waehleBildschirm([HAUPT], null, 1), null);
});

test('Kommt der zweite Bildschirm zurück, ist er wieder dran', () => {
  assert.strictEqual(waehleBildschirm([HAUPT], null, 1), null);
  assert.deepStrictEqual(waehleBildschirm([HAUPT, ZWEITER], null, 1), ZWEITER);
});

// --- Ausdrücklich gewählt ----------------------------------------------------

test('Eine ausdrückliche Wahl wird befolgt', () => {
  assert.deepStrictEqual(waehleBildschirm([HAUPT, ZWEITER], 2, 1), ZWEITER);
});

test('Auch der Bildschirm mit den Meldungen, wenn er ausdrücklich gewählt ist', () => {
  // Wer das einstellt, meint es so - etwa mit nur einem Monitor, als
  // Hintergrundbild im Wallpaper-Engine-Sinn.
  assert.deepStrictEqual(waehleBildschirm([HAUPT], 1, 1), HAUPT);
});

test('Ist der gewählte Bildschirm weg, wird NICHT ausgewichen', () => {
  // Das ist der Kern: lieber kein Schrank als einer an der falschen Stelle.
  assert.strictEqual(waehleBildschirm([HAUPT], 2, 1), null);
});

// --- Kaputte Eingaben --------------------------------------------------------

test('Ohne Bildschirme gibt es nichts zu wählen', () => {
  assert.strictEqual(waehleBildschirm([], null, 1), null);
  assert.strictEqual(waehleBildschirm(null, null, 1), null);
  assert.strictEqual(waehleBildschirm(undefined, 2, 1), null);
});
