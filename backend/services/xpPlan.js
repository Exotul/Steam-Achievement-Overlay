/**
 * Entscheidet, welche Spiele bei der XP-Berechnung überhaupt neu abgefragt
 * werden müssen.
 *
 * Bewusst ohne Abhängigkeiten und ohne Netzzugriff, damit sich genau diese
 * Entscheidung prüfen lässt - sie bestimmt, wie lange jemand beim Start
 * wartet.
 *
 * DIE ÜBERLEGUNG DAHINTER: Trophäen bekommt man nur durch Spielen. Ändert
 * sich die Spielzeit eines Titels nicht, kann sich sein XP-Beitrag nicht
 * geändert haben - die Abfrage dafür ist reine Verschwendung. Vorher wurde
 * stur die halbe Bibliothek durchgefragt, jedes Mal, zwölf Stunden nachdem
 * dasselbe schon einmal ausgerechnet worden war.
 *
 * Restrisiko und warum es vertretbar ist: Steam führt die Spielzeit in
 * Minuten. Wer ein Achievement in einer angebrochenen Minute holt und danach
 * sofort aufhört, könnte theoretisch durchs Raster fallen. Das fällt nicht
 * auf, weil das Overlay den XP-Stand bei jeder erkannten Freischaltung selbst
 * fortschreibt - die Erstberechnung ist nur die Grundlage, nicht die einzige
 * Quelle. Zusätzlich läuft jeder Eintrag nach einiger Zeit ohnehin ab.
 */

/**
 * Darf ein gemerkter XP-Wert weiterverwendet werden?
 *
 * @param {{xp: number, spielzeit: number}|number|undefined} eintrag
 *        Gemerkter Wert. Zahlen stammen aus einer älteren Fassung, die die
 *        Spielzeit noch nicht mitgeschrieben hat - die sind nicht mehr
 *        beurteilbar und werden deshalb verworfen.
 * @param {number} spielzeitJetzt - aktuelle Spielzeit in Minuten
 */
function darfWiederverwenden(eintrag, spielzeitJetzt) {
  if (!eintrag || typeof eintrag !== 'object') return false;
  if (typeof eintrag.xp !== 'number' || !Number.isFinite(eintrag.xp)) return false;
  if (typeof eintrag.spielzeit !== 'number') return false;

  const jetzt = Number(spielzeitJetzt) || 0;

  // Gleiche Spielzeit: seit der letzten Berechnung wurde nicht gespielt.
  // Weniger als gemerkt sollte nicht vorkommen (Steam zählt nur hoch), wäre
  // aber ein Zeichen, dass etwas nicht stimmt - dann lieber neu rechnen.
  return eintrag.spielzeit === jetzt;
}

/**
 * Teilt die Bibliothek in "muss abgefragt werden" und "steht schon fest".
 *
 * @param {Array<{appid: number, playtime_forever: number}>} spiele
 * @param {(appId: number) => any} gemerkt - Zugriff auf den Zwischenspeicher
 * @returns {{offen: Array, sicher: Array, xpSicher: number}}
 */
function planeBerechnung(spiele, gemerkt) {
  const offen = [];
  const sicher = [];
  let xpSicher = 0;

  for (const spiel of spiele || []) {
    // Nie gespielte Titel können keine Achievements haben. Sie zu
    // überspringen kostet nichts und spart bei den meisten Bibliotheken den
    // größten Teil der Abfragen.
    const spielzeit = spiel.playtime_forever || 0;
    if (spielzeit <= 0) continue;

    const eintrag = gemerkt(spiel.appid);
    if (darfWiederverwenden(eintrag, spielzeit)) {
      sicher.push(spiel);
      xpSicher += eintrag.xp;
    } else {
      offen.push(spiel);
    }
  }

  return { offen, sicher, xpSicher };
}

module.exports = { darfWiederverwenden, planeBerechnung };
