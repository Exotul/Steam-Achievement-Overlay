/**
 * XP- und Level-Berechnung.
 *
 * Bewusst ohne Abhängigkeiten: Diese Kurve bestimmt, welches Level angezeigt
 * wird, und liegt gespiegelt im Dashboard (frontend/src/lib/xp.js) und im
 * Overlay (overlay/lib/levelKurve.js). Tests vergleichen alle drei - laufen
 * sie auseinander, zeigen Overlay und Dashboard unbemerkt verschiedene Level.
 */

/**
 * Wird an alle Zwischenspeicher-Schlüssel gehängt, die XP-Werte enthalten.
 *
 * Ohne das würden nach einer Änderung an der Formel bis zu zwölf Stunden lang
 * die alten, mit der alten Formel berechneten Werte weiterbenutzt - der Level
 * bliebe scheinbar unverändert, und man würde den Fehler in der Formel suchen
 * statt im Zwischenspeicher. Bei jeder Änderung unten hochzählen.
 */
// 3: Die Levelberechnung stuft jetzt wie die Meldung mit dem Zusammenhang
//    des Spiels ein - die gemerkten Werte je Spiel waren nach festen Grenzen
//    gerechnet und damit zu niedrig.
// 4: Gleitende XP statt Spruengen an den Stufengrenzen (scoring.js).
// 5: Fuenfte Stufe "Blutig" (0,2 % und weniger) mit eigenem Faktor.
const FORMEL_VERSION = 5;

// Stufenfaktoren. Seit den gleitenden XP sind das die Werte in der MITTE
// einer Stufe - dazwischen gleitet der Faktor (siehe xpFaktor in scoring.js).
// Blutig bringt rund 900 XP: fast ein Drittel eines Levels.
const TIER_MULTIPLIER = { Kupfer: 1, Silber: 2.5, Gold: 4, Platin: 6, Blutig: 9 };

/** XP eines einzelnen freigeschalteten Achievements. */
function achievementXp(faktor, globalPercent) {
  return faktor * (100 - globalPercent);
}

/**
 * Kosten einer Levelstufe: eine Treppe mit Deckel.
 *
 * Die Vorgeschichte: Erst `90 * level^1.55`, dann `400 * level^0.7`. Beide
 * liessen die Kosten mit dem Level immer weiter steigen. An einer echten
 * Sammlung (rund 190.000 XP, Level 51) kostete eine Stufe 6.271 XP - eine
 * Kupfertrophaee bewegte den Balken um 1 %, eine Platintrophaee um 9 %, und
 * je weiter jemand kam, desto bedeutungsloser wurde jede einzelne Trophaee.
 *
 * Jetzt: Die ersten 15 Level kosten je 1.000 XP, damit man am Anfang zuegig
 * aufsteigt. Level 16 bis 30 kosten 2.000 XP, ab Level 31 kostet JEDES Level
 * 3.000 XP - fuer immer. Dadurch behaelt eine Trophaee ihr Gewicht, egal wie
 * gross die Sammlung ist: Platin fuellt knapp ein Fuenftel eines Levels.
 */
const LEVEL_TREPPE = [
  { bisLevel: 15, kosten: 1000 },
  { bisLevel: 30, kosten: 2000 },
  { bisLevel: Infinity, kosten: 3000 },
];

function xpRequiredForLevel(level) {
  return LEVEL_TREPPE.find((stufe) => level <= stufe.bisLevel).kosten;
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
  LEVEL_TREPPE,
  achievementXp,
  xpRequiredForLevel,
  getLevelProgress,
};
