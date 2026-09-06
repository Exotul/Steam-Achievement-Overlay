const axios = require('axios');
const cache = require('./cache');
const logger = require('./logger');
const queue = require('./steamQueue');
const health = require('./steamHealth');

// Jeden Steam-Aufruf mitschreiben: Endpunkt, Statuscode, Dauer. Genau diese
// drei Angaben haben bei der Suche nach der Verzoegerung gefehlt - ohne sie
// laesst sich nicht unterscheiden, ob Steam langsam ist oder die App.
const client = axios.create();

client.interceptors.request.use((config) => {
  config.metadata = { start: Date.now() };
  return config;
});

function endpunktName(url) {
  // Nur den sprechenden Teil behalten, z. B. "GetPlayerAchievements".
  const teile = String(url).split('/').filter(Boolean);
  return teile[teile.length - 2] || teile[teile.length - 1] || url;
}

/**
 * Jeder Steam-Aufruf geht durch die Warteschlange. Dadurch kann keine
 * Funktion mehr ungebremst Anfragen absetzen und andere ausbremsen - genau
 * das war die Ursache, als die Komplettierungszeit beim Spielstart die
 * Achievement-Erkennung blockierte.
 */
function steamGet(url, config) {
  return queue.einreihen(() => client.get(url, config));
}

client.interceptors.response.use(
  (antwort) => {
    const dauer = Date.now() - (antwort.config.metadata?.start || Date.now());
    logger.steam(endpunktName(antwort.config.url), antwort.status, dauer);
    health.erfolg();
    return antwort;
  },
  (fehler) => {
    const dauer = Date.now() - (fehler.config?.metadata?.start || Date.now());
    logger.steam(
      endpunktName(fehler.config?.url || 'unbekannt'),
      fehler.response?.status || 0,
      dauer,
      fehler.response?.status ? undefined : fehler.code || fehler.message
    );
    health.fehlschlag(fehler);
    return Promise.reject(fehler);
  }
);

const BASE = 'https://api.steampowered.com';
const key = () => process.env.STEAM_API_KEY;

// --- Rohe Steam-Web-API-Aufrufe -------------------------------------------

/**
 * Liste aller Spiele, die ein Nutzer besitzt (inkl. Spielzeit).
 * Erfordert, dass "Spieldetails" im Steam-Profil auf öffentlich steht.
 */
async function getOwnedGames(steamId) {
  const { data } = await steamGet(`${BASE}/IPlayerService/GetOwnedGames/v1/`, {
    params: {
      key: key(),
      steamid: steamId,
      include_appinfo: true,
      include_played_free_games: true,
    },
  });
  return data.response.games || [];
}

/**
 * Die vom Nutzer erlangten Achievements für ein einzelnes Spiel.
 * Wirft keinen Fehler, sondern gibt null zurück, wenn das Spiel keine
 * Achievements hat oder das Profil privat ist.
 */
async function getPlayerAchievements(steamId, appId) {
  try {
    const { data } = await steamGet(`${BASE}/ISteamUserStats/GetPlayerAchievements/v1/`, {
      params: { key: key(), steamid: steamId, appid: appId, l: 'german' },
    });
    return data.playerstats.achievements || [];
  } catch (err) {
    // Steam antwortet mit 400/403, wenn das Spiel keine Achievements hat
    // oder das Profil privat ist -> das ist ein normaler Fall, kein Crash.
    return null;
  }
}

/**
 * Schema (Metadaten) der Achievements eines Spiels: Name, Beschreibung, Icon.
 */
async function getGameSchema(appId) {
  // Das Schema (Namen, Beschreibungen, Symbole) aendert sich praktisch nie -
  // frueher wurde es bei JEDEM Poll neu geholt, was zusammen mit den globalen
  // Prozentsaetzen zu drei Steam-Abfragen alle 2 Sekunden fuehrte. Das reicht,
  // damit Steam anfaengt zu drosseln - und genau das verzoegert dann die
  // Antworten massiv. Deshalb: lange zwischenspeichern.
  const cached = cache.get(`schema:${appId}`);
  if (cached !== undefined) return cached;

  try {
    const { data } = await steamGet(`${BASE}/ISteamUserStats/GetSchemaForGame/v2/`, {
      params: { key: key(), appid: appId, l: 'german' },
    });
    const result = data.game?.availableGameStats?.achievements || [];
    cache.set(`schema:${appId}`, result, 24 * 60 * 60 * 1000); // 24 Stunden
    return result;
  } catch (err) {
    cache.set(`schema:${appId}`, [], 60 * 1000); // kurz merken, nicht sofort erneut fragen
    return [];
  }
}

/**
 * Globale Prozentsätze: wie viel Prozent aller Spieler haben dieses
 * Achievement freigeschaltet. Grundlage für Kupfer/Silber/Gold/Platin.
 */
async function getGlobalAchievementPercentages(appId) {
  // Aendert sich nur sehr langsam (Durchschnitt ueber alle Spieler weltweit).
  const cached = cache.get(`globalpct:${appId}`);
  if (cached !== undefined) return cached;

  try {
    const { data } = await steamGet(
      `${BASE}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/`,
      { params: { gameid: appId } }
    );
    const list = data.achievementpercentages?.achievements || [];
    // in eine Map umwandeln: apiname -> percent
    const result = Object.fromEntries(list.map((a) => [a.name, parseFloat(a.percent)]));
    cache.set(`globalpct:${appId}`, result, 6 * 60 * 60 * 1000); // 6 Stunden
    return result;
  } catch (err) {
    cache.set(`globalpct:${appId}`, {}, 60 * 1000);
    return {};
  }
}

async function getFriendList(steamId) {
  try {
    const { data } = await steamGet(`${BASE}/ISteamUser/GetFriendList/v1/`, {
      params: { key: key(), steamid: steamId, relationship: 'friend' },
    });
    return data.friendslist.friends || [];
  } catch (err) {
    // Freundesliste ist privat
    return [];
  }
}

/**
 * Öffentliche Profildaten (Name, Avatar) für eine Liste von SteamIDs.
 * Steam erlaubt bis zu 100 IDs pro Aufruf.
 */
async function getPlayerSummaries(steamIds) {
  const chunks = [];
  for (let i = 0; i < steamIds.length; i += 100) {
    chunks.push(steamIds.slice(i, i + 100));
  }
  const results = [];
  for (const chunk of chunks) {
    const { data } = await steamGet(`${BASE}/ISteamUser/GetPlayerSummaries/v2/`, {
      params: { key: key(), steamids: chunk.join(',') },
    });
    results.push(...data.response.players);
  }
  return results;
}

// --- Anreicherung: Kategorie, Diamant-Status --------------------------------

/**
 * Ordnet ein Achievement anhand des globalen Prozentsatzes einer Stufe zu.
 * Kupfer 100–60% | Silber <60–25% | Gold <25–5% | Platin <5–0%
 */
const scoring = require('./scoring');
const { categorize, categorizeInContext, buildTierContext, estimateDifficulty } = scoring;

async function buildEnrichedAchievements(steamId, appId) {
  const [playerAch, schema, percentages] = await Promise.all([
    getPlayerAchievements(steamId, appId),
    getGameSchema(appId),
    getGlobalAchievementPercentages(appId),
  ]);

  if (!playerAch || schema.length === 0) {
    return { achievements: [], unlockedCount: 0, totalCount: 0, isDiamond: false };
  }

  const schemaByName = Object.fromEntries(schema.map((s) => [s.name, s]));

  // Zusammenhang des Spiels einmal aufbauen, damit die relative Einstufung
  // fuer alle Achievements auf derselben Grundlage steht.
  const tierContext = buildTierContext(
    playerAch.map((a) => percentages[a.apiname]).filter((p) => typeof p === 'number')
  );

  const achievements = playerAch.map((a) => {
    const meta = schemaByName[a.apiname] || {};
    const percent = percentages[a.apiname] ?? 100; // Fallback, falls Steam nichts liefert
    return {
      apiName: a.apiname,
      name: meta.displayName || a.apiname,
      description: meta.description || '',
      icon: a.achieved ? meta.icon : meta.icongray,
      unlocked: !!a.achieved,
      unlockedAt: a.achieved ? a.unlocktime : null,
      globalPercent: percent,
      category: categorizeInContext(percent, tierContext),
    };
  });

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;
  const isDiamond = totalCount > 0 && unlockedCount === totalCount;

  const ergebnis = {
    achievements,
    unlockedCount,
    totalCount,
    isDiamond,
    difficulty: estimateDifficulty(achievements),
  };

  // Langlebige Sicherungskopie: Faellt Steam aus, ist das die Grundlage, mit
  // der zusammen mit der lokalen Datei weitergearbeitet werden kann.
  cache.set(`achievements-letzter:${steamId}:${appId}`, ergebnis, 30 * 24 * 60 * 60 * 1000);

  return ergebnis;
}

/**
 * Liefert, ob und welches Spiel ein Nutzer gerade aktiv spielt.
 * Kommt aus GetPlayerSummaries (Felder gameid/gameextrainfo), die Steam nur
 * füllt, während die Person tatsächlich im Spiel ist - kein Polling-Ersatz
 * für "im Spiel", sondern die einzige öffentliche Quelle dafür.
 */
async function getPresence(steamId) {
  const [summary] = await getPlayerSummaries([steamId]);
  if (!summary || !summary.gameid) {
    return { inGame: false, appId: null, gameName: null };
  }
  return { inGame: true, appId: summary.gameid, gameName: summary.gameextrainfo || null };
}

/**
 * Prueft, ob der hinterlegte Steam-API-Schluessel funktioniert.
 * Gibt eine klare Aussage zurueck, statt den Nutzer mit "403" alleinzulassen.
 * Der Schluessel selbst wird nie vollstaendig ausgegeben.
 */
async function checkApiKey() {
  const k = key();

  if (!k || k === 'undefined' || k === 'DEIN_STEAM_API_KEY') {
    return {
      ok: false,
      grund: !k
        ? 'Es ist gar kein Schlüssel gesetzt.'
        : k === 'undefined'
          ? 'Der Schlüssel kam als Text "undefined" an - er fehlt in der .env der Overlay-App.'
          : 'Es steht noch der Platzhalter aus der Vorlage in der .env.',
      laenge: k ? k.length : 0,
    };
  }

  if (!/^[0-9A-Fa-f]{32}$/.test(k)) {
    return {
      ok: false,
      grund: `Der Schlüssel hat ein unerwartetes Format (${k.length} Zeichen; erwartet werden 32 Zeichen aus 0-9 und A-F). Steht evtl. ein Leerzeichen oder ein Anführungszeichen in der .env?`,
      laenge: k.length,
    };
  }

  // Leichtgewichtiger Testaufruf gegen die Steam-API.
  try {
    await steamGet(`${BASE}/ISteamWebAPIUtil/GetSupportedAPIList/v1/`, {
      params: { key: k },
      timeout: 8000,
    });
    return { ok: true, laenge: k.length };
  } catch (err) {
    const status = err.response?.status;
    return {
      ok: false,
      status,
      grund:
        status === 403
          ? 'Steam lehnt den Schlüssel ab (403). Er ist ungültig, wurde zurückgezogen oder gehört zu einem anderen Konto. Neuen Schlüssel holen unter https://steamcommunity.com/dev/apikey'
          : `Steam antwortet nicht wie erwartet (${status || err.message}).`,
      laenge: k.length,
    };
  }
}

module.exports = {
  checkApiKey,
  getOwnedGames,
  getPlayerAchievements,
  getGameSchema,
  getGlobalAchievementPercentages,
  getFriendList,
  getPlayerSummaries,
  getPresence,
  // aus scoring.js weitergereicht, damit bestehende Aufrufe unveraendert bleiben
  categorize,
  categorizeInContext,
  buildTierContext,
  estimateDifficulty,
  TIER_THRESHOLDS: scoring.TIER_THRESHOLDS,
  buildEnrichedAchievements,
};
