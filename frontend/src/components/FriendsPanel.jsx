import { TIER_ORDER, tierOf } from '../lib/tiers';

export default function FriendsPanel({ friendsWithLevel, isLoading, onSelectFriend }) {
  if (isLoading) {
    return <p className="friends__hint">Lädt Freundesliste…</p>;
  }

  if (!friendsWithLevel || friendsWithLevel.length === 0) {
    return (
      <p className="friends__hint">
        Keine Freunde gefunden – entweder sind noch keine Steam-Freunde verknüpft, oder die
        Freundesliste ist auf privat gestellt.
      </p>
    );
  }

  // Wer schon geladen ist, steht oben – nach Level sortiert.
  const sorted = [...friendsWithLevel].sort((a, b) => {
    if (!!a.level !== !!b.level) return a.level ? -1 : 1;
    if (a.level && b.level) return b.level.totalXp - a.level.totalXp;
    return a.displayName.localeCompare(b.displayName, 'de');
  });

  return (
    <div className="friend-list">
      {sorted.map((f) => {
        const p = f.profile;
        const unavailable = p && (p.isPrivate || p.error);

        return (
          <button
            key={f.steamId}
            className="friend-card"
            onClick={() => onSelectFriend(f)}
            disabled={!p || unavailable}
          >
            <img className="friend-card__avatar" src={f.avatar} alt="" loading="lazy" />

            <div className="friend-card__main">
              <p className="friend-card__name">{f.displayName}</p>

              {!p ? (
                <p className="friend-card__status">
                  {f.isLoading ? 'Profil wird berechnet…' : 'Wartet auf Berechnung'}
                </p>
              ) : p.isPrivate ? (
                <p className="friend-card__status">Profil ist privat</p>
              ) : p.error ? (
                <p className="friend-card__status">Konnte nicht geladen werden</p>
              ) : (
                <>
                  <p className="friend-card__status">
                    {p.gameCount} Spiele · {p.diamondCount} Diamant
                  </p>
                  <div className="friend-card__tiers">
                    {TIER_ORDER.map((key) => (
                      <span
                        key={key}
                        className="friend-card__tier"
                        style={{ '--tier-color': tierOf(key).color }}
                        title={key}
                      >
                        <span className="friend-card__tier-dot" />
                        <span className="num">{p.tierCounts?.[key] || 0}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {f.level && (
              <div className="friend-card__level">
                <span className="friend-card__level-num">{f.level.level}</span>
                <span className="friend-card__level-label">Level</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
