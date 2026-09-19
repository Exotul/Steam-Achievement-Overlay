// Eine Quelle der Wahrheit für alles, was mit den Trophäen-Stufen zu tun hat.
// Die Kategorie-Namen kommen 1:1 vom Backend (services/steamApi.js -> categorize()).

export const TIERS = {
  Kupfer: { label: 'Kupfer', color: 'var(--tier-kupfer)', glow: 'var(--tier-kupfer-glow)', order: 0 },
  Silber: { label: 'Silber', color: 'var(--tier-silber)', glow: 'var(--tier-silber-glow)', order: 1 },
  Gold: { label: 'Gold', color: 'var(--tier-gold)', glow: 'var(--tier-gold-glow)', order: 2 },
  Platin: { label: 'Platin', color: 'var(--tier-platin)', glow: 'var(--tier-platin-glow)', order: 3 },
  Blutig: { label: 'Blutig', color: 'var(--tier-blutig)', glow: 'var(--tier-blutig-glow)', order: 4 },
};

export const TIER_ORDER = ['Kupfer', 'Silber', 'Gold', 'Platin', 'Blutig'];

export function tierOf(category) {
  return TIERS[category] || TIERS.Kupfer;
}

// XP eines einzelnen freigeschalteten Achievements - vom Backend fertig
// gerechnet (scoring.bewerteSpiel). Frueher stand die Formel hier ein zweites
// Mal, samt eigener Kopie der Stufenfaktoren; die wurde einmal beim Anpassen
// uebersehen, und das Dashboard zeigte ein anderes Level als das Overlay.
export function achievementXp(achievement) {
  return typeof achievement.xp === 'number' ? achievement.xp : 0;
}
