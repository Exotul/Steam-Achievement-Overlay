import { useMemo, useState } from 'react';
import { getLevelProgress } from '../lib/xp';
import { sortGames } from '../lib/sorting';
import ProfileHero from './ProfileHero';
import RarestAchievements from './RarestAchievements';
import LibraryControls from './LibraryControls';
import GameGrid from './GameGrid';

export default function FriendProfileView({ friend, onBack, onSelectGame }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('completion');

  const profile = friend.profile;

  // Das Profil liefert pro Spiel bereits die Zaehlstaende. Das Raster erwartet
  // dieselbe Form wie beim eigenen Profil, deshalb hier umgeformt.
  const progressByAppId = useMemo(() => {
    const map = {};
    (profile?.games || []).forEach((g) => {
      map[g.appId] = {
        achievements: [],
        unlockedCount: g.unlockedCount,
        totalCount: g.totalCount,
        isDiamond: g.isDiamond,
        difficulty: g.difficulty ?? undefined,
      };
    });
    return map;
  }, [profile]);

  const visibleGames = useMemo(() => {
    const games = profile?.games || [];
    const term = search.trim().toLowerCase();
    const filtered = term ? games.filter((g) => g.name.toLowerCase().includes(term)) : games;
    return sortGames(filtered, progressByAppId, sortBy, {});
  }, [profile, progressByAppId, search, sortBy]);

  if (!profile || profile.isPrivate || profile.error) {
    return (
      <div>
        <button className="back-link" onClick={onBack}>
          ← Zurück zur Freundesliste
        </button>
        <p className="friends__hint">
          {profile?.isPrivate
            ? `${friend.displayName} hat die Spieldetails auf privat gestellt – Achievements sind darum nicht einsehbar.`
            : 'Das Profil konnte nicht geladen werden.'}
        </p>
      </div>
    );
  }

  const levelProgress = getLevelProgress(profile.totalXp);

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← Zurück zur Freundesliste
      </button>

      <ProfileHero
        user={{ displayName: profile.displayName, avatar: profile.avatar }}
        levelProgress={levelProgress}
        tierCounts={profile.tierCounts}
        diamondCount={profile.diamondCount}
        gameCount={profile.gameCount}
      />

      {profile.truncated && (
        <p className="notice">
          Angezeigt werden die {profile.gameCount} meistgespielten von {profile.totalOwned} Spielen –
          bei sehr großen Bibliotheken würde das vollständige Auswerten die Steam-Schnittstelle
          überlasten.
        </p>
      )}

      <RarestAchievements achievements={profile.rarest || []} />

      <div className="section-heading">
        <h2>Bibliothek</h2>
      </div>

      <LibraryControls
        search={search}
        onSearchChange={setSearch}
        sortBy={sortBy}
        onSortChange={setSortBy}
        resultCount={visibleGames.length}
        totalCount={profile.games.length}
        releaseDatesLoading={false}
        hideReleaseDate
      />

      <GameGrid
        games={visibleGames}
        progressByAppId={progressByAppId}
        onSelectGame={(game) => onSelectGame(game, friend.steamId)}
      />
    </div>
  );
}
