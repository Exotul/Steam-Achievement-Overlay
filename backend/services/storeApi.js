const axios = require('axios');
const cache = require('./cache');
const logger = require('./logger');
const queue = require('./steamQueue');

// Die Store-Schnittstelle ist deutlich strenger limitiert als die Web-API
// (grob 200 Anfragen / 5 Minuten). Deshalb: kleine Parallelität, langes
// Caching, und Erscheinungsdaten werden nur auf ausdrückliche Anfrage
// geladen - nicht automatisch für die ganze Bibliothek beim Start.
const CONCURRENCY = 2;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage - Erscheinungsdaten ändern sich nicht
const MAX_PER_REQUEST = 60;

async function fetchOne(appId) {
  const cacheKey = `releasedate:${appId}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Erscheinungsdaten sind nie dringend - immer im Hintergrund.
    const { data } = await queue.einreihen(
      () =>
        axios.get('https://store.steampowered.com/api/appdetails', {
          params: { appids: appId, filters: 'basic', l: 'german' },
          timeout: 8000,
        }),
      'hintergrund'
    );
    logger.debug(`Store-Abfrage für App ${appId} erfolgreich`);
    const entry = data?.[appId];
    const raw = entry?.success ? entry.data?.release_date?.date : null;
    const value = raw ? { appId: Number(appId), releaseDate: raw } : { appId: Number(appId), releaseDate: null };
    cache.set(cacheKey, value, TTL_MS);
    return value;
  } catch (err) {
    // Bei Rate-Limit oder Netzproblem: kurz zwischenspeichern, damit nicht
    // sofort erneut angefragt wird, aber nicht dauerhaft als "kein Datum".
    const value = { appId: Number(appId), releaseDate: null };
    cache.set(cacheKey, value, 60 * 1000);
    return value;
  }
}

/** Holt Erscheinungsdaten für mehrere Spiele, begrenzt parallel. */
async function getReleaseDates(appIds) {
  const ids = appIds.slice(0, MAX_PER_REQUEST);
  const results = [];
  const queue = [...ids];

  async function worker() {
    while (queue.length > 0) {
      const appId = queue.shift();
      results.push(await fetchOne(appId));
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return results;
}

module.exports = { getReleaseDates };
