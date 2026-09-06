import { tierOf } from '../lib/tiers';

export default function RarestAchievements({ achievements }) {
  if (achievements.length === 0) return null;

  return (
    <section className="rarest">
      <div className="section-heading">
        <h2>Seltenste Trophäen</h2>
      </div>

      <div className="rarest__row">
        {achievements.map((a) => {
          const tier = tierOf(a.category);
          return (
            <div
              key={`${a.appId}-${a.apiName}`}
              className="rarest__item"
              style={{ '--tier-color': tier.color, '--tier-glow': tier.glow }}
              title={`${a.name} — ${a.gameName}`}
            >
              <img className="rarest__icon" src={a.icon} alt="" loading="lazy" />
              <div className="rarest__text">
                <p className="rarest__name">{a.name}</p>
                <p className="rarest__game">{a.gameName}</p>
                <p className="rarest__pct">
                  <span className="num">{a.globalPercent.toFixed(2)}%</span> · {tier.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
