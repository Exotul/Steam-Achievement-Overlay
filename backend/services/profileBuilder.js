const steamApi = require('./steamApi');
const cache = require('./cache');
const queue = require('./steamQueue');

// XP-Formel wie im Dashboard: Kupfer 1x, Silber 2x, Gold 3x, Platin 4x,
// jeweils mal (100 - Prozentsatz). Bewusst hier gespiegelt, damit die
// Berechnung fuer Freunde serverseitig laufen kann - sonst muessten alle
// Achievement-Listen aller Freunde zum Browser uebertragen werden.
const TIER_MULTIPLIER = { Kupfer: 1, Silber: 2, Gold: 3, Platin: 4 };

// Wie viele Spiele eines Profils gleichzeitig abgefragt werden. Bewusst
// niedrig: Bei Freunden geht es um Vollstaendigkeit, nicht um Tempo, und die
// Steam-API drosselt bei zu vielen gleichzeitigen Anfragen.
const CONCURRENCY = 3;

// Sehr grosse Bibliotheken wuerden minutenlang laden. Wir beschraenken uns
// auf die meistgespielten Titel und weisen im Ergebnis darauf hin.
const MAX_GAMES = 250;

const PROFILE_TTL_MS = 30 * 60 * 1000; // 30 Minuten

async function buildProfile(steamId) {
  // Ein Freundesprofil ist nie dringend - es darf nie vor der
  // Achievement-Erkennung liegen.
  return queue.mitPrioritaet('hintergrund', () => buildProfileIntern(steamId));
}

async function buildProfileIntern(steamId) {
  const games = await steamApi.getOwnedGames(steamId);

  if (!games || games.length === 0) {
    // Leere Antwort heisst bei Steam fast immer: Profil ist privat.
    return { isPrivate: true, games: [], totalXp: 0 };
  }

  const sorted = [...games]
    .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
    .slice(0, MAX_GAMES);

  const results = [];
  // Bewusst NICHT "queue": So hiess auch das oben eingebundene
  // steamQueue-Modul, das dadurch in dieser Funktion verdeckt war. Wer hier
  // spaeter eine Prioritaet setzen will, greift sonst ins Leere.
  const offen = [...sorted];

  async function worker() {
    while (offen.length > 0) {
      const g = offen.shift();
      try {
        const progress = await steamApi.buildEnrichedAchievements(steamId, g.appid);
        results.push({ game: g, progress });
      } catch (err) {
        results.push({
          game: g,
          progress: { achievements: [], unlockedCount: 0, totalCount: 0, isDiamond: false },
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sorted.length) }, worker));

  let totalXp = 0;
  let diamondCount = 0;
  const tierCounts = { Kupfer: 0, Silber: 0, Gold: 0, Platin: 0 };
  const allUnlocked = [];

  const gameList = results.map(({ game, progress }) => {
    if (progress.isDiamond) diamondCount += 1;

    progress.achievements.forEach((a) => {
      if (!a.unlocked) return;
      tierCounts[a.category] = (tierCounts[a.category] || 0) + 1;
      totalXp += (TIER_MULTIPLIER[a.category] || 1) * (100 - a.globalPercent);
      allUnlocked.push({
        apiName: a.apiName,
        name: a.name,
        icon: a.icon,
        globalPercent: a.globalPercent,
        category: a.category,
        gameName: game.name,
        appId: game.appid,
      });
    });

    return {
      appId: game.appid,
      name: game.name,
      playtimeMinutes: game.playtime_forever,
      iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
      libraryUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`,
      headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
      unlockedCount: progress.unlockedCount,
      totalCount: progress.totalCount,
      isDiamond: progress.isDiamond,
      difficulty: progress.difficulty ?? null,
    };
  });

  const rarest = allUnlocked.sort((a, b) => a.globalPercent - b.globalPercent).slice(0, 6);

  return {
    isPrivate: false,
    totalXp: Math.round(totalXp),
    tierCounts,
    diamondCount,
    gameCount: gameList.length,
    truncated: games.length > MAX_GAMES,
    totalOwned: games.length,
    games: gameList,
    rarest,
  };
}

/**
 * Mit Zwischenspeicher, weil der Aufbau eines Profils teuer ist.
 * Mit `neuBerechnen` wird der Speicher bewusst uebergangen - das nutzt der
 * Aktualisieren-Knopf im Dashboard.
 */
async function getProfile(steamId, neuBerechnen = false) {
  if (neuBerechnen) {
    const profil = await buildProfile(steamId);
    cache.set(`profile:${steamId}`, profil, PROFILE_TTL_MS);
    return profil;
  }
  return cache.remember(`profile:${steamId}`, PROFILE_TTL_MS, () => buildProfile(steamId));
}

module.exports = { getProfile, buildProfile, TIER_MULTIPLIER };
