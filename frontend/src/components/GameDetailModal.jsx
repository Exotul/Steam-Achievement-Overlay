import { useEffect, useState } from 'react';
import { tierOf } from '../lib/tiers';
import { api } from '../lib/api';
import { difficultyColor, difficultyLabel, difficultyTextColor } from '../lib/difficulty';

export default function GameDetailModal({ game, progress, ownerSteamId = null, onClose }) {
  // Beim eigenen Profil liegen die Achievements bereits vor. Bei einem Freund
  // wird die Liste erst hier nachgeladen - sie fuer alle Spiele aller Freunde
  // im Voraus zu holen waere viel zu aufwaendig.
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ownerSteamId || !game) return;
    let cancelled = false;
    setLoaded(null);
    setError(false);
    api
      .friendAchievements(ownerSteamId, game.appId)
      .then((r) => !cancelled && setLoaded(r))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [ownerSteamId, game]);

  const data = ownerSteamId ? loaded : progress;

  if (!game) return null;

  if (!data) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal modal--slim" onClick={(e) => e.stopPropagation()}>
          <p className="modal__loading">
            {error ? 'Achievements konnten nicht geladen werden.' : 'Lädt Achievements…'}
          </p>
        </div>
      </div>
    );
  }

  const sorted = [...data.achievements].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return a.globalPercent - b.globalPercent;
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <img className="modal__icon" src={game.headerUrl || game.iconUrl} alt="" />
          <div>
            <h2 className={`modal__title${data.isDiamond ? ' game-card__title--diamond' : ''}`}>
              {game.name}
            </h2>
            <p className="modal__count">
              {data.unlockedCount} / {data.totalCount} Achievements
              {data.isDiamond ? ' · Diamant' : ''}
            </p>
            {typeof data.difficulty === 'number' && (
              <p className="modal__difficulty">
                <span
                  className="modal__difficulty-chip"
                  style={{
                    background: difficultyColor(data.difficulty),
                    color: difficultyTextColor(data.difficulty),
                  }}
                >
                  {data.difficulty.toFixed(1)}
                </span>
                <span className="modal__difficulty-text">
                  Schwierigkeit (geschätzt) · {difficultyLabel(data.difficulty)}
                </span>
              </p>
            )}
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </header>

        <ul className="modal__list">
          {sorted.map((a) => {
            const tier = tierOf(a.category);
            return (
              <li key={a.apiName} className={`ach-row${a.unlocked ? '' : ' ach-row--locked'}`}>
                <img className="ach-row__icon" src={a.icon} alt="" loading="lazy" />
                <div className="ach-row__text">
                  <p className="ach-row__name">{a.name}</p>
                  <p className="ach-row__desc">{a.description}</p>
                </div>
                <div className="ach-row__tier" style={{ '--tier-color': tier.color }}>
                  <span className="ach-row__tier-dot" />
                  <span className="num">{a.globalPercent.toFixed(1)}%</span>
                  <span>{tier.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
