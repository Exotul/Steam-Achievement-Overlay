import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { achievementXp } from './tiers';
import { loadSnapshot, saveSnapshot } from './persistentCache';

const CONCURRENCY = 4;

/**
 * Lädt die Spielebibliothek und die Achievements aller Spiele (begrenzt
 * parallel). Zeigt beim Start sofort den zuletzt zwischengespeicherten Stand
 * an (falls vorhanden) und aktualisiert danach still im Hintergrund.
 *
 * WAS DABEI NICHT MEHR PASSIERT: Früher wurden im Hintergrund ausnahmslos
 * ALLE Spiele neu abgefragt - bei einer gewachsenen Bibliothek mehrere
 * hundert Anfragen, jedes Mal beim Öffnen. Dabei gilt hier dieselbe
 * Überlegung wie bei der XP-Berechnung im Overlay: Achievements bekommt man
 * nur durch Spielen. Hat sich die Spielzeit eines Titels seit dem letzten
 * Mal nicht geändert, kann sich sein Fortschritt nicht geändert haben.
 *
 * Die Spielzeit steht in der Bibliotheksliste, die ohnehin geholt wird -
 * dieser eine Aufruf genügt also, um zu wissen, was überhaupt neu zu laden
 * ist. (Die Entsprechung im Backend liegt in backend/services/xpPlan.js;
 * beide Seiten teilen die Überlegung, aber keinen Code - Dashboard und
 * Backend haben getrennte Modulwelten.)
 */
/**
 * Darf der gemerkte Fortschritt eines Spiels weiterverwendet werden?
 *
 * Nur wenn er vollständig ist UND die Spielzeit unverändert. Ein Eintrag
 * ohne Achievements ist ein früherer Fehlschlag und muss neu geholt werden -
 * sonst bliebe ein einmal misslungenes Spiel dauerhaft leer.
 */
function unveraendert(gemerkt, fortschritt, spiel) {
  if (!fortschritt || !Array.isArray(fortschritt.achievements)) return false;
  if (!gemerkt) return false;
  if (fortschritt.totalCount > 0 && fortschritt.achievements.length === 0) return false;
  return gemerkt.playtimeMinutes === spiel.playtimeMinutes;
}

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

        // Was aus dem letzten Besuch noch gilt, wird uebernommen statt neu
        // geholt. Bei unveraenderter Bibliothek bleibt die Warteschlange
        // dadurch leer und das Oeffnen kostet genau eine Anfrage.
        const gemerkteSpiele = new Map((cached?.games ?? []).map((g) => [g.appId, g]));
        const gemerkterFortschritt = cached?.progressByAppId ?? {};

        const freshProgress = {};
        const queue = [];

        for (const spiel of library) {
          const fortschritt = gemerkterFortschritt[spiel.appId];
          if (unveraendert(gemerkteSpiele.get(spiel.appId), fortschritt, spiel)) {
            freshProgress[spiel.appId] = fortschritt;
          } else {
            queue.push(spiel);
          }
        }

        // Der uebernommene Stand muss sofort sichtbar sein, auch wenn die
        // Bibliothek inzwischen anders sortiert ist.
        if (Object.keys(freshProgress).length > 0) {
          setProgressByAppId((prev) => ({ ...prev, ...freshProgress }));
        }

        let active = 0;
        let finished = 0;
        const zuLaden = queue.length;

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
                  // Der Fortschritt zaehlt die tatsaechlich geladenen Spiele,
                  // nicht die gesamte Bibliothek - sonst stuende dort
                  // "3 / 488", obwohl nur drei zu tun waren.
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
          if (zuLaden === 0) {
            // Nichts nachzuladen - das ist der Normalfall beim zweiten
            // Oeffnen und soll auch so aussehen.
            setLoadedCount(library.length);
          }
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
