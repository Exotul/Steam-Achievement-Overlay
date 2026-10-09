const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const { ordneSpiele, UNSORTIERT, VERSCHIEDENES } = require('../../backend/services/spieleschrank');

/**
 * Welches Spiel steht in welchem Fach?
 *
 * Die eine Regel, um die es geht: Ein Spiel steht in mehreren Sammlungen,
 * aber im Regal nur an EINER Stelle - sonst steht dieselbe Packung dreimal da.
 */

const spiel = (appid, name, playtime_forever = 0) => ({ appid, name, playtime_forever });
const sammlung = (name, appIds, art = 'eigene') => ({ id: 'uc-' + name, name, appIds, art, dynamisch: false });

const BIBLIOTHEK = [
  spiel(1, 'Resident Evil 4', 1200),
  spiel(2, 'Silent Hill 2', 300),
  spiel(3, 'Fallout 4', 900),
  spiel(4, 'Fallout 76', 60),
  spiel(5, 'Skyrim', 4000),
  spiel(6, 'Irgendein Indie', 20),
  spiel(7, 'Wallpaper Engine', 5000),
  spiel(8, 'Peinliches Spiel', 10),
  spiel(9, 'Fallout 3', 500),
  spiel(10, 'Dead Space', 800),
  spiel(11, 'The Witcher 3', 2000),
  spiel(12, 'Oblivion', 700),
];

const SAMMLUNGEN = [
  sammlung('Horror', [1, 2, 10]),
  sammlung('RPG', [3, 4, 5, 9, 11, 12]),
  sammlung('Fallout', [3, 4, 9]),
  sammlung('Programme', [7]),
  sammlung('Favoriten', [5], 'favorit'),
  sammlung('Versteckt', [8], 'versteckt'),
];

const fach = (ergebnis, name) => ergebnis.faecher.find((f) => f.name === name);
const spieleIn = (ergebnis, name) => (fach(ergebnis, name)?.spiele || []).map((s) => s.name);

test('Jedes Spiel steht genau einmal im Schrank', () => {
  const e = ordneSpiele(SAMMLUNGEN, BIBLIOTHEK);
  const alle = e.faecher.flatMap((f) => f.spiele.map((s) => s.appId));
  assert.strictEqual(alle.length, new Set(alle).size, 'ein Spiel steht doppelt');
});

test('Die genauere Sammlung gewinnt', () => {
  // Fallout 4 liegt in "RPG" (5 Spiele) und in "Fallout" (3). Die kleinere
  // Sammlung ist die genauere Aussage - das Spiel gehoert ins Fallout-Fach.
  const e = ordneSpiele(SAMMLUNGEN, BIBLIOTHEK);
  assert.deepStrictEqual(spieleIn(e, 'Fallout'), ['Fallout 4', 'Fallout 3', 'Fallout 76']);
  assert.deepStrictEqual(spieleIn(e, 'RPG'), ['Skyrim', 'The Witcher 3', 'Oblivion']);
});

test('Verstecktes und Programme kommen gar nicht in den Schrank', () => {
  const e = ordneSpiele(SAMMLUNGEN, BIBLIOTHEK);
  const alle = e.faecher.flatMap((f) => f.spiele.map((s) => s.name));
  assert.ok(!alle.includes('Peinliches Spiel'), 'verstecktes Spiel');
  assert.ok(!alle.includes('Wallpaper Engine'), 'Programm');
  assert.ok(!e.faecher.some((f) => f.name === 'Programme'));
});

test('Favoriten bekommen kein eigenes Fach, sondern ein Zeichen', () => {
  const e = ordneSpiele(SAMMLUNGEN, BIBLIOTHEK);
  assert.ok(!e.faecher.some((f) => f.name === 'Favoriten'));
  const skyrim = fach(e, 'RPG').spiele.find((s) => s.name === 'Skyrim');
  assert.strictEqual(skyrim.favorit, true);
  assert.strictEqual(fach(e, 'Horror').spiele[0].favorit, false);
});

test('Spiele ohne Sammlung landen im Fach Unsortiert', () => {
  const e = ordneSpiele(SAMMLUNGEN, BIBLIOTHEK);
  assert.deepStrictEqual(spieleIn(e, UNSORTIERT), ['Irgendein Indie']);
});

test('Winzige Sammlungen werden zu "Verschiedenes" zusammengelegt', () => {
  // Sonst besteht der Schrank aus zwei Dutzend fast leeren Kaesten.
  const e = ordneSpiele(
    [sammlung('Rythm', [1]), sammlung('Puzzle', [2]), sammlung('Horror', [3, 4, 5])],
    BIBLIOTHEK.slice(0, 5)
  );
  assert.ok(!e.faecher.some((f) => f.name === 'Rythm'));
  const misch = fach(e, VERSCHIEDENES);
  assert.strictEqual(misch.anzahl, 2);
  // Woher sie kamen, bleibt erhalten - fuer die Beschriftung im Fach.
  assert.deepStrictEqual(misch.spiele.map((s) => s.herkunft).sort(), ['Puzzle', 'Rythm']);
});

test('Im Fach steht das Meistgespielte vorn', () => {
  const e = ordneSpiele([sammlung('Alles', [1, 2, 3])], BIBLIOTHEK);
  assert.deepStrictEqual(spieleIn(e, 'Alles'), ['Resident Evil 4', 'Fallout 4', 'Silent Hill 2']);
});

test('Grosse Faecher zuerst, die Sammelfaecher ganz hinten', () => {
  const e = ordneSpiele(SAMMLUNGEN, BIBLIOTHEK);
  const namen = e.faecher.map((f) => f.name);
  assert.strictEqual(namen[namen.length - 1], UNSORTIERT, namen.join(', '));
  const echte = namen.filter((n) => n !== UNSORTIERT && n !== VERSCHIEDENES);
  const anzahlen = echte.map((n) => fach(e, n).anzahl);
  assert.deepStrictEqual(anzahlen, [...anzahlen].sort((a, b) => b - a), namen.join(', '));
});

test('Sammlungseintraege, die nicht mehr in der Bibliothek sind, fallen weg', () => {
  // Eine Sammlung kann Spiele nennen, die der Anwender nicht mehr besitzt.
  const e = ordneSpiele([sammlung('Horror', [1, 2, 10, 999])], BIBLIOTHEK);
  assert.strictEqual(fach(e, 'Horror').anzahl, 3);
});

test('Ohne Sammlungen steht alles in einem Fach - statt gar nichts', () => {
  const e = ordneSpiele([], BIBLIOTHEK);
  assert.strictEqual(e.faecher.length, 1);
  assert.strictEqual(fach(e, UNSORTIERT).anzahl, BIBLIOTHEK.length);
});

test('Jedes Spiel bringt seine Bildadressen mit', () => {
  const e = ordneSpiele(SAMMLUNGEN, BIBLIOTHEK);
  const re4 = fach(e, 'Horror').spiele[0];
  assert.ok(re4.libraryUrl.includes('/apps/1/library_600x900.jpg'), re4.libraryUrl);
  assert.ok(re4.headerUrl.includes('/apps/1/header.jpg'), re4.headerUrl);
});
