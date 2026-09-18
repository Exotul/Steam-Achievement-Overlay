/**
 * Wo genau das Overlay-Fenster liegt - und warum NICHT exakt bildschirmgross.
 *
 * Zwei Anforderungen, die sich auf den ersten Blick widersprechen:
 *
 * 1. Die Meldungen sollen in der ECHTEN Bildschirmecke sitzen. Dort erscheint
 *    Steams eigene Meldung, und nur buendig in der Ecke verdeckt unsere sie
 *    vollstaendig.
 *
 * 2. Das Fenster darf den Bildschirm NICHT exakt abdecken. Nachgemessen: Ein
 *    Fenster von genau 3840x2160 auf einem 3840x2160-Bildschirm haelt Windows
 *    fuer eine Vollbild-Anwendung (SHQueryUserNotificationState meldet 2 statt
 *    5) - auch wenn es unsichtbar, nicht anklickbar und nicht im Vordergrund
 *    ist. Windows haelt dann SYSTEMWEIT Benachrichtigungen zurueck, solange
 *    der Trophaeenschrank laeuft.
 *
 *    Schon ein einziger freier Pixel an irgendeiner Seite genuegt, damit
 *    Windows wieder "frei" meldet - ebenfalls nachgemessen, an allen Seiten.
 *
 * Die Aufloesung: Das Fenster laesst genau 1 px frei, und zwar an der Seite,
 * die der eingestellten Ecke GEGENUEBER liegt. Die Ecke selbst bleibt exakt.
 *
 * Bewusst ohne Electron-Abhaengigkeit, damit die Tests es ohne npm install
 * pruefen koennen.
 */

/**
 * @param {{x:number,y:number,width:number,height:number}} bildschirm - bounds
 * @param {string} position - 'oben-rechts' | 'oben-links' | 'unten-rechts' | 'unten-links'
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function overlayRechteck(bildschirm, position) {
  const { x, y, width, height } = bildschirm;
  // Unten verankert: oben 1 px frei. Oben verankert (und alles Unbekannte):
  // unten 1 px frei. Die Breite bleibt voll - so bleiben links wie rechts
  // beide Ecken der verankerten Seite exakt.
  if (String(position).startsWith('unten')) {
    return { x, y: y + 1, width, height: height - 1 };
  }
  return { x, y, width, height: height - 1 };
}

module.exports = { overlayRechteck };
