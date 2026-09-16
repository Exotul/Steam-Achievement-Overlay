const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { lesbareSpanne } = require(
  path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'zeitspanne.js')
);

/**
 * Der Rückblick in der Spielstart-Meldung steht oder fällt mit diesen Sätzen.
 * Steht dort etwas Falsches, ist es schlimmer als gar nichts: Man richtet
 * sich danach ein ("ach, das war erst letzte Woche") und liegt daneben.
 */

const MINUTE = 60 * 1000;
const STUNDE = 60 * MINUTE;
const TAG = 24 * STUNDE;

const JETZT = Date.parse('2026-09-16T20:00:00Z');
const vor = (ms) => lesbareSpanne(JETZT - ms, JETZT);

// --- Die üblichen Fälle -------------------------------------------------------

test('Eben Geschehenes heißt "gerade eben"', () => {
  assert.strictEqual(vor(0), 'gerade eben');
  assert.strictEqual(vor(20 * MINUTE), 'gerade eben');
  assert.strictEqual(vor(89 * MINUTE), 'gerade eben');
});

test('Stunden werden als Stunden benannt', () => {
  assert.strictEqual(vor(2 * STUNDE), 'vor 2 Stunden');
  assert.strictEqual(vor(9 * STUNDE), 'vor 9 Stunden');
});

test('Ein Tag ist "gestern", nicht "vor 1 Tagen"', () => {
  assert.strictEqual(vor(TAG), 'gestern');
  assert.strictEqual(vor(1.5 * TAG), 'gestern');
});

test('Wenige Tage werden gezählt', () => {
  assert.strictEqual(vor(3 * TAG), 'vor 3 Tagen');
  assert.strictEqual(vor(6 * TAG), 'vor 6 Tagen');
});

test('Ab einer Woche wird in Wochen gerechnet', () => {
  assert.strictEqual(vor(7 * TAG), 'vor einer Woche');
  assert.strictEqual(vor(21 * TAG), 'vor 3 Wochen');
  assert.strictEqual(vor(59 * TAG), 'vor 8 Wochen');
});

test('Ab zwei Monaten wird in Monaten gerechnet', () => {
  assert.strictEqual(vor(60 * TAG), 'vor 2 Monaten');
  assert.strictEqual(vor(200 * TAG), 'vor 6 Monaten');
});

test('Sehr lange her wird nicht mehr genau beziffert', () => {
  assert.strictEqual(vor(400 * TAG), 'vor über einem Jahr');
  assert.strictEqual(vor(3 * 365 * TAG), 'vor über 3 Jahren');
});

// --- Die Randfälle, wegen derer es diese Datei gibt ---------------------------

test('Kein Einzahl-Plural-Unfall an den Grenzen', () => {
  // "vor 1 Tagen" und "vor 1 Wochen" sind genau die Stellen, an denen solche
  // Funktionen üblicherweise auffallen.
  for (const text of [vor(TAG), vor(7 * TAG), vor(STUNDE)]) {
    assert.ok(!/\b1 (Tagen|Wochen|Stunden|Monaten)\b/.test(text), `holprig: "${text}"`);
  }
});

test('Unbrauchbare Angaben ergeben null, nicht "vor 56 Jahren"', () => {
  // Ein fehlender Zeitstempel wird gern zu 0 - und 0 ist der 1.1.1970.
  assert.strictEqual(lesbareSpanne(0, JETZT), null);
  assert.strictEqual(lesbareSpanne(null, JETZT), null);
  assert.strictEqual(lesbareSpanne(undefined, JETZT), null);
  assert.strictEqual(lesbareSpanne('kein Datum', JETZT), null);
  assert.strictEqual(lesbareSpanne(NaN, JETZT), null);
});

test('Ein Zeitstempel als Text wird verstanden', () => {
  assert.strictEqual(lesbareSpanne('2026-09-13T20:00:00Z', JETZT), 'vor 3 Tagen');
});

test('Zukunft ergibt null statt einer unsinnigen Angabe', () => {
  // Kommt vor, wenn die Uhr des Rechners nachgestellt wird.
  assert.strictEqual(lesbareSpanne(JETZT + 5 * TAG, JETZT), null);
});

test('Eine Minute Vorsprung wird noch verziehen', () => {
  // Kleine Abweichungen zwischen Backend- und Overlay-Uhr sollen nicht dazu
  // führen, dass der Rückblick verschwindet.
  assert.strictEqual(lesbareSpanne(JETZT + 30 * 1000, JETZT), 'gerade eben');
});
