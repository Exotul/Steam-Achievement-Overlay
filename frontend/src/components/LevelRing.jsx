const SIZE = 132;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export default function LevelRing({ level, progress }) {
  const offset = CIRC * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div className="level-ring">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="url(#levelGradient)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
        <defs>
          <linearGradient id="levelGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--tier-diamant-a)" />
            <stop offset="100%" stopColor="var(--tier-diamant-b)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="level-ring__center">
        <span className="level-ring__num">{level}</span>
        <span className="level-ring__label">Level</span>
      </div>
    </div>
  );
}
