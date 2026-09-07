const test = require('node:test');
const assert = require('node:assert');

const P = require('../../backend/services/xpPlan');

/**
 * Diese Entscheidung bestimmt, wie lange jemand beim Start der App wartet.
 *
 * Vorher wurde stur die halbe Bibliothek durchgefragt - bei 488 Spielen rund
 * 1.000 Steam-Abfragen, jedes Mal, zwölf Stunden nachdem dasselbe schon
 * einmal ausgerechnet worden war. Die Überlegung dahinter: Trophäen bekommt
 * man nur durch Spielen. Ändert sich die Spielzeit nicht, kann sich der
 * XP-Beitrag nicht geändert haben.
 *
 * Wird das hier zu großzügig, zeigt die App falsche Level. Wird es zu streng,
 * ist die Beschleunigung wirkungslos. Deshalb diese Tests.
 */

const eintrag = (xp, spielzeit) => ({ xp, spielzeit });

// --- Wann darf ein gemerkter Wert weiterverwendet werden? --------------------

test('Unveränderte Spielzeit heißt: der gemerkte Wert gilt weiter', () => {
  assert.strictEqual(P.darfWiederverwenden(eintrag(1500, 420), 420), true);
});

test('Gestiegene Spielzeit erzwingt eine neue Abfrage', () => {
  // Es wurde gespielt - es könnten Trophäen dazugekommen sein.
  assert.strictEqual(P.darfWiederverwenden(eintrag(1500, 420), 421), false);
});

test('Gesunkene Spielzeit erzwingt ebenfalls eine neue Abfrage', () => {
  // Sollte nicht vorkommen (Steam zählt nur hoch). Wenn doch, stimmt etwas
  // nicht - dann ist Nachrechnen die sichere Antwort.
  assert.strictEqual(P.darfWiederverwenden(eintrag(1500, 420), 100), false);
});

test('Fehlender oder unbrauchbarer Eintrag führt zur Abfrage', () => {
  assert.strictEqual(P.darfWiederverwenden(undefined, 10), false);
  assert.strictEqual(P.darfWiederverwenden(null, 10), false);
  assert.strictEqual(P.darfWiederverwenden({}, 10), false);
  assert.strictEqual(P.darfWiederverwenden({ xp: 5 }, 10), false, 'ohne Spielzeit unbeurteilbar');
  assert.strictEqual(P.darfWiederverwenden({ spielzeit: 10 }, 10), false, 'ohne XP wertlos');
  assert.strictEqual(P.darfWiederverwenden({ xp: NaN, spielzeit: 10 }, 10), false);
});

test('Werte aus einer älteren Fassung werden verworfen', () => {
  // Früher stand dort eine nackte Zahl ohne Spielzeit. Die lässt sich nicht
  // mehr beurteilen - lieber einmal neu rechnen als dauerhaft falsch liegen.
  assert.strictEqual(P.darfWiederverwenden(1500, 420), false);
  assert.strictEqual(P.darfWiederverwenden(0, 420), false);
});

test('Ein gemerkter Wert von 0 XP ist ein gültiger Wert', () => {
  // Spiele ohne Achievement-System liefern 0. Das ist ein Ergebnis, kein
  // fehlender Wert - sonst würden genau diese Spiele ewig neu abgefragt.
  assert.strictEqual(P.darfWiederverwenden(eintrag(0, 300), 300), true);
});

// --- Aufteilung der Bibliothek ----------------------------------------------

const spiel = (appid, playtime_forever) => ({ appid, playtime_forever });

test('Nie gespielte Titel werden gar nicht erst betrachtet', () => {
  const spiele = [spiel(1, 0), spiel(2, 0), spiel(3, 120)];
  const { offen, sicher } = P.planeBerechnung(spiele, () => undefined);

  assert.deepStrictEqual(offen.map((g) => g.appid), [3]);
  assert.strictEqual(sicher.length, 0);
});

test('Unveränderte Spiele landen im Speicher-Topf und ihre XP werden addiert', () => {
  const gemerkt = { 1: eintrag(1000, 100), 2: eintrag(500, 200) };
  const spiele = [spiel(1, 100), spiel(2, 200), spiel(3, 300)];

  const { offen, sicher, xpSicher } = P.planeBerechnung(spiele, (id) => gemerkt[id]);

  assert.deepStrictEqual(sicher.map((g) => g.appid), [1, 2]);
  assert.deepStrictEqual(offen.map((g) => g.appid), [3], 'nur das unbekannte muss abgefragt werden');
  assert.strictEqual(xpSicher, 1500, 'die gemerkten XP müssen mitgezählt werden');
});

test('Ein einziges gespieltes Spiel macht nur eine einzige Abfrage nötig', () => {
  // Der Alltagsfall: Beim Start nach einer Spielsitzung hat sich genau ein
  // Titel geändert. Genau dafür ist die ganze Übung da.
  const gemerkt = {};
  const spiele = [];
  for (let i = 1; i <= 300; i++) {
    gemerkt[i] = eintrag(10, 60);
    spiele.push(spiel(i, 60));
  }
  spiele[41] = spiel(42, 75); // dieser eine wurde gespielt

  const { offen, sicher, xpSicher } = P.planeBerechnung(spiele, (id) => gemerkt[id]);

  assert.strictEqual(offen.length, 1, `nur eine Abfrage erwartet, geplant: ${offen.length}`);
  assert.strictEqual(offen[0].appid, 42);
  assert.strictEqual(sicher.length, 299);
  assert.strictEqual(xpSicher, 2990);
});

test('Ohne jeden gemerkten Wert muss alles Gespielte abgefragt werden', () => {
  const spiele = [spiel(1, 10), spiel(2, 20), spiel(3, 0)];
  const { offen, sicher, xpSicher } = P.planeBerechnung(spiele, () => undefined);

  assert.strictEqual(offen.length, 2);
  assert.strictEqual(sicher.length, 0);
  assert.strictEqual(xpSicher, 0);
});

test('Eine leere oder fehlende Bibliothek stürzt nicht ab', () => {
  assert.deepStrictEqual(P.planeBerechnung([], () => undefined), {
    offen: [],
    sicher: [],
    xpSicher: 0,
  });
  assert.strictEqual(P.planeBerechnung(undefined, () => undefined).offen.length, 0);
  assert.strictEqual(P.planeBerechnung(null, () => undefined).sicher.length, 0);
});
