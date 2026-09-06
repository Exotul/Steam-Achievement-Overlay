import LevelRing from './LevelRing';
import { TIER_ORDER, tierOf } from '../lib/tiers';

export default function ProfileHero({ user, levelProgress, tierCounts, diamondCount, gameCount }) {
  return (
    <section className="hero">
      <div className="hero__identity">
        <img className="hero__avatar" src={user.avatar} alt="" />
        <div>
          <p className="hero__eyebrow">Trophäenschrank von</p>
          <h1 className="hero__name">{user.displayName}</h1>
          <p className="hero__meta">
            {gameCount} Spiele &middot; {diamondCount} im Diamant-Status
          </p>
        </div>
      </div>

      <div className="hero__level">
        <LevelRing level={levelProgress.level} progress={levelProgress.progress} />
        <p className="hero__xp">
          <span className="num">{levelProgress.xpIntoLevel}</span> / {levelProgress.xpForThisLevel} XP bis
          Level {levelProgress.level + 1}
        </p>
      </div>

      <div className="hero__tiers">
        {TIER_ORDER.map((key) => {
          const tier = tierOf(key);
          return (
            <div key={key} className="tier-count" style={{ '--tier-color': tier.color }}>
              <span className="tier-count__dot" />
              <span className="tier-count__num">{tierCounts[key] || 0}</span>
              <span className="tier-count__label">{tier.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
