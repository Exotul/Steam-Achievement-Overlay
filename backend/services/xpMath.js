/**
 * XP- und Level-Berechnung.
 *
 * Bewusst ohne Abhängigkeiten: Diese Kurve bestimmt, welches Level angezeigt
 * wird, und liegt gespiegelt auch im Dashboard (frontend/src/lib/xp.js). Ein
 * Test vergleicht beide - laufen sie auseinander, zeigen Overlay und
 * Dashboard unbemerkt verschiedene Level.
 */

/**
 * Wird an alle Zwischenspeicher-Schlüssel gehängt, die XP-Werte enthalten.
 *
 * Ohne das würden nach einer Änderung an der Formel bis zu zwölf Stunden lang
 * die alten, mit der alten Formel berechneten Werte weiterbenutzt - der Level
 * bliebe scheinbar unverändert, und man würde den Fehler in der Formel suchen
 * statt im Zwischenspeicher. Bei jeder Änderung unten hochzählen.
 */
const FORMEL_VERSION = 2;

// Stufenfaktoren. Kupfer bleibt der Grundwert, die selteneren Stufen sind
// gegenüber der ersten Fassung (1/2/3/4) stärker gespreizt.
const TIER_MULTIPLIER = { Kupfer: 1, Silber: 2.5, Gold: 4, Platin: 6 };

/** XP eines einzelnen freigeschalteten Achievements. */
function achievementXp(category, globalPercent) {
  return (TIER_MULTIPLIER[category] || 1) * (100 - globalPercent);
}

/**
 * Kosten einer Levelstufe.
 *
 * Die erste Fassung war `90 * level^1.55`. Der Exponent war das Problem:
 * Die Levelkosten wuchsen weit schneller als eine Sammlung wächst. An einer
 * echten Sammlung nachgemessen (2.177 Trophäen, Level 28): Eine Stufe kostete
 * dort 15.752 XP, während eine durchschnittliche Silbertrophäe 154 XP brachte
 * - **ein Prozent**. Der Fortschrittsbalken stand faktisch still, und je
 * weiter jemand kam, desto schlimmer wurde es. Genau das ist das Gegenteil
 * dessen, was eine Levelkurve leisten soll.
 *
 * Der flachere Exponent dreht das um: Die Kosten steigen noch, aber langsam
 * genug, dass eine einzelne Trophäe sichtbar bleibt. Dieselbe Sammlung liegt
 * damit bei Level 52, eine Stufe kostet rund 6.400 XP, und eine Silbertrophäe
 * bewegt den Balken um 3 %, eine Platintrophäe um 9 %.
 *
 * Der höhere Grundwert hält dabei die ersten Level davon ab, im Sekundentakt
 * durchzurauschen - Stufe 1 kostet weiterhin etwa zehn Kupfertrophäen.
 */
function xpRequiredForLevel(level) {
  return Math.round(400 * Math.pow(level, 0.7));
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

module.exports = {
  FORMEL_VERSION,
  TIER_MULTIPLIER,
  achievementXp,
  xpRequiredForLevel,
  getLevelProgress,
};
