// Das benötigte XP pro Level wächst überproportional, damit hohe Level
// etwas bedeuten. Die konkreten Zahlen sind ein sinnvoller Startwert -
// falls Markus die Progression anders spüren möchte, hier justieren.
function xpRequiredForLevel(level) {
  return Math.round(90 * Math.pow(level, 1.55));
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
