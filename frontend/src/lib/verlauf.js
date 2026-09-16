/**
 * Auswertung des Trophäenverlaufs.
 *
 * Bewusst reine Funktionen ohne React und ohne Netzzugriff: Das sind
 * Datumsrechnungen, und die sind die übliche Quelle stiller Fehler -
 * Zeitzonen, Monatsgrenzen, Schaltjahre, die Woche über den Jahreswechsel.
 * So lassen sie sich prüfen, ohne eine Oberfläche zu bauen.
 *
 * WICHTIG ZUR ZEITZONE: Das Backend gruppiert mit `toISOString()`, also nach
 * UTC-Tagen. Eine Trophäe um 00:30 deutscher Zeit zählt damit zum Vortag.
 * Diese Datei rechnet deshalb ebenfalls in UTC - konsequent falsch ist besser
 * als halb richtig, weil sonst die Summe der Tageswerte nicht mehr zur
 * Gesamtzahl passt und niemand nachvollziehen kann, warum.
 */

const TAG_MS = 24 * 60 * 60 * 1000;

/** Ein Zeitstempel als Tagesschlüssel "2026-09-16" (UTC, wie im Backend). */
export function tagVon(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Tagesschlüssel um `versatz` Tage verschieben. */
export function tagPlus(tag, versatz) {
  return tagVon(Date.parse(`${tag}T12:00:00Z`) + versatz * TAG_MS);
}

/**
 * Baut das Raster für die Jahresansicht: volle Wochen, Montag bis Sonntag,
 * die letzte Woche enthält den heutigen Tag.
 *
 * Warum volle Wochen: Ein Raster, das mitten in der Woche anfängt, verschiebt
 * alle Wochentagszeilen gegeneinander - dann liegen Sonntage mal oben, mal
 * unten, und das Muster "am Wochenende spiele ich mehr" ist nicht mehr
 * ablesbar.
 *
 * @param {Array<{tag: string, anzahl: number, xp: number, stufen: object}>} proTag
 * @param {number} wochen
 * @param {number} [jetzt] - Zeitpunkt für "heute", nur für Tests
 * @returns {{wochen: Array<Array<object>>, maximum: number}}
 */
export function baueRaster(proTag, wochen = 53, jetzt = Date.now()) {
  const nachTag = new Map((proTag || []).map((t) => [t.tag, t]));

  const heute = tagVon(jetzt);
  // Auf den Sonntag der laufenden Woche vorlaufen, damit die letzte Spalte
  // vollständig ist und "heute" nicht am Rand klebt.
  const wochentag = (new Date(`${heute}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Montag
  const letzterTag = tagPlus(heute, 6 - wochentag);
  const ersterTag = tagPlus(letzterTag, -(wochen * 7 - 1));

  const raster = [];
  let maximum = 0;

  for (let w = 0; w < wochen; w++) {
    const woche = [];
    for (let d = 0; d < 7; d++) {
      const tag = tagPlus(ersterTag, w * 7 + d);
      const treffer = nachTag.get(tag);
      const anzahl = treffer ? treffer.anzahl : 0;
      if (anzahl > maximum) maximum = anzahl;
      woche.push({
        tag,
        anzahl,
        xp: treffer ? treffer.xp : 0,
        stufen: treffer ? treffer.stufen : {},
        // Tage nach heute gehören zum Raster, sind aber keine Daten - sie
        // dürfen nicht wie "nichts geschafft" aussehen.
        zukunft: tag > heute,
      });
    }
    raster.push(woche);
  }

  return { wochen: raster, maximum };
}

/**
 * Stufe eines Tages auf der Farbrampe: 0 (nichts) bis 4 (viel).
 *
 * Die Schwellen richten sich nach dem eigenen Höchstwert statt nach festen
 * Zahlen. Wer an guten Tagen drei Trophäen holt, soll dieselbe Spanne sehen
 * wie jemand mit dreißig - sonst ist das Raster für die einen immer blass
 * und für die anderen immer voll.
 */
export function stufeVon(anzahl, maximum) {
  if (anzahl <= 0) return 0;
  if (maximum <= 1) return 4;
  const anteil = anzahl / maximum;
  if (anteil <= 0.25) return 1;
  if (anteil <= 0.5) return 2;
  if (anteil <= 0.75) return 3;
  return 4;
}

/**
 * Wie viele Tage in Folge bis heute (oder gestern) etwas errungen wurde.
 *
 * Gestern zählt als Start, nicht nur heute: Sonst stünde die Serie bis zum
 * ersten Erfolg des Tages auf null, obwohl sie ungebrochen ist - man hat ja
 * einfach noch nicht gespielt.
 */
export function serie(proTag, jetzt = Date.now()) {
  const mitTrophaeen = new Set((proTag || []).filter((t) => t.anzahl > 0).map((t) => t.tag));
  const heute = tagVon(jetzt);

  let tag = mitTrophaeen.has(heute) ? heute : tagPlus(heute, -1);
  let laenge = 0;
  while (mitTrophaeen.has(tag)) {
    laenge += 1;
    tag = tagPlus(tag, -1);
  }
  return laenge;
}

/** Summen über einen Zeitraum - für die Kennzahlen über dem Raster. */
export function summe(proTag, tage, jetzt = Date.now()) {
  const ab = tagPlus(tagVon(jetzt), -(tage - 1));
  const stufen = { Kupfer: 0, Silber: 0, Gold: 0, Platin: 0 };
  let anzahl = 0;
  let xp = 0;
  let besterTag = null;

  (proTag || []).forEach((t) => {
    if (t.tag < ab) return;
    anzahl += t.anzahl;
    xp += t.xp || 0;
    Object.entries(t.stufen || {}).forEach(([stufe, n]) => {
      if (stufen[stufe] !== undefined) stufen[stufe] += n;
    });
    if (!besterTag || t.anzahl > besterTag.anzahl) besterTag = t;
  });

  return { anzahl, xp: Math.round(xp), stufen, besterTag };
}

/**
 * Gruppiert einzelne Freischaltungen nach Tag, jüngste zuerst.
 * Das ist zugleich die lesbare Alternative zum Raster - dort steht jede
 * Trophäe mit Namen und Uhrzeit, nicht nur als eingefärbtes Kästchen.
 */
export function nachTagen(verlauf) {
  const gruppen = new Map();
  (verlauf || []).forEach((e) => {
    const tag = tagVon(e.ts);
    if (!gruppen.has(tag)) gruppen.set(tag, []);
    gruppen.get(tag).push(e);
  });

  return [...gruppen.entries()]
    .map(([tag, eintraege]) => ({
      tag,
      eintraege,
      xp: Math.round(eintraege.reduce((s, e) => s + (e.xpZuwachs || 0), 0)),
    }))
    .sort((a, b) => b.tag.localeCompare(a.tag));
}

/** "16. September 2026" - für Überschriften. */
export function lesbaresDatum(tag) {
  return new Date(`${tag}T12:00:00Z`).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
