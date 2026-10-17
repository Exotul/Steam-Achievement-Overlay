/**
 * Die Meldung zusaetzlich auf den anderen Bildschirmen - aber nur im Vollbild.
 *
 * WARUM ES DAS GIBT
 *
 * Ueber einem Spiel im exklusiven Vollbild zeigt Windows fremde Fenster nicht
 * an. Das ist nachgemessen und nicht zu umgehen: Steam, Discord und NVIDIA
 * schaffen es nur, weil sie sich in das Spiel selbst einklinken - genau das
 * kommt hier nicht in Frage (nativer Code, Anti-Cheat; die Begruendung steht
 * ausfuehrlich in main.js bei meldeExklusivesVollbild).
 *
 * Was Windows aber nicht unterdrueckt, ist ein Fenster auf einem ANDEREN
 * Bildschirm. Das Spiel besitzt einen Bildschirm, nicht den Rechner. Also
 * erscheint die Meldung dort zusaetzlich - gleichzeitig, nicht stattdessen.
 * Auf dem Spielbildschirm wird sie weiterhin gezeigt; geht sie dort durch,
 * sieht man sie zweimal, und das ist das kleinere Uebel gegenueber "gar
 * nicht".
 *
 * WANN: ausschliesslich, solange ein Spiel im Vollbild laeuft. Ohne Spiel
 * oder im Fenstermodus sieht man die Meldung ohnehin - eine zweite waere dann
 * nur Unruhe auf dem Nebenbildschirm.
 *
 * Bewusst ohne Electron-Abhaengigkeit: So laesst sich die Entscheidung in den
 * Tests ohne npm install und ohne zweiten Monitor pruefen. Das Anlegen der
 * Fenster bleibt in main.js.
 */

/**
 * Welche Bildschirme eine Zweitmeldung bekommen.
 *
 * Alle ausser dem, auf dem die Meldung schon erscheint. Reihenfolge und
 * Anzahl kommen von Windows; bei einem einzigen Bildschirm ist das Ergebnis
 * leer - dann gibt es nichts zu spiegeln.
 *
 * @param {Array<{id: number}>} alle - screen.getAllDisplays()
 * @param {number|null|undefined} hauptId - id des Bildschirms mit dem Overlay
 * @returns {Array<object>} die uebrigen Bildschirme
 */
function zweitBildschirme(alle, hauptId) {
  if (!Array.isArray(alle)) return [];
  return alle.filter((d) => d && d.id !== hauptId);
}

/**
 * Darf gerade gespiegelt werden?
 *
 * Alle vier Bedingungen muessen zutreffen. Einzeln begruendet, weil jede fuer
 * sich schon ein Grund war, es NICHT zu tun:
 *
 *   eingeschaltet  - in den Einstellungen abschaltbar.
 *   spielLaeuft    - ohne verfolgtes Spiel gibt es keine Trophaeen.
 *   vollbild       - im Fenstermodus sieht man die Meldung ohnehin.
 *   fenster        - ohne zweiten Bildschirm gibt es kein Ziel.
 *
 * @param {{eingeschaltet: boolean, spielLaeuft: boolean, vollbild: boolean, fenster: number}} lage
 * @returns {boolean}
 */
function darfSpiegeln(lage) {
  const l = lage || {};
  return !!l.eingeschaltet && !!l.spielLaeuft && !!l.vollbild && Number(l.fenster) > 0;
}

module.exports = { zweitBildschirme, darfSpiegeln };
