/**
 * Wo das Achievement-Fenster des Schranks steht.
 *
 * Zwei Auflagen, beide ausdruecklich gewuenscht:
 *
 *   1. Es darf NICHT ueber den Bildschirmrand hinausragen. Der Schrank reicht
 *      bis an alle Raender, eine Packung kann also ganz aussen stehen - und
 *      ein Fenster, das daneben aufgeht, waere halb weg.
 *   2. Es liegt NICHT ueber anderen Fenstern. Das entscheidet nicht die Lage,
 *      sondern die Fensterebene (siehe main.js) - hier geht es nur um die
 *      Koordinaten.
 *
 * Gerechnet wird in der Arbeitsflaeche (workArea), nicht im ganzen Bildschirm:
 * Unter der Taskleiste waere das Fenster zwar "auf dem Bildschirm", aber die
 * unteren Zeilen waeren verdeckt.
 *
 * Bewusst ohne Electron-Abhaengigkeit, damit sich genau das ohne Bildschirm
 * pruefen laesst.
 */

// Luft zwischen Packung und Fenster, und zum Rand hin.
const ABSTAND = 14;

/**
 * @param {{x:number,y:number,breite:number,hoehe:number}} ziel
 *        Die Packung in BILDSCHIRMkoordinaten.
 * @param {{x:number,y:number,width:number,height:number}} arbeitsflaeche
 *        workArea des Bildschirms, auf dem der Schrank steht.
 * @param {{breite:number,hoehe:number}} masse - Wunschgroesse des Fensters
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function listeRechteck(ziel, arbeitsflaeche, masse) {
  const a = arbeitsflaeche;
  // Nie groesser als die Arbeitsflaeche - sonst ist "hineinschieben"
  // unmoeglich und das Fenster ragt in jedem Fall hinaus.
  const width = Math.min(masse.breite, a.width - 2 * ABSTAND);
  const height = Math.min(masse.hoehe, a.height - 2 * ABSTAND);

  // Lieber rechts der Packung; passt es dort nicht, nach links. Eine Packung
  // ganz am rechten Rand bekommt ihr Fenster also auf die andere Seite,
  // statt es gegen den Rand zu quetschen.
  const rechts = ziel.x + ziel.breite + ABSTAND;
  const links = ziel.x - ABSTAND - width;
  let x = rechts + width + ABSTAND <= a.x + a.width ? rechts : links;

  // Mittig zur Packung, soweit es geht.
  let y = Math.round(ziel.y + ziel.hoehe / 2 - height / 2);

  // Und zum Schluss in jedem Fall hinein. Das ist die eigentliche Zusage:
  // Was hier herauskommt, liegt vollstaendig in der Arbeitsflaeche.
  x = Math.max(a.x + ABSTAND, Math.min(x, a.x + a.width - width - ABSTAND));
  y = Math.max(a.y + ABSTAND, Math.min(y, a.y + a.height - height - ABSTAND));

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

/**
 * Die Reihenfolge der Achievements in der Liste.
 *
 * OFFENE ZUERST, und darin die haeufigsten oben: Das ist die Reihenfolge, in
 * der man sie sich vornehmen wuerde. Die erreichten stehen darunter, die
 * seltensten zuerst - dort ist es eine Trophaeenwand, keine Arbeitsliste.
 *
 * @param {Array} achievements
 * @returns {Array} neue Liste, die urspruengliche bleibt unangetastet
 */
function sortiere(achievements) {
  const anteil = (a) => (typeof a.globalPercent === 'number' ? a.globalPercent : -1);
  return [...(achievements || [])].sort((a, b) => {
    if (!!a.unlocked !== !!b.unlocked) return a.unlocked ? 1 : -1;
    return a.unlocked ? anteil(a) - anteil(b) : anteil(b) - anteil(a);
  });
}

module.exports = { ABSTAND, listeRechteck, sortiere };
