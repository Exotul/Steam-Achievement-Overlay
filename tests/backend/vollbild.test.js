const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { deuteAusgabe } = require(
  path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'vollbild.js')
);

/**
 * Die Übersicht öffnet sich nur, wenn diese Deutung "nicht exklusiv" sagt.
 *
 * Irrt sie in die eine Richtung, minimiert sich das Spiel - genau der Fehler,
 * den es zu beheben galt. Irrt sie in die andere, geht die Übersicht nie mehr
 * auf, und niemand weiß warum. Beide Richtungen sind hier festgehalten.
 */

// --- Was Windows zurückgibt ---------------------------------------------------

test('3 ist exklusives Vollbild - so meldet es Dead Space', () => {
  // An diesem Rechner nachgemessen, während Dead Space lief.
  const r = deuteAusgabe('3\r\n');
  assert.strictEqual(r.code, 3);
  assert.strictEqual(r.zustand, 'exklusiv');
  assert.strictEqual(r.exklusiv, true);
});

test('5 ist der normale Desktop', () => {
  const r = deuteAusgabe('5\r\n');
  assert.strictEqual(r.zustand, 'frei');
  assert.strictEqual(r.exklusiv, false);
});

test('2 ist Vollbild, aber NICHT exklusiv - dort darf die Übersicht auf', () => {
  // Randlose Spiele und Präsentationen melden 2. Sie wie 3 zu behandeln
  // hieße, die Übersicht genau dort zu sperren, wo sie funktioniert - bei
  // Galaxy Burger blieb Steams Overlay mit ihr 8 Sekunden lang offen.
  const r = deuteAusgabe('2');
  assert.strictEqual(r.zustand, 'vollbild');
  assert.strictEqual(r.exklusiv, false);
});

test('Alle bekannten Werte werden benannt', () => {
  const erwartet = { 1: 'gesperrt', 4: 'praesentation', 6: 'ruhezeit', 7: 'app' };
  for (const [code, zustand] of Object.entries(erwartet)) {
    assert.strictEqual(deuteAusgabe(code).zustand, zustand, `Wert ${code}`);
    assert.strictEqual(deuteAusgabe(code).exklusiv, false, `Wert ${code}`);
  }
});

// --- Was schiefgehen kann -----------------------------------------------------

test('Eine Fehlermeldung wird nicht als Zahl missverstanden', () => {
  // PowerShell schreibt bei einem Fehler Text. Daraus darf weder "frei" noch
  // "exklusiv" werden.
  const r = deuteAusgabe('Add-Type : Der Typname "TS.Q" ist bereits vorhanden.');
  assert.strictEqual(r.code, null);
  assert.strictEqual(r.zustand, 'unbekannt');
  assert.strictEqual(r.exklusiv, false);
});

test('Leere Ausgabe ergibt "unbekannt"', () => {
  for (const leer of ['', '   ', '\r\n', null, undefined]) {
    const r = deuteAusgabe(leer);
    assert.strictEqual(r.zustand, 'unbekannt', JSON.stringify(leer));
    assert.strictEqual(r.exklusiv, false);
  }
});

test('Ein unbekannter Wert wird nicht geraten', () => {
  const r = deuteAusgabe('42');
  assert.strictEqual(r.code, 42);
  assert.strictEqual(r.zustand, 'unbekannt');
  assert.strictEqual(r.exklusiv, false);
});

test('Eine Zahl irgendwo in einer Fehlermeldung zählt nicht', () => {
  // "Zeile 3" in einer Fehlermeldung ist keine Antwort von Windows. Nur eine
  // Zeile, die ausschließlich aus der Zahl besteht, gilt.
  const r = deuteAusgabe('In Zeile:3 Zeichen:1 - Fehler');
  assert.strictEqual(r.exklusiv, false);
  assert.strictEqual(r.zustand, 'unbekannt');
});

test('Die Antwort darf in einer eigenen Zeile nach anderer Ausgabe stehen', () => {
  // Manche PowerShell-Profile schreiben vorab etwas. Die Zahl steht dann in
  // der letzten Zeile und muss trotzdem gefunden werden.
  const r = deuteAusgabe('Willkommen\r\n3\r\n');
  assert.strictEqual(r.exklusiv, true);
});
