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

/**
 * Ordnet die Spiele den Faechern zu - ohne Netz- oder Dateizugriff, damit
 * genau diese Regeln sich pruefen lassen.
 *
 * @param {Array} alleSammlungen - aus steamSammlungen.deuteSammlungen()
 * @param {Array<{appid: number, name: string, playtime_forever: number}>} spiele
 * @returns {{faecher: Array, anzahlSpiele: number}}
 */
function ordneSpiele(alleSammlungen, spiele) {
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

  for (const spiel of bibliothek.values()) {
    if (versteckt.has(spiel.appid)) continue;
    const fach = fachVon.get(spiel.appid);
    lege(fach ? fach.name : UNSORTIERT, {
      appId: spiel.appid,
      name: spiel.name || `App ${spiel.appid}`,
      spielzeitMin: spiel.playtime_forever || 0,
      favorit: favoriten.has(spiel.appid),
      // Dieselben Bildquellen wie im Dashboard: das hochformatige Bild ist
      // die Packung, header.jpg der Rueckfall fuer Titel ohne eigenes.
      libraryUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${spiel.appid}/library_600x900.jpg`,
      headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${spiel.appid}/header.jpg`,
    });
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

  return { faecher, anzahlSpiele: faecher.reduce((s, f) => s + f.anzahl, 0) };
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

  const { faecher, anzahlSpiele } = ordneSpiele(stand.sammlungen, spiele);
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
  ordneSpiele,
  baueSchrank,
};
