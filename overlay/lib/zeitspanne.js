/**
 * Zeitabstände in Worten.
 *
 * Warum eine eigene Datei: Der Rückblick in der Spielstart-Meldung braucht
 * einen Satz wie "vor 3 Wochen", und das ist Logik mit Randfällen (gestern,
 * Monatsgrenzen, Rundung). Hier steht sie ohne Abhängigkeiten, damit die
 * Tests sie ohne `npm install` prüfen können — so wie es in diesem Projekt
 * für alles Rechnende gilt.
 *
 * Bewusst grob: Für "wann war ich hier zuletzt?" ist "vor 3 Wochen" die
 * brauchbare Antwort. "vor 22 Tagen, 4 Stunden" wäre genauer und schlechter —
 * niemand rechnet das im Kopf in ein Gefühl um.
 */

const MINUTE = 60 * 1000;
const STUNDE = 60 * MINUTE;
const TAG = 24 * STUNDE;

/**
 * @param {number} dann - Zeitpunkt in der Vergangenheit (ms)
 * @param {number} [jetzt] - Bezugspunkt, vorgabeweise die aktuelle Zeit
 * @returns {string|null} z. B. "vor 3 Wochen"; null, wenn `dann` unbrauchbar
 *   ist oder in der Zukunft liegt. Null heißt: gar nichts anzeigen. Eine
 *   erfundene Angabe wäre schlimmer als keine.
 */
function lesbareSpanne(dann, jetzt = Date.now()) {
  const zeitpunkt = typeof dann === 'string' ? Date.parse(dann) : dann;
  if (!Number.isFinite(zeitpunkt) || zeitpunkt <= 0) return null;

  const abstand = jetzt - zeitpunkt;
  // Kleine Abweichungen in die Zukunft kommen vor, wenn die Uhr des Rechners
  // nachgestellt wird. Eine Minute Spielraum, danach wird nichts behauptet.
  if (abstand < -MINUTE) return null;

  if (abstand < 90 * MINUTE) return 'gerade eben';
  if (abstand < TAG) {
    const stunden = Math.round(abstand / STUNDE);
    return stunden <= 1 ? 'vor einer Stunde' : `vor ${stunden} Stunden`;
  }

  const tage = Math.floor(abstand / TAG);
  if (tage === 1) return 'gestern';
  if (tage < 7) return `vor ${tage} Tagen`;

  const wochen = Math.floor(tage / 7);
  if (wochen === 1) return 'vor einer Woche';
  if (tage < 60) return `vor ${wochen} Wochen`;

  const monate = Math.floor(tage / 30);
  if (monate < 12) return `vor ${monate} Monaten`;

  const jahre = Math.floor(tage / 365);
  if (jahre <= 1) return 'vor über einem Jahr';
  return `vor über ${jahre} Jahren`;
}

module.exports = { lesbareSpanne };
