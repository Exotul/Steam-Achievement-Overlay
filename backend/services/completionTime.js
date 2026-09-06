const steamApi = require('./steamApi');
const cache = require('./cache');

/**
 * Schaetzt, wie lange man fuer alle Achievements eines Spiels braucht.
 *
 * WICHTIG - woher die Daten kommen:
 * Steam bietet KEINE Statistik "durchschnittliche Zeit bis 100 %". Verfuegbar
 * ist nur die Spielzeit einzelner Personen mit oeffentlichem Profil.
 * Ausgewertet wird deshalb, wer das Spiel tatsaechlich vollstaendig hat.
 *
 * ENTSCHEIDEND fuer die Geschwindigkeit: Diese Funktion fragt NICHTS bei
 * Steam nach. Sie liest ausschliesslich bereits berechnete Freundesprofile
 * aus dem Zwischenspeicher - die entstehen, wenn im Dashboard der Reiter
 * "Freunde" geoeffnet wird. Frueher hat sie beim Spielstart selbst die
 * Freundesliste durchgearbeitet und dabei die Achievement-Erkennung
 * ausgebremst. Das passiert jetzt nur noch dort, wo der Nutzer es auch
 * erwartet: im Dashboard.
 *
 * Folge: Sind noch keine Freundesprofile berechnet, wird keine Zeit
 * angezeigt - lieber nichts als eine Verzoegerung im Spiel.
 */

function median(zahlen) {
  const s = [...zahlen].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
}

/** Holt die Spielzeit aus einem bereits berechneten Profil - falls komplett. */
function zeitAusProfil(profil, appId) {
  if (!profil || profil.isPrivate || !Array.isArray(profil.games)) return null;
  const eintrag = profil.games.find((g) => String(g.appId) === String(appId));
  if (!eintrag || !eintrag.isDiamond || !eintrag.playtimeMinutes) return null;
  return eintrag.playtimeMinutes;
}

async function build(ownSteamId, appId) {
  const zeiten = [];
  let quellen = 0;

  // Eigene Zeit: nur aus bereits vorhandenen Daten, ohne neue Abfrage.
  const eigeneSpiele = cache.get(`ownedgames:${ownSteamId}`) || cache.get(`library:${ownSteamId}`);
  const eigenesSpiel = Array.isArray(eigeneSpiele)
    ? eigeneSpiele.find((g) => String(g.appid ?? g.appId) === String(appId))
    : null;
  if (eigenesSpiel) {
    const eigenerStand = cache.get(`achievements:${ownSteamId}:${appId}`);
    if (eigenerStand && eigenerStand.isDiamond) {
      const minuten = eigenesSpiel.playtime_forever ?? eigenesSpiel.playtimeMinutes;
      if (minuten) {
        zeiten.push(minuten);
        quellen += 1;
      }
    }
  }

  // Freunde: ausschliesslich aus bereits berechneten Profilen.
  const friends = cache.get(`friendlist:${ownSteamId}`) || [];
  friends.forEach((f) => {
    const profil = cache.get(`profile:${f.steamid}`);
    if (!profil) return;
    quellen += 1;
    const zeit = zeitAusProfil(profil, appId);
    if (zeit) zeiten.push(zeit);
  });

  if (zeiten.length === 0) {
    return {
      sampleSize: 0,
      medianMinutes: null,
      minMinutes: null,
      maxMinutes: null,
      // Damit die Oberflaeche erklaeren kann, warum nichts da ist.
      geprueft: quellen,
      hinweis:
        quellen === 0
          ? 'Noch keine Freundesprofile berechnet - dafür im Dashboard den Reiter "Freunde" öffnen.'
          : 'Niemand aus dem Freundeskreis hat dieses Spiel komplett.',
    };
  }

  return {
    sampleSize: zeiten.length,
    medianMinutes: median(zeiten),
    minMinutes: Math.min(...zeiten),
    maxMinutes: Math.max(...zeiten),
    geprueft: quellen,
  };
}

/**
 * Kein eigener Zwischenspeicher noetig: Die Berechnung liest ohnehin nur aus
 * dem Speicher und ist dadurch sofort fertig.
 */
function getCompletionTime(ownSteamId, appId) {
  return build(ownSteamId, appId);
}

module.exports = { getCompletionTime };
