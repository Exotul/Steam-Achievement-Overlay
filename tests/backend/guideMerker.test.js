const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const M = require('../../overlay/lib/guideMerker');

/**
 * Welcher Guide zu welchem Spiel — und wo man darin stehengeblieben ist.
 *
 * Das ist der eigentliche Punkt: Einen Guide öffnen kann jeder Browser. Was
 * keiner kann, ist ihn nach drei Monaten genau dort wieder aufzumachen, wo man
 * aufgehört hat. In einem 400 Seiten langen Komplettguide ist das der
 * Unterschied zwischen Weiterspielen und Nochmalsuchen.
 *
 * Die Datei darf von Hand bearbeitet und weitergegeben werden. Also wird
 * geprüft, was aus ihr kommt — die Nummer landet in einer Adresse.
 */

// --- Ein einzelner Eintrag ---------------------------------------------------

test('Ein vollständiger Eintrag bleibt erhalten', () => {
  const e = M.bereinigeEintrag({
    id: '3389709405',
    titel: '100% Achievement Guide',
    stand: 4200,
    zuletzt: '2026-10-24T17:00:00.000Z',
  });
  assert.strictEqual(e.id, '3389709405');
  assert.strictEqual(e.stand, 4200);
  assert.strictEqual(e.titel, '100% Achievement Guide');
});

test('Nur eine reine Zahlenfolge gilt als Guide-Nummer', () => {
  // Sie wird in eine Steam-Adresse eingesetzt. Dort gehört nur hinein, was
  // von Steam kommt.
  for (const unsinn of [
    { id: '' },
    { id: 'abc' },
    { id: '123 OR 1=1' },
    { id: '../../etc/passwd' },
    { id: 'javascript:alert(1)' },
    { id: null },
    {},
    null,
    'nur ein Text',
  ]) {
    assert.strictEqual(M.bereinigeEintrag(unsinn), null, JSON.stringify(unsinn));
  }
});

test('Ein unsinniger Scrollstand wird zurechtgerückt', () => {
  assert.strictEqual(M.bereinigeEintrag({ id: '1', stand: -500 }).stand, 0);
  assert.strictEqual(M.bereinigeEintrag({ id: '1', stand: 'weit unten' }).stand, 0);
  assert.strictEqual(M.bereinigeEintrag({ id: '1', stand: 1e12 }).stand, M.MAX_STAND);
  assert.strictEqual(M.bereinigeEintrag({ id: '1', stand: 1234.7 }).stand, 1235, 'gerundet');
});

// --- Die ganze Zuordnung ------------------------------------------------------

test('Kaputte Einträge fallen weg, heile bleiben', () => {
  const z = M.bereinige({
    1693980: { id: '3389709405', stand: 100 },
    3373660: { id: 'kaputt' },
    'kein appid': { id: '123' },
    892970: { id: '456', titel: 'Valheim: 100% Achievement Guide' },
  });
  assert.deepStrictEqual(Object.keys(z).sort(), ['1693980', '892970']);
});

test('Eine fehlende oder beschädigte Datei hindert nichts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guidemerker-'));
  try {
    assert.deepStrictEqual(M.laden(path.join(dir, 'gibtsnicht.json')), {});
    const kaputt = path.join(dir, 'kaputt.json');
    fs.writeFileSync(kaputt, '{ das ist kein JSON');
    assert.deepStrictEqual(M.laden(kaputt), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Geschrieben und wieder gelesen kommt dasselbe heraus', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guidemerker-'));
  const datei = path.join(dir, 'guides.json');
  try {
    M.speichern({ 1693980: { id: '3389709405', titel: 'Ein Guide', stand: 777 } }, datei);
    const wieder = M.laden(datei);
    assert.strictEqual(wieder['1693980'].id, '3389709405');
    assert.strictEqual(wieder['1693980'].stand, 777);
    // Und die Nebendatei ist wieder weg.
    assert.ok(!fs.existsSync(`${datei}.tmp`));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Merken und Fortschreiben --------------------------------------------------

test('Ein neuer Guide wird mit Stand 0 gemerkt', () => {
  const z = M.merke({}, 1693980, { id: '3389709405', titel: 'Ein Guide' });
  assert.strictEqual(z['1693980'].id, '3389709405');
  assert.strictEqual(z['1693980'].stand, 0);
  assert.ok(z['1693980'].zuletzt, 'der Zeitpunkt wird festgehalten');
});

test('Weiterscrollen behält die Auswahl', () => {
  // Der häufigste Fall: Das Fenster meldet nur den Stand. Ohne diese Regel
  // würde jedes Scrollen die Guide-Auswahl löschen.
  let z = M.merke({}, 1693980, { id: '3389709405', titel: 'Ein Guide' });
  z = M.merke(z, 1693980, { stand: 8400 });
  assert.strictEqual(z['1693980'].id, '3389709405');
  assert.strictEqual(z['1693980'].stand, 8400);
  assert.strictEqual(z['1693980'].titel, 'Ein Guide', 'der Titel bleibt auch stehen');
});

test('Ein ANDERER Guide fängt wieder oben an', () => {
  // Ein Stand aus einem anderen Text wäre eine zufällige Stelle.
  let z = M.merke({}, 1693980, { id: '111', titel: 'Erster' });
  z = M.merke(z, 1693980, { stand: 5000 });
  z = M.merke(z, 1693980, { id: '222', titel: 'Zweiter' });
  assert.strictEqual(z['1693980'].stand, 0);
});

test('Ein Stand ohne vorher gewählten Guide ändert nichts', () => {
  assert.deepStrictEqual(M.merke({}, 1693980, { stand: 4000 }), {});
});

test('Merken lässt die übergebene Zuordnung unangetastet', () => {
  const vorher = { 1693980: { id: '111', titel: null, stand: 10, zuletzt: null } };
  const kopie = JSON.parse(JSON.stringify(vorher));
  M.merke(vorher, 1693980, { stand: 999 });
  assert.deepStrictEqual(vorher, kopie);
});

test('Andere Spiele bleiben beim Merken unberührt', () => {
  let z = M.merke({}, 1693980, { id: '111' });
  z = M.merke(z, 892970, { id: '222' });
  assert.strictEqual(z['1693980'].id, '111');
  assert.strictEqual(z['892970'].id, '222');
});

test('fuerSpiel liefert null statt undefined-Gestolper', () => {
  assert.strictEqual(M.fuerSpiel({}, 1693980), null);
  assert.strictEqual(M.fuerSpiel(null, 1693980), null);
  const z = M.merke({}, 1693980, { id: '111' });
  assert.strictEqual(M.fuerSpiel(z, 1693980).id, '111');
  assert.strictEqual(M.fuerSpiel(z, '1693980').id, '111', 'Text oder Zahl ist egal');
});
