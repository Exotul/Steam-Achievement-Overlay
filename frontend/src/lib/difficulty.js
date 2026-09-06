// Gemeinsame Darstellung der geschaetzten Komplettierungs-Schwierigkeit.
// Dieselbe Farbskala wie im Overlay: hellgruen (0) -> gelb (5) -> dunkelrot (10).

export function difficultyColor(wert) {
  const misch = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const gruen = [126, 217, 87];
  const gelb = [255, 210, 63];
  const rot = [139, 26, 26];
  const w = Math.min(10, Math.max(0, wert));
  const rgb = w <= 5 ? misch(gruen, gelb, w / 5) : misch(gelb, rot, (w - 5) / 5);
  return `rgb(${rgb.join(',')})`;
}

export function difficultyLabel(wert) {
  if (wert < 1.5) return 'sehr leicht';
  if (wert < 3) return 'leicht';
  if (wert < 5) return 'mittel';
  if (wert < 7) return 'fordernd';
  if (wert < 8.5) return 'schwer';
  return 'brutal';
}

/** Dunkle Schrift auf hellem Grund, helle auf dunklem - fuer Lesbarkeit. */
export function difficultyTextColor(wert) {
  return wert < 7 ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.95)';
}
