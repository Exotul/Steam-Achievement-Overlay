/**
 * Auf welchem Bildschirm der Spieleschrank steht - oder auf keinem.
 *
 * NULL IST HIER EIN ERGEBNIS, KEIN FEHLER.
 *
 * Frueher wich der Schrank auf den Hauptbildschirm aus, wenn sein Bildschirm
 * fehlte. In der Praxis sah das so aus: Der zweite Monitor war aus, der
 * Schrank lag auf dem Hauptbildschirm hinter Browser, Discord und
 * Spielfenster - unsichtbar, aber er rechnete mit, zog Packungen heraus und
 * lud Titelbilder. Ein Hintergrundbild, das man nie zu sehen bekommt, soll
 * gar nicht erst aufgebaut werden.
 *
 * Bewusst ohne Electron-Abhaengigkeit, damit sich genau diese Entscheidung
 * ohne zweiten Monitor pruefen laesst.
 */

/**
 * @param {Array<{id: number}>} alle - screen.getAllDisplays()
 * @param {number|null} gewaehlteId - einstellungen.schrankBildschirm
 *        (null = "automatisch")
 * @param {number} meldungsId - Bildschirm, auf dem die Meldungen erscheinen
 * @returns {object|null}
 */
function waehleBildschirm(alle, gewaehlteId, meldungsId) {
  const liste = Array.isArray(alle) ? alle.filter(Boolean) : [];

  // Eine ausdrueckliche Wahl wird befolgt, solange es den Bildschirm gibt -
  // auch wenn es der mit den Meldungen ist. Wer das einstellt, meint es so.
  // Ist der Bildschirm weg, wird NICHT ausgewichen.
  if (gewaehlteId !== null && gewaehlteId !== undefined) {
    return liste.find((d) => d.id === gewaehlteId) || null;
  }

  // "Automatisch" heisst: ein anderer als der mit den Meldungen. Gibt es
  // keinen, bleibt der Schrank zu.
  return liste.find((d) => d.id !== meldungsId) || null;
}

module.exports = { waehleBildschirm };
