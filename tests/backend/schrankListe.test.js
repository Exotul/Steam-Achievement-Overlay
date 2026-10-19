const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const L = require(path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'schrankListe.js'));

/**
 * Das Achievement-Fenster des Schranks darf NICHT über den Rand hinausragen.
 *
 * Das ist keine Feinheit: Der Schrank reicht bis an alle Bildschirmränder,
 * eine Packung kann also ganz außen stehen — und ein Fenster, das einfach
 * daneben aufgeht, wäre zur Hälfte weg. Gerechnet wird in der Arbeitsfläche,
 * nicht im ganzen Bildschirm: Unter der Taskleiste wäre es zwar „auf dem
 * Bildschirm", aber die unteren Zeilen wären verdeckt.
 */

const FLAECHE = { x: 0, y: 0, width: 3840, height: 2112 }; // 4K minus Taskleiste
const MASSE = { breite: 560, hoehe: 760 };

const drin = (r, a) =>
  r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.width && r.y + r.height <= a.y + a.height;

test('Mitten im Regal steht es rechts neben der Packung', () => {
  const r = L.listeRechteck({ x: 1900, y: 900, breite: 30, hoehe: 240 }, FLAECHE, MASSE);
  assert.ok(r.x > 1930, `rechts daneben erwartet, ist ${r.x}`);
  assert.strictEqual(r.width, 560);
  assert.ok(drin(r, FLAECHE));
});

test('Am rechten Rand klappt es auf die andere Seite', () => {
  // Eine Packung ganz rechts bekommt ihr Fenster links davon, statt es gegen
  // den Rand zu quetschen.
  const r = L.listeRechteck({ x: 3790, y: 900, breite: 30, hoehe: 240 }, FLAECHE, MASSE);
  assert.ok(r.x + r.width <= 3790, `links der Packung erwartet, ist ${r.x}+${r.width}`);
  assert.ok(drin(r, FLAECHE));
});

test('An jeder Ecke bleibt es vollständig in der Arbeitsfläche', () => {
  // Die eigentliche Zusage, an allen vier Ecken und in der Mitte geprüft.
  const ecken = [
    { x: 0, y: 0 },
    { x: 3810, y: 0 },
    { x: 0, y: 1872 },
    { x: 3810, y: 1872 },
    { x: 1920, y: 1000 },
  ];
  for (const e of ecken) {
    const r = L.listeRechteck({ ...e, breite: 30, hoehe: 240 }, FLAECHE, MASSE);
    assert.ok(drin(r, FLAECHE), `bei ${JSON.stringify(e)} ragt es hinaus: ${JSON.stringify(r)}`);
  }
});

test('Auf dem zweiten Bildschirm zählen dessen Koordinaten', () => {
  // Der Schrank steht in der Regel rechts daneben; die Arbeitsfläche beginnt
  // dann bei x = 3840 und nicht bei 0.
  const zweite = { x: 3840, y: 0, width: 3840, height: 2112 };
  const r = L.listeRechteck({ x: 7600, y: 100, breite: 30, hoehe: 240 }, zweite, MASSE);
  assert.ok(drin(r, zweite), JSON.stringify(r));
  assert.ok(r.x >= 3840, 'darf nicht auf den ersten Bildschirm rutschen');
});

test('Eine kleine Arbeitsfläche schrumpft das Fenster, statt es hinausragen zu lassen', () => {
  const klein = { x: 0, y: 0, width: 800, height: 600 };
  const r = L.listeRechteck({ x: 400, y: 300, breite: 20, hoehe: 200 }, klein, MASSE);
  assert.ok(drin(r, klein), JSON.stringify(r));
  assert.ok(r.height < MASSE.hoehe, 'die Höhe muss sich anpassen');
});

test('Eine Taskleiste oben wird genauso beachtet', () => {
  const obenLeiste = { x: 0, y: 48, width: 3840, height: 2112 };
  const r = L.listeRechteck({ x: 100, y: 48, breite: 30, hoehe: 240 }, obenLeiste, MASSE);
  assert.ok(r.y >= 48, `darf nicht unter die Leiste, ist ${r.y}`);
  assert.ok(drin(r, obenLeiste));
});

// --- Die Reihenfolge der Liste ----------------------------------------------

test('Offene zuerst, darin die häufigsten oben', () => {
  // Das ist die Reihenfolge, in der man sie sich vornehmen würde.
  const liste = L.sortiere([
    { name: 'erreicht selten', unlocked: true, globalPercent: 1 },
    { name: 'offen selten', unlocked: false, globalPercent: 2 },
    { name: 'erreicht häufig', unlocked: true, globalPercent: 80 },
    { name: 'offen häufig', unlocked: false, globalPercent: 60 },
  ]);
  assert.deepStrictEqual(liste.map((a) => a.name), [
    'offen häufig',
    'offen selten',
    // Erreichte darunter, die seltensten zuerst - dort ist es eine
    // Trophäenwand, keine Arbeitsliste.
    'erreicht selten',
    'erreicht häufig',
  ]);
});

test('Sortieren lässt die übergebene Liste unangetastet', () => {
  const roh = [{ name: 'b', unlocked: true }, { name: 'a', unlocked: false }];
  const kopie = [...roh];
  L.sortiere(roh);
  assert.deepStrictEqual(roh, kopie);
});

test('Fehlende Angaben stürzen nicht ab', () => {
  assert.deepStrictEqual(L.sortiere(undefined), []);
  assert.strictEqual(L.sortiere([{ name: 'x' }, { name: 'y' }]).length, 2);
});
