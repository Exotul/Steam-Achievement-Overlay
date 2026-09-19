/**
 * Levelkurve des Overlays.
 *
 * ACHTUNG: gespiegelt aus backend/services/xpMath.js (und im Dashboard in
 * frontend/src/lib/xp.js). Das Overlay schreibt den XP-Stand nach jedem
 * Achievement selbst fort, ohne das Backend zu fragen - dafuer braucht es die
 * Kurve hier. Ein Test vergleicht diese Kopie mit dem Backend fuer viele
 * Staende; laufen sie auseinander, zeigt die Meldung ein anderes Level als
 * das Dashboard eine Sekunde spaeter.
 *
 * Eigene Datei statt in main.js, damit der Test sie laden kann - main.js
 * zieht Electron nach. Vorher wurde dafuer der Quelltext von main.js mit
 * einem regulaeren Ausdruck gelesen.
 */

// Treppe mit Deckel: Level 1-15 je 1.000 XP, 16-30 je 2.000 XP, ab 31 je
// 3.000 XP fuer immer. Warum, steht in xpMath.js.
function xpFuerLevel(level) {
  if (level <= 15) return 1000;
  if (level <= 30) return 2000;
  return 3000;
}

function levelAus(totalXp) {
  let level = 1;
  let verbraucht = 0;
  while (true) {
    const noetig = xpFuerLevel(level);
    if (verbraucht + noetig > totalXp) {
      return {
        level,
        xpIntoLevel: Math.round(totalXp - verbraucht),
        xpForThisLevel: noetig,
        totalXp: Math.round(totalXp),
      };
    }
    verbraucht += noetig;
    level += 1;
  }
}

module.exports = { xpFuerLevel, levelAus };
