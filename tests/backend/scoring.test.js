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

test('XP eines Achievements folgt Faktor mal (100 - Prozent)', () => {
  assert.strictEqual(xp.achievementXp(1, 88), 12);
  assert.strictEqual(xp.achievementXp(2.5, 44), 140);
  assert.ok(Math.abs(xp.achievementXp(6, 2.4) - 585.6) < 0.001);
});

// --- Gleitende XP --------------------------------------------------------------

/**
 * Der Anlass: An den Stufengrenzen sprangen die XP. 30,0 % gab als Kupfer
 * 70 XP, 29,9 % als Silber 175 XP. Die weltweiten Anteile bewegen sich
 * staendig, und bei ueber 2.000 Trophaeen liegen immer einige knapp an einer
 * Grenze - der XP-Stand wanderte um Hunderte XP, ohne dass jemand spielte.
 */
test('An den Stufengrenzen springen die XP nicht mehr', () => {
  const { kupfer, silber, gold } = A.TIER_THRESHOLDS;
  for (const grenze of [kupfer, silber, gold]) {
    const drueber = xp.achievementXp(A.xpFaktor(grenze + 0.05, null), grenze + 0.05);
    const drunter = xp.achievementXp(A.xpFaktor(grenze - 0.05, null), grenze - 0.05);
    // Relativ geprueft: 0,1 Prozentpunkte sind bei 3 % viel mehr als bei
    // 30 %. Vorher betrug der Sprung 50 bis 150 %, jetzt unter 2 %.
    assert.ok(
      Math.abs(drunter - drueber) / drueber < 0.02,
      `An der Grenze ${grenze} %: ${drueber.toFixed(1)} -> ${drunter.toFixed(1)} XP`
    );
  }
});

test('Nirgends ein Sprung - von 0,05 % bis 100 %', () => {
  // Feines Raster ueber den ganzen Bereich: Zwischen zwei benachbarten
  // Anteilen (0,5 % Abstand relativ) darf sich der Faktor nur wenig aendern.
  let vorher = A.xpFaktor(0.05, null);
  for (let p = 0.05 * 1.005; p <= 100; p *= 1.005) {
    const jetzt = A.xpFaktor(p, null);
    assert.ok(Math.abs(jetzt - vorher) < 0.05, `Sprung bei ${p.toFixed(3)} %: ${vorher} -> ${jetzt}`);
    vorher = jetzt;
  }
});

test('In der Mitte jeder Stufe gilt genau der bekannte Stufenfaktor', () => {
  // So bringt eine Stufe im Mittel so viel wie vor den gleitenden XP.
  const { kupfer, silber, gold } = A.TIER_THRESHOLDS;
  const M = xp.TIER_MULTIPLIER;
  const nah = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(nah(A.xpFaktor(kupfer + 20, null), M.Kupfer));
  assert.ok(nah(A.xpFaktor(Math.sqrt(silber * kupfer), null), M.Silber));
  assert.ok(nah(A.xpFaktor(Math.sqrt(gold * silber), null), M.Gold));
  assert.ok(nah(A.xpFaktor(gold / 3, null), M.Platin));
});

test('Seltener heisst nie weniger Faktor', () => {
  let vorher = Infinity;
  for (let p = 0.05; p <= 100; p *= 1.01) {
    const f = A.xpFaktor(p, null);
    assert.ok(f <= vorher + 1e-12, `Faktor steigt bei ${p.toFixed(2)} % wieder an`);
    vorher = f;
  }
});

/** Hilfe: Bewertung fuer ein Spiel aus einer Liste von Anteilen. */
function spielBewertung(anteile) {
  const alle = anteile.map((p, i) => ({ apiname: 'A' + i }));
  const prozente = Object.fromEntries(anteile.map((p, i) => ['A' + i, p]));
  return A.bewerteSpiel(alle, prozente);
}

test('Das seltenste Achievement eines zugaenglichen Spiels zaehlt wie Platin', () => {
  // Die Einstufung im Spiel bleibt: 12 % ist hier das Schwerste.
  const bewerte = spielBewertung([80, 60, 50, 40, 30, 12]);
  const r = bewerte(12);
  assert.strictEqual(r.stufe, 'Platin');
  assert.strictEqual(r.faktor, xp.TIER_MULTIPLIER.Platin);
  assert.ok(Math.abs(r.xp - 6 * 88) < 1e-9);
});

test('Die Stufe fuer Name und Farbe bleibt, wie sie war', () => {
  const anteile = [90, 70, 45, 25, 12, 6, 2];
  const bewerte = spielBewertung(anteile);
  const ctx = A.buildTierContext(anteile);
  for (const p of anteile) {
    assert.strictEqual(bewerte(p).stufe, A.categorizeInContext(p, ctx));
  }
});

test('Zieht ein anderes Achievement vorbei, gleiten die XP statt zu springen', () => {
  // A liegt bei 5 %, B wandert von 5,5 % auf 4,5 % an A vorbei. Frueher
  // tauschten beide in dem Moment ihren Rang - fuer A ein Sprung.
  let vorher = null;
  for (let b = 5.5; b >= 4.5; b -= 0.01) {
    const xpA = spielBewertung([70, 55, 40, 30, 20, 5, b])(5).xp;
    if (vorher !== null) {
      assert.ok(Math.abs(xpA - vorher) < 5, `Sprung bei B = ${b.toFixed(2)} %: ${vorher} -> ${xpA}`);
    }
    vorher = xpA;
  }
});

test('Kreuzt ein Spiel die Mindestspreizung, gleiten die XP statt zu springen', () => {
  // Leichtestes Achievement wandert, bis die Spreizung ueber 2,5 steigt.
  let vorher = null;
  for (let leicht = 24; leicht <= 36; leicht += 0.05) {
    const x = spielBewertung([leicht, 20, 18, 16, 14, 12])(12).xp;
    if (vorher !== null) {
      assert.ok(Math.abs(x - vorher) < 5, `Sprung bei ${leicht.toFixed(2)} %: ${vorher} -> ${x}`);
    }
    vorher = x;
  }
});

test('Die Stellung im Spiel senkt die XP nie unter den weltweiten Wert', () => {
  const bewerte = spielBewertung([95, 90, 85, 80, 2]);
  for (const p of [95, 90, 85, 80, 2]) {
    assert.ok(bewerte(p).faktor >= A.xpFaktor(p, null) - 1e-12);
  }
});

test('Ein haeufiges Achievement wird nie weit hochgestuft', () => {
  // Das seltenste Achievement eines Spiels mit grosser Spreizung, aber 90 %
  // haben es: Die Obergrenze haelt es bei Kupfer.
  const bewerte = spielBewertung([100, 100, 100, 100, 100, 90, 30]);
  assert.strictEqual(bewerte(90).faktor, 1);
});

test('Spiele mit weniger als 5 Achievements werden nur weltweit bewertet', () => {
  const bewerte = spielBewertung([80, 40, 12]);
  assert.strictEqual(bewerte(12).faktor, A.xpFaktor(12, null));
});

// --- Levelkurve: Treppe mit Deckel -----------------------------------------------

test('Die Treppe: 1.000 / 2.000 / 3.000 XP je Level', () => {
  assert.strictEqual(xp.xpRequiredForLevel(1), 1000);
  assert.strictEqual(xp.xpRequiredForLevel(15), 1000);
  assert.strictEqual(xp.xpRequiredForLevel(16), 2000);
  assert.strictEqual(xp.xpRequiredForLevel(30), 2000);
  assert.strictEqual(xp.xpRequiredForLevel(31), 3000);
});

test('Der Deckel: Ab Level 31 wird kein Level mehr teurer', () => {
  // Genau das war der Anlass: Mit einer immer weiter steigenden Kurve wird
  // jede einzelne Trophaee irgendwann bedeutungslos.
  for (const level of [31, 50, 100, 500, 2000]) {
    assert.strictEqual(xp.xpRequiredForLevel(level), 3000, `Level ${level}`);
  }
});

test('Level steigt monoton und der Rest passt zur Stufe', () => {
  let vorher = 0;
  for (const wert of [0, 90, 999, 1000, 15000, 45000, 45001, 200000, 1000000]) {
    const l = xp.getLevelProgress(wert);
    assert.ok(l.level >= vorher, 'Level darf nie sinken');
    assert.ok(l.xpIntoLevel >= 0 && l.xpIntoLevel < l.xpForThisLevel, 'Rest muss innerhalb der Stufe liegen');
    vorher = l.level;
  }
  // Grenzfaelle der Treppe: 15.000 XP = Level 1-15 genau voll.
  assert.strictEqual(xp.getLevelProgress(14999).level, 15);
  assert.strictEqual(xp.getLevelProgress(15000).level, 16);
  assert.strictEqual(xp.getLevelProgress(45000).level, 31);
});

test('Eine Trophäe bewegt den Balken auch bei riesiger Sammlung spürbar', () => {
  // Egal wie gross die Sammlung: Platin fuellt knapp ein Fuenftel eines
  // Levels, eine mittlere Silbertrophaee mindestens 4 %.
  const silber = xp.achievementXp(A.xpFaktor(17.3, null), 17.3);
  const platin = xp.achievementXp(A.xpFaktor(1, null), 1);
  for (const gesamt of [196000, 1000000, 5000000]) {
    const stand = xp.getLevelProgress(gesamt);
    assert.ok(silber / stand.xpForThisLevel >= 0.04, `Silber bei ${gesamt} XP zu schwach`);
    assert.ok(platin / stand.xpForThisLevel >= 0.18, `Platin bei ${gesamt} XP zu schwach`);
  }
});

// --- Kopien der Levelkurve ---------------------------------------------------------

/**
 * Die Levelkurve liegt DREIMAL im Code: im Backend, im Dashboard
 * (frontend/src/lib/xp.js) und im Overlay (overlay/lib/levelKurve.js, das den
 * Stand nach jedem Achievement selbst fortschreibt). Laufen sie auseinander,
 * zeigen Overlay und Dashboard verschiedene Level fuer denselben Stand, ohne
 * dass es jemandem auffaellt. Verglichen wird das Verhalten an vielen
 * Staenden, nicht der Quelltext.
 */
const STAENDE = [0, 89, 999, 1000, 12345, 14999, 15000, 44999, 45000, 48000, 137000, 196000, 1234567];

test('Backend und Dashboard verwenden dieselbe Level-Kurve', async () => {
  // pathToFileURL statt des blossen Pfades: Unter Windows haelt import()
  // einen absoluten Pfad wie "e:\..." fuer ein Protokoll und bricht ab.
  const frontendXp = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'xp.js')).href
  );
  for (const wert of STAENDE) {
    const b = xp.getLevelProgress(wert);
    const f = frontendXp.getLevelProgress(wert);
    assert.strictEqual(b.level, f.level, `Level weicht ab bei ${wert} XP`);
    assert.strictEqual(b.xpForThisLevel, f.xpForThisLevel, `Stufengröße weicht ab bei ${wert} XP`);
  }
});

test('Backend und Overlay verwenden dieselbe Level-Kurve', () => {
  const overlay = require('../../overlay/lib/levelKurve');
  for (const wert of STAENDE) {
    const b = xp.getLevelProgress(wert);
    const o = overlay.levelAus(wert);
    assert.strictEqual(b.level, o.level, `Level weicht ab bei ${wert} XP`);
    assert.strictEqual(b.xpForThisLevel, o.xpForThisLevel, `Stufengröße weicht ab bei ${wert} XP`);
    assert.strictEqual(b.xpIntoLevel, o.xpIntoLevel, `Rest weicht ab bei ${wert} XP`);
  }
});

// --- Keine Kopien der XP-Formel mehr -----------------------------------------------

/**
 * Frueher rechneten Overlay und Dashboard die XP je Achievement selbst nach,
 * jeweils mit eigener Kopie der Stufenfaktoren. Eine davon wurde beim
 * Anpassen uebersehen, und das Dashboard zeigte ein anderes Level als das
 * Overlay. Heute liefert das Backend die XP fertig mit - und diese Tests
 * halten fest, dass niemand die Formel wieder einbaut.
 */
test('Dashboard übernimmt die XP des Backends', async () => {
  const tiers = await import(
    pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'tiers.js')).href
  );
  assert.strictEqual(tiers.achievementXp({ category: 'Platin', globalPercent: 1, xp: 123.4 }), 123.4);
  // Ohne mitgelieferte XP lieber 0 als eine selbst geratene Zahl.
  assert.strictEqual(tiers.achievementXp({ category: 'Platin', globalPercent: 1 }), 0);
});

test('Overlay und Dashboard enthalten keine eigenen Stufenfaktoren mehr', () => {
  const dateien = [
    path.join(__dirname, '..', '..', 'overlay', 'main.js'),
    path.join(__dirname, '..', '..', 'frontend', 'src', 'lib', 'tiers.js'),
  ];
  for (const datei of dateien) {
    const quelle = fs.readFileSync(datei, 'utf8');
    assert.ok(
      !/TIER_MULTIPLIER\s*=|xpMultiplier\s*:/.test(quelle),
      `${path.basename(datei)} hat wieder eine eigene Kopie der Stufenfaktoren`
    );
  }
});
