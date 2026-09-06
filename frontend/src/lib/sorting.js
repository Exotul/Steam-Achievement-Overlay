export const SORT_OPTIONS = [
  { id: 'completion', label: 'Fortschritt' },
  { id: 'alphabetical', label: 'A–Z' },
  { id: 'achievementCount', label: 'Anzahl Trophäen' },
  { id: 'difficulty', label: 'Schwierigkeit' },
  { id: 'releaseDate', label: 'Erscheinungsdatum' },
  { id: 'playtime', label: 'Spielzeit' },
];

function completionOf(progress) {
  if (!progress || progress.totalCount === 0) return -1; // Spiele ohne Achievements ans Ende
  return progress.unlockedCount / progress.totalCount;
}

// Steam liefert das Erscheinungsdatum als lokalisierten Text ("12. Mai 2020",
// "Demnächst"). Wir parsen, was sich parsen lässt, und sortieren den Rest ans Ende.
function releaseTimestamp(dateString) {
  if (!dateString) return null;
  const parsed = Date.parse(dateString);
  if (!Number.isNaN(parsed)) return parsed;
  const yearMatch = dateString.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? Date.parse(`${yearMatch[0]}-01-01`) : null;
}

export function sortGames(games, progressByAppId, sortBy, releaseDates = {}) {
  const list = [...games];

  const comparators = {
    completion: (a, b) => completionOf(progressByAppId[b.appId]) - completionOf(progressByAppId[a.appId]),
    alphabetical: (a, b) => a.name.localeCompare(b.name, 'de'),
    achievementCount: (a, b) =>
      (progressByAppId[b.appId]?.totalCount ?? -1) - (progressByAppId[a.appId]?.totalCount ?? -1),
    playtime: (a, b) => (b.playtimeMinutes ?? 0) - (a.playtimeMinutes ?? 0),
    // Schwerste zuerst; Spiele ohne Wert ans Ende.
    difficulty: (a, b) => {
      const da = progressByAppId[a.appId]?.difficulty;
      const db = progressByAppId[b.appId]?.difficulty;
      if (typeof da !== 'number' && typeof db !== 'number') return 0;
      if (typeof da !== 'number') return 1;
      if (typeof db !== 'number') return -1;
      return db - da;
    },
    releaseDate: (a, b) => {
      const ta = releaseTimestamp(releaseDates[a.appId]);
      const tb = releaseTimestamp(releaseDates[b.appId]);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta; // neueste zuerst
    },
  };

  return list.sort(comparators[sortBy] || comparators.completion);
}

/**
 * Sammelt die seltensten bereits freigeschalteten Achievements über die
 * ganze Bibliothek hinweg - das sind die, auf die man am ehesten stolz ist.
 */
export function getRarestUnlocked(games, progressByAppId, limit = 6) {
  const gameNameByAppId = Object.fromEntries(games.map((g) => [g.appId, g.name]));
  const all = [];

  Object.entries(progressByAppId).forEach(([appId, progress]) => {
    progress.achievements
      .filter((a) => a.unlocked)
      .forEach((a) => all.push({ ...a, appId: Number(appId), gameName: gameNameByAppId[appId] }));
  });

  return all.sort((a, b) => a.globalPercent - b.globalPercent).slice(0, limit);
}
