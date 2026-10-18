/**
 * Das Aussehen des Spieleschranks: Holz, Rueckwand, Ruecken, Schrift.
 *
 * WARUM HIER UND NICHT IM CSS: Aus EINER Holzfarbe werden vier Toene - Kante,
 * Flaeche, Schattenseite, Innenraum. Haette jeder seinen eigenen Regler,
 * muesste man vier Farben aufeinander abstimmen, um ein Regal zu bekommen,
 * das nach Holz aussieht. Ein Regler, vier abgeleitete Toene.
 *
 * Die Werte landen als CSS-Variablen im Schrankfenster. Deshalb werden sie
 * hier streng geprueft: Was nicht wie eine Farbe aussieht, kommt gar nicht
 * erst an - sonst stuende in einem Stylesheet, was jemand in eine
 * Einstellungsdatei geschrieben hat.
 *
 * Bewusst ohne Electron-Abhaengigkeit, damit sich die Ableitungen ohne
 * Bildschirm pruefen lassen.
 */

// Dieselbe Regel wie in schrankFarben.js: Farbwerte gehen in CSS.
const FARBE = /^(rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|hsl\([^)]{1,30}\)|#[0-9a-f]{3,8})$/i;

/** @returns {boolean} */
function istFarbe(wert) {
  return typeof wert === 'string' && FARBE.test(wert.trim());
}

/**
 * #abc oder #aabbcc zu [r, g, b]. Gibt null zurueck, wenn es keine
 * Hex-Farbe ist - rgb() und hsl() lassen sich nicht aufhellen, die werden
 * dann unveraendert durchgereicht.
 */
function zuRgb(hex) {
  const t = String(hex || '').trim();
  const kurz = t.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (kurz) return kurz.slice(1).map((z) => parseInt(z + z, 16));
  const lang = t.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (lang) return lang.slice(1).map((z) => parseInt(z, 16));
  return null;
}

const zuHex = (rgb) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/**
 * Heller oder dunkler machen.
 *
 * Aufhellen laeuft gegen Weiss, nicht ueber eine Multiplikation: Ein dunkles
 * Braun mal 1,3 bleibt dunkles Braun, weil alle drei Kanaele gleich wachsen.
 * Gegen Weiss zu mischen ergibt die Lichtkante, die ein Regalbrett hat.
 *
 * @param {string} farbe
 * @param {number} anteil - >0 heller (Anteil Weiss), <0 dunkler (Anteil Schwarz)
 */
function mische(farbe, anteil) {
  const rgb = zuRgb(farbe);
  if (!rgb) return farbe;
  const ziel = anteil >= 0 ? 255 : 0;
  const a = Math.min(1, Math.abs(anteil));
  return zuHex(rgb.map((v) => v + (ziel - v) * a));
}

/**
 * Die vier Holztoene aus einer Grundfarbe.
 *
 * Die Anteile sind an der urspruenglichen Palette abgelesen (#c89a63 / #a97b4a
 * / #7c5733 / #4a3420): die Lichtkante gut ein Viertel heller, die
 * Schattenseite ein Viertel dunkler, der Innenraum deutlich tiefer.
 */
function holzToene(basis) {
  const grund = istFarbe(basis) ? basis.trim() : '#a97b4a';
  return {
    hell: mische(grund, 0.28),
    normal: grund,
    dunkel: mische(grund, -0.26),
    tief: mische(grund, -0.56),
    // Die Rueckwand im Fach - noch eine Spur tiefer als der Innenraum.
    wand: mische(grund, -0.64),
  };
}

/** Die beiden Toene der Wand hinter dem Schrank. */
function raumToene(basis) {
  const grund = istFarbe(basis) ? basis.trim() : '#171310';
  return {
    grund,
    // Oben faellt Licht ein, unten liegt Schatten.
    oben: mische(grund, 0.09),
    unten: mische(grund, -0.3),
  };
}

/**
 * Farbton, Saettigung, Helligkeit zu #rrggbb.
 *
 * WARUM HEX UND NICHT hsl(): Ein hsl() waere im Schrank gleichwertig, aber
 * der Farbwaehler im Einstellungsfenster kennt nur Hex. Mit hsl() stand dort
 * neben "Horror" ein schwarzes Feld, waehrend der Schrank Violett zeigte -
 * man haette raten muessen, welcher Ton gerade gilt.
 */
function hslZuHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return zuHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

// Saettigung und Helligkeit der abgeleiteten Toene. Gedaempft: Die Ruecken
// stehen zu Dutzenden nebeneinander, und kraeftige Farben in dieser Menge
// sehen aus wie eine Tuete Bonbons.
const SAMMLUNG_SAETTIGUNG = 0.32;
const SAMMLUNG_HELLIGKEIT = 0.34;

/**
 * Die Farbe einer Sammlung.
 *
 * Ohne eigene Wahl eine aus dem Namen abgeleitete: Dieselbe Sammlung bekommt
 * damit immer denselben Ton - auch nach einem Neustart und auf einem anderen
 * Rechner. Ein Zufallswert waere bei jedem Start ein anderer, und ein Regal,
 * das sich jedes Mal umfaerbt, ist unruhig.
 *
 * (Dass "Horror" dabei von sich aus ein Violett ergibt, ist Zufall - aber ein
 * huebscher.)
 *
 * @param {string} name
 * @param {object} eigene - Zuordnung Name -> Farbe aus den Einstellungen
 * @returns {string} #rrggbb
 */
function sammlungsFarbe(name, eigene = {}) {
  const gewaehlt = eigene && eigene[name];
  if (istFarbe(gewaehlt)) return gewaehlt.trim();

  // Quersumme der Zeichen - klein, stabil, und ohne Abhaengigkeit.
  let summe = 0;
  for (const z of String(name || '')) summe = (summe * 31 + z.codePointAt(0)) % 100000;
  return hslZuHex(summe % 360, SAMMLUNG_SAETTIGUNG, SAMMLUNG_HELLIGKEIT);
}

/**
 * Die Farben ALLER Faecher, fertig aufgeloest.
 *
 * Damit braucht das Schrankfenster keine eigene Rechnung: Es schlaegt nur
 * noch nach. Dieselbe Formel an zwei Stellen waeren zwei Stellen, die
 * auseinanderlaufen koennen - und dann faerbten Einstellungsfenster und
 * Schrank unterschiedlich.
 *
 * @param {Array<{name: string}>} faecher
 * @param {object} eigene
 */
function fachFarben(faecher, eigene = {}) {
  const raus = {};
  for (const fach of faecher || []) {
    if (fach && typeof fach.name === 'string') raus[fach.name] = sammlungsFarbe(fach.name, eigene);
  }
  return raus;
}

/**
 * Die Schriftarten zur Auswahl.
 *
 * Nur solche, die unter Windows ohnehin da sind: Das Projekt liefert keine
 * Schriftdateien mit, und eine Schrift aus dem Netz nachzuladen hiesse, dass
 * der Schrank beim Start kurz anders aussieht.
 */
const SCHRIFTEN = {
  standard: "'Inter', 'Segoe UI', sans-serif",
  schmal: "'Bahnschrift', 'Oswald', 'Segoe UI Semibold', sans-serif",
  serifen: "Georgia, 'Times New Roman', serif",
  maschine: "Consolas, 'Space Mono', monospace",
};

const SCHRIFT_NAMEN = Object.keys(SCHRIFTEN);

/** @returns {string} CSS-Schriftliste; unbekannte Angaben ergeben die Vorgabe. */
function schriftListe(name) {
  return SCHRIFTEN[name] || SCHRIFTEN.standard;
}

/**
 * Alles zusammen, wie es das Schrankfenster braucht.
 *
 * @param {object} e - Einstellungen
 */
function ausSichtDesSchranks(e = {}) {
  const holz = holzToene(e.schrankHolz);
  const raum = raumToene(e.schrankWand);
  return {
    holz,
    raum,
    schrift: schriftListe(e.schrankSchrift),
    ruecken: e.schrankRuecken || 'bild',
    verlauf: e.schrankVerlauf !== false,
    sammlungsfarben: e.schrankSammlungsfarben || {},
  };
}

module.exports = {
  istFarbe,
  mische,
  hslZuHex,
  holzToene,
  raumToene,
  sammlungsFarbe,
  fachFarben,
  SCHRIFTEN,
  SCHRIFT_NAMEN,
  schriftListe,
  ausSichtDesSchranks,
};
