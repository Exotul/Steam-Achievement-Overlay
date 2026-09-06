/**
 * XP- und Level-Berechnung.
 *
 * Bewusst ohne Abhängigkeiten: Diese Kurve bestimmt, welches Level angezeigt
 * wird, und liegt gespiegelt auch im Dashboard (frontend/src/lib/xp.js). Ein
 * Test vergleicht beide - laufen sie auseinander, zeigen Overlay und
 * Dashboard unbemerkt verschiedene Level.
 */

const TIER_MULTIPLIER = { Kupfer: 1, Silber: 2, Gold: 3, Platin: 4 };

/** XP eines einzelnen freigeschalteten Achievements. */
function achievementXp(category, globalPercent) {
  return (TIER_MULTIPLIER[category] || 1) * (100 - globalPercent);
}

function xpRequiredForLevel(level) {
  return Math.round(90 * Math.pow(level, 1.55));
}

function getLevelProgress(totalXp) {
  let level = 1;
  let xpConsumed = 0;
  while (true) {
    const needed = xpRequiredForLevel(level);
    if (xpConsumed + needed > totalXp) {
      const xpIntoLevel = totalXp - xpConsumed;
      return {
        level,
        xpIntoLevel: Math.round(xpIntoLevel),
        xpForThisLevel: needed,
        totalXp: Math.round(totalXp),
      };
    }
    xpConsumed += needed;
    level += 1;
  }
}

module.exports = { TIER_MULTIPLIER, achievementXp, xpRequiredForLevel, getLevelProgress };
