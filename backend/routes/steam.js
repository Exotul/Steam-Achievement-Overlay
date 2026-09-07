const express = require('express');
const logger = require('../services/logger');
const ensureAuth = require('../middleware/ensureAuth');
const steamApi = require('../services/steamApi');
const storeApi = require('../services/storeApi');
const cache = require('../services/cache');
const profileBuilder = require('../services/profileBuilder');
const completionTime = require('../services/completionTime');
const xpSummary = require('../services/xpSummary');
const queue = require('../services/steamQueue');
const history = require('../services/history');

const router = express.Router();
router.use(ensureAuth);

// Eigene Spielebibliothek - ändert sich selten, darf länger im Cache bleiben.
router.get('/library', async (req, res) => {
  try {
    const games = await cache.remember(`library:${req.user.steamId}`, 5 * 60 * 1000, () =>
      steamApi.getOwnedGames(req.user.steamId)
    );
    res.json(
      games.map((g) => ({
        appId: g.appid,
        name: g.name,
        playtimeMinutes: g.playtime_forever,
        iconUrl: `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`,
        // Großes Regal-Bild wie in der Steam-Bibliothek. Nicht jedes Spiel
        // hat ein library_600x900 - das Frontend fällt dann automatisch auf
        // headerUrl und zuletzt auf iconUrl zurück.
        libraryUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
        headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
      }))
    );
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Steam-Bibliothek konnte nicht geladen werden.' });
  }
});

// Angereicherte Achievements für ein Spiel (inkl. Kategorie & Diamant-Status).
// Kurze Cache-Zeit fürs Dashboard, damit nicht jede Kachel einzeln die
// Steam-API belastet. Das Overlay hängt beim aktiven Polling ?fresh=1 an
// und umgeht den Cache damit bewusst - sonst würde die Cache-Dauer die
// Reaktionszeit des Overlays künstlich verlängern.
router.get('/games/:appId/achievements', async (req, res) => {
  try {
    const cacheKey = `achievements:${req.user.steamId}:${req.params.appId}`;
    // Das Overlay hängt beim aktiven Polling ?fresh=1 an - genau diese
    // Aufrufe entscheiden darüber, wie schnell eine Meldung erscheint, und
    // bekommen deshalb Vorrang vor allem Hintergrundgeschehen.
    const dringend = req.query.fresh === '1';
    const fetchFresh = () =>
      queue.mitPrioritaet(dringend ? 'dringend' : 'hintergrund', () =>
        // Nur die Erkennung umgeht den Spielerstand-Speicher. Das Dashboard
        // darf ihn nutzen - sonst holt es beim Oeffnen die halbe Bibliothek
        // neu, obwohl dieselben Daten Minuten vorher schon da waren.
        steamApi.buildEnrichedAchievements(req.user.steamId, req.params.appId, {
          frisch: dringend,
        })
      );

    let result;
    try {
      // Acht Sekunden waren fuer das Dashboard sinnlos kurz: Bis die letzte
      // Kachel geladen war, galt die erste laengst nicht mehr. Fuenf Minuten
      // machen ein erneutes Oeffnen praktisch kostenlos, ohne dass jemand
      // veraltete Zahlen sieht - waehrend eines Spiels schreibt die
      // Erkennung diesen Eintrag ohnehin laufend neu.
      const HALTBAR_MS = 5 * 60 * 1000;
      if (dringend) {
        result = await fetchFresh();
        // frisch geholten Stand ablegen, damit das Dashboard davon profitiert
        cache.set(cacheKey, result, HALTBAR_MS, { persistent: false });
      } else {
        result = await cache.remember(cacheKey, HALTBAR_MS, fetchFresh, { persistent: false });
      }
    } catch (fehler) {
      // Steam nicht erreichbar? Dann den letzten bekannten Stand ausliefern
      // statt gar nichts. Das Overlay ergaenzt ihn mit der lokalen Datei und
      // bleibt dadurch arbeitsfaehig.
      const letzter = cache.get(`achievements-letzter:${req.user.steamId}:${req.params.appId}`);
      if (letzter) {
        logger.warn(`Steam nicht erreichbar - liefere letzten Stand für App ${req.params.appId}`);
        return res.json({ ...letzter, veraltet: true });
      }
      throw fehler;
    }
    res.json(result);
  } catch (err) {
    logger.error('Achievements konnten nicht geladen werden: ' + err.message);
    res.status(502).json({ error: 'Achievements konnten nicht geladen werden.' });
  }
});

// Geschaetzte Zeit bis zur Komplettierung, aus der Spielzeit derjenigen im
// Freundeskreis, die das Spiel tatsaechlich vollstaendig haben. Teuer, daher
// 6 Stunden zwischengespeichert.
router.get('/games/:appId/completion-time', async (req, res) => {
  try {
    const result = await completionTime.getCompletionTime(req.user.steamId, req.params.appId);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Komplettierungszeit konnte nicht ermittelt werden.' });
  }
});

// XP-Gesamtstand und Achievement-Level. Wird EINMAL beim Start der App
// ermittelt; danach schreibt das Overlay den Wert selbst fort, statt bei
// jedem Achievement die ganze Bibliothek neu durchzugehen.
router.get('/xp-summary', (req, res) => {
  try {
    res.json(xpSummary.getSummary(req.user.steamId, req.query.refresh === '1'));
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'XP-Stand konnte nicht ermittelt werden.' });
  }
});

// Verlauf: wird vom Overlay beschickt, sobald eine Meldung erscheint.
router.post('/history/achievement', express.json(), (req, res) => {
  try {
    history.achievementFreigeschaltet({ steamId: req.user.steamId, ...req.body });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Verlauf konnte nicht geschrieben werden: ' + err.message);
    res.status(500).json({ ok: false });
  }
});

router.get('/history', (req, res) => {
  res.json({
    verlauf: history.verlauf({
      limit: Number(req.query.limit) || 200,
      appId: req.query.appId || null,
    }),
    proTag: history.proTag({ tage: Number(req.query.tage) || 30 }),
  });
});

// Wird gerade gespielt, und wenn ja, welches Spiel?
router.get('/presence', async (req, res) => {
  try {
    const presence = await cache.remember(`presence:${req.user.steamId}`, 5 * 1000, () =>
      queue.mitPrioritaet('dringend', () => steamApi.getPresence(req.user.steamId))
    );
    res.json(presence);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Spielstatus konnte nicht geladen werden.' });
  }
});

// Erscheinungsdaten - bewusst als eigener Endpunkt, weil sie aus der
// strenger limitierten Store-Schnittstelle kommen und nur bei Bedarf
// (Sortierung nach Erscheinungsdatum) geladen werden sollen.
router.get('/release-dates', async (req, res) => {
  try {
    const appIds = String(req.query.appIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (appIds.length === 0) return res.json([]);
    const results = await storeApi.getReleaseDates(appIds);
    res.json(results);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Erscheinungsdaten konnten nicht geladen werden.' });
  }
});

// Freundesliste inkl. Profildaten (Name, Avatar)
router.get('/friends', async (req, res) => {
  try {
    if (req.query.refresh === '1') {
      // Beim Aktualisieren die Liste selbst neu holen, nicht nur die Profile.
      cache.set(`friendlist:${req.user.steamId}`, undefined, 0);
    }
    const friends = await cache.remember(`friendlist:${req.user.steamId}`, 5 * 60 * 1000, () =>
      steamApi.getFriendList(req.user.steamId)
    );
    if (friends.length === 0) return res.json([]);
    const summaries = await cache.remember(
      `friendsummaries:${req.user.steamId}`,
      5 * 60 * 1000,
      () => steamApi.getPlayerSummaries(friends.map((f) => f.steamid))
    );
    res.json(
      summaries.map((s) => ({
        steamId: s.steamid,
        displayName: s.personaname,
        avatar: s.avatarfull,
        profileUrl: s.profileurl,
      }))
    );
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Freundesliste konnte nicht geladen werden (evtl. privat gestellt).' });
  }
});

// Vollstaendiges Achievement-Profil eines Freundes (Level, Stufen, Spiele,
// seltenste Trophaeen). Teuer im Aufbau, deshalb serverseitig 30 Minuten
// zwischengespeichert - der Browser muesste sonst alle Achievementlisten
// aller Freunde einzeln laden.
router.get('/friends/:steamId/profile', async (req, res) => {
  try {
    const [summary] = await steamApi.getPlayerSummaries([req.params.steamId]);
    const profile = await profileBuilder.getProfile(
      req.params.steamId,
      req.query.refresh === '1'
    );
    res.json({
      steamId: req.params.steamId,
      displayName: summary?.personaname || 'Unbekannt',
      avatar: summary?.avatarfull || '',
      profileUrl: summary?.profileurl || '',
      ...profile,
    });
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Profil konnte nicht geladen werden.' });
  }
});

// Achievements eines Freundes für ein bestimmtes Spiel
router.get('/friends/:steamId/games/:appId/achievements', async (req, res) => {
  try {
    const result = await cache.remember(
      `achievements:${req.params.steamId}:${req.params.appId}`,
      30 * 1000,
      () => steamApi.buildEnrichedAchievements(req.params.steamId, req.params.appId)
    );
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: 'Achievements des Freundes konnten nicht geladen werden.' });
  }
});

module.exports = router;
