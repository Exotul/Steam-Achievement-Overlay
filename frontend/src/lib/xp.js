// ACHTUNG: Diese Kurve liegt gespiegelt in backend/services/xpMath.js und
// overlay/lib/levelKurve.js. Laufen sie auseinander, zeigen Overlay und
// Dashboard verschiedene Level für denselben Stand - Tests in
// tests/backend/scoring.test.js vergleichen sie deshalb. Bei Änderungen ALLE
// DREI Dateien anfassen.
//
// Treppe mit Deckel: Level 1-15 je 1.000 XP, 16-30 je 2.000 XP, ab 31 je
// 3.000 XP für immer. Warum, steht in xpMath.js.
function xpRequiredForLevel(level) {
  if (level <= 15) return 1000;
  if (level <= 30) return 2000;
  return 3000;
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
