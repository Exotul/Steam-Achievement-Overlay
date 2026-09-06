// Eine Quelle der Wahrheit für alles, was mit den Trophäen-Stufen zu tun hat.
// Die Kategorie-Namen kommen 1:1 vom Backend (services/steamApi.js -> categorize()).

export const TIERS = {
  Kupfer: { label: 'Kupfer', color: 'var(--tier-kupfer)', glow: 'var(--tier-kupfer-glow)', xpMultiplier: 1, order: 0 },
  Silber: { label: 'Silber', color: 'var(--tier-silber)', glow: 'var(--tier-silber-glow)', xpMultiplier: 2, order: 1 },
  Gold: { label: 'Gold', color: 'var(--tier-gold)', glow: 'var(--tier-gold-glow)', xpMultiplier: 3, order: 2 },
  Platin: { label: 'Platin', color: 'var(--tier-platin)', glow: 'var(--tier-platin-glow)', xpMultiplier: 4, order: 3 },
};

export const TIER_ORDER = ['Kupfer', 'Silber', 'Gold', 'Platin'];

export function tierOf(category) {
  return TIERS[category] || TIERS.Kupfer;
}

// XP eines einzelnen freigeschalteten Achievements nach Markus' Formel:
// Kupfer = 1×(100−%), Silber = 2×(100−%), Gold = 3×(100−%), Platin = 4×(100−%)
export function achievementXp(achievement) {
  const tier = tierOf(achievement.category);
  return tier.xpMultiplier * (100 - achievement.globalPercent);
}
