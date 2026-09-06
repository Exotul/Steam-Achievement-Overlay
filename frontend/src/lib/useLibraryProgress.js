import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { achievementXp } from './tiers';
import { loadSnapshot, saveSnapshot } from './persistentCache';

const CONCURRENCY = 4;

/**
 * Lädt die Spielebibliothek und die Achievements aller Spiele (begrenzt
 * parallel). Zeigt beim Start sofort den zuletzt zwischengespeicherten Stand
 * an (falls vorhanden) und aktualisiert danach still im Hintergrund - so
 * wirkt das Dashboard beim erneuten Öffnen sofort "da", statt jedes Mal von
 * vorne zu laden.
 */
export function useLibraryProgress(steamId) {
  const cached = steamId ? loadSnapshot(steamId) : null;

  const [games, setGames] = useState(cached?.games ?? null);
  const [progressByAppId, setProgressByAppId] = useState(cached?.progressByAppId ?? {});
  const [loadedCount, setLoadedCount] = useState(cached ? cached.games.length : 0);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [error, setError] = useState(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!steamId) return;
    cancelled.current = false;

    async function run() {
      try {
        const library = await api.library();
        if (cancelled.current) return;
        setGames(library);

        const freshProgress = {};
        const queue = [...library];
        let active = 0;
        let finished = 0;

        await new Promise((resolve) => {
          if (queue.length === 0) resolve();

          function next() {
            if (cancelled.current) return resolve();
            if (queue.length === 0 && active === 0) return resolve();
            while (active < CONCURRENCY && queue.length > 0) {
              const game = queue.shift();
              active += 1;
              api
                .gameAchievements(game.appId)
                .then((result) => {
                  if (cancelled.current) return;
                  freshProgress[game.appId] = result;
                  setProgressByAppId((prev) => ({ ...prev, [game.appId]: result }));
                })
                .catch(() => {
                  if (cancelled.current) return;
                  const fallback = { achievements: [], unlockedCount: 0, totalCount: 0, isDiamond: false };
                  freshProgress[game.appId] = fallback;
                  setProgressByAppId((prev) => ({ ...prev, [game.appId]: fallback }));
                })
                .finally(() => {
                  active -= 1;
                  finished += 1;
                  setLoadedCount(finished);
                  next();
                });
            }
          }
          next();
        });

        if (!cancelled.current) {
          saveSnapshot(steamId, { games: library, progressByAppId: freshProgress });
          setIsRefreshing(false);
        }
      } catch (err) {
        if (!cancelled.current) setError(err);
      }
    }

    run();
    return () => {
      cancelled.current = true;
    };
  }, [steamId]);

  const totalXp = Object.values(progressByAppId).reduce((sum, g) => {
    const gained = g.achievements.filter((a) => a.unlocked).reduce((s, a) => s + achievementXp(a), 0);
    return sum + gained;
  }, 0);

  // "Lädt" heißt hier: noch gar nichts (auch nicht aus dem Cache) vorhanden.
  const isLoading = games === null;

  return { games, progressByAppId, totalXp, isLoading, isRefreshing, loadedCount, error };
}
