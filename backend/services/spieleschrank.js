/**
 * Der Inhalt des Spieleschranks: welches Spiel in welchem Fach steht.
 *
 * Grundlage sind die Sammlungen, die der Anwender sich in Steam selbst
 * angelegt hat (steamSammlungen.js), verheiratet mit seiner Bibliothek.
 *
 * Die eine Entscheidung, um die es hier geht: Ein Spiel steht in MEHREREN
 * Sammlungen - "Resident Evil 4" liegt in Horror, in Resident Evil und in
 * Soulslike-nahem. Im Regal kann es aber nur an einer Stelle stehen, sonst
 * steht dieselbe Packung dreimal da und der Schrank fuehlt sich falsch an.
 *
 * Gewaehlt wird die KLEINSTE Sammlung, in der ein Spiel vorkommt. Die ist die
 * genaueste Aussage ueber das Spiel: Wer eine Sammlung "Fallout" mit acht
 * Titeln anlegt, meint damit mehr als mit "RPG" mit 83. Nebenbei verteilt das
 * die Spiele besser ueber die Faecher, statt alles in zwei Riesenfaecher zu
 * kippen.
 */

const steamApi = require('./steamApi');
const sammlungen = require('./steamSammlungen');
const xpSummary = require('./xpSummary');

// Sammlungen, die kein Fach bekommen. "Versteckt" fuehrt Steam selbst - was
// dort liegt, will der Anwender nicht sehen. Die Namen sind das, was man in
// einer Bibliothek typischerweise fuer Nicht-Spiele anlegt; sie landen im
// Schrank sonst zwischen den Spielen (hier: eine Sammlung "Programme" mit 20
// Eintraegen, darunter Wallpaper Engine und Aufnahmesoftware).
const KEIN_FACH = /^(programme|software|tools?|apps?|anwendungen|utilities)$/i;

// Unter so vielen Spielen lohnt sich kein eigenes Fach - sonst besteht der
// Schrank aus zwei Dutzend fast leeren Kaesten.
const MIN_PRO_FACH = 3;

const UNSORTIERT = 'Unsortiert';
const VERSCHIEDENES = 'Verschiedenes';

/* ----------------------------------------------------------------------------
   Die beiden Spiegelfaecher
   ----------------------------------------------------------------------------
   "Fast geschafft" und "Zuletzt gespielt" sind keine Sammlungen, sondern
   Blickwinkel auf dieselbe Bibliothek. Die Spiele darin stehen deshalb
   ZUSAETZLICH in ihrem Sammlungsfach, nicht statt dessen - ein Spiel aus
   seinem Genre zu nehmen, weil es gerade fast fertig ist, waere eine
   Umraeumaktion hinter dem Ruecken des Anwenders.

   Damit zaehlen sie nirgends mit: `anzahlSpiele` bleibt die Zahl der echten
   Spiele, und `spiegel: true` sagt dem Schrank, dass er dieses Fach anders
   beschriften darf.
   -------------------------------------------------------------------------- */

const FAST_GESCHAFFT = 'Fast geschafft';
const ZULETZT_GESPIELT = 'Zuletzt gespielt';

/*
 * Wie nah ist "fast"?
 *
 * Eine feste Grenze geht hier nicht: Bei zwei fehlenden Trophaeen ist der
 * Diamant zum Greifen nah, aber wer gerade keines dieser Spiele hat, bekaeme
 * ein leeres Fach - und ein leeres Fach sieht aus wie ein Fehler, nicht wie
 * eine Aussage. Deshalb der Reihe nach: Erst die ganz nahen; findet sich
 * davon fast nichts, wird die Grenze einmal weiter gefasst.
 */
const FAST_GRENZEN = [2, 5, 12];
const FAST_MINDESTENS = 3; // darunter lohnt die naechste Grenze
const FAST_HOECHSTENS = 20; // mehr wuerde das Fach zum groessten im Schrank machen

/*
 * Und eine zweite Bedingung: mindestens zur Haelfte fertig.
 *
 * Die Zahl der fehlenden Trophaeen allein genuegt nicht. An den echten Daten
 * dieser Bibliothek stand sonst ein Spiel mit 1 von 5 Achievements im Fach -
 * vier fehlen, also "nah dran", aber angefangen ist es gerade erst. Erst
 * beides zusammen - wenige fehlen UND das meiste ist geschafft - ergibt das,
 * was man unter "fast geschafft" versteht.
 */
const FAST_MIN_ANTEIL = 0.5;

const ZULETZT_ANZAHL = 12;

/**
 * Ordnet die Spiele den Faechern zu - ohne Netz- oder Dateizugriff, damit
 * genau diese Regeln sich pruefen lassen.
 *
 * @param {Array} alleSammlungen - aus steamSammlungen.deuteSammlungen()
 * @param {Array<{appid: number, name: string, playtime_forever: number}>} spiele
 * @param {{stand?: (appId: number) => ({erreicht?: number, gesamt?: number}|null)}} [zusatz]
 *        Zugriff auf den gemerkten Achievement-Stand je Spiel. Fehlt er,
 *        entsteht das Fach "Fast geschafft" eben nicht - der Schrank
 *        funktioniert auch ohne.
 * @returns {{faecher: Array, anzahlSpiele: number}}
 */
function ordneSpiele(alleSammlungen, spiele, zusatz = {}) {
  const standVon = typeof zusatz.stand === 'function' ? zusatz.stand : () => null;
  const bibliothek = new Map((spiele || []).map((s) => [s.appid, s]));

  const versteckt = new Set();
  const favoriten = new Set();
  const kandidaten = [];

  for (const s of alleSammlungen || []) {
    if (s.art === 'versteckt') {
      s.appIds.forEach((id) => versteckt.add(id));
      continue;
    }
    if (s.art === 'favorit') {
      // Kein Fach, sondern eine Auszeichnung: Favoriten stehen in ihrem
      // Genre-Fach und bekommen dort ein Zeichen.
      s.appIds.forEach((id) => favoriten.add(id));
      continue;
    }
    if (KEIN_FACH.test(s.name)) {
      s.appIds.forEach((id) => versteckt.add(id));
      continue;
    }
    kandidaten.push(s);
  }

  // Nur Spiele, die es in der Bibliothek auch gibt: Eine Sammlung kann
  // Eintraege enthalten, die inzwischen aus der Bibliothek verschwunden sind.
  const beruecksichtigt = kandidaten.map((s) => ({
    ...s,
    appIds: s.appIds.filter((id) => bibliothek.has(id) && !versteckt.has(id)),
  }));

  // Kleinste zuerst: Beim Zuordnen gewinnt damit die genaueste Sammlung.
  const nachGroesse = [...beruecksichtigt].sort(
    (a, b) => a.appIds.length - b.appIds.length || a.name.localeCompare(b.name, 'de')
  );

  const fachVon = new Map(); // appId -> Sammlung
  for (const s of nachGroesse) {
    for (const id of s.appIds) {
      if (!fachVon.has(id)) fachVon.set(id, s);
    }
  }

  const inhalt = new Map(); // Fachname -> Spiele
  const lege = (fach, spiel) => {
    if (!inhalt.has(fach)) inhalt.set(fach, []);
    inhalt.get(fach).push(spiel);
  };

  // Alle sichtbaren Spiele in der Form, in der sie im Schrank stehen - die
  // Spiegelfaecher greifen spaeter auf genau dieselben Objekte zurueck.
  const alleKartons = [];

  for (const spiel of bibliothek.values()) {
    if (versteckt.has(spiel.appid)) continue;
    const fach = fachVon.get(spiel.appid);
    const stand = standVon(spiel.appid) || {};
    const karton = {
      appId: spiel.appid,
      name: spiel.name || `App ${spiel.appid}`,
      spielzeitMin: spiel.playtime_forever || 0,
      favorit: favoriten.has(spiel.appid),
      // Sekunden seit 1970, wie Steam sie liefert; 0 heisst "nie" oder
      // "sagt Steam nicht".
      zuletztGespielt: spiel.rtime_last_played || 0,
      // Achievement-Stand aus der XP-Berechnung, wenn er dort schon liegt.
      // undefined heisst ausdruecklich "unbekannt" - das ist etwas anderes
      // als "null von null".
      erreicht: typeof stand.erreicht === 'number' ? stand.erreicht : undefined,
      gesamt: typeof stand.gesamt === 'number' ? stand.gesamt : undefined,
      // Dieselben Bildquellen wie im Dashboard: das hochformatige Bild ist
      // die Packung, header.jpg der Rueckfall fuer Titel ohne eigenes.
      libraryUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${spiel.appid}/library_600x900.jpg`,
      headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${spiel.appid}/header.jpg`,
    };
    alleKartons.push(karton);
    lege(fach ? fach.name : UNSORTIERT, karton);
  }

  // Zu kleine Faecher zusammenlegen - aber nie "Unsortiert", das ist schon
  // das Sammelfach.
  const zuKlein = [];
  for (const [name, liste] of inhalt) {
    if (name !== UNSORTIERT && liste.length < MIN_PRO_FACH) zuKlein.push(name);
  }
  for (const name of zuKlein) {
    const liste = inhalt.get(name);
    inhalt.delete(name);
    liste.forEach((spiel) => lege(VERSCHIEDENES, { ...spiel, herkunft: name }));
  }

  const faecher = [...inhalt.entries()]
    .map(([name, liste]) => ({
      name,
      spiele: liste.sort(
        (a, b) => b.spielzeitMin - a.spielzeitMin || a.name.localeCompare(b.name, 'de')
      ),
      anzahl: liste.length,
      gespielt: liste.filter((s) => s.spielzeitMin > 0).length,
    }))
    // Grosse Faecher zuerst; die Sammelfaecher immer ans Ende, egal wie voll.
    .sort((a, b) => {
      const sammel = (n) => (n.name === UNSORTIERT ? 2 : n.name === VERSCHIEDENES ? 1 : 0);
      return sammel(a) - sammel(b) || b.anzahl - a.anzahl || a.name.localeCompare(b.name, 'de');
    });

  // Die echte Zahl - vor den Spiegelfaechern ermittelt, damit kein Spiel
  // doppelt zaehlt.
  const anzahlSpiele = faecher.reduce((s, f) => s + f.anzahl, 0);

  return {
    faecher: [...spiegelFaecher(alleKartons), ...faecher],
    anzahlSpiele,
  };
}

/**
 * "Fast geschafft": Spielen, denen nur noch wenige Trophaeen zum Diamanten
 * fehlen.
 *
 * Ausdruecklich nur Spiele, in denen schon etwas erreicht wurde: Ein Spiel
 * mit 0 von 2 Achievements fehlen zwar auch nur zwei, aber angefangen hat man
 * es nicht - und "fast geschafft" soll heissen, dass es sich lohnt
 * weiterzumachen.
 */
function fastGeschafft(kartons) {
  const offen = kartons
    .filter(
      (k) =>
        typeof k.gesamt === 'number' &&
        typeof k.erreicht === 'number' &&
        k.gesamt > 0 &&
        k.erreicht > 0 &&
        k.erreicht < k.gesamt &&
        k.erreicht / k.gesamt >= FAST_MIN_ANTEIL
    )
    .map((k) => ({ ...k, fehlend: k.gesamt - k.erreicht }))
    // Die naechsten zuerst; bei gleichem Abstand das weiter fortgeschrittene.
    .sort(
      (a, b) =>
        a.fehlend - b.fehlend ||
        b.erreicht / b.gesamt - a.erreicht / a.gesamt ||
        a.name.localeCompare(b.name, 'de')
    );

  for (const grenze of FAST_GRENZEN) {
    const treffer = offen.filter((k) => k.fehlend <= grenze);
    if (treffer.length >= FAST_MINDESTENS || grenze === FAST_GRENZEN[FAST_GRENZEN.length - 1]) {
      return treffer.slice(0, FAST_HOECHSTENS);
    }
  }
  return [];
}

/** "Zuletzt gespielt": die letzten Titel, in der Reihenfolge von Steam. */
function zuletztGespielt(kartons) {
  return kartons
    .filter((k) => k.zuletztGespielt > 0)
    .sort((a, b) => b.zuletztGespielt - a.zuletztGespielt)
    .slice(0, ZULETZT_ANZAHL);
}

/**
 * Die beiden Spiegelfaecher - oder keines, wenn nichts hineingehoert.
 *
 * Ein leeres Fach waere schlimmer als gar keines: Es sieht aus, als haette
 * etwas nicht geladen.
 */
function spiegelFaecher(kartons) {
  const faecher = [];
  const fast = fastGeschafft(kartons);
  if (fast.length > 0) {
    faecher.push({
      name: FAST_GESCHAFFT,
      spiegel: true,
      spiele: fast,
      anzahl: fast.length,
      gespielt: fast.length,
    });
  }
  const zuletzt = zuletztGespielt(kartons);
  if (zuletzt.length > 0) {
    faecher.push({
      name: ZULETZT_GESPIELT,
      spiegel: true,
      // Hier NICHT nach Spielzeit sortieren wie sonst: Die Reihenfolge ist
      // die Aussage des Fachs.
      spiele: zuletzt,
      anzahl: zuletzt.length,
      gespielt: zuletzt.length,
    });
  }
  return faecher;
}

/**
 * Der fertige Schrankinhalt fuer ein Konto.
 *
 * Die Bibliothek kommt aus dem Zwischenspeicher, wenn sie dort liegt - der
 * Schrank laeuft dauerhaft und darf nicht bei jedem Blick Steam befragen.
 */
async function baueSchrank(steamId) {
  const [stand, spiele] = await Promise.all([
    sammlungen.leseSammlungen(steamId),
    steamApi.getOwnedGames(steamId),
  ]);

  // Der Achievement-Stand kommt aus dem Zwischenspeicher der XP-Berechnung -
  // keine einzige zusaetzliche Steam-Abfrage. Was dort noch nicht liegt,
  // fehlt eben im Fach "Fast geschafft", bis die Berechnung durch ist.
  const { faecher, anzahlSpiele } = ordneSpiele(stand.sammlungen, spiele, {
    stand: (appId) => xpSummary.spielStand(steamId, appId),
  });
  return {
    faecher,
    anzahlSpiele,
    anzahlSammlungen: stand.sammlungen.filter((s) => s.art === 'eigene').length,
    stand: stand.stand,
    grund: stand.grund,
  };
}

module.exports = {
  KEIN_FACH,
  MIN_PRO_FACH,
  UNSORTIERT,
  VERSCHIEDENES,
  FAST_GESCHAFFT,
  ZULETZT_GESPIELT,
  ordneSpiele,
  baueSchrank,
};
