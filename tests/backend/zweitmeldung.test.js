const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const Z = require(path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'zweitmeldung.js'));

/**
 * Die Zweitmeldung soll genau einen Fall abdecken: ein Spiel im Vollbild.
 *
 * Irrt die Entscheidung in die eine Richtung, blinkt mitten beim Arbeiten
 * eine Trophäenmeldung auf dem Nebenbildschirm auf. Irrt sie in die andere,
 * erscheint die Meldung nirgends - genau der Fall, für den es sie gibt.
 * Beide Richtungen stehen hier.
 */

// --- Welche Bildschirme ------------------------------------------------------

test('Alle Bildschirme außer dem mit dem Overlay', () => {
  const alle = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepStrictEqual(Z.zweitBildschirme(alle, 2), [{ id: 1 }, { id: 3 }]);
});

test('Ein einzelner Bildschirm ergibt nichts zu spiegeln', () => {
  // Wichtig: Sonst läge die Zweitmeldung über dem Spiel selbst - also genau
  // dort, wo Windows sie ohnehin nicht zeigt.
  assert.deepStrictEqual(Z.zweitBildschirme([{ id: 1 }], 1), []);
});

test('Ohne eingestellten Hauptbildschirm bleiben alle übrig', () => {
  // einstellungen.bildschirm ist null, solange der Hauptbildschirm gilt. Die
  // id des Hauptbildschirms wird deshalb immer aufgelöst übergeben - kommt
  // doch null an, darf daraus keine leere Liste werden, sondern eine
  // vollständige. Lieber einmal zu viel als die Meldung zu verlieren.
  const alle = [{ id: 7 }, { id: 8 }];
  assert.deepStrictEqual(Z.zweitBildschirme(alle, null), alle);
});

test('Kaputte Eingabe ergibt eine leere Liste, keinen Absturz', () => {
  for (const unsinn of [null, undefined, 'zwei', 42, {}]) {
    assert.deepStrictEqual(Z.zweitBildschirme(unsinn, 1), [], JSON.stringify(unsinn));
  }
});

// --- Wann gespiegelt wird ----------------------------------------------------

const LAGE = { eingeschaltet: true, spielLaeuft: true, vollbild: true, fenster: 1 };

test('Spiel im Vollbild, zweiter Bildschirm da: wird gespiegelt', () => {
  assert.strictEqual(Z.darfSpiegeln(LAGE), true);
});

test('Jede einzelne Bedingung genügt, um es zu lassen', () => {
  assert.strictEqual(Z.darfSpiegeln({ ...LAGE, eingeschaltet: false }), false, 'abgeschaltet');
  assert.strictEqual(Z.darfSpiegeln({ ...LAGE, spielLaeuft: false }), false, 'kein Spiel');
  assert.strictEqual(Z.darfSpiegeln({ ...LAGE, vollbild: false }), false, 'Fenstermodus');
  assert.strictEqual(Z.darfSpiegeln({ ...LAGE, fenster: 0 }), false, 'nur ein Bildschirm');
});

test('Im Fenstermodus bleibt es aus - auch wenn alles andere passt', () => {
  // Der ganze Sinn der Einschränkung: Dort sieht man die Meldung ohnehin, und
  // eine zweite wäre nur Unruhe daneben.
  assert.strictEqual(Z.darfSpiegeln({ ...LAGE, vollbild: false, fenster: 3 }), false);
});

test('Fehlende Angaben gelten als "nein"', () => {
  assert.strictEqual(Z.darfSpiegeln(), false);
  assert.strictEqual(Z.darfSpiegeln({}), false);
  assert.strictEqual(Z.darfSpiegeln({ eingeschaltet: true }), false);
});

// --- Die Einstellung ---------------------------------------------------------

test('Standardmäßig an - und ein unsinniger Wert macht es nicht kaputt', () => {
  const E = require(path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'einstellungen.js'));
  // An, weil es sonst niemand findet und außerhalb des Vollbilds ohnehin
  // nichts tut.
  assert.strictEqual(E.standard().vollbildZweitschirm, true);
  assert.strictEqual(E.bereinige({ vollbildZweitschirm: false }).vollbildZweitschirm, false);
  assert.strictEqual(E.bereinige({ vollbildZweitschirm: 'nein' }).vollbildZweitschirm, true);
  assert.strictEqual(E.bereinige({}).vollbildZweitschirm, true);
});

/**
 * Drei Dinge, die sich nur im Quelltext prüfen lassen - main.js zieht
 * Electron nach und ist hier nicht ladbar. Jede dieser Zeilen stand schon
 * einmal anders, und jedes Mal war das Ergebnis ein Fehler, den man erst
 * mitten im Spiel bemerkt.
 */
test('main.js: Zweitfenster beim Start, stumm, und die Meldung geht an beide', () => {
  const fs = require('node:fs');
  const quelle = fs.readFileSync(path.join(__dirname, '..', '..', 'overlay', 'main.js'), 'utf8');

  // 1. Beim START anlegen, nicht erst beim Umschalten einer Einstellung -
  //    derselbe Fehler, der den Spieleschrank nie aufgehen ließ.
  const start = quelle.indexOf('app.whenReady()');
  assert.ok(start > 0, 'app.whenReady() muss es geben');
  assert.ok(
    /createZweitFenster\(\)/.test(quelle.slice(start, start + 4000)),
    'createZweitFenster() muss beim Start gerufen werden'
  );

  // 2. STUMM. Zwei Fenster, die denselben Klang starten, ergeben ein
  //    Flattern - sie legen nie genau gleich schnell los.
  assert.ok(
    /setAudioMuted\(true\)/.test(quelle),
    'die Zweitfenster müssen stummgeschaltet werden'
  );

  // 3. Die Trophäenmeldung muss über sendeMeldung() laufen. Ein direktes
  //    overlayWindow.webContents.send('achievement-unlocked', ...) würde die
  //    Zweitmeldung still wieder abschalten, ohne dass irgendetwas kaputt
  //    aussieht.
  assert.ok(
    /sendeMeldung\('achievement-unlocked'/.test(quelle),
    "'achievement-unlocked' muss über sendeMeldung() gehen"
  );
  assert.ok(
    !/overlayWindow\.webContents\.send\('achievement-unlocked'/.test(quelle),
    'die Meldung darf nicht direkt nur ans Hauptfenster gehen'
  );
});
