const steamApi = require('./steamApi');
const cache = require('./cache');
const queue = require('./steamQueue');
const logger = require('./logger');

/**
 * Berechnet einmalig den XP-Gesamtstand und das Achievement-Level.
 *
 * Warum als eigener Dienst mit Fortschritt: Der Gesamtstand erfordert, die
 * ganze Bibliothek durchzugehen. Frueher haette das bei jedem einzelnen
 * Achievement erneut passieren muessen - voellig unnoetig, denn der Zuwachs
 * eines einzelnen Achievements laesst sich direkt ausrechnen. Deshalb: einmal
 * beim Start sauber ermitteln, danach nur noch fortschreiben.
 *
 * Die Berechnung laeuft im Hintergrund weiter, auch wenn die anfragende
 * Verbindung schon beantwortet ist. Der Fortschritt ist jederzeit abrufbar,
 * damit die App einen Ladebalken zeigen kann.
 */

const { FORMEL_VERSION, TIER_MULTIPLIER, achievementXp, getLevelProgress } = require('./xpMath');
const { planeBerechnung } = require('./xpPlan');
const steamFehler = require('./steamFehler');

// Höher als früher: Die Warteschlange begrenzt ohnehin global und gibt der
// Achievement-Erkennung Vorrang, deshalb ist mehr Parallelität hier
// unbedenklich und verkürzt die Erstberechnung deutlich.
const CONCURRENCY = 8;
const SUMMARY_TTL_MS = 12 * 60 * 60 * 1000; // 12 Stunden

// Der zuletzt fertig berechnete Stand, deutlich länger gemerkt. Er ist die
// Grundlage dafür, dass beim Start niemand mehr warten muss: Er wird sofort
// ausgeliefert, während im Hintergrund neu gerechnet wird.
const LETZTER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

// Ein einzelner Spielbeitrag darf lange gemerkt werden, weil er ohnehin
// verworfen wird, sobald sich die Spielzeit ändert (siehe xpPlan.js).
const SPIEL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const schluesselSpiel = (steamId, appId) => `xp-spiel:v${FORMEL_VERSION}:${steamId}:${appId}`;
const schluesselFrisch = (steamId) => `xpsummary:v${FORMEL_VERSION}:${steamId}`;
const schluesselLetzter = (steamId) => `xpsummary-letzter:v${FORMEL_VERSION}:${steamId}`;

// Laufende Berechnungen je Konto.
const jobs = new Map();

/**
 * Letzter Fehlschlag je Konto.
 *
 * Ohne das hat die App eine aussichtslose Berechnung endlos wiederholt: Bei
 * einem zurueckgezogenen API-Schluessel antwortet Steam mit 401, und daran
 * aendert sich durch Wiederholen nichts. Im Protokoll standen fuenfzehn
 * gleichlautende Fehler, und jeder davon war eine weitere Anfrage an Steam.
 */
const fehlschlaege = new Map();

// Nach einem voruebergehenden Problem (kein Netz, Serverfehler) darf es
// wieder losgehen - aber nicht im Sekundentakt.
const FEHLER_RUHE_MS = 60 * 1000;

async function berechne(steamId, job) {
  // Die Erstberechnung geht durch die ganze Bibliothek - ausdruecklich
  // Hintergrund, damit sie das Spielgeschehen nicht stoert.
  return queue.mitPrioritaet('hintergrund', () => berechneIntern(steamId, job));
}

/**
 * Ermittelt den XP-Beitrag EINES Spiels - bewusst sparsam.
 *
 * Der ursprüngliche Weg lief über buildEnrichedAchievements und machte damit
 * drei Steam-Abfragen je Spiel: Spielerstand, Schema (Namen, Beschreibungen,
 * Symbole) und weltweite Prozentsätze. Für die reine XP-Rechnung wird das
 * Schema aber gar nicht gebraucht - XP hängen nur an Stufe und Prozentsatz.
 * Damit fällt ein Drittel der Abfragen weg.
 */
async function spielXp(steamId, appId, spielzeit) {
  // Formelfassung im Schluessel: Nach einer Aenderung an der XP-Formel sind
  // die gemerkten Werte falsch, wuerden aber sonst weitergelten.
  const schluessel = schluesselSpiel(steamId, appId);

  // Die beiden Abfragen liefen frueher parallel. Das war bequem, aber bei
  // der Haelfte der Bibliothek umsonst: Wer in einem Spiel nichts
  // freigeschaltet hat, braucht die weltweiten Prozentsaetze gar nicht.
  // Nacheinander kostet etwas Wartezeit je Spiel, spart aber an einer echten
  // Bibliothek rund ein Viertel aller Abfragen - und die Warteschlange ist
  // der Engpass, nicht die Latenz einzelner Aufrufe.
  const playerAch = await steamApi.getPlayerAchievements(steamId, appId);
  const errungen = (playerAch || []).filter((a) => a.achieved);

  if (errungen.length === 0) {
    // Kein Achievement-System, privates Profil oder schlicht noch nichts
    // geholt - merken, damit nicht bei jedem Start erneut gefragt wird.
    cache.set(schluessel, { xp: 0, spielzeit }, SPIEL_TTL_MS);
    return 0;
  }

  const percentages = await steamApi.getGlobalAchievementPercentages(appId);

  let xp = 0;
  errungen.forEach((a) => {
    const prozent = percentages[a.apiname];
    if (typeof prozent !== 'number') return;
    xp += achievementXp(steamApi.categorize(prozent), prozent);
  });

  cache.set(schluessel, { xp, spielzeit }, SPIEL_TTL_MS);
  return xp;
}

async function berechneIntern(steamId, job) {
  // Erste Phase: die Bibliothek selbst. Sie dauert spuerbar, und solange sie
  // laeuft, ist noch gar nicht bekannt, wie viele Spiele es zu pruefen gibt -
  // die Oberflaeche kann deshalb keinen Fortschritt in Prozent zeigen und
  // muss das auch nicht vortaeuschen.
  job.phase = 'bibliothek';
  const games = await steamApi.getOwnedGames(steamId);

  const { offen, sicher, xpSicher } = planeBerechnung(games, (appId) =>
    cache.get(schluesselSpiel(steamId, appId))
  );

  job.phase = 'spiele';
  job.total = offen.length;
  job.done = 0;
  job.ausSpeicher = sicher.length;
  job.uebersprungen = games.length - offen.length - sicher.length;

  let totalXp = xpSicher;
  const warteschlange = [...offen];

  async function worker() {
    while (warteschlange.length > 0) {
      const g = warteschlange.shift();
      try {
        totalXp += await spielXp(steamId, g.appid, g.playtime_forever || 0);
      } catch (err) {
        /* Spiel überspringen */
      }
      job.done += 1;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, warteschlange.length || 1) }, worker)
  );

  const summary = { ...getLevelProgress(totalXp), berechnetAm: Date.now() };
  cache.set(schluesselFrisch(steamId), summary, SUMMARY_TTL_MS);
  // Zusaetzlich langfristig merken: Dieser Wert erspart beim naechsten Start
  // das Warten, weil er sofort angezeigt werden kann.
  cache.set(schluesselLetzter(steamId), summary, LETZTER_TTL_MS);

  logger.info(
    `XP-Berechnung fertig: Level ${summary.level}, ${offen.length} Spiele abgefragt, ` +
      `${sicher.length} unverändert aus dem Speicher, ` +
      `${job.uebersprungen} nie gespielte übersprungen`
  );
  return summary;
}

/**
 * Gibt den Stand zurueck. Ist er noch nicht da, wird die Berechnung
 * angestossen und der aktuelle Fortschritt gemeldet.
 */
function getSummary(steamId, neuBerechnen = false) {
  if (!neuBerechnen) {
    const fertig = cache.get(schluesselFrisch(steamId));
    if (fertig) return { status: 'ready', ...fertig };
  }

  // Ist die Berechnung zuletzt an etwas gescheitert, das sich von selbst
  // nicht aendert, wird nicht erneut angefangen. Ein ausdrueckliches
  // Neuberechnen (Aktualisieren-Knopf, neuer Schluessel) hebt das auf.
  const letzterFehler = fehlschlaege.get(steamId);
  if (letzterFehler && !neuBerechnen) {
    const ruht = Date.now() - letzterFehler.zeit < FEHLER_RUHE_MS;
    if (letzterFehler.endgueltig || ruht) {
      return {
        status: 'fehler',
        grund: letzterFehler.grund,
        endgueltig: letzterFehler.endgueltig,
        schluesselProblem: letzterFehler.schluesselProblem,
      };
    }
    fehlschlaege.delete(steamId);
  }
  if (neuBerechnen) fehlschlaege.delete(steamId);

  // Rechnen lassen, falls noch niemand rechnet.
  let laufend = jobs.get(steamId);
  if (!laufend) {
    laufend = { done: 0, total: 0, phase: 'start' };
    jobs.set(steamId, laufend);
    berechne(steamId, laufend)
      .then(() => fehlschlaege.delete(steamId))
      .catch((err) => {
        const info = steamFehler.beschreibe(err);
        fehlschlaege.set(steamId, { ...info, zeit: Date.now() });
        // Einmal mit Begruendung, statt immer wieder mit dem nackten Code.
        logger.error(
          'XP-Berechnung fehlgeschlagen: ' +
            info.grund +
            (info.endgueltig ? ' Es wird nicht erneut versucht.' : '')
        );
      })
      .finally(() => jobs.delete(steamId));
  }

  // ENTSCHEIDEND fuer den Start: Gibt es einen frueher berechneten Stand,
  // wird er SOFORT ausgeliefert, statt jemanden minutenlang auf einen
  // Ladebalken schauen zu lassen. Er ist hoechstens um das veraltet, was seit
  // der letzten Berechnung dazugekommen ist - und das Overlay schreibt jede
  // erkannte Freischaltung ohnehin selbst fort. Sobald die Neuberechnung
  // fertig ist, wird der Wert still ersetzt.
  const letzter = cache.get(schluesselLetzter(steamId));
  if (letzter) {
    return { status: 'ready', veraltet: true, ...letzter };
  }

  return {
    status: 'running',
    phase: laufend.phase,
    done: laufend.done,
    total: laufend.total,
    ausSpeicher: laufend.ausSpeicher || 0,
  };
}

module.exports = { getSummary, getLevelProgress, achievementXp, TIER_MULTIPLIER };
