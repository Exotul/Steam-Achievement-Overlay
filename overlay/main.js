const { ladeKonfiguration, schluesselFehlt, BENUTZER_CONFIG } = require('./lib/config');
const konfig = ladeKonfiguration(__dirname);
const path = require('path');
const { app, BrowserWindow, Tray, Menu, screen, nativeImage, shell, dialog, ipcMain } =
  require('electron');
const SteamClient = require('./lib/steamClient');
const { ensureBackendRunning } = require('./lib/backendManager');
const { LocalWatcher, findSteamPath } = require('./lib/localWatcher');
const ChangeRecorder = require('./lib/changeRecorder');
const updater = require('./lib/updater');
const autostart = require('./lib/autostart');
const logger = require('./lib/logger');
const path_ = require('path');
const fs_ = require('fs');
const os_ = require('os');

/**
 * Merkt sich, welche lokale Datei fuer welches Spiel bereits erfolgreich
 * gegen den bestaetigten Stand geprueft wurde.
 *
 * Warum dauerhaft: Faellt Steam aus, laesst sich nicht neu pruefen. Eine
 * frueher bestandene Pruefung ist dann die beste verfuegbare Grundlage - sie
 * beruhte schliesslich auf echten Steam-Daten.
 */
const GEPRUEFT_DATEI = path_.join(os_.homedir(), '.trophaenschrank', 'geprueft.json');

function ladeGeprueft() {
  try {
    return JSON.parse(fs_.readFileSync(GEPRUEFT_DATEI, 'utf8'));
  } catch (err) {
    return {};
  }
}

function merkeGeprueft(appId, eintrag) {
  try {
    const alle = ladeGeprueft();
    alle[String(appId)] = { ...eintrag, geprueftAm: Date.now() };
    fs_.mkdirSync(path_.dirname(GEPRUEFT_DATEI), { recursive: true });
    const tmp = `${GEPRUEFT_DATEI}.tmp`;
    fs_.writeFileSync(tmp, JSON.stringify(alle), 'utf8');
    fs_.renameSync(tmp, GEPRUEFT_DATEI);
  } catch (err) {
    logger.warn('Geprüfte Quelle konnte nicht gemerkt werden: ' + err.message);
  }
}
logger.setBereich('overlay');
logger.info(`Konfiguration geladen aus ${konfig.quelle}`);
if (konfig.uebernommen) {
  logger.info(`Bisherige .env nach ${konfig.benutzerConfig} übernommen - sie übersteht künftig Updates`);
}
const steamKey = require('./lib/steamKey');
const einstellungenModul = require('./lib/einstellungen');
const SteamOverlayDetector = require('./lib/steamOverlayDetector');
const {
  findVerifiedSource,
  readUnlockedFromFile,
  readUnlockedViaSchema,
} = require('./lib/steamStatsFile');

const BASE_URL = process.env.STEAM_APP_BASE_URL || 'http://localhost:3000';
const PORT = new URL(BASE_URL).port || 3000;
const PRESENCE_POLL_INTERVAL_MS = Number(process.env.PRESENCE_POLL_INTERVAL_MS) || 15000;
const ACHIEVEMENT_POLL_INTERVAL_MS = Number(process.env.ACHIEVEMENT_POLL_INTERVAL_MS) || 2000;
// Lokale Beschleunigung: beobachtet Dateien, die Steam selbst auf diesem PC
// schreibt, um Achievements frueher zu bemerken als die (serverseitig
// verzoegerte) Web-API. 'auto' = nutzen wenn moeglich, 'off' = nur Web-API.
const LOCAL_WATCH = (process.env.LOCAL_WATCH || 'auto').toLowerCase();
// Wann das Status-Abzeichen unten rechts sichtbar ist:
//   steam-overlay = nur waehrend Steams Overlay offen ist (Shift+Tab)
//   spiel         = solange ein Spiel verfolgt wird
//   aus           = nie
// Kommt jetzt aus den Einstellungen (siehe unten), nicht mehr aus der .env.
// Wie lange die Spielstart-Meldung stehen bleibt. Deutlich laenger als eine
// Achievement-Meldung, weil beim Spielstart oft noch Ladebildschirme,
// Logos und Menues kommen - eine kurze Einblendung geht dabei schlicht unter.
// Frueher standen Anzeigedauer und Status-Abzeichen nur in der .env und
// waren damit praktisch unerreichbar. Sie kommen jetzt aus den
// Einstellungen; die alten Umgebungsvariablen gelten weiterhin als
// Vorgabewerte, damit eine bestehende Einrichtung sich nicht aendert.
let einstellungen = einstellungenModul.laden();

let backendChild = null;
let overlayWindow;
let tray;
let steamClient;
let currentUser = null;

let presenceTimer = null;
let achievementTimer = null;
let isCheckingPresence = false;
let isCheckingAchievements = false;

// appId des aktuell verfolgten Spiels + Menge der bereits bekannten,
// freigeschalteten Achievement-apiNames (Baseline zum Diffen).
let trackedAppId = null;
let trackedGameName = null;
let unlockedBaseline = null;

// Spiele, für die die Diamant-Feier in dieser Sitzung schon gezeigt wurde
// (verhindert Wiederholung bei jedem weiteren Poll).
const diamondCelebrated = new Set();

// Nachschlagewerk apiName -> angereichertes Achievement des aktuellen Spiels,
// damit der Schnell-Modus (der nur apiNames kennt) sofort ein vollstaendiges
// Popup bauen kann, ohne auf die Web-API zu warten.
let achievementIndex = new Map();
let letzterStand = null; // { unlockedCount, totalCount } des verfolgten Spiels

// XP-Stand: EINMAL beim Start ermittelt, danach selbst fortgeschrieben.
// Ein einzelnes Achievement bringt einen berechenbaren Zuwachs - dafuer
// muss die Bibliothek nicht erneut durchgegangen werden.
let xpStand = null; // { level, xpIntoLevel, xpForThisLevel, totalXp }
// Gespiegelt aus backend/services/xpMath.js - bei Änderungen dort mitziehen.
const TIER_MULTIPLIER = { Kupfer: 1, Silber: 2.5, Gold: 4, Platin: 6 };

function xpFuer(achievement) {
  return (TIER_MULTIPLIER[achievement.category] || 1) * (100 - achievement.globalPercent);
}

// Dieselbe Kurve wie im Backend und im Dashboard.
function xpFuerLevel(level) {
  return Math.round(400 * Math.pow(level, 0.7));
}

function levelAus(totalXp) {
  let level = 1;
  let verbraucht = 0;
  while (true) {
    const noetig = xpFuerLevel(level);
    if (verbraucht + noetig > totalXp) {
      return {
        level,
        xpIntoLevel: Math.round(totalXp - verbraucht),
        xpForThisLevel: noetig,
        totalXp: Math.round(totalXp),
      };
    }
    verbraucht += noetig;
    level += 1;
  }
}
let localWatcher = null;
let localWatchReady = false;

// Lokale Achievement-Datei, deren Parser sich gegen den von Steam
// bestaetigten Stand als korrekt erwiesen hat. Nur dann wird sie genutzt.
let verifiedStatsFile = null;
let localAuthoritative = false;
let lastVerifyAttempts = [];
let verifiedSchemaFile = null;
let overlayDetector = null;
let badgeSichtbar = false;
let steamErreichbar = true;
let verifiedMethod = null;

/**
 * Der Bildschirm, auf dem das Overlay liegen soll.
 *
 * Faellt bewusst auf den Hauptbildschirm zurueck, wenn der eingestellte
 * Monitor nicht mehr da ist - abgezogen, umgesteckt, anderer Rechner. Sonst
 * laege das Overlay im Nirgendwo und waere schlicht unsichtbar, ohne dass
 * erkennbar waere warum.
 */
function gewaehlterBildschirm() {
  if (einstellungen.bildschirm === null) return screen.getPrimaryDisplay();
  const treffer = screen.getAllDisplays().find((d) => d.id === einstellungen.bildschirm);
  if (treffer) return treffer;
  logger.warn(
    `Eingestellter Bildschirm ${einstellungen.bildschirm} nicht gefunden - Hauptbildschirm`
  );
  return screen.getPrimaryDisplay();
}

function createOverlayWindow() {
  // Volle Bildschirmgroesse verwenden (nicht workAreaSize), damit das Overlay
  // auch im Vollbild ueber der Taskleisten-Zone liegt.
  const anzeige = gewaehlterBildschirm();
  const { x, y, width, height } = anzeige.bounds;

  overlayWindow = new BrowserWindow({
    width,
    // Das Fenster deckt den ganzen Bildschirm ab; wo die Meldungen darin
    // sitzen, entscheidet die Position aus den Einstellungen (per CSS).
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'overlay', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 'screen-saver' ist die hoechste Fensterebene, die Electron anbietet -
  // damit liegt das Overlay ueber Vollbild-Spielen im randlosen Modus.
  // relativeLevel 1 schiebt es zusaetzlich ueber andere Fenster derselben
  // Ebene (z. B. andere Overlays).
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, 'overlay', 'overlay.html'));

  // Manche Spiele reissen beim Start in den Vollbildmodus den
  // Vordergrund-Status an sich und schieben andere Fenster dauerhaft
  // dahinter. Deshalb setzen wir die Ebene regelmaessig neu - das kostet
  // praktisch nichts und holt das Overlay in genau diesen Faellen zurueck.
  setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    if (!overlayWindow.isAlwaysOnTop()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }
    overlayWindow.moveTop();
  }, 4000);

  // Zeigt direkt beim Start ein Test-Popup, damit man ohne ein Spiel zu
  // starten sofort sehen kann, ob das Overlay sichtbar und richtig
  // positioniert ist.
  overlayWindow.webContents.once('did-finish-load', () => {
    sendToOverlay('einstellungen', einstellungenFuerOverlay());
    // Beim automatischen Start nach dem Hochfahren keine Begruessung
    // einblenden - da laufen ohnehin schon genug Programme hoch, und die
    // Meldung ist als Bestaetigung beim manuellen Start gedacht.
    if (!autostart.wasAutoStarted()) {
      overlayWindow.webContents.send('show-welcome');
    }
  });
}

/**
 * Schickt ein Achievement ins Overlay - zusammen mit dem daraus folgenden
 * XP-Zuwachs und dem neuen Level. Der Zuwachs wird hier ausgerechnet, nicht
 * neu von Steam geholt: Ein Achievement ist eine bekannte Groesse.
 *
 * @param {boolean} nurTest - bei true wird der XP-Stand NICHT veraendert.
 */
function sendAchievementToOverlay(achievement, nurTest = false) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  let xpInfo = null;
  if (xpStand) {
    const zuwachs = xpFuer(achievement);
    const vorher = xpStand;
    const nachher = levelAus(vorher.totalXp + zuwachs);

    if (!nurTest) xpStand = nachher;

    xpInfo = {
      zuwachs: Math.round(zuwachs),
      level: nachher.level,
      xpIntoLevel: nachher.xpIntoLevel,
      xpForThisLevel: nachher.xpForThisLevel,
      totalXp: nachher.totalXp,
      levelUp: nachher.level > vorher.level,
      // Fuer die Balken-Animation: Stand vor dem Achievement.
      vorherXpIntoLevel: vorher.xpIntoLevel,
      vorherXpForThisLevel: vorher.xpForThisLevel,
      vorherLevel: vorher.level,
    };
  }

  logger.info(
    `Meldung: ${achievement.name} (${achievement.category}, ${achievement.globalPercent}%)` +
      (nurTest ? ' [TEST]' : '') +
      (xpInfo ? ` +${xpInfo.zuwachs} XP, Level ${xpInfo.level}${xpInfo.levelUp ? ' AUFSTIEG' : ''}` : '')
  );
  overlayWindow.webContents.send('achievement-unlocked', { ...achievement, xp: xpInfo, nurTest });

  // Im Verlauf festhalten - aber nur echte Freischaltungen, keine Tests.
  if (!nurTest) {
    steamClient
      .verlaufMelden({
        appId: trackedAppId,
        gameName: trackedGameName,
        achievement: {
          apiName: achievement.apiName,
          name: achievement.name,
          category: achievement.category,
          globalPercent: achievement.globalPercent,
        },
        xpZuwachs: xpInfo ? xpInfo.zuwachs : null,
        level: xpInfo ? xpInfo.level : null,
      })
      .catch(() => {});
  }
}

function sendGameStartedToOverlay(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('game-started', payload);
}

function sendStatusBadge(visible) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (badgeSichtbar === visible) return;
  badgeSichtbar = visible;

  const stand = trackedAppId ? letzterStand : null;
  overlayWindow.webContents.send('status-badge', {
    visible,
    gameName: trackedGameName,
    unlockedCount: stand ? stand.unlockedCount : null,
    totalCount: stand ? stand.totalCount : null,
  });
}

function sendCompletionTimeToOverlay(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('completion-time', payload);
}

function sendDiamondToOverlay(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('game-diamond-unlocked', payload);
}

// --- Langsame Schleife: nur "wird gerade gespielt?" ------------------------

async function checkPresence() {
  if (isCheckingPresence || !currentUser) return;
  isCheckingPresence = true;
  try {
    const presence = await steamClient.presence();

    if (!presence.inGame) {
      if (trackedAppId !== null) {
        logger.info(`Spiel beendet: ${trackedGameName || trackedAppId}`);
        stopAchievementTracking();
      }
      updateTrayStatus('Eingeloggt · aktuell kein Spiel offen');
      return;
    }

    if (presence.appId !== trackedAppId) {
      logger.info(`Spiel erkannt: ${presence.gameName || '?'} (AppID ${presence.appId})`);
      await startAchievementTracking(presence.appId, presence.gameName);
    }
  } catch (err) {
    console.error('Presence-Fehler:', err.message);
  } finally {
    isCheckingPresence = false;
  }
}

// --- Schnelle Schleife: nur solange aktiv, wie ein Spiel läuft -------------

async function startAchievementTracking(appId, gameName) {
  trackedAppId = appId;
  trackedGameName = gameName;
  unlockedBaseline = null;
  achievementIndex = new Map();

  let result = null;
  let veraltet = false;
  try {
    result = await steamClient.gameAchievements(appId, true);
    veraltet = result?.veraltet === true;
    unlockedBaseline = new Set(result.achievements.filter((a) => a.unlocked).map((a) => a.apiName));
    achievementIndex = new Map(result.achievements.map((a) => [a.apiName, a]));
    letzterStand = { unlockedCount: result.unlockedCount, totalCount: result.totalCount };
    if (result.isDiamond) diamondCelebrated.add(appId); // schon vorher komplett -> nicht feiern
  } catch (err) {
    // WICHTIG: hier NICHT auf ein leeres Set setzen. Sonst gaelten beim
    // naechsten erfolgreichen Abruf saemtliche laengst vorhandenen
    // Achievements als frisch errungen - das fuehrt zu einer Flut von Popups.
    // null heisst: "Ausgangsstand steht noch aus", checkAchievements() holt
    // ihn dann still nach, ohne etwas zu melden.
    console.error('Konnte Achievement-Baseline nicht laden:', err.message);
    unlockedBaseline = null;
  }

  updateTrayStatus(`Verfolge: ${gameName || appId}`);

  // Sichtbare Bestaetigung im Overlay: Das Spiel wurde erkannt und wird ab
  // jetzt verfolgt. Zeigt zugleich den aktuellen Trophaeenstand - so ist auf
  // einen Blick klar, dass die App laeuft und was noch fehlt.
  if (result) {
    sendGameStartedToOverlay({
      gameName: gameName || `App ${appId}`,
      unlockedCount: result.unlockedCount,
      totalCount: result.totalCount,
      isDiamond: result.isDiamond,
      difficulty: result.difficulty ?? null,
      displaySeconds: einstellungen.spielStartDauerSek,
    });

    // Die Komplettierungszeit liest nur bereits berechnete Freundesprofile
    // aus dem Zwischenspeicher - keine einzige Steam-Abfrage, also auch keine
    // Konkurrenz zur Achievement-Erkennung. Ist noch nichts berechnet (der
    // Reiter "Freunde" im Dashboard wurde noch nie geoeffnet), kommt einfach
    // kein Wert und es wird nichts angezeigt.
    steamClient
      .completionTime(appId)
      .then((zeit) => {
        if (zeit && zeit.sampleSize > 0) sendCompletionTimeToOverlay({ appId, ...zeit });
      })
      .catch(() => {});
  } else {
    sendGameStartedToOverlay({
      gameName: gameName || `App ${appId}`,
      unlockedCount: null,
      totalCount: null,
      isDiamond: false,
      displaySeconds: einstellungen.spielStartDauerSek,
    });
  }

  // Pruefen, ob es eine lokale Achievement-Datei gibt, deren Inhalt exakt
  // dem von Steam bestaetigten Stand entspricht. Nur eine solche Datei darf
  // spaeter eigenstaendig Freischaltungen melden.
  if (veraltet) {
    // Steam liefert nur noch den letzten bekannten Stand - eine neue Prüfung
    // ist damit nicht möglich. Stattdessen den früher geprüften Weg
    // wiederverwenden: Er beruhte auf echten Steam-Daten.
    const frueher = ladeGeprueft()[String(appId)];
    if (frueher && fs_.existsSync(frueher.file)) {
      verifiedStatsFile = frueher.file;
      verifiedSchemaFile = frueher.schemaFile;
      verifiedMethod = frueher.method;
      localAuthoritative = true;
      logger.warn('Eingeschränkter Betrieb: nutze zuvor geprüfte lokale Datei');
      updateTrayStatus(`Verfolge: ${gameName || appId} · lokal (Steam nicht erreichbar)`);
    } else {
      logger.warn('Eingeschränkter Betrieb ohne geprüfte lokale Datei - keine Erkennung möglich');
    }
  } else {
    await verifyLocalStatsSource(appId);
  }

  starteStatusAbzeichen();

  // Lokale Beschleunigung anwerfen: liest nur Dateien, die Steam selbst auf
  // diesem PC schreibt, und meldet dadurch frueher als die Web-API.
  if (LOCAL_WATCH !== 'off' && achievementIndex.size > 0) {
    startLocalWatcher(appId, [...achievementIndex.keys()], gameName);
  }

  if (achievementTimer) clearInterval(achievementTimer);
  checkAchievements();
  achievementTimer = setInterval(checkAchievements, ACHIEVEMENT_POLL_INTERVAL_MS);
}

let verifyRetryTimer = null;

/**
 * Prueft wiederholt, ob die lokale Achievement-Datei nutzbar ist.
 *
 * Warum wiederholt: Direkt nach einem Rechnerneustart kann Steams lokale
 * Datei noch nicht auf dem aktuellen Stand sein - dann weicht sie vom
 * bestaetigten Stand ab und wird (richtigerweise) abgelehnt. Frueher lief die
 * Pruefung nur EINMAL beim Spielstart; ein solcher Fehlschlag bedeutete
 * deshalb, dass die ganze Sitzung ueber der langsame Weg genutzt wurde,
 * obwohl die Datei Sekunden spaeter gepasst haette.
 */
function starteWiederholtePruefung(appId) {
  stoppeWiederholtePruefung();
  let versuche = 0;

  verifyRetryTimer = setInterval(async () => {
    versuche += 1;
    if (localAuthoritative || trackedAppId !== appId || versuche > 20) {
      stoppeWiederholtePruefung();
      return;
    }
    await verifyLocalStatsSource(appId, true);
    if (localAuthoritative) {
      logger.info(`Erkennungsweg wechselt auf LOKAL (beim ${versuche}. Nachprüfen akzeptiert)`);
      updateTrayStatus(`Verfolge: ${trackedGameName || appId} · lokal (sofort)`);
      stoppeWiederholtePruefung();
    }
  }, 15000);
}

function stoppeWiederholtePruefung() {
  if (verifyRetryTimer) clearInterval(verifyRetryTimer);
  verifyRetryTimer = null;
}

async function verifyLocalStatsSource(appId, istWiederholung = false) {
  verifiedStatsFile = null;
  verifiedSchemaFile = null;
  verifiedMethod = null;
  localAuthoritative = false;

  if (LOCAL_WATCH === 'off' || !unlockedBaseline) return;

  const watcher = await ensureLocalWatcher();
  if (!localWatchReady || !watcher.steamPath) return;

  try {
    const knownApiNames = [...achievementIndex.keys()];
    const result = findVerifiedSource(
      watcher.steamPath,
      appId,
      unlockedBaseline,
      knownApiNames
    );
    lastVerifyAttempts = result.attempts || [];
    if (result.file) {
      // Die lokale Datei kann der Web-API ein oder zwei Eintraege voraus
      // sein. Diese uebernehmen wir still in den Ausgangsstand - es sind
      // laengst errungene Achievements, keine neuen. Ohne das wuerden sie
      // gleich beim naechsten Durchlauf faelschlich als frisch gemeldet.
      result.unlocked.forEach((name) => unlockedBaseline.add(name));

      verifiedStatsFile = result.file;
      verifiedSchemaFile = result.schemaFile || null;
      verifiedMethod = result.method || null;
      localAuthoritative = true;
      merkeGeprueft(appId, {
        file: result.file,
        schemaFile: result.schemaFile || null,
        method: result.method || null,
      });
      logger.info(`Erkennungsweg: LOKAL (${verifiedMethod}) - ${result.file}`);
    } else {
      if (!istWiederholung) {
        logger.warn('Erkennungsweg: WEB-API (lokale Datei passte nicht)');
        lastVerifyAttempts.forEach((a) => logger.warn(`  geprüft ${a.file}: ${a.reason}`));
        starteWiederholtePruefung(appId);
      }
    }
  } catch (err) {
    console.error('Pruefung der lokalen Datei fehlgeschlagen:', err.message);
  }
}

/**
 * Liest die verifizierte lokale Datei und meldet neue Freischaltungen.
 * Wird nur aufgerufen, wenn die Datei zuvor die Selbstpruefung bestanden hat.
 */
function checkLocalStatsFile() {
  if (!localAuthoritative || !verifiedStatsFile || !unlockedBaseline) return;

  const unlocked =
    verifiedMethod === 'schema' && verifiedSchemaFile
      ? readUnlockedViaSchema(verifiedStatsFile, verifiedSchemaFile)
      : readUnlockedFromFile(verifiedStatsFile, [...achievementIndex.keys()]);
  if (!unlocked) return;

  // Sicherheitsnetz: Wenn auf einen Schlag sehr viele neue Eintraege
  // auftauchen, stimmt etwas nicht (z. B. Datei wurde neu aufgebaut).
  // Dann lieber nichts melden und der Web-API das Feld ueberlassen.
  const neu = [...unlocked].filter((n) => !unlockedBaseline.has(n));
  if (neu.length === 0) return;
  if (neu.length > 3) {
    // Beim normalen Spielen kommen Achievements einzeln. Ein Schwung deutet
    // auf einen Neuaufbau der Datei hin (z. B. Steam-Neustart oder Abgleich
    // mit dem Server) - dann lieber nichts melden.
    console.log(`Lokale Datei meldet ${neu.length} neue Eintraege auf einmal - ignoriert.`);
    neu.forEach((n) => unlockedBaseline.add(n));
    return;
  }

  neu.forEach((apiName) => {
    unlockedBaseline.add(apiName);
    const achievement = achievementIndex.get(apiName);
    if (achievement) sendAchievementToOverlay({ ...achievement, unlocked: true });
  });

  setTimeout(checkAchievements, 2000); // Diamant-Status gegenpruefen
}

async function starteStatusAbzeichen() {
  stoppeStatusAbzeichen();
  if (einstellungen.statusAbzeichen === 'aus') return;

  if (einstellungen.statusAbzeichen === 'spiel') {
    sendStatusBadge(true);
    return;
  }

  // Betriebsart "steam-overlay": versuchen, Steams Overlay zu erkennen.
  const watcher = await ensureLocalWatcher();
  if (!localWatchReady || !watcher.steamPath) {
    // Ohne Steam-Pfad keine Erkennung moeglich -> zuverlaessige Betriebsart.
    sendStatusBadge(true);
    return;
  }

  overlayDetector = new SteamOverlayDetector({
    steamPath: watcher.steamPath,
    onChange: (offen) => sendStatusBadge(offen),
  });

  const gestartet = overlayDetector.start();
  if (!gestartet) {
    console.log('gameoverlay_renderer.txt nicht gefunden - Abzeichen dauerhaft sichtbar.');
    overlayDetector = null;
    sendStatusBadge(true);
    return;
  }

  // Sicherheitsnetz: Wenn nach einer Weile ueberhaupt kein Overlay-Ereignis
  // erkannt wurde, ist die Erkennung fuer diese Steam-Version untauglich.
  // Dann lieber dauerhaft anzeigen als nie.
  setTimeout(() => {
    if (overlayDetector && !overlayDetector.funktioniert() && !badgeSichtbar) {
      console.log('Keine Overlay-Ereignisse erkannt - Abzeichen dauerhaft sichtbar.');
      sendStatusBadge(true);
    }
  }, 90000);
}

function stoppeStatusAbzeichen() {
  if (overlayDetector) {
    overlayDetector.stop();
    overlayDetector = null;
  }
  sendStatusBadge(false);
}

async function ensureLocalWatcher() {
  if (localWatcher) return localWatcher;
  localWatcher = new LocalWatcher({
    onGenericChange: () => {
      // Es hat sich lokal etwas geaendert. Gibt es eine verifizierte lokale
      // Datei, wird sie direkt gelesen - das ist der schnelle Weg, und er
      // ist sicher, weil der Parser sich zuvor gegen den bestaetigten Stand
      // beweisen musste. Andernfalls entscheidet weiterhin die Web-API.
      if (localAuthoritative) checkLocalStatsFile();
      checkAchievements();
    },
    onStatus: (status) => {
      localWatchReady = !!status.available;
      if (!status.available) {
        console.log(`Lokale Erkennung nicht verfuegbar: ${status.reason}`);
      }
    },
  });
  await localWatcher.init();
  return localWatcher;
}

async function startLocalWatcher(appId, apiNames, gameName) {
  const watcher = await ensureLocalWatcher();
  if (!localWatchReady) return;
  watcher.start(appId, apiNames);
  updateTrayStatus(
    `Verfolge: ${gameName || appId}` +
      (localAuthoritative ? ' · lokal (sofort)' : ' · lokal beschleunigt')
  );
}

function stopLocalWatcher() {
  if (localWatcher) localWatcher.stop();
}

function stopAchievementTracking() {
  if (achievementTimer) clearInterval(achievementTimer);
  achievementTimer = null;
  stopLocalWatcher();
  stoppeWiederholtePruefung();
  stoppeStatusAbzeichen();
  letzterStand = null;
  trackedAppId = null;
  trackedGameName = null;
  unlockedBaseline = null;
  achievementIndex = new Map();
}

async function checkAchievements() {
  if (isCheckingAchievements || trackedAppId === null) return;
  isCheckingAchievements = true;
  try {
    const result = await steamClient.gameAchievements(trackedAppId, true);

    // Ausgangsstand steht noch aus (erster Abruf war fehlgeschlagen) ->
    // jetzt still nachholen und diesmal nichts melden.
    if (unlockedBaseline === null) {
      unlockedBaseline = new Set(
        result.achievements.filter((a) => a.unlocked).map((a) => a.apiName)
      );
      achievementIndex = new Map(result.achievements.map((a) => [a.apiName, a]));
      if (result.isDiamond) diamondCelebrated.add(trackedAppId);
      return;
    }

    const newlyUnlocked = result.achievements.filter(
      (a) => a.unlocked && !unlockedBaseline.has(a.apiName)
    );

    letzterStand = { unlockedCount: result.unlockedCount, totalCount: result.totalCount };

    newlyUnlocked.forEach((a) => {
      unlockedBaseline.add(a.apiName);
      sendAchievementToOverlay(a);
    });

    if (result.isDiamond && !diamondCelebrated.has(trackedAppId)) {
      diamondCelebrated.add(trackedAppId);
      sendDiamondToOverlay({
        gameName: trackedGameName,
        icon: newlyUnlocked[0]?.icon || result.achievements[0]?.icon,
      });
    }
  } catch (err) {
    console.error('Achievement-Poll-Fehler:', err.message);
  } finally {
    isCheckingAchievements = false;
  }
}

function startPolling() {
  stopPolling();
  checkPresence();
  schedulePresence();
}

/**
 * Solange kein Spiel laeuft, haeufiger nachsehen (damit ein Spielstart schnell
 * bemerkt wird). Laeuft bereits ein Spiel, reicht ein grosszuegiges Intervall -
 * dann uebernimmt ohnehin die Achievement-Pruefung.
 */
function schedulePresence() {
  if (presenceTimer) clearInterval(presenceTimer);
  const interval = trackedAppId === null ? 5000 : PRESENCE_POLL_INTERVAL_MS;
  presenceTimer = setInterval(async () => {
    const before = trackedAppId;
    await checkPresence();
    pruefeErreichbarkeit();
    // Intervall wechseln, sobald sich der Zustand geaendert hat.
    if ((before === null) !== (trackedAppId === null)) schedulePresence();
  }, interval);
}

function stopPolling() {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = null;
  stopAchievementTracking();
}

// --- Tray -------------------------------------------------------------------

async function pruefeErreichbarkeit() {
  try {
    const antwort = await steamClient.gesundheit();
    const jetztErreichbar = antwort?.steam?.steamErreichbar !== false;
    if (jetztErreichbar !== steamErreichbar) {
      steamErreichbar = jetztErreichbar;
      logger.info(
        steamErreichbar
          ? 'Steam wieder erreichbar - Normalbetrieb'
          : 'Steam nicht erreichbar - eingeschränkter Betrieb'
      );
      buildTrayMenu();
    }
  } catch (err) {
    /* Backend selbst nicht erreichbar - nicht als Steam-Ausfall werten */
  }
}

function updateTrayStatus(statusLine) {
  if (!tray) return;
  tray.setToolTip(`Trophäenschrank Overlay\n${statusLine}`);
  buildTrayMenu(statusLine);
}

function buildTrayMenu(statusLine) {
  const loggedIn = !!currentUser;
  // Das Menue war auf siebzehn Eintraege angewachsen und mischte alles
  // durcheinander: Taegliches neben Werkzeugen, die man einmal im Leben
  // braucht. Hier stehen jetzt nur noch die Dinge, die man wirklich im
  // Vorbeigehen anklickt - der Rest liegt in den Einstellungen oder unter
  // "Diagnose".
  const menu = Menu.buildFromTemplate([
    {
      label: loggedIn ? `Angemeldet als ${currentUser.displayName}` : 'Nicht angemeldet',
      enabled: false,
    },
    { label: statusLine || (loggedIn ? 'Warte auf Spielstart…' : '—'), enabled: false },
    !steamErreichbar
      ? { label: '⚠ Steam nicht erreichbar – eingeschränkter Betrieb', enabled: false }
      : null,
    { type: 'separator' },
    !loggedIn && { label: 'Mit Steam anmelden', click: handleLogin },
    loggedIn && { label: 'Abmelden', click: handleLogout },
    { label: 'Dashboard öffnen', click: () => shell.openExternal(BASE_URL) },
    { label: 'Einstellungen…', click: zeigeEinstellungen },
    { type: 'separator' },
    { label: 'Test-Achievement anzeigen', click: handleTestAchievement },
    autostart.isAvailable()
      ? {
          label: 'Automatisch mit Windows starten',
          type: 'checkbox',
          checked: autostart.isEnabled(),
          click: handleAutostartToggle,
        }
      : null,
    {
      // Alles, was der Fehlersuche dient. Zusammengefasst, weil es genau
      // dann gebraucht wird, wenn etwas klemmt - und sonst nie.
      label: 'Diagnose',
      submenu: [
        { label: 'Lokale Erkennung prüfen…', click: handleDiagnose },
        { label: 'Steam-API-Schlüssel prüfen…', click: handleKeycheck },
        { type: 'separator' },
        { label: 'Protokoll öffnen', click: () => shell.openPath(logger.logFile) },
        { label: 'Protokollordner öffnen', click: () => shell.openPath(logger.logDir) },
        { type: 'separator' },
        recorder
          ? { label: 'Aufzeichnung beenden und speichern', click: stopRecording }
          : { label: 'Dateiänderungen aufzeichnen…', click: startRecording },
      ],
    },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: 'Nach Updates suchen…', click: () => updater.jetztPruefen() },
    { label: 'Beenden', click: () => app.quit() },
  ].filter(Boolean));
  tray.setContextMenu(menu);
}

/**
 * Holt den XP-Gesamtstand. Laeuft die Berechnung noch, wird der Fortschritt
 * ins Overlay gemeldet, damit ein Ladebalken erscheint.
 */
async function ladeXpStand() {
  let gemeldet = false;

  for (let versuch = 0; versuch < 900; versuch++) {
    let antwort;
    try {
      antwort = await steamClient.xpSummary();
    } catch (err) {
      return; // ohne XP-Stand laeuft alles weiter, nur ohne XP-Meldungen
    }

    // Die Berechnung ist gescheitert und wird von sich aus nicht besser -
    // dann hier ebenfalls aufhoeren zu fragen. Frueher lief diese Schleife
    // weiter und stiess bei jedem Durchlauf einen neuen, ebenso
    // aussichtslosen Versuch an.
    if (antwort.status === 'fehler') {
      logger.warn('XP-Stand nicht verfügbar: ' + antwort.grund);
      if (gemeldet) sendToOverlay('xp-loading', { abbruch: true });
      if (antwort.schluesselProblem) {
        updateTrayStatus('Steam-Schlüssel abgelehnt - unter Einstellungen neu eintragen');
      }
      return;
    }

    if (antwort.status === 'ready') {
      xpStand = antwort;

      // "veraltet" heisst: Das ist der zuletzt fertig berechnete Stand, im
      // Hintergrund laeuft gerade eine Neuberechnung. Damit ist sofort ein
      // Level da und XP-Meldungen funktionieren - deshalb wird hier KEIN
      // Ladebalken gezeigt. Es gibt nichts, worauf jemand warten muesste.
      if (antwort.veraltet) {
        if (!gemeldet) {
          logger.info(
            `XP-Stand aus dem Speicher: Level ${antwort.level} ` +
              `(${antwort.totalXp} XP) - Neuberechnung laeuft im Hintergrund`
          );
        }
        gemeldet = true;
        await new Promise((r) => setTimeout(r, 3000));
        continue; // still weiterfragen, bis der frische Wert da ist
      }

      if (gemeldet) sendToOverlay('xp-loading', { fertig: true, level: antwort.level });
      logger.info(`XP-Stand geladen: Level ${antwort.level} (${antwort.totalXp} XP)`);
      return;
    }

    // Kein frueherer Stand vorhanden - hier wartet also wirklich jemand.
    gemeldet = true;
    sendToOverlay('xp-loading', {
      fertig: false,
      phase: antwort.phase || 'start',
      done: antwort.done || 0,
      total: antwort.total || 0,
      ausSpeicher: antwort.ausSpeicher || 0,
    });
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * Einstellungen so aufbereiten, wie das Overlay sie braucht.
 *
 * Der eigene Ton liegt als Dateipfad vor; die Anzeigeschicht laeuft aber im
 * Browser und kann damit nichts anfangen - sie braucht eine file://-Adresse.
 * Die Umwandlung gehoert hierher und nicht ins Overlay: Dort gibt es
 * bewusst keinen Node-Zugriff.
 */
function einstellungenFuerOverlay() {
  let eigenerTonUrl = null;
  if (einstellungen.eigenerTon) {
    try {
      // Nur verschicken, wenn die Datei ueberhaupt noch da ist - sonst
      // versucht das Overlay bei jeder Trophaee vergeblich abzuspielen.
      if (fs_.existsSync(einstellungen.eigenerTon)) {
        eigenerTonUrl = require('url').pathToFileURL(einstellungen.eigenerTon).href;
      } else {
        logger.warn(`Eigener Ton nicht gefunden: ${einstellungen.eigenerTon}`);
      }
    } catch (err) {
      logger.warn('Eigener Ton nicht verwendbar: ' + err.message);
    }
  }
  return { ...einstellungen, eigenerTonUrl };
}

function sendToOverlay(kanal, nutzlast) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send(kanal, nutzlast);
}

async function handleLogin() {
  try {
    currentUser = await steamClient.login();
    updateTrayStatus('Eingeloggt · aktuell kein Spiel offen');
    startPolling();
    ladeXpStand();
  } catch (err) {
    console.error('Login abgebrochen:', err.message);
    buildTrayMenu('Login abgebrochen');

    // Haeufigste Ursache fuer einen fehlgeschlagenen Login ist ein Problem
    // mit dem API-Schluessel - das gleich mitpruefen, statt den Nutzer mit
    // einer nackten Fehlermeldung von Steam alleinzulassen.
    try {
      const pruefung = await steamClient.keycheck();
      if (!pruefung.ok) {
        dialog.showMessageBox({
          type: 'warning',
          title: 'Anmeldung fehlgeschlagen',
          message: 'Vermutliche Ursache: der Steam-API-Schlüssel.',
          detail: `${pruefung.grund}\n\nZu prüfen in:\n${BENUTZER_CONFIG}\nZeile STEAM_API_KEY=...`,
          buttons: ['OK'],
        });
      }
    } catch (e) {
      /* nicht kritisch */
    }
  }
}

function handleLogout() {
  stopPolling();
  steamClient.logout();
  currentUser = null;
  diamondCelebrated.clear();
  buildTrayMenu();
}

let recorder = null;

function handleAutostartToggle(menuItem) {
  const gewuenscht = menuItem.checked;
  const ok = autostart.setEnabled(gewuenscht);

  if (!ok) {
    dialog.showMessageBox({
      type: 'error',
      title: 'Autostart',
      message: 'Die Einstellung konnte nicht gespeichert werden.',
      buttons: ['OK'],
    });
    buildTrayMenu();
    return;
  }

  if (gewuenscht && autostart.isDevelopmentBuild()) {
    // Ehrlicher Hinweis: Aus der Entwicklungsumgebung heraus zeigt der
    // Autostart-Eintrag auf die Electron-Hilfsdatei, nicht auf ein fertiges
    // Programm. Funktioniert, ist aber nicht das, was man erwartet.
    dialog.showMessageBox({
      type: 'info',
      title: 'Autostart aktiviert',
      message: 'Der Autostart wurde eingerichtet.',
      detail:
        'Hinweis: Die App läuft gerade über "npm start", nicht als installiertes\n' +
        'Programm. Der Autostart-Eintrag zeigt deshalb auf die Entwicklungs-\n' +
        'umgebung und funktioniert nur, solange dieser Ordner unverändert bleibt.\n\n' +
        'Für einen sauberen Autostart im Overlay-Ordner einmal "npm run dist"\n' +
        'ausführen, das erzeugte Installationsprogramm ausführen und den\n' +
        'Autostart dann in der installierten Version einschalten.',
      buttons: ['OK'],
    });
  }

  buildTrayMenu();
}

async function startRecording() {
  const steamPath = await findSteamPath();
  if (!steamPath) {
    dialog.showMessageBox({
      type: 'error',
      title: 'Aufzeichnung',
      message: 'Steam-Installation nicht gefunden.',
      buttons: ['OK'],
    });
    return;
  }
  recorder = new ChangeRecorder(steamPath, trackedAppId);
  const count = recorder.start();
  buildTrayMenu('Zeichnet Dateiänderungen auf…');
  dialog.showMessageBox({
    type: 'info',
    title: 'Aufzeichnung läuft',
    message: 'Die Aufzeichnung wurde gestartet.',
    detail:
      `${count} Dateien werden beobachtet.\n\n` +
      'Spiel jetzt weiter und hol dir ein Achievement. Sobald Steam die\n' +
      'Meldung zeigt, im Tray-Menü auf "Aufzeichnung beenden und speichern"\n' +
      'klicken.\n\n' +
      'Es werden nur Dateipfade, Größen und Zeitpunkte erfasst - keine Inhalte.',
    buttons: ['OK'],
  });
}

function stopRecording() {
  if (!recorder) return;
  recorder.stop();
  let file;
  try {
    file = recorder.writeReport();
  } catch (err) {
    file = null;
  }
  const count = recorder.events.length;
  recorder = null;
  buildTrayMenu();
  dialog.showMessageBox({
    type: 'info',
    title: 'Aufzeichnung beendet',
    message: file ? 'Bericht wurde gespeichert.' : 'Bericht konnte nicht gespeichert werden.',
    detail: file
      ? `${count} Änderungen aufgezeichnet.\n\nDatei:\n${file}`
      : 'Bitte Schreibrechte im Benutzerordner prüfen.',
    buttons: ['OK'],
  });
}

/**
 * Spielt die komplette Melde-Abfolge mit einem erfundenen Achievement ab -
 * ohne irgendetwas am tatsaechlichen Stand zu veraendern. Gedacht zum Pruefen
 * von Aussehen, Position und Ton, ohne erst ein Achievement erspielen zu
 * muessen.
 */
let testZaehler = 0;

function handleTestAchievement() {
  const stufen = [
    { category: 'Kupfer', globalPercent: 74.3, name: 'Erste Schritte' },
    { category: 'Silber', globalPercent: 22.8, name: 'Auf halbem Weg' },
    { category: 'Gold', globalPercent: 7.1, name: 'Meisterprüfung' },
    { category: 'Platin', globalPercent: 1.4, name: 'Gegen alle Widerstände' },
  ];
  // Bei jedem Aufruf die naechste Stufe, damit sich alle vier pruefen lassen.
  const stufe = stufen[testZaehler % stufen.length];
  testZaehler += 1;

  // Wenn ein Spiel läuft, ein echtes Achievement-Symbol daraus verwenden -
  // sonst sieht der Test anders aus als der Ernstfall, und genau dafür ist er
  // ja da. Ohne laufendes Spiel bleibt das App-Symbol als Notbehelf.
  const echtesSymbol = [...achievementIndex.values()].find((a) => a.icon)?.icon;

  sendAchievementToOverlay(
    {
      apiName: `TEST_${Date.now()}`,
      name: stufe.name,
      description: 'Test-Achievement – ändert nichts an deinem Fortschritt.',
      icon: echtesSymbol || '../assets/app-icon.png',
      unlocked: true,
      globalPercent: stufe.globalPercent,
      category: stufe.category,
    },
    true // nurTest: XP-Stand bleibt unveraendert
  );
}

async function handleKeycheck() {
  let ergebnis;
  try {
    ergebnis = await steamClient.keycheck();
  } catch (err) {
    dialog.showMessageBox({
      type: 'error',
      title: 'Steam-API-Schlüssel',
      message: 'Die Prüfung konnte nicht durchgeführt werden.',
      detail: `Läuft das Backend? (${err.message})`,
      buttons: ['OK'],
    });
    return;
  }

  dialog.showMessageBox({
    type: ergebnis.ok ? 'info' : 'warning',
    title: 'Steam-API-Schlüssel',
    message: ergebnis.ok ? 'Der Schlüssel funktioniert.' : 'Mit dem Schlüssel stimmt etwas nicht.',
    detail: ergebnis.ok
      ? `Steam hat den Schlüssel akzeptiert (${ergebnis.laenge} Zeichen).`
      : `${ergebnis.grund}\n\n` +
        `Der Schlüssel wird aus overlay\\.env gelesen und von dort an das\n` +
        `Backend weitergereicht. Prüfe dort die Zeile STEAM_API_KEY=...\n` +
        `(ohne Anführungszeichen, ohne Leerzeichen am Ende).\n\n` +
        `Neuen Schlüssel holen: https://steamcommunity.com/dev/apikey`,
    buttons: ['OK'],
  });
}

async function handleDiagnose() {
  const watcher = await ensureLocalWatcher();

  // Zuerst live nachfragen, was Steam gerade ueber den Spielstatus meldet -
  // ohne das ist jede weitere Aussage wertlos, denn ohne erkanntes Spiel
  // wird gar nichts verfolgt.
  let presence = null;
  let presenceError = null;
  try {
    presence = await steamClient.presence();
  } catch (err) {
    presenceError = err.message;
  }

  const lines = [];
  lines.push('Spielstatus laut Steam:');
  if (presenceError) {
    lines.push(`  Abfrage fehlgeschlagen: ${presenceError}`);
  } else if (presence && presence.inGame) {
    lines.push(`  Spiel erkannt: ${presence.gameName || '(ohne Namen)'} (AppID ${presence.appId})`);
    if (trackedAppId === null) {
      lines.push('  Wird gleich verfolgt - die Erkennung laeuft alle paar Sekunden.');
    }
  } else {
    lines.push('  KEIN Spiel gemeldet.');
    lines.push('');
    lines.push('  Steam veroeffentlicht das laufende Spiel nur, wenn:');
    lines.push('   1. dein Online-Status NICHT auf "Unsichtbar" oder');
    lines.push('      "Offline" steht (haeufigste Ursache), und');
    lines.push('   2. im Profil unter Datenschutz die "Spieldetails"');
    lines.push('      auf "Oeffentlich" stehen.');
    lines.push('');
    lines.push('  Ohne diese Angabe kann die App nicht wissen, welches Spiel');
    lines.push('  sie beobachten soll - dann erscheinen gar keine Meldungen.');
  }
  lines.push('');

  const watcherLines = await watcher.diagnose(trackedAppId);
  lines.push(...watcherLines);

  lines.push('');
  lines.push('Status-Abzeichen (unten rechts):');
  lines.push(`  Betriebsart: ${einstellungen.statusAbzeichen}`);
  if (einstellungen.statusAbzeichen === 'steam-overlay') {
    if (!overlayDetector) {
      lines.push('  Steam-Overlay-Erkennung nicht aktiv (Abzeichen dauerhaft sichtbar)');
    } else if (overlayDetector.funktioniert()) {
      lines.push(`  Erkennung funktioniert (${overlayDetector.erkannteEreignisse} Ereignisse)`);
    } else {
      lines.push('  Noch kein Overlay-Ereignis erkannt.');
      if (overlayDetector.unbekannteZeilen.length > 0) {
        lines.push('  Nicht zuordenbare Zeilen aus Steams Protokoll:');
        overlayDetector.unbekannteZeilen.slice(0, 5).forEach((z) => {
          lines.push(`   ${z.slice(0, 90)}`);
        });
        lines.push('  (Diese Zeilen helfen, die Erkennung gezielt anzupassen.)');
      }
    }
  }

  lines.push('');
  lines.push('Lokale Achievement-Datei:');
  if (localAuthoritative && verifiedStatsFile) {
    lines.push('  GEFUNDEN und geprüft - Achievements erscheinen sofort.');
    lines.push(`  Verfahren: ${verifiedMethod === 'schema' ? 'Schema + Status' : 'Namensabgleich'}`);
    lines.push(`  ${verifiedStatsFile}`);
  } else if (!trackedAppId) {
    lines.push('  (kein Spiel aktiv - Prüfung erfolgt beim Spielstart)');
  } else {
    lines.push('  Keine passende Datei gefunden.');
    if (lastVerifyAttempts.length > 0) {
      lines.push('');
      lines.push('  Geprüfte Dateien:');
      lastVerifyAttempts.forEach((a) => {
        const name = String(a.file).split(/[\\/]/).pop();
        lines.push(`   - ${name}`);
        lines.push(`     ${a.reason}`);
      });
    } else {
      lines.push('  Es wurden gar keine Kandidaten-Dateien gefunden.');
    }
    lines.push('');
    lines.push('  Es wird weiterhin die Web-API genutzt (langsamer).');
  }
  dialog.showMessageBox({
    type: 'info',
    title: 'Lokale Erkennung',
    message: 'Ergebnis der Prüfung',
    detail:
      lines.join('\n') +
      '\n\nDie App liest diese Dateien nur - sie schreibt oder verändert nichts' +
      ' und spricht dabei nicht mit Steam-Servern.' +
      (trackedAppId ? '' : '\n\nHinweis: Aktuell läuft kein Spiel, deshalb konnte' +
        ' der spielbezogene Ordner nicht geprüft werden.'),
    buttons: ['OK'],
  });
}

/**
 * Begruesst jemanden, der die App zum ersten Mal startet.
 *
 * Ohne das stand ein frisch installierter Trophaeenschrank einfach da und tat
 * nichts: Es fehlt der persoenliche Steam-Schluessel, und der kann auch nicht
 * mitgeliefert werden - er ist geheim und haengt am Konto dessen, der ihn
 * geholt hat. Frueher verwies die Fehlermeldung dafuer auf die Datei
 * overlay/.env, die es in einer installierten Fassung gar nicht gibt. Wer die
 * App nicht selbst gebaut hatte, war damit chancenlos.
 *
 * Der Schluessel ist der EINZIGE Handgriff - das Sitzungsgeheimnis erzeugt
 * die App beim Anlegen der Konfiguration selbst.
 */
let setupWindow = null;

/**
 * Einrichtungsfenster fuer den persoenlichen Steam-Schluessel.
 *
 * Warum ein eigenes Fenster und kein Systemdialog: Der Schluessel muss
 * EINGEGEBEN werden, und dialog.showMessageBox kann keine Eingabe. Die
 * Zwischenloesung - "oeffne diese Textdatei und ersetze den Platzhalter" -
 * funktioniert, aber daran scheitert jeder, der die App nur benutzen und
 * nicht selbst bauen will. Genau die Leute sollen sie benutzen koennen.
 *
 * Loest auf mit true, sobald ein Schluessel gespeichert wurde, sonst mit
 * false (auf "Spaeter" geklickt oder Fenster geschlossen).
 */
function zeigeEinrichtung() {
  return new Promise((fertig) => {
    let erfolgreich = false;

    setupWindow = new BrowserWindow({
      width: 660,
      height: 760,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Trophaeenschrank einrichten',
      backgroundColor: '#171b23',
      // Erst zeigen, wenn fertig gezeichnet - sonst blitzt ein weisses
      // Fenster auf, und das ist der allererste Eindruck der App.
      show: false,
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'assets', 'app-icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'setup', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    setupWindow.loadFile(path.join(__dirname, 'setup', 'setup.html'));
    setupWindow.once('ready-to-show', () => setupWindow.show());

    const behandler = {
      'setup:konfig-pfad': () => steamKey.BENUTZER_CONFIG,

      'setup:schluesselseite': () => {
        shell.openExternal('https://steamcommunity.com/dev/apikey');
        return true;
      },

      'setup:speichern': async (_e, eingabe) => {
        // Format zuerst: kostet nichts und faengt den haeufigsten Fall ab
        // (halb kopiert, Leerzeichen mitgenommen), ohne Steam zu fragen.
        const form = steamKey.formatPruefen(eingabe);
        if (!form.ok) return { ok: false, grund: form.grund };

        const bei = await steamKey.beiSteamPruefen(form.schluessel);

        // Kein Netz oder Steam gestoert: Der Schluessel kann trotzdem richtig
        // sein. Ihn deswegen abzulehnen waere falsch - also speichern und
        // ehrlich ins Protokoll schreiben, dass nicht geprueft werden konnte.
        if (!bei.ok && !bei.unklar) return { ok: false, grund: bei.grund };

        try {
          steamKey.speichereSchluessel(form.schluessel);
        } catch (err) {
          return { ok: false, grund: 'Speichern fehlgeschlagen: ' + err.message };
        }

        if (bei.ok) {
          logger.info('Steam-Schluessel eingerichtet und von Steam bestaetigt');
        } else {
          logger.warn('Steam-Schluessel gespeichert, aber nicht pruefbar: ' + bei.grund);
        }

        erfolgreich = true;
        // Kurz stehen lassen, damit die Bestaetigung im Fenster lesbar ist.
        setTimeout(schliessen, 900);
        return { ok: true };
      },

      'setup:spaeter': () => {
        schliessen();
        return true;
      },
    };

    // Die Behandler gelten nur, solange das Fenster offen ist. Ohne das
    // scheitert ein zweiter Aufruf ueber das Tray-Menue mit "second handler
    // for the same channel".
    Object.entries(behandler).forEach(([kanal, fn]) => ipcMain.handle(kanal, fn));

    function aufraeumen() {
      Object.keys(behandler).forEach((kanal) => ipcMain.removeHandler(kanal));
    }

    function schliessen() {
      if (setupWindow && !setupWindow.isDestroyed()) setupWindow.destroy();
    }

    setupWindow.on('closed', () => {
      setupWindow = null;
      aufraeumen();
      fertig(erfolgreich);
    });
  });
}

/**
 * Einrichtung aus dem Tray-Menue heraus, also bei bereits laufender App.
 * Ein neuer Schluessel wirkt erst nach einem Neustart, weil das Backend ihn
 * beim Starten als Umgebungsvariable mitbekommt - deshalb wird hier
 * ausdruecklich danach gefragt.
 */
async function handleSchluesselEintragen() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }

  const gespeichert = await zeigeEinrichtung();
  if (!gespeichert) return;

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Schluessel gespeichert',
    message: 'Der Schluessel wurde uebernommen.',
    detail:
      'Damit er ueberall greift, muss der Trophaeenschrank einmal neu starten.\n' +
      'Anmeldung, Verlauf und Einstellungen bleiben dabei erhalten.',
    buttons: ['Jetzt neu starten', 'Spaeter'],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    app.relaunch();
    app.exit(0);
  }
}

/**
 * Uebernimmt geaenderte Einstellungen, ohne die App neu zu starten.
 *
 * Das Overlay-Fenster wird dabei nur dann verschoben, wenn sich der
 * Bildschirm tatsaechlich geaendert hat - ein Fenster umzusetzen laesst es
 * kurz flackern, und das bei jedem Zug am Lautstaerkeregler waere unschoen.
 */
function wendeEinstellungenAn(vorher) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (!vorher || vorher.bildschirm !== einstellungen.bildschirm) {
      const { x, y, width, height } = gewaehlterBildschirm().bounds;
      overlayWindow.setBounds({ x, y, width, height });
      // Nach dem Umsetzen die Ebene neu behaupten, sonst rutscht das Overlay
      // auf manchen Systemen hinter andere Fenster.
      overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }
    sendToOverlay('einstellungen', einstellungenFuerOverlay());
  }

  // Das Status-Abzeichen haengt an einer Betriebsart, die sich geaendert
  // haben kann - neu aufsetzen, aber nur wenn gerade ein Spiel verfolgt wird.
  if (vorher && vorher.statusAbzeichen !== einstellungen.statusAbzeichen && trackedAppId !== null) {
    starteStatusAbzeichen();
  }
}

let settingsWindow = null;

/**
 * Einstellungsfenster.
 *
 * Warum ueberhaupt: Das Tray-Menue war auf siebzehn Eintraege angewachsen,
 * darunter Dinge, die man einmal im Leben braucht (Dateiaenderungen
 * aufzeichnen) neben solchen, die man staendig sucht. Und Groesse, Position
 * oder Lautstaerke liessen sich ueberhaupt nicht einstellen - sie standen
 * fest im Code oder in einer .env, an die niemand herankommt.
 */
function zeigeEinstellungen() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 860,
    minWidth: 640,
    minHeight: 520,
    title: 'Trophaeenschrank - Einstellungen',
    backgroundColor: '#171b23',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'settings', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings', 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());

  const uebernehmen = (roh) => {
    const vorher = einstellungen;
    einstellungen = einstellungenModul.speichern(roh);
    wendeEinstellungenAn(vorher);
    buildTrayMenu();
    return einstellungen;
  };

  const behandler = {
    'einst:laden': () => ({
      einstellungen,
      bildschirme: screen.getAllDisplays().map((d, i) => ({
        id: d.id,
        name: d.label || `Bildschirm ${i + 1}`,
        breite: d.bounds.width,
        hoehe: d.bounds.height,
        istHaupt: d.id === screen.getPrimaryDisplay().id,
      })),
      schluesselVorhanden: !schluesselFehlt(),
    }),

    'einst:speichern': (_e, roh) => uebernehmen(roh),

    'einst:zuruecksetzen': () => uebernehmen(einstellungenModul.standard()),

    'einst:ton-waehlen': async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog(settingsWindow, {
        title: 'Eigenen Ton waehlen',
        properties: ['openFile'],
        filters: [{ name: 'Tondateien', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }],
      });
      return canceled || filePaths.length === 0 ? null : filePaths[0];
    },

    'einst:test': () => {
      handleTestAchievement();
      return true;
    },

    'einst:schluessel': async () => {
      // Bewusst derselbe Weg wie ueber das Tray-Menue: Der neue Schluessel
      // wirkt im Backend erst nach einem Neustart, weil es ihn beim Starten
      // als Umgebungsvariable mitbekommt. Ohne den Hinweis traegt jemand
      // einen gueltigen Schluessel ein und wundert sich, dass weiterhin
      // nichts geht.
      await handleSchluesselEintragen();
      return !schluesselFehlt();
    },

    'einst:schliessen': () => {
      if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
      return true;
    },
  };

  Object.entries(behandler).forEach(([kanal, fn]) => ipcMain.handle(kanal, fn));

  settingsWindow.on('closed', () => {
    Object.keys(behandler).forEach((kanal) => ipcMain.removeHandler(kanal));
    settingsWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(icon);
  buildTrayMenu();
}

app.whenReady().then(async () => {
  createOverlayWindow();
  createTray();
  // Der Schluessel wird VOR dem Backend gebraucht: Es bekommt ihn beim
  // Starten als Umgebungsvariable mit. Liefe die Einrichtung erst danach,
  // arbeitete das Backend die ganze Sitzung ohne Schluessel weiter und die
  // App muesste doch neu gestartet werden.
  if (schluesselFehlt()) {
    logger.warn('Kein Steam-API-Schlüssel gesetzt - Einrichtung wird angeboten');
    updateTrayStatus('Einrichtung - Steam-Schlüssel fehlt');
    const eingerichtet = await zeigeEinrichtung();
    if (!eingerichtet) {
      updateTrayStatus('Einrichtung offen - im Tray-Menü nachholbar');
      logger.info('Einrichtung übersprungen - App wartet auf den Schlüssel');
      return;
    }
  }

  tray.setToolTip('Trophäenschrank Overlay\nStarte Backend…');

  try {
    const { child } = await ensureBackendRunning(BASE_URL, {
      PORT,
      BASE_URL,
      STEAM_API_KEY: process.env.STEAM_API_KEY,
      SESSION_SECRET: process.env.SESSION_SECRET,
    });
    backendChild = child;
  } catch (err) {
    console.error('Backend konnte nicht gestartet werden:', err.message);
    tray.setToolTip('Trophäenschrank Overlay\nBackend konnte nicht gestartet werden');
    buildTrayMenu('Backend nicht erreichbar - siehe README');
    return;
  }

  steamClient = new SteamClient(BASE_URL);

  // Updates einrichten. Die Prüfung läuft still im Hintergrund; gefragt wird
  // erst, wenn etwas bereitliegt - und nie mitten im Spiel.
  const updatesAktiv = updater.init({
    istInstalliert: app.isPackaged,
    spielLaeuftPruefung: () => trackedAppId !== null,
  });
  if (updatesAktiv) {
    setTimeout(() => updater.jetztPruefen({ stillWennAktuell: true }), 20000);
    // Danach alle sechs Stunden erneut.
    setInterval(() => updater.jetztPruefen({ stillWennAktuell: true }), 6 * 60 * 60 * 1000);
  }

  try {
    const existingUser = await steamClient.me();
    if (existingUser) {
      currentUser = existingUser;
      updateTrayStatus('Eingeloggt · aktuell kein Spiel offen');
      startPolling();
      ladeXpStand();
    } else {
      updateTrayStatus('Bereit - bitte über das Tray-Menü mit Steam anmelden');
    }
  } catch (err) {
    updateTrayStatus('Bereit - bitte über das Tray-Menü mit Steam anmelden');
  }
});

app.on('before-quit', () => {
  stopLocalWatcher();
  if (backendChild) backendChild.kill();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
