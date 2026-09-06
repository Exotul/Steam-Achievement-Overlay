import { useState } from 'react';
import { difficultyColor, difficultyLabel, difficultyTextColor } from '../lib/difficulty';

export default function GameCard({ game, progress, onClick }) {
  // Nicht jedes Spiel hat ein hochformatiges Bibliotheks-Bild. Wir probieren
  // der Reihe nach: library_600x900 -> header.jpg -> kleines Icon. Schlägt
  // alles fehl, zeigen wir eine Platzhalter-Kachel mit den Initialen, damit
  // das Raster nicht in sich zusammenfällt.
  const sources = [game.libraryUrl, game.headerUrl, game.iconUrl].filter(Boolean);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(sources.length === 0);

  const loading = !progress;
  const total = progress?.totalCount ?? 0;
  const unlocked = progress?.unlockedCount ?? 0;
  const isDiamond = progress?.isDiamond ?? false;
  const difficulty = progress?.difficulty;
  const hatSchwierigkeit = typeof difficulty === 'number';
  const pct = total > 0 ? unlocked / total : 0;

  const initials = game.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  function handleImageError() {
    if (sourceIndex < sources.length - 1) {
      setSourceIndex((i) => i + 1);
    } else {
      setFailed(true);
    }
  }

  return (
    <button
      className={`game-card${isDiamond ? ' game-card--diamond' : ''}`}
      onClick={onClick}
      disabled={loading || total === 0}
      title={game.name}
    >
      <div className="game-card__art">
        {failed ? (
          <span className="game-card__placeholder">{initials}</span>
        ) : (
          <img
            className="game-card__image"
            src={sources[sourceIndex]}
            alt=""
            loading="lazy"
            onError={handleImageError}
          />
        )}
        {isDiamond && <span className="game-card__diamond-badge">Diamant</span>}
        {hatSchwierigkeit && (
          <span
            className="game-card__difficulty"
            style={{
              background: difficultyColor(difficulty),
              color: difficultyTextColor(difficulty),
            }}
            title={`Geschätzte Komplettierungs-Schwierigkeit: ${difficulty.toFixed(1)} von 10 (${difficultyLabel(difficulty)})`}
          >
            {difficulty.toFixed(1)}
          </span>
        )}
      </div>

      <div className="game-card__body">
        <h3 className={`game-card__title${isDiamond ? ' game-card__title--diamond' : ''}`}>
          {game.name}
        </h3>

        {loading ? (
          <p className="game-card__status">Lädt…</p>
        ) : total === 0 ? (
          <p className="game-card__status">Keine Achievements</p>
        ) : (
          <>
            <div className="game-card__bar">
              <div
                className="game-card__bar-fill"
                style={{
                  width: `${pct * 100}%`,
                  background: isDiamond ? 'var(--diamond-gradient)' : 'var(--tier-platin)',
                }}
              />
            </div>
            <p className="game-card__count">
              <span className="num">{unlocked}</span> / {total}
              <span className="game-card__pct num">{Math.round(pct * 100)}%</span>
            </p>
          </>
        )}
      </div>
    </button>
  );
}
