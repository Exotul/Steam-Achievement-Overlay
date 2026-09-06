import GameCard from './GameCard';

export default function GameGrid({ games, progressByAppId, onSelectGame }) {
  if (games.length === 0) {
    return <p className="grid-empty">Keine Spiele gefunden.</p>;
  }

  return (
    <div className="game-grid">
      {games.map((game) => (
        <GameCard
          key={game.appId}
          game={game}
          progress={progressByAppId[game.appId]}
          onClick={() => onSelectGame(game)}
        />
      ))}
    </div>
  );
}
