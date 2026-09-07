const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// Bewusst die reinen Rechenmodule, nicht steamApi/xpSummary: Diese Tests
// sollen ohne installierte Abhängigkeiten und ohne Steam-Zugang laufen.
const A = require('../../backend/services/scoring');
const xp = require('../../backend/services/xpMath');

// --- Trophäenstufen: absolut -------------------------------------------------

test('Absolute Schwellen liegen dort, wo sie liegen sollen', () => {
  assert.strictEqual(A.categorize(30), 'Kupfer');
  assert.strictEqual(A.categorize(29.9), 'Silber');
  assert.strictEqual(A.categorize(10), 'Silber');
  assert.strictEqual(A.categorize(9.9), 'Gold');
  assert.strictEqual(A.categorize(3), 'Gold');
  assert.strictEqual(A.categorize(2.9), 'Platin');
});

test('Bei typischer Verteilung ist Kupfer die Mehrheit', () => {
  // Genau das war der Anlass für die Neuverteilung: vorher gab es mehr
  // Silber als Kupfer, was sich falsch anfühlte.
  const typisch = [88, 74, 66, 58, 52, 47, 43, 39, 35, 33, 31, 28, 24, 21, 18, 15, 12, 10, 8, 6, 4, 2.5, 1.2, 0.6];
  const zaehlung = { Kupfer: 0, Silber: 0, Gold: 0, Platin: 0 };
  typisch.forEach((p) => zaehlung[A.categorize(p)]++);
  assert.ok(
    zaehlung.Kupfer > zaehlung.Silber,
    `Kupfer (${zaehlung.Kupfer}) muss häufiger sein als Silber (${zaehlung.Silber})`
  );
});

// --- Trophäenstufen: relativ innerhalb eines Spiels ---------------------------

test('Story-Spiel mit geringer Spreizung bekommt trotzdem Gold und Platin', () => {
  // Beispiel Expedition 33: viele spielen durch, das seltenste liegt bei 11 %.
  const werte = [52, 48, 44, 41, 38, 35, 33, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 11];
  const ctx = A.buildTierContext(werte);
  assert.ok(ctx.relativAktiv, 'Spreizung von 4,7x muss die relative Einstufung auslösen');

  const zaehlung = { Kupfer: 0, Silber: 0, Gold: 0, Platin: 0 };
  werte.forEach((p) => zaehlung[A.categorizeInContext(p, ctx)]++);
  assert.ok(zaehlung.Gold > 0, 'muss Gold vergeben');
  assert.ok(zaehlung.Platin > 0, 'muss Platin vergeben');
});

test('Sehr leichtes Spiel bleibt komplett Kupfer', () => {
  // Beispiel Horripilant: fast jeder bekommt alles, nichts davon ist schwer.
  const werte = [95, 93, 90, 88, 85, 82, 78, 75, 72, 68, 65, 62];
  const ctx = A.buildTierContext(werte);
  assert.ok(!ctx.relativAktiv, 'Spreizung von 1,5x darf die relative Einstufung NICHT auslösen');
  werte.forEach((p) => assert.strictEqual(A.categorizeInContext(p, ctx), 'Kupfer'));
});

test('Ein häufiges Achievement wird nie hochgestuft', () => {
  const werte = [99, 96, 92, 88, 84, 80, 76, 72, 68, 64, 60];
  const ctx = A.buildTierContext(werte);
  // Selbst als seltenstes seines Spiels darf 60 % nicht Gold werden.
  assert.strictEqual(A.categorizeInContext(60, ctx), 'Kupfer');
});

test('Unter fünf Achievements greift die relative Einstufung nicht', () => {
  const ctx = A.buildTierContext([80, 40, 10]);
  assert.ok(!ctx.relativAktiv, 'drei Achievements ergeben keine sinnvolle Verteilung');
});

// --- Schwierigkeitsschätzung -------------------------------------------------

function schwierigkeit(werte) {
  return A.estimateDifficulty(werte.map((p) => ({ globalPercent: p })));
}

test('Schwierigkeit bleibt in der Spanne 0 bis 10 und ist geordnet', () => {
  const leicht = schwierigkeit([92, 80, 70, 60, 50, 45]);
  const mittel = schwierigkeit([70, 40, 20, 10, 6, 4.5]);
  const schwer = schwierigkeit([40, 15, 4, 1, 0.4, 0.15]);

  [leicht, mittel, schwer].forEach((w) => {
    assert.ok(w >= 0 && w <= 10, `Wert ${w} muss zwischen 0 und 10 liegen`);
  });
  assert.ok(leicht < mittel, 'leicht muss unter mittel liegen');
  assert.ok(mittel < schwer, 'mittel muss unter schwer liegen');
});

test('Der Absturz zwischen erstem und seltenstem Achievement zählt', () => {
  // Bei gleichem seltensten Achievement muss ein steilerer Absturz einen
  // höheren Wert ergeben - das war die ausdrückliche Anforderung.
  const flach = schwierigkeit([30, 20, 10, 5, 2, 1]);
  const steil = schwierigkeit([95, 60, 30, 10, 3, 1]);
  assert.ok(steil > flach, `steil (${steil}) muss über flach (${flach}) liegen`);
});

test('Ohne verwertbare Prozentsätze gibt es keinen Wert statt eines erfundenen', () => {
  assert.strictEqual(A.estimateDifficulty([]), null);
});

// --- XP und Level ------------------------------------------------------------

test('XP eines Achievements folgt Stufenfaktor mal (100 - Prozent)', () => {
  // Bewusst gegen TIER_MULTIPLIER gerechnet statt gegen feste Zahlen: Die
  // Faktoren sind eine Stellschraube am Spielgefühl und dürfen sich ändern,
  // ohne dass ein Test scheitert. Die FORM der Formel darf sich nicht ändern -
  // genau die prüft dieser Test.
  const M = xp.TIER_MULTIPLIER;
  assert.strictEqual(xp.achievementXp('Kupfer', 88), M.Kupfer * 12);
  assert.strictEqual(xp.achievementXp('Silber', 44), M.Silber * 56);
  assert.strictEqual(xp.achievementXp('Gold', 12), M.Gold * 88);
  assert.ok(Math.abs(xp.achievementXp('Platin', 2.4) - M.Platin * 97.6) < 0.001);
  // Unbekannte Stufe faellt auf den Grundwert zurueck, statt NaN zu liefern.
  assert.strictEqual(xp.achievementXp('Unbekannt', 40), 60);
});

test('Level steigt monoton und der Rest passt zur Stufe', () => {
  let vorher = 0;
  for (const wert of [0, 90, 500, 3000, 20000, 48000, 200000]) {
    const l = xp.getLevelProgress(wert);
    assert.ok(l.level >= vorher, 'Level darf nie sinken');
    assert.ok(l.xpIntoLevel >= 0 && l.xpIntoLevel < l.xpForThisLevel, 'Rest muss innerhalb der Stufe liegen');
    vorher = l.level;
  }
});

/**
 * Der wichtigste Test dieser Datei: Die Level-Kurve liegt DOPPELT im Code -
 * einmal im Backend, einmal im Dashboard. Laufen sie auseinander, zeigen
 * Overlay und Dashboard verschiedene Level für denselben Stand, ohne dass es
 * jemandem auffällt.
 */
/**
 * Die Stufenfaktoren und die Kurve liegen ein DRITTES Mal in overlay/main.js -
 * dort, damit der XP-Zuwachs eines Achievements ohne Steam-Abfrage berechnet
 * werden kann. Diese Datei laesst sich hier nicht laden (sie zieht Electron
 * nach), deshalb wird ihr Quelltext gelesen und mit den maessgeblichen Werten
 * verglichen. Unschoen, aber die Alternative ist, dass die Kopie unbemerkt
 * auseinanderlaeuft - dann zeigt das Overlay beim Achievement einen anderen
 * Level als das Dashboard eine Sekunde spaeter.
 */
/**
 * Das Dashboard rechnet die XP selbst - es bekommt vom Backend nur Stufe und
 * Prozentsatz, nicht die fertigen Punkte. Deshalb liegen die Stufenfaktoren
 * dort ein VIERTES Mal, in frontend/src/lib/tiers.js.
 *
 * Genau diese Kopie wurde beim Anpassen der Faktoren uebersehen: Sie heisst
 * dort "xpMultiplier" statt TIER_MULTIPLIER und steckt in einem Objekt
 * zusammen mit Farben - eine Suche nach dem gewohnten Namen findet sie nicht.
 * Das Dashboard hat daraufhin ein anderes Level angezeigt als das Overlay,
 * ohne dass irgendetwas fehlgeschlagen waere.
 */
test('Dashboard verwendet dieselben Stufenfaktoren wie das Backend', async () => {
  const tiers = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'tiers.js')).href
  );

  for (const [stufe, faktor] of Object.entries(xp.TIER_MULTIPLIER)) {
    assert.strictEqual(
      tiers.TIERS[stufe]?.xpMultiplier,
      faktor,
      `Stufenfaktor für ${stufe} weicht im Dashboard ab`
    );
  }
});

test('Dashboard und Backend errechnen dieselben XP je Achievement', async () => {
  // Die Faktoren allein reichen nicht - auch die Formel drumherum muss
  // dieselbe sein.
  const tiers = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'tiers.js')).href
  );

  for (const stufe of ['Kupfer', 'Silber', 'Gold', 'Platin']) {
    for (const prozent of [0.4, 7, 23, 61, 94]) {
      assert.strictEqual(
        tiers.achievementXp({ category: stufe, globalPercent: prozent }),
        xp.achievementXp(stufe, prozent),
        `XP weichen ab bei ${stufe} / ${prozent} %`
      );
    }
  }
});

test('Overlay verwendet dieselben Stufenfaktoren wie das Backend', () => {
  const quelle = fs.readFileSync(
    path.join(__dirname, '..', '..', 'overlay', 'main.js'),
    'utf8'
  );

  const treffer = quelle.match(/const TIER_MULTIPLIER = \{([^}]*)\}/);
  assert.ok(treffer, 'TIER_MULTIPLIER muss in overlay/main.js stehen');

  const ausOverlay = {};
  treffer[1].split(',').forEach((teil) => {
    const [name, wert] = teil.split(':').map((t) => t.trim());
    if (name) ausOverlay[name] = Number(wert);
  });

  assert.deepStrictEqual(
    ausOverlay,
    xp.TIER_MULTIPLIER,
    'Stufenfaktoren in overlay/main.js weichen von xpMath.js ab'
  );
});

test('Overlay verwendet dieselbe Level-Kurve wie das Backend', () => {
  const quelle = fs.readFileSync(
    path.join(__dirname, '..', '..', 'overlay', 'main.js'),
    'utf8'
  );
  const treffer = quelle.match(/Math\.round\((\d+(?:\.\d+)?) \* Math\.pow\(level, (\d+(?:\.\d+)?)\)\)/);
  assert.ok(treffer, 'Level-Kurve muss in overlay/main.js stehen');

  // Gegen die maessgebliche Fassung rechnen statt Zahlen zu vergleichen:
  // So faellt auch auf, wenn jemand die Form der Formel aendert.
  const [, basis, exponent] = treffer;
  for (const level of [1, 5, 17, 40, 80]) {
    assert.strictEqual(
      Math.round(Number(basis) * Math.pow(level, Number(exponent))),
      xp.xpRequiredForLevel(level),
      `Kurve weicht bei Level ${level} ab`
    );
  }
});

/**
 * Der eigentliche Zweck der Kurve, als Test formuliert.
 *
 * Die erste Fassung (90 * level^1.55) hat diesen Zweck verfehlt: Bei einer
 * gewachsenen Sammlung kostete eine Stufe 15.752 XP, waehrend eine mittlere
 * Silbertrophaee 154 XP brachte - ein Prozent, zusammen mit einer Rundung auf
 * ganze Prozent in der Anzeige also gar nichts. Dieser Test haelt fest, dass
 * eine Trophaee spuerbar bleibt, auch wenn jemand schon lange sammelt.
 */
test('Eine Trophäe bewegt den Balken auch bei großer Sammlung spürbar', () => {
  // Nachgemessen an einer echten Sammlung: 2.177 Trophäen, gut 196.000 XP.
  const stand = xp.getLevelProgress(196000);

  const silber = xp.achievementXp('Silber', 23); // mittlere Silbertrophäe
  const platin = xp.achievementXp('Platin', 2);

  const anteilSilber = (silber / stand.xpForThisLevel) * 100;
  const anteilPlatin = (platin / stand.xpForThisLevel) * 100;

  assert.ok(
    anteilSilber >= 2,
    `Silber bewegt den Balken nur um ${anteilSilber.toFixed(2)} % (mindestens 2 % erwartet)`
  );
  assert.ok(
    anteilPlatin >= 6,
    `Platin bewegt den Balken nur um ${anteilPlatin.toFixed(2)} % (mindestens 6 % erwartet)`
  );
  // Gegenprobe: Die Level sollen dabei nicht ins Absurde laufen.
  assert.ok(stand.level < 100, `Level ${stand.level} ist zu hoch für diese Sammlung`);
});

test('Seltenere Stufen bringen mehr XP als häufigere', () => {
  // Gleicher Prozentsatz, nur die Stufe unterscheidet sich.
  const werte = ['Kupfer', 'Silber', 'Gold', 'Platin'].map((s) => xp.achievementXp(s, 10));
  for (let i = 1; i < werte.length; i++) {
    assert.ok(werte[i] > werte[i - 1], `${werte[i]} muss größer als ${werte[i - 1]} sein`);
  }
});

test('Backend und Dashboard verwenden dieselbe Level-Kurve', async () => {
  // pathToFileURL statt des blossen Pfades: Unter Windows haelt import()
  // einen absoluten Pfad wie "e:\..." fuer ein Protokoll und bricht ab -
  // damit lief genau dieser Test dort nie durch.
  const frontendXp = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'xp.js')).href
  );

  for (const wert of [0, 89, 90, 500, 3000, 12345, 48000, 137000]) {
    const b = xp.getLevelProgress(wert);
    const f = frontendXp.getLevelProgress(wert);
    assert.strictEqual(b.level, f.level, `Level weicht ab bei ${wert} XP`);
    assert.strictEqual(
      b.xpForThisLevel,
      f.xpForThisLevel,
      `Stufengröße weicht ab bei ${wert} XP`
    );
  }
});
