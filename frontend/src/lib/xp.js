// ACHTUNG: Diese Kurve liegt gespiegelt in backend/services/xpMath.js.
// Laufen beide auseinander, zeigen Overlay und Dashboard verschiedene Level
// für denselben Stand - ein Test in tests/backend/scoring.test.js vergleicht
// sie deshalb. Bei Änderungen BEIDE Dateien anfassen.
//
// Der Exponent war ursprünglich 1.55 und liess die Levelkosten weit schneller
// wachsen als eine Sammlung wächst: Bei Level 28 kostete eine Stufe 15.752 XP,
// eine durchschnittliche Silbertrophäe brachte 154 - der Balken stand still.
function xpRequiredForLevel(level) {
  return Math.round(400 * Math.pow(level, 0.7));
}

export function getLevelProgress(totalXp) {
  let level = 1;
  let xpConsumed = 0;

  while (true) {
    const needed = xpRequiredForLevel(level);
    if (xpConsumed + needed > totalXp) {
      const xpIntoLevel = totalXp - xpConsumed;
      return {
        level,
        xpIntoLevel,
        xpForThisLevel: needed,
        progress: needed === 0 ? 0 : xpIntoLevel / needed,
        totalXp,
      };
    }
    xpConsumed += needed;
    level += 1;
  }
}
