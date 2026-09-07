// Eine Quelle der Wahrheit für alles, was mit den Trophäen-Stufen zu tun hat.
// Die Kategorie-Namen kommen 1:1 vom Backend (services/steamApi.js -> categorize()).

// ACHTUNG - xpMultiplier liegt gespiegelt in backend/services/xpMath.js.
// Laufen beide auseinander, zeigt das Dashboard ein anderes Level als das
// Overlay fuer denselben Stand. Genau das ist schon einmal passiert: Beim
// Anpassen der Faktoren wurde diese Datei uebersehen, weil der Wert hier
// anders heisst und in einem Objekt mit Farben steckt. Ein Test in
// tests/backend/scoring.test.js vergleicht die Kopien seitdem.
export const TIERS = {
  Kupfer: { label: 'Kupfer', color: 'var(--tier-kupfer)', glow: 'var(--tier-kupfer-glow)', xpMultiplier: 1, order: 0 },
  Silber: { label: 'Silber', color: 'var(--tier-silber)', glow: 'var(--tier-silber-glow)', xpMultiplier: 2.5, order: 1 },
  Gold: { label: 'Gold', color: 'var(--tier-gold)', glow: 'var(--tier-gold-glow)', xpMultiplier: 4, order: 2 },
  Platin: { label: 'Platin', color: 'var(--tier-platin)', glow: 'var(--tier-platin-glow)', xpMultiplier: 6, order: 3 },
};

export const TIER_ORDER = ['Kupfer', 'Silber', 'Gold', 'Platin'];

export function tierOf(category) {
  return TIERS[category] || TIERS.Kupfer;
}

// XP eines einzelnen freigeschalteten Achievements: Stufenfaktor × (100 − %).
// Die Faktoren stehen oben in TIERS und müssen zu xpMath.js passen.
export function achievementXp(achievement) {
  const tier = tierOf(achievement.category);
  return tier.xpMultiplier * (100 - achievement.globalPercent);
}
