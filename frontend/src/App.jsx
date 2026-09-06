import { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import { useLibraryProgress } from './lib/useLibraryProgress';
import { getLevelProgress } from './lib/xp';
import { sortGames, getRarestUnlocked } from './lib/sorting';
import LoginScreen from './components/LoginScreen';
import ProfileHero from './components/ProfileHero';
import LibraryControls from './components/LibraryControls';
import RarestAchievements from './components/RarestAchievements';
import GameGrid from './components/GameGrid';
import GameDetailModal from './components/GameDetailModal';
import FriendsPanel from './components/FriendsPanel';
import FriendProfileView from './components/FriendProfileView';
import { useFriendProfiles } from './lib/useFriendProfiles';

export default function App() {
  const [authState, setAuthState] = useState('checking'); // checking | out | in
  const [user, setUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedGameOwner, setSelectedGameOwner] = useState(null); // null = eigenes Profil
  const [tab, setTab] = useState('profil'); // profil | freunde
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [friendsRefresh, setFriendsRefresh] = useState(0);
  const [steamErreichbar, setSteamErreichbar] = useState(true);

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('completion');
  const [releaseDates, setReleaseDates] = useState({});
  const [releaseDatesLoading, setReleaseDatesLoading] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((u) => {
        setUser(u);
        setAuthState('in');
      })
      .catch(() => setAuthState('out'));
  }, []);

  // Betriebszustand regelmäßig prüfen, damit ein Steam-Ausfall sichtbar wird
  // und nicht als "das Dashboard ist kaputt" wahrgenommen wird.
  useEffect(() => {
    if (authState !== 'in') return;
    const pruefen = () =>
      api
        .health()
        .then((h) => setSteamErreichbar(h?.steam?.steamErreichbar !== false))
        .catch(() => {});
    pruefen();
    const timer = setInterval(pruefen, 30000);
    return () => clearInterval(timer);
  }, [authState]);

  useEffect(() => {
    if (authState !== 'in') return;
    api
      .friends()
      .then(setFriends)
      .catch(() => setFriends([]))
      .finally(() => setFriendsLoading(false));
  }, [authState]);

  const { games, progressByAppId, totalXp, isRefreshing, loadedCount } = useLibraryProgress(
    user?.steamId
  );

  // Freundesprofile erst laden, wenn der Reiter wirklich geoeffnet wurde -
  // sie sind teuer im Aufbau und werden sonst unnoetig berechnet.
  const { friendsWithLevel, loadingId, fertig } = useFriendProfiles(
    tab === 'freunde' ? friends : null,
    friendsRefresh
  );

  // Erscheinungsdaten kommen aus der strenger limitierten Store-Schnittstelle
  // und werden deshalb erst geladen, wenn wirklich danach sortiert wird.
  useEffect(() => {
    if (sortBy !== 'releaseDate' || !games) return;
    const missing = games.map((g) => g.appId).filter((id) => !(id in releaseDates));
    if (missing.length === 0) return;

    let cancelled = false;
    setReleaseDatesLoading(true);

    (async () => {
      // In Blöcken laden, damit auch große Bibliotheken durchlaufen, ohne
      // die Store-Schnittstelle zu überfahren.
      for (let i = 0; i < missing.length; i += 60) {
        if (cancelled) break;
        try {
          const batch = await api.releaseDates(missing.slice(i, i + 60));
          if (cancelled) break;
          setReleaseDates((prev) => {
            const next = { ...prev };
            batch.forEach((r) => {
              next[r.appId] = r.releaseDate;
            });
            return next;
          });
        } catch (err) {
          break;
        }
      }
      if (!cancelled) setReleaseDatesLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [sortBy, games, releaseDates]);

  const visibleGames = useMemo(() => {
    if (!games) return [];
    const term = search.trim().toLowerCase();
    const filtered = term ? games.filter((g) => g.name.toLowerCase().includes(term)) : games;
    return sortGames(filtered, progressByAppId, sortBy, releaseDates);
  }, [games, progressByAppId, search, sortBy, releaseDates]);

  const rarest = useMemo(
    () => (games ? getRarestUnlocked(games, progressByAppId, 6) : []),
    [games, progressByAppId]
  );

  if (authState === 'checking') {
    return <div className="app-loading">Lädt…</div>;
  }

  if (authState === 'out') {
    return <LoginScreen />;
  }

  const levelProgress = getLevelProgress(totalXp);

  const tierCounts = { Kupfer: 0, Silber: 0, Gold: 0, Platin: 0 };
  let diamondCount = 0;
  Object.values(progressByAppId).forEach((p) => {
    if (p.isDiamond) diamondCount += 1;
    p.achievements.forEach((a) => {
      if (a.unlocked) tierCounts[a.category] = (tierCounts[a.category] || 0) + 1;
    });
  });

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__brand">Trophäenschrank</span>
        <a className="topbar__logout" href={api.logoutUrl}>
          Abmelden
        </a>
      </header>

      {!steamErreichbar && (
        <div className="offline-banner">
          Steam ist gerade nicht erreichbar. Angezeigt werden die zuletzt bekannten Daten –
          Freundesprofile und aktuelle Werte fehlen, bis die Verbindung zurück ist.
        </div>
      )}

      <nav className="tabs">
        <button
          className={`tab${tab === 'profil' ? ' tab--active' : ''}`}
          onClick={() => {
            setTab('profil');
            setSelectedFriend(null);
          }}
        >
          Mein Profil
        </button>
        <button
          className={`tab${tab === 'freunde' ? ' tab--active' : ''}`}
          onClick={() => setTab('freunde')}
        >
          Freunde{friends.length > 0 ? ` (${friends.length})` : ''}
        </button>
      </nav>

      <main className="app__main">
        {tab === 'profil' ? (
          <>
            <ProfileHero
              user={user}
              levelProgress={levelProgress}
              tierCounts={tierCounts}
              diamondCount={diamondCount}
              gameCount={games?.length ?? 0}
            />

            <RarestAchievements achievements={rarest} />

            <div className="section-heading">
              <h2>Bibliothek</h2>
              {games && isRefreshing && (
                <span className="section-heading__hint">
                  Aktualisiere Achievements ({loadedCount} / {games.length})
                </span>
              )}
            </div>

            {games === null ? (
              <p className="app-loading">Lädt Bibliothek…</p>
            ) : (
              <>
                <LibraryControls
                  search={search}
                  onSearchChange={setSearch}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  resultCount={visibleGames.length}
                  totalCount={games.length}
                  releaseDatesLoading={releaseDatesLoading}
                />
                <GameGrid
                  games={visibleGames}
                  progressByAppId={progressByAppId}
                  onSelectGame={(g) => {
                    setSelectedGameOwner(null);
                    setSelectedGame(g);
                  }}
                />
              </>
            )}
          </>
        ) : selectedFriend ? (
          <FriendProfileView
            friend={friendsWithLevel.find((f) => f.steamId === selectedFriend) || {}}
            onBack={() => setSelectedFriend(null)}
            onSelectGame={(game, steamId) => {
              setSelectedGameOwner(steamId);
              setSelectedGame(game);
            }}
          />
        ) : (
          <>
            <div className="section-heading">
              <h2>Freunde</h2>
              <div className="section-heading__actions">
                <span className="section-heading__hint">
                  {loadingId
                    ? 'Profile werden nacheinander berechnet…'
                    : fertig
                      ? 'Alle Profile berechnet'
                      : 'Profile werden geladen…'}
                </span>
                <button
                  className="refresh-button"
                  onClick={async () => {
                    // Erst die Freundesliste selbst neu holen, dann die Profile.
                    try {
                      const frisch = await api.friends(true);
                      setFriends(frisch);
                    } catch (err) {
                      /* alte Liste weiterverwenden */
                    }
                    setFriendsRefresh((n) => n + 1);
                  }}
                  disabled={!!loadingId}
                  title="Freundesliste und alle Profile neu berechnen"
                >
                  {loadingId ? 'Läuft…' : '↻ Aktualisieren'}
                </button>
              </div>
            </div>
            <FriendsPanel
              friendsWithLevel={friendsWithLevel}
              isLoading={friendsLoading}
              onSelectFriend={(f) => setSelectedFriend(f.steamId)}
            />
          </>
        )}
      </main>

      {selectedGame && (
        <GameDetailModal
          game={selectedGame}
          ownerSteamId={selectedGameOwner}
          progress={selectedGameOwner ? null : progressByAppId[selectedGame.appId]}
          onClose={() => {
            setSelectedGame(null);
            setSelectedGameOwner(null);
          }}
        />
      )}
    </div>
  );
}
