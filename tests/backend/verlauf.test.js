const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/**
 * Auswertung des Trophäenverlaufs.
 *
 * Hier wird mit Datumsangaben gerechnet, und das ist die klassische Quelle
 * stiller Fehler: Zeitzonen, Monatsgrenzen, Schaltjahre, Wochen über den
 * Jahreswechsel. Nichts davon fällt beim Draufschauen auf - ein Raster sieht
 * auch dann richtig aus, wenn es einen Tag verschoben ist.
 *
 * Die Funktionen liegen deshalb abhängigkeitsfrei in frontend/src/lib und
 * werden hier geprüft, ohne eine Oberfläche zu bauen.
 */

const modul = () =>
  import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'verlauf.js')).href);

// Ein fester Bezugspunkt: Mittwoch, 16. September 2026, 10:00 UTC.
const JETZT = Date.parse('2026-09-16T10:00:00Z');

// --- Tagesschlüssel ----------------------------------------------------------

test('Ein Zeitstempel wird zum Tagesschlüssel in UTC', async () => {
  const { tagVon } = await modul();
  assert.strictEqual(tagVon(JETZT), '2026-09-16');
});

test('Die Zeitzone passt zu der des Backends', async () => {
  // Das Backend gruppiert mit toISOString(), also nach UTC-Tagen. Würde hier
  // nach Ortszeit gerechnet, passte die Summe der Tageswerte nicht mehr zur
  // Gesamtzahl - und niemand käme darauf, warum.
  const { tagVon } = await modul();
  const ts = Date.parse('2026-09-16T23:30:00Z');
  assert.strictEqual(tagVon(ts), new Date(ts).toISOString().slice(0, 10));
});

test('Tage verschieben funktioniert über Monats- und Jahresgrenzen', async () => {
  const { tagPlus } = await modul();
  assert.strictEqual(tagPlus('2026-09-16', 1), '2026-09-17');
  assert.strictEqual(tagPlus('2026-09-30', 1), '2026-10-01', 'Monatsende');
  assert.strictEqual(tagPlus('2026-01-01', -1), '2025-12-31', 'Jahreswechsel rückwärts');
  assert.strictEqual(tagPlus('2024-02-28', 1), '2024-02-29', 'Schaltjahr');
  assert.strictEqual(tagPlus('2026-02-28', 1), '2026-03-01', 'kein Schaltjahr');
});

test('Eine Verschiebung um 365 Tage landet ein Jahr früher', async () => {
  const { tagPlus } = await modul();
  assert.strictEqual(tagPlus('2026-09-16', -365), '2025-09-16');
});

// --- Das Raster --------------------------------------------------------------

test('Das Raster besteht aus vollen Wochen', async () => {
  // Ein Raster, das mitten in der Woche anfängt, verschiebt alle
  // Wochentagszeilen - dann liegen Sonntage mal oben, mal unten, und das
  // Muster "am Wochenende spiele ich mehr" ist nicht mehr ablesbar.
  const { baueRaster } = await modul();
  const r = baueRaster([], 53, JETZT);

  assert.strictEqual(r.wochen.length, 53);
  r.wochen.forEach((w, i) => assert.strictEqual(w.length, 7, `Woche ${i}`));
});

test('Jede Zeile des Rasters ist derselbe Wochentag', async () => {
  const { baueRaster } = await modul();
  const r = baueRaster([], 8, JETZT);

  for (let zeile = 0; zeile < 7; zeile++) {
    const tage = r.wochen.map((w) => new Date(`${w[zeile].tag}T12:00:00Z`).getUTCDay());
    assert.strictEqual(new Set(tage).size, 1, `Zeile ${zeile} enthält verschiedene Wochentage`);
  }
});

test('Das Raster beginnt montags und endet sonntags', async () => {
  const { baueRaster } = await modul();
  const r = baueRaster([], 4, JETZT);
  const ersterTag = new Date(`${r.wochen[0][0].tag}T12:00:00Z`).getUTCDay();
  const letzterTag = new Date(`${r.wochen[3][6].tag}T12:00:00Z`).getUTCDay();

  assert.strictEqual(ersterTag, 1, 'erster Tag muss ein Montag sein');
  assert.strictEqual(letzterTag, 0, 'letzter Tag muss ein Sonntag sein');
});

test('Heute liegt im Raster, Tage danach sind als Zukunft markiert', async () => {
  const { baueRaster, tagVon } = await modul();
  const r = baueRaster([], 6, JETZT);
  const alle = r.wochen.flat();

  const heute = alle.find((t) => t.tag === tagVon(JETZT));
  assert.ok(heute, 'heute muss enthalten sein');
  assert.strictEqual(heute.zukunft, false);

  // Ein leerer Tag und ein Tag in der Zukunft sehen sonst gleich aus -
  // "noch nicht gewesen" ist aber etwas anderes als "nichts geschafft".
  const morgen = alle.find((t) => t.tag > tagVon(JETZT));
  assert.ok(morgen, 'die laufende Woche wird vollständig gezeigt');
  assert.strictEqual(morgen.zukunft, true);
});

test('Werte aus den Tagesdaten landen an der richtigen Stelle', async () => {
  const { baueRaster } = await modul();
  const proTag = [
    { tag: '2026-09-14', anzahl: 3, xp: 300, stufen: { Kupfer: 3 } },
    { tag: '2026-09-16', anzahl: 7, xp: 900, stufen: { Gold: 7 } },
  ];
  const r = baueRaster(proTag, 3, JETZT);
  const alle = r.wochen.flat();

  assert.strictEqual(alle.find((t) => t.tag === '2026-09-14').anzahl, 3);
  assert.strictEqual(alle.find((t) => t.tag === '2026-09-16').anzahl, 7);
  assert.strictEqual(alle.find((t) => t.tag === '2026-09-15').anzahl, 0, 'Lücke bleibt leer');
  assert.strictEqual(r.maximum, 7);
});

test('Ein leeres Raster stürzt nicht ab', async () => {
  const { baueRaster } = await modul();
  for (const eingabe of [undefined, null, []]) {
    const r = baueRaster(eingabe, 4, JETZT);
    assert.strictEqual(r.maximum, 0);
    assert.strictEqual(r.wochen.flat().length, 28);
  }
});

// --- Farbstufen --------------------------------------------------------------

test('Ohne Trophäen gibt es die Stufe 0', async () => {
  const { stufeVon } = await modul();
  assert.strictEqual(stufeVon(0, 10), 0);
  assert.strictEqual(stufeVon(-1, 10), 0);
});

test('Die Stufen richten sich nach dem eigenen Höchstwert', async () => {
  // Wer an guten Tagen drei Trophäen holt, soll dieselbe Spanne sehen wie
  // jemand mit dreißig - sonst ist das Raster für die einen immer blass.
  const { stufeVon } = await modul();
  assert.strictEqual(stufeVon(3, 3), 4, 'der eigene Höchstwert ist immer die oberste Stufe');
  assert.strictEqual(stufeVon(30, 30), 4);
  assert.strictEqual(stufeVon(1, 4), 1);
  assert.strictEqual(stufeVon(4, 4), 4);
});

test('Ein einziger Tag mit einer Trophäe bekommt die oberste Stufe', async () => {
  // Sonst wäre das ganze Raster blass, obwohl es nichts Helleres gibt.
  const { stufeVon } = await modul();
  assert.strictEqual(stufeVon(1, 1), 4);
});

test('Die Stufen steigen monoton mit der Anzahl', async () => {
  const { stufeVon } = await modul();
  let vorher = -1;
  for (let n = 0; n <= 20; n++) {
    const s = stufeVon(n, 20);
    assert.ok(s >= vorher, `Stufe sinkt bei ${n}`);
    assert.ok(s >= 0 && s <= 4, `Stufe ${s} ausserhalb der Rampe`);
    vorher = s;
  }
});

// --- Serie -------------------------------------------------------------------

test('Aufeinanderfolgende Tage ergeben eine Serie', async () => {
  const { serie } = await modul();
  const proTag = [
    { tag: '2026-09-14', anzahl: 1 },
    { tag: '2026-09-15', anzahl: 2 },
    { tag: '2026-09-16', anzahl: 1 },
  ];
  assert.strictEqual(serie(proTag, JETZT), 3);
});

test('Gestern zählt als Start - man hat heute nur noch nicht gespielt', async () => {
  const { serie } = await modul();
  const proTag = [
    { tag: '2026-09-14', anzahl: 1 },
    { tag: '2026-09-15', anzahl: 1 },
  ];
  assert.strictEqual(serie(proTag, JETZT), 2);
});

test('Eine Lücke beendet die Serie', async () => {
  const { serie } = await modul();
  const proTag = [
    { tag: '2026-09-10', anzahl: 5 },
    { tag: '2026-09-11', anzahl: 5 },
    // 12. bis 14. nichts
    { tag: '2026-09-15', anzahl: 1 },
    { tag: '2026-09-16', anzahl: 1 },
  ];
  assert.strictEqual(serie(proTag, JETZT), 2, 'nur die aktuelle Serie zählt');
});

test('Ein Tag mit null Trophäen bricht die Serie', async () => {
  const { serie } = await modul();
  const proTag = [
    { tag: '2026-09-15', anzahl: 0 },
    { tag: '2026-09-16', anzahl: 3 },
  ];
  assert.strictEqual(serie(proTag, JETZT), 1);
});

test('Ohne Daten ist die Serie null', async () => {
  const { serie } = await modul();
  assert.strictEqual(serie([], JETZT), 0);
  assert.strictEqual(serie(null, JETZT), 0);
});

// --- Summen ------------------------------------------------------------------

test('Die Summe berücksichtigt nur den gewählten Zeitraum', async () => {
  const { summe } = await modul();
  const proTag = [
    { tag: '2026-09-01', anzahl: 100, xp: 1000, stufen: { Kupfer: 100 } },
    { tag: '2026-09-15', anzahl: 2, xp: 200, stufen: { Gold: 2 } },
    { tag: '2026-09-16', anzahl: 3, xp: 300, stufen: { Kupfer: 1, Platin: 2 } },
  ];

  const woche = summe(proTag, 7, JETZT);
  assert.strictEqual(woche.anzahl, 5, 'der 1. September liegt ausserhalb');
  assert.strictEqual(woche.xp, 500);
  assert.strictEqual(woche.stufen.Gold, 2);
  assert.strictEqual(woche.stufen.Platin, 2);
  assert.strictEqual(woche.stufen.Kupfer, 1);

  const monat = summe(proTag, 30, JETZT);
  assert.strictEqual(monat.anzahl, 105);
});

test('Der beste Tag im Zeitraum wird gefunden', async () => {
  const { summe } = await modul();
  const proTag = [
    { tag: '2026-09-14', anzahl: 2, xp: 0, stufen: {} },
    { tag: '2026-09-15', anzahl: 9, xp: 0, stufen: {} },
    { tag: '2026-09-16', anzahl: 4, xp: 0, stufen: {} },
  ];
  assert.strictEqual(summe(proTag, 7, JETZT).besterTag.tag, '2026-09-15');
});

test('Unbekannte Stufen bringen die Summe nicht durcheinander', async () => {
  const { summe } = await modul();
  const r = summe([{ tag: '2026-09-16', anzahl: 1, xp: 5, stufen: { Quatsch: 1 } }], 7, JETZT);
  assert.strictEqual(r.anzahl, 1);
  assert.deepStrictEqual(Object.keys(r.stufen).sort(), ['Gold', 'Kupfer', 'Platin', 'Silber']);
});

test('Ein leerer Zeitraum liefert Nullen statt undefined', async () => {
  const { summe } = await modul();
  const r = summe([], 30, JETZT);
  assert.strictEqual(r.anzahl, 0);
  assert.strictEqual(r.xp, 0);
  assert.strictEqual(r.besterTag, null);
});

// --- Gruppierung der Einzeleinträge ------------------------------------------

test('Freischaltungen werden nach Tag gruppiert, jüngste zuerst', async () => {
  const { nachTagen } = await modul();
  const verlauf = [
    { ts: Date.parse('2026-09-14T10:00:00Z'), name: 'A', xpZuwachs: 10 },
    { ts: Date.parse('2026-09-16T08:00:00Z'), name: 'B', xpZuwachs: 20 },
    { ts: Date.parse('2026-09-16T09:00:00Z'), name: 'C', xpZuwachs: 30 },
  ];
  const tage = nachTagen(verlauf);

  assert.deepStrictEqual(tage.map((t) => t.tag), ['2026-09-16', '2026-09-14']);
  assert.strictEqual(tage[0].eintraege.length, 2);
  assert.strictEqual(tage[0].xp, 50, 'XP des Tages werden zusammengezählt');
});

test('Fehlende XP-Angaben zählen als null', async () => {
  const { nachTagen } = await modul();
  const tage = nachTagen([{ ts: JETZT, name: 'A' }]);
  assert.strictEqual(tage[0].xp, 0);
});

test('Ein leerer Verlauf ergibt eine leere Liste', async () => {
  const { nachTagen } = await modul();
  assert.deepStrictEqual(nachTagen([]), []);
  assert.deepStrictEqual(nachTagen(null), []);
});

// --- Darstellung -------------------------------------------------------------

test('Das Datum wird auf Deutsch ausgeschrieben', async () => {
  const { lesbaresDatum } = await modul();
  assert.strictEqual(lesbaresDatum('2026-09-16'), '16. September 2026');
});

test('Das Datum verschiebt sich nicht durch die Zeitzone', async () => {
  // Ohne feste Zeitzone würde der 1. eines Monats westlich von Greenwich als
  // letzter Tag des Vormonats erscheinen.
  const { lesbaresDatum } = await modul();
  assert.ok(lesbaresDatum('2026-01-01').startsWith('1. Januar'));
  assert.ok(lesbaresDatum('2026-12-31').startsWith('31. Dezember'));
});
