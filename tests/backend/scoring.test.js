const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

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
  assert.strictEqual(xp.achievementXp('Kupfer', 88), 12);
  assert.strictEqual(xp.achievementXp('Silber', 44), 112);
  assert.strictEqual(xp.achievementXp('Gold', 12), 264);
  assert.ok(Math.abs(xp.achievementXp('Platin', 2.4) - 390.4) < 0.001);
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
test('Backend und Dashboard verwenden dieselbe Level-Kurve', async () => {
  const frontendXp = await import(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'xp.js')
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
