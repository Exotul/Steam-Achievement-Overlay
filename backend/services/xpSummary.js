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

// Höher als früher: Die Warteschlange begrenzt ohnehin global und gibt der
// Achievement-Erkennung Vorrang, deshalb ist mehr Parallelität hier
// unbedenklich und verkürzt die Erstberechnung deutlich.
const CONCURRENCY = 8;
const SUMMARY_TTL_MS = 12 * 60 * 60 * 1000; // 12 Stunden

// Laufende Berechnungen je Konto.
const jobs = new Map();

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
async function spielXp(steamId, appId) {
  // Formelfassung im Schluessel: Nach einer Aenderung an der XP-Formel sind
  // die gemerkten Werte falsch, laufen aber noch zwoelf Stunden weiter.
  const schluessel = `xp-spiel:v${FORMEL_VERSION}:${steamId}:${appId}`;
  const gemerkt = cache.get(schluessel);
  if (gemerkt !== undefined) return gemerkt;

  const [playerAch, percentages] = await Promise.all([
    steamApi.getPlayerAchievements(steamId, appId),
    steamApi.getGlobalAchievementPercentages(appId),
  ]);

  if (!playerAch || playerAch.length === 0) {
    // Kein Achievement-System oder privates Profil - kurz merken, damit nicht
    // bei jedem Start erneut gefragt wird.
    cache.set(schluessel, 0, 12 * 60 * 60 * 1000);
    return 0;
  }

  let xp = 0;
  playerAch.forEach((a) => {
    if (!a.achieved) return;
    const prozent = percentages[a.apiname];
    if (typeof prozent !== 'number') return;
    xp += achievementXp(steamApi.categorize(prozent), prozent);
  });

  cache.set(schluessel, xp, 12 * 60 * 60 * 1000);
  return xp;
}

async function berechneIntern(steamId, job) {
  const games = await steamApi.getOwnedGames(steamId);

  // Nie gespielte Titel können keine Achievements haben. Sie zu überspringen
  // kostet nichts und spart bei den meisten Bibliotheken den größten Teil der
  // Abfragen - dort liegen oft mehr ungespielte als gespielte Titel.
  const relevant = games.filter((g) => (g.playtime_forever || 0) > 0);

  job.total = relevant.length;
  job.uebersprungen = games.length - relevant.length;
  job.done = 0;

  let totalXp = 0;
  const queueGames = [...relevant];

  async function worker() {
    while (queueGames.length > 0) {
      const g = queueGames.shift();
      try {
        totalXp += await spielXp(steamId, g.appid);
      } catch (err) {
        /* Spiel überspringen */
      }
      job.done += 1;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queueGames.length || 1) }, worker)
  );

  const summary = { ...getLevelProgress(totalXp), berechnetAm: Date.now() };
  cache.set(`xpsummary:v${FORMEL_VERSION}:${steamId}`, summary, SUMMARY_TTL_MS);
  logger.info(
    `XP-Berechnung fertig: Level ${summary.level}, ${relevant.length} Spiele geprüft, ` +
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
    const fertig = cache.get(`xpsummary:v${FORMEL_VERSION}:${steamId}`);
    if (fertig) return { status: 'ready', ...fertig };
  }

  const laufend = jobs.get(steamId);
  if (laufend) {
    return { status: 'running', done: laufend.done, total: laufend.total };
  }

  const job = { done: 0, total: 0 };
  jobs.set(steamId, job);

  berechne(steamId, job)
    .catch((err) => console.error('XP-Berechnung fehlgeschlagen:', err.message))
    .finally(() => jobs.delete(steamId));

  return { status: 'running', done: 0, total: 0 };
}

module.exports = { getSummary, getLevelProgress, achievementXp, TIER_MULTIPLIER };
