const storage = require('./storage');
const logger = require('./logger');

/**
 * Verlauf: was wann freigeschaltet wurde und wie sich das Level entwickelt.
 *
 * Warum angehängt statt neu geschrieben: Ein Verlauf wächst dauerhaft. Würde
 * jedes Ereignis die ganze Datei neu schreiben, wüchse der Aufwand mit der
 * Zeit immer weiter. Anhängen bleibt gleich schnell, egal wie lang die Datei
 * ist, und übersteht einen Absturz - schlimmstenfalls ist die letzte Zeile
 * unvollständig und wird beim Lesen übersprungen.
 *
 * Das ist zugleich die Grundlage für die geplante Verlaufsansicht im
 * Dashboard ("was habe ich diesen Monat geschafft").
 */

const MAX_EREIGNISSE = 20000;
const KUERZEN_AB = 25000;

/** Hält fest, dass ein Achievement freigeschaltet wurde. */
function achievementFreigeschaltet({ steamId, appId, gameName, achievement, xpZuwachs, level }) {
  const ok = storage.schreibeEreignis('achievements', {
    steamId,
    appId,
    gameName,
    apiName: achievement.apiName,
    name: achievement.name,
    category: achievement.category,
    globalPercent: achievement.globalPercent,
    xpZuwachs,
    level,
  });

  if (ok) pruefeKuerzung();
  return ok;
}

/** Hält den XP-Stand fest, damit sich die Entwicklung nachzeichnen lässt. */
function xpStand({ steamId, totalXp, level }) {
  return storage.schreibeEreignis('xp', { steamId, totalXp, level });
}

let letztePruefung = 0;

function pruefeKuerzung() {
  // Nicht bei jedem Ereignis die ganze Datei lesen - höchstens stündlich.
  if (Date.now() - letztePruefung < 60 * 60 * 1000) return;
  letztePruefung = Date.now();

  const anzahl = storage.leseEreignisse('achievements').length;
  if (anzahl > KUERZEN_AB) {
    storage.kuerzeEreignisse('achievements', MAX_EREIGNISSE);
  }
}

/**
 * Liest den Verlauf, jüngste zuerst.
 * @param {object} optionen - seit (Zeitstempel), limit, appId
 */
function verlauf({ seit = 0, limit = 200, appId = null } = {}) {
  let ereignisse = storage.leseEreignisse('achievements', { seit });
  if (appId !== null) {
    ereignisse = ereignisse.filter((e) => String(e.appId) === String(appId));
  }
  return ereignisse.slice(-limit).reverse();
}

/** Zusammenfassung je Tag - Grundlage für eine spätere Verlaufsansicht. */
function proTag({ tage = 30 } = {}) {
  const seit = Date.now() - tage * 24 * 60 * 60 * 1000;
  const ereignisse = storage.leseEreignisse('achievements', { seit });

  const nachTag = new Map();
  ereignisse.forEach((e) => {
    const tag = new Date(e.ts).toISOString().slice(0, 10);
    const eintrag = nachTag.get(tag) || { tag, anzahl: 0, xp: 0, stufen: {} };
    eintrag.anzahl += 1;
    eintrag.xp += e.xpZuwachs || 0;
    eintrag.stufen[e.category] = (eintrag.stufen[e.category] || 0) + 1;
    nachTag.set(tag, eintrag);
  });

  return [...nachTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

module.exports = { achievementFreigeschaltet, xpStand, verlauf, proTag };
