const { ladeKonfiguration, schluesselFehlt, BENUTZER_CONFIG } = require('./lib/config');
const konfig = ladeKonfiguration(__dirname);
const path = require('path');
const {
  app, BrowserWindow, Tray, Menu, screen, nativeImage, shell, dialog, ipcMain,
  globalShortcut,
} = require('electron');
const SteamClient = require('./lib/steamClient');
const { ensureBackendRunning } = require('./lib/backendManager');
const { LocalWatcher, findSteamPath } = require('./lib/localWatcher');
const ChangeRecorder = require('./lib/changeRecorder');
const updater = require('./lib/updater');
const autostart = require('./lib/autostart');
const { lesbareSpanne } = require('./lib/zeitspanne');
const vollbild = require('./lib/vollbild');
const { overlayRechteck } = require('./lib/overlayFlaeche');
const { levelAus } = require('./lib/levelKurve');
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
const todoModul = require('./lib/todo');
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

/**
 * Was in dieser Spielsitzung passiert ist.
 *
 * Wird beim Spielstart angelegt und beim Spielende zur Bilanz. Bewusst hier
 * mitgeschrieben und nicht hinterher aus dem Verlauf gelesen: Der Verlauf
 * kennt keine Sitzungsgrenzen - wer ein Spiel zweimal am Tag startet, bekaeme
 * beide Male dieselben Zahlen.
 *
 * null heisst: gerade laeuft keine Sitzung.
 */
let sitzung = null;

// Nachschlagewerk apiName -> angereichertes Achievement des aktuellen Spiels,
// damit der Schnell-Modus (der nur apiNames kennt) sofort ein vollstaendiges
// Popup bauen kann, ohne auf die Web-API zu warten.
let achievementIndex = new Map();
let letzterStand = null; // { unlockedCount, totalCount } des verfolgten Spiels

// XP-Stand: EINMAL beim Start ermittelt, danach selbst fortgeschrieben.
// Ein einzelnes Achievement bringt einen berechenbaren Zuwachs - dafuer
// muss die Bibliothek nicht erneut durchgegangen werden.
let xpStand = null; // { level, xpIntoLevel, xpForThisLevel, totalXp }
// XP bringt jedes Achievement fertig gerechnet vom Backend mit
// (scoring.bewerteSpiel). Frueher stand die Formel hier ein weiteres Mal,
// samt Kopie der Stufenfaktoren - und musste bei jeder Aenderung mitgezogen
// werden.
function xpFuer(achievement) {
  return typeof achievement.xp === 'number' ? achievement.xp : 0;
}
let localWatcher = null;
let localWatchReady = false;

// Merklisten je Spiel, aus dem Benutzerordner.
let merklisten = todoModul.laden();

/**
 * appId -> Spielname, fuer die Auswahl im Merklisten-Fenster.
 *
 * Ohne das staende dort "App 7670" statt "BioShock". Die Namen kommen beim
 * Spielstart mit und werden neben der Merkliste abgelegt - eine eigene
 * Steam-Abfrage nur fuer eine Beschriftung waere die Sache nicht wert.
 */
const NAMEN_DATEI = path_.join(os_.homedir(), '.trophaenschrank', 'spielnamen.json');
let gemerkteSpielnamen = {};
try {
  gemerkteSpielnamen = JSON.parse(fs_.readFileSync(NAMEN_DATEI, 'utf8'));
} catch (err) {
  gemerkteSpielnamen = {};
}

function merkeSpielname(appId, name) {
  if (!name || gemerkteSpielnamen[String(appId)] === name) return;
  gemerkteSpielnamen[String(appId)] = name;
  try {
    fs_.mkdirSync(path_.dirname(NAMEN_DATEI), { recursive: true });
    const tmp = `${NAMEN_DATEI}.tmp`;
    fs_.writeFileSync(tmp, JSON.stringify(gemerkteSpielnamen), 'utf8');
    fs_.renameSync(tmp, NAMEN_DATEI);
  } catch (e) {
    /* nicht kritisch - dann steht dort eben die Nummer */
  }
}
// Steht die Uebersicht gerade offen? Davon haengt ab, ob das Overlay-Fenster
// Mausklicks annimmt.
let panelWindow = null;
// Ist Steams eigenes Overlay gerade offen? Gebraucht, weil die Pruefung auf
// exklusives Vollbild einen Moment dauert - siehe zeigePanel().
let steamOverlayOffen = false;

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

  // Die Groesse EXPLIZIT noch einmal setzen. Beim Anlegen kuerzt Windows ein
  // Fenster auf die Flaeche ohne Taskleiste - nachgemessen: 3840x2120 statt
  // 3840x2160. Die Meldungen sassen dadurch 40 px ueber der Bildschirmecke und
  // verdeckten Steams Meldung, die genau dort erscheint, nicht vollstaendig.
  // Ein setBounds danach wird nicht gekuerzt.
  //
  // Aber NICHT exakt bildschirmgross: Das haelt Windows fuer eine
  // Vollbild-Anwendung und unterdrueckt dann systemweit Benachrichtigungen.
  // Warum und wie viel Rand, steht in lib/overlayFlaeche.js.
  overlayWindow.setBounds(overlayRechteck({ x, y, width, height }, einstellungen.position));

  // 'screen-saver' ist die hoechste Fensterebene, die Electron anbietet -
  // damit liegt das Overlay ueber Vollbild-Spielen im randlosen Modus.
  // relativeLevel 1 schiebt es zusaetzlich ueber andere Fenster derselben
  // Ebene (z. B. andere Overlays).
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // EINMAL und nie wieder. Jeder spaetere Aufruf von setIgnoreMouseEvents
  // wuerde diesem transparenten Fenster WS_EX_LAYERED wegnehmen und damit ein
  // Vollbildspiel minimieren - die Messung dazu steht in overlay/panel/panel.html.
  // `forward` braucht es nicht mehr: Seit die Uebersicht ein eigenes Fenster
  // hat, verfolgt hier niemand mehr den Mauszeiger.
  overlayWindow.setIgnoreMouseEvents(true);
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
      begruessungSeit = Date.now();
      overlayWindow.webContents.send('show-welcome');
    }
  });
}

/**
 * Fenster fuer die Achievement-Uebersicht.
 *
 * WARUM EIGENES FENSTER: Die Uebersicht war ein Kasten im Overlay-Fenster.
 * Damit man sie bedienen konnte, musste dieses bildschirmfuellende,
 * transparente Fenster Klicks annehmen - und genau das minimierte das Spiel.
 * Die Messung steht in overlay/panel/panel.html.
 *
 * Dieses Fenster nimmt die Maus von Anfang an an und aendert seine
 * Fensterstile deshalb nie. Es wird einmal beim Start angelegt und danach nur
 * noch ein- und ausgeblendet - ein Fenster, das es schon gibt, stoert weniger
 * als eines, das mitten im Spiel neu entsteht.
 */
function createPanelWindow() {
  const anzeige = gewaehlterBildschirm();
  const { breite, hoehe, x, y } = panelMasse(anzeige);

  panelWindow = new BrowserWindow({
    width: breite,
    height: hoehe,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    // Wie das Overlay: nicht fokussierbar. Ein Fenster, in das man tippt,
    // gehoert nicht ueber ein laufendes Spiel. Klicks kommen trotzdem an.
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'panel', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  panelWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panelWindow.loadFile(path.join(__dirname, 'panel', 'panel.html'));
}

/** Groesse und Lage der Uebersicht - mittig auf dem gewaehlten Bildschirm. */
function panelMasse(anzeige) {
  const b = anzeige.bounds;
  const breite = Math.round(Math.min(760, b.width * 0.82));
  const hoehe = Math.round(b.height * 0.78);
  return {
    breite,
    hoehe,
    x: Math.round(b.x + (b.width - breite) / 2),
    y: Math.round(b.y + (b.height - hoehe) / 2),
  };
}

function sendToPanel(kanal, nutzlast) {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  panelWindow.webContents.send(kanal, nutzlast);
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

  // Die Uebersicht ist ein eigenes Fenster und haelt eine eigene Kopie. Sie
  // bekommt nur den Namen - mehr braucht sie nicht, um den Eintrag sofort von
  // "offen" auf "erreicht" zu drehen. Tests bleiben aussen vor: Sie sollen
  // nichts umstellen, was gar nicht erreicht wurde.
  if (!nurTest) sendToPanel('achievement-erreicht', achievement.apiName);

  // Fuer die Fehlersuche: Passt das Overlay-Fenster noch zum Bildschirm? Kostet
  // nichts und haette die Frage "warum sah ich nichts?" sofort beantwortet.
  if (!nurTest && overlayWindow && !overlayWindow.isDestroyed()) {
    const f = overlayWindow.getBounds();
    const b = gewaehlterBildschirm().bounds;
    const soll = overlayRechteck(b, einstellungen.position);
    const passt =
      f.width === soll.width && f.height === soll.height && f.x === soll.x && f.y === soll.y;
    logger.info(
      `  Overlay ${f.width}x${f.height} auf Bildschirm ${b.width}x${b.height}` +
        (passt ? '' : '  <- PASST NICHT') +
        `, sichtbar: ${overlayWindow.isVisible()}, oben: ${overlayWindow.isAlwaysOnTop()}`
    );
    // Aus dem Zwischenspeicher, wenn vorhanden - keine Verzoegerung der Meldung.
    vollbild.istExklusivesVollbild().then((modus) => {
      if (modus.exklusiv) {
        logger.info('  Spiel im exklusiven Vollbild - diese Meldung ist vermutlich nicht zu sehen');
        meldeExklusivesVollbild();
      }
    });
  }

  // Fuer die Bilanz am Ende der Sitzung mitschreiben. Tests zaehlen nicht -
  // sonst stuende am Abend eine Trophaee in der Bilanz, die es nie gab.
  if (!nurTest && sitzung) {
    sitzung.erreicht.push({
      category: achievement.category,
      xp: xpInfo ? xpInfo.zuwachs : 0,
    });
  }

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

/**
 * "Zuletzt vor 3 Wochen - Silber »Kapitel 5«"
 *
 * Wer nach Wochen in ein Spiel zurueckkommt, weiss nicht mehr, wo er stand.
 * Die Meldung zeigte bisher nur "12 von 45" - das sagt nichts darueber, ob
 * das von gestern ist oder von vorletztem Jahr.
 *
 * Kostet keine Steam-Abfrage: Der Rueckblick kommt aus dem eigenen Verlauf,
 * einer Datei auf dieser Platte. Schlaegt er fehl, faellt die Zeile weg -
 * eine Spielstart-Meldung darf daran nicht haengen.
 */
async function holeRueckblick(appId) {
  try {
    const roh = await steamClient.rueckblick(appId);
    if (!roh || !roh.ts) return null;

    const wann = lesbareSpanne(roh.ts);
    // Ohne brauchbaren Zeitpunkt lieber gar nichts. Eine erfundene Angabe
    // waere schlimmer als keine - man richtet sich danach ein.
    if (!wann) return null;

    return { wann, name: roh.name, category: roh.category, anzahl: roh.anzahl };
  } catch (err) {
    return null;
  }
}

const BILANZ_MINDESTDAUER_MS = 60 * 1000;

/**
 * Bilanz am Ende einer Spielsitzung.
 *
 * Beim Spielende passierte bisher nichts Sichtbares - eine Zeile im Protokoll,
 * das war alles. Dabei ist genau das der Moment, in dem sich zeigt, ob die
 * letzten zwei Stunden etwas gebracht haben.
 *
 * WANN SIE NICHT ERSCHEINT:
 *
 *  - Ohne eine einzige Trophaee. Eine Karte, die "0 Achievements" meldet,
 *    liest sich wie ein Vorwurf. Wer nichts geholt hat, weiss das selbst.
 *  - Unter einer Minute Spielzeit. Ein Fehlstart oder ein kurzes Hineinschauen
 *    ist keine Sitzung.
 *  - Wenn sie in den Einstellungen abgeschaltet ist.
 */
function zeigeSitzungsbilanz() {
  const s = sitzung;
  sitzung = null;
  if (!s) return;

  if (einstellungen.sitzungsbilanz === false) return;
  if (s.erreicht.length === 0) return;

  const dauerMs = Date.now() - s.beginn;
  if (dauerMs < BILANZ_MINDESTDAUER_MS) return;

  const nachStufe = {};
  s.erreicht.forEach((e) => {
    nachStufe[e.category] = (nachStufe[e.category] || 0) + 1;
  });

  const xpSumme = s.erreicht.reduce((summe, e) => summe + (e.xp || 0), 0);

  const nutzlast = {
    gameName: s.gameName,
    minuten: Math.round(dauerMs / 60000),
    anzahl: s.erreicht.length,
    nachStufe,
    xp: xpSumme,
    levelVorher: s.levelVorher,
    levelNachher: xpStand ? xpStand.level : s.levelVorher,
  };

  logger.info(
    `Sitzungsbilanz ${s.gameName}: ${nutzlast.anzahl} Achievements, ` +
      `+${xpSumme} XP, ${nutzlast.minuten} Min`
  );

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('sitzungsbilanz', nutzlast);
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
    // Das Abzeichen ist genau dann sichtbar, wenn Steams Overlay offen ist -
    // also in dem Moment, in dem jemand die Uebersicht auch bedienen kann.
    // Der beste Platz fuer den Hinweis, wie man sie aufruft.
    panelTaste: einstellungen.panelTaste || '',
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
        // VOR dem Aufräumen: stopAchievementTracking() wirft trackedGameName
        // und den Achievement-Index weg, und beides steckt in der Bilanz.
        zeigeSitzungsbilanz();
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

  // Anderes Spiel, womoeglich anderer Anzeigemodus - neu fragen.
  vollbild.vergessen();
  planeVollbildPruefung(appId);

  sitzung = {
    appId,
    gameName: gameName || `App ${appId}`,
    beginn: Date.now(),
    erreicht: [],
    // Der Stand VOR der Sitzung - daraus wird spaeter "Level 15 -> 16".
    levelVorher: xpStand ? xpStand.level : null,
    xpVorher: xpStand ? xpStand.totalXp : null,
  };

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
      rueckblick: await holeRueckblick(appId),
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

  // Merkliste um das bereinigen, was inzwischen erreicht wurde - eine
  // erledigte Aufgabe soll nicht weiter auf dem Bildschirm stehen.
  const erreicht = [...achievementIndex.values()].filter((a) => a.unlocked).map((a) => a.apiName);
  const bereinigt = todoModul.entferneErreichte(merklisten, appId, erreicht);
  if (bereinigt.entfernt.length > 0) {
    merklisten = todoModul.speichern(bereinigt.listen);
    logger.info(`Merkliste: ${bereinigt.entfernt.length} erledigte Einträge entfernt`);
  }

  merkeSpielname(appId, gameName);
  sendeSpielDaten();

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
    // Zeilen, die das Overlay betreffen aber auf kein Muster passen, ins
    // Protokoll - so laesst sich die Erkennung mit echten Daten nachbessern
    // statt zu raten. Genau so wurde das Format der Statistikdateien
    // ermittelt.
    onUnknownLine: (zeile) => logger.info('Steam-Overlay, unbekannte Zeile: ' + zeile.slice(0, 160)),
    onChange: (offen) => {
      logger.info(`Steams Overlay erkannt als: ${offen ? 'offen' : 'geschlossen'}`);
      steamOverlayOffen = offen;
      sendStatusBadge(offen);
      // In Steams Overlay hineinzuzeichnen ist ausgeschlossen - unser
      // Fenster liegt aber darueber, und waehrend Steams Overlay offen ist
      // hat der Nutzer ohnehin einen Mauszeiger. Genau dann ist die
      // Uebersicht bedienbar.
      if (!einstellungen.panelBeiSteamOverlay) return;
      if (offen) {
        // `nurWennSteamOffen`: Die Vollbild-Pruefung dauert einen Moment.
        // Hat man Steams Overlay in der Zeit schon wieder zugemacht, soll
        // die Uebersicht nicht nachtraeglich allein aufgehen.
        zeigePanel(true, { nurWennSteamOffen: true });
      } else if (panelOffen()) {
        zeigePanel(false);
      }
    },
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
  clearTimeout(vollbildPruefTimer);
  // Keine Verfolgung, keine Sitzung. zeigeSitzungsbilanz() raeumt selbst auf
  // und wird VOR dieser Funktion gerufen - hier steht es noch einmal, damit
  // die Regel nicht an der Aufrufreihenfolge haengt. Ueber stopPolling()
  // landet man naemlich auch hier, und dann gibt es keine Bilanz.
  sitzung = null;

  if (achievementTimer) clearInterval(achievementTimer);
  achievementTimer = null;
  if (panelOffen()) zeigePanel(false);
  stopLocalWatcher();
  stoppeWiederholtePruefung();
  stoppeStatusAbzeichen();
  letzterStand = null;
  trackedAppId = null;
  trackedGameName = null;
  unlockedBaseline = null;
  achievementIndex = new Map();
  sendeSpielDaten();
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
      // Der Index haelt den Stand fuer Merkliste und Uebersicht.
      const bekannt = achievementIndex.get(a.apiName);
      if (bekannt) bekannt.unlocked = true;
      sendAchievementToOverlay(a);
    });

    if (newlyUnlocked.length > 0) {
      const erledigt = todoModul.entferneErreichte(
        merklisten,
        trackedAppId,
        newlyUnlocked.map((a) => a.apiName)
      );
      if (erledigt.entfernt.length > 0) merklisten = todoModul.speichern(erledigt.listen);
    }

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

/**
 * Das Tray-Menue enthaelt nur noch, was man im Vorbeigehen anklickt.
 *
 * Es war auf siebzehn Eintraege angewachsen und mischte dabei zwei ganz
 * verschiedene Dinge: das Taegliche (Dashboard, Uebersicht) und Werkzeuge,
 * die man ein- oder zweimal im Leben braucht (Dateiaenderungen aufzeichnen,
 * Autostart, Protokollordner). Ein Menue, in dem man suchen muss, ist kein
 * Menue mehr.
 *
 * Geblieben ist deshalb nur, was waehrend des Spielens gebraucht wird. Alles
 * Seltene - Abmelden, Autostart, Updates, die gesamte Diagnose und die
 * Testmeldungen - steht jetzt im Einstellungsfenster, wo Platz fuer eine
 * Erklaerung daneben ist. Im Tray war dafuer nie welcher.
 */
function buildTrayMenu(statusLine) {
  const loggedIn = !!currentUser;
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
    // Anmelden bleibt hier: Ohne das geht gar nichts, und wer nicht
    // angemeldet ist, soll es nicht erst in den Einstellungen suchen muessen.
    // Ohne die Huelle bekaeme handleLogin das MenuItem als ersten Parameter -
    // und das ist jetzt `stillerFehler`. Die Fehlermeldung bliebe aus.
    !loggedIn && { label: 'Mit Steam anmelden', click: () => handleLogin() },
    {
      label: 'Achievements des Spiels…',
      enabled: trackedAppId !== null,
      click: () => zeigePanel(true),
    },
    { label: 'Merkliste bearbeiten…', click: zeigeMerkliste },
    { label: 'Dashboard öffnen', click: () => shell.openExternal(BASE_URL) },
    { type: 'separator' },
    { label: 'Einstellungen…', click: zeigeEinstellungen },
    { label: 'Beenden', click: () => app.quit() },
  ].filter(Boolean));
  tray.setContextMenu(menu);
}

/**
 * Holt den XP-Gesamtstand. Laeuft die Berechnung noch, wird der Fortschritt
 * ins Overlay gemeldet, damit ein Ladebalken erscheint.
 */
/**
 * Level und XP fuer die Begruessung - genau EINMAL je Start.
 *
 * Die Begruessung beginnt, sobald das Overlay geladen ist; der XP-Stand kommt
 * erst, wenn das Backend laeuft. Nachgemessen an neun echten Starts: 0,9 bis
 * 6,7 Sekunden, im Median 4,3. Die Begruessungskarte wartet deshalb auf diese
 * Nachricht - und muss erfahren, wenn nichts kommt (nicht angemeldet,
 * Schluessel abgelehnt, Erstberechnung dauert Minuten). Sonst stuende sie
 * sinnlos wartend da.
 *
 * @param {object|null} stand - null heisst ausdruecklich: kein Level zu zeigen
 */
let startLevelGemeldet = false;

function meldeStartLevel(stand) {
  if (startLevelGemeldet) return;
  startLevelGemeldet = true;
  sendToOverlay(
    'start-level',
    stand
      ? {
          level: stand.level,
          xpIntoLevel: stand.xpIntoLevel,
          xpForThisLevel: stand.xpForThisLevel,
          totalXp: stand.totalXp,
        }
      : null
  );
}

async function ladeXpStand() {
  let gemeldet = false;

  for (let versuch = 0; versuch < 900; versuch++) {
    let antwort;
    try {
      antwort = await steamClient.xpSummary();
    } catch (err) {
      meldeStartLevel(null);
      return; // ohne XP-Stand laeuft alles weiter, nur ohne XP-Meldungen
    }

    // Die Berechnung ist gescheitert und wird von sich aus nicht besser -
    // dann hier ebenfalls aufhoeren zu fragen. Frueher lief diese Schleife
    // weiter und stiess bei jedem Durchlauf einen neuen, ebenso
    // aussichtslosen Versuch an.
    if (antwort.status === 'fehler') {
      meldeStartLevel(null);
      logger.warn('XP-Stand nicht verfügbar: ' + antwort.grund);
      if (gemeldet) sendToOverlay('xp-loading', { abbruch: true });
      if (antwort.schluesselProblem) {
        updateTrayStatus('Steam-Schlüssel abgelehnt - unter Einstellungen neu eintragen');
      }
      return;
    }

    if (antwort.status === 'ready') {
      xpStand = antwort;
      // Auch ein "veralteter" Stand taugt fuer die Begruessung: Er weicht
      // hoechstens um das ab, was seit der letzten Berechnung dazukam.
      meldeStartLevel(antwort);

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
    // Die Erstberechnung kann Minuten dauern; darauf wartet die Begruessung
    // nicht. Den Fortschritt zeigt der Ladebalken, das Level dann dessen Ende.
    meldeStartLevel(null);
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

/**
 * Schickt die vollstaendige Achievement-Liste des verfolgten Spiels ans
 * Overlay. Merkliste und Uebersicht arbeiten ausschliesslich damit - sie
 * fragen nie selbst bei Steam nach.
 */
function sendeSpielDaten() {
  const daten = {
    appId: trackedAppId,
    gameName: trackedGameName,
    achievements: [...achievementIndex.values()],
    merkliste: todoModul.fuerSpiel(merklisten, trackedAppId),
  };
  // Beide Fenster bekommen dasselbe. Sie halten je eine eigene Kopie, statt
  // sich gegenseitig Zustand zuzuschieben - das waere die Art Kopplung, die
  // spaeter niemand mehr durchschaut.
  sendToOverlay('spiel-daten', daten);
  sendToPanel('spiel-daten', daten);
}

/**
 * Sagt einmal je Spiel, warum die Uebersicht nicht aufgeht.
 *
 * Ohne das drueckt jemand Strg+Umschalt+A, und nichts passiert - man haelt
 * die App fuer kaputt. Die Rueckmeldung kann aber nicht im Spiel erscheinen:
 * Genau das darf ja nicht passieren. Also ins Tray (Tooltip und Statuszeile)
 * und als Windows-Benachrichtigung. Die haelt Windows selbst zurueck, solange
 * ein Spiel im exklusiven Vollbild laeuft, und zeigt sie danach - sie stoert
 * also nicht, sondern wartet.
 */
let vollbildGemeldetFuer = null;

/*
 * Ueber einem Spiel im EXKLUSIVEN Vollbild zeigt Windows fremde Fenster nicht
 * zuverlaessig an - weder unsere Meldungen noch die Uebersicht. Steam, Discord
 * und NVIDIA schaffen das nur, weil sie sich in das Spiel selbst einklinken.
 * Das kommt hier nicht in Frage: Es braucht nativen Code, und Anti-Cheat-
 * Systeme reagieren darauf, in Mehrspielerspielen bis zur Kontosperre.
 *
 * Nachgewiesen an Dead Space: vier verschiedene Meldungen, alle nachweislich
 * ausgeloest und angezeigt, Overlay sichtbar und oben - und alle unsichtbar,
 * waehrend Windows "exklusives Vollbild" meldete.
 *
 * Was bleibt: Es nicht still ins Leere laufen lassen, sondern einmal je Spiel
 * sagen, warum man nichts sieht und was hilft.
 */
function meldeExklusivesVollbild() {
  const name = trackedGameName || 'Das Spiel';
  updateTrayStatus(`${name}: exklusives Vollbild - Meldungen nur im randlosen Modus sichtbar`);

  if (vollbildGemeldetFuer === trackedAppId) return;
  vollbildGemeldetFuer = trackedAppId;
  logger.info(`${name} läuft im exklusiven Vollbild - Hinweis auf den randlosen Modus gegeben`);

  try {
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      // Windows haelt Benachrichtigungen selbst zurueck, solange ein Spiel im
      // exklusiven Vollbild laeuft, und zeigt sie danach - sie stoeren also
      // nicht, sondern warten.
      new Notification({
        title: 'Meldungen im Vollbild nicht sichtbar',
        body:
          `${name} läuft im exklusiven Vollbild. Darüber zeigt Windows fremde Fenster ` +
          'nicht zuverlässig an - Achievement-Meldungen und die Übersicht bleiben ' +
          'unsichtbar (der Ton kommt trotzdem). Stell im Spiel den Anzeigemodus auf ' +
          '„Randlos“ oder „Vollbild-Fenster“, dann ist alles zu sehen.',
        icon: path.join(__dirname, 'assets', 'app-icon.png'),
        silent: true,
      }).show();
    }
  } catch (err) {
    /* Nur ein Hinweis - wenn er nicht geht, steht es im Tray und im Protokoll. */
  }
}

/**
 * Einmal je Spiel nachsehen, ob es im exklusiven Vollbild laeuft.
 *
 * 45 Sekunden nach dem Start: Viele Spiele zeigen zuerst ein Startfenster und
 * schalten erst danach ins Vollbild - eine fruehere Abfrage saehe noch das
 * Startfenster. Die Abfrage selbst stoert das Spiel nicht (nachgemessen: Dead
 * Space blieb dabei im Vordergrund und nicht minimiert).
 */
const VOLLBILD_PRUEFUNG_NACH_MS = 45 * 1000;
let vollbildPruefTimer = null;

function planeVollbildPruefung(appId) {
  clearTimeout(vollbildPruefTimer);
  vollbildPruefTimer = setTimeout(async () => {
    if (trackedAppId !== appId) return;
    const modus = await vollbild.istExklusivesVollbild({ frisch: true });
    if (trackedAppId === appId && modus.exklusiv) meldeExklusivesVollbild();
  }, VOLLBILD_PRUEFUNG_NACH_MS);
}

/** Ist die Uebersicht gerade zu sehen? */
function panelOffen() {
  return !!panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible();
}

/**
 * Uebersicht ein- oder ausblenden.
 *
 * Nur noch show/hide - kein Umschalten von Fensterstilen mehr, weder hier
 * noch am Overlay. Genau das war der Grund, warum sich das Spiel minimierte.
 */
async function zeigePanel(sichtbar, { nurWennSteamOffen = false } = {}) {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const zeigen = sichtbar === undefined ? !panelOffen() : !!sichtbar;

  if (!zeigen) {
    panelWindow.hide();
    return;
  }

  if (achievementIndex.size === 0) {
    logger.info('Übersicht angefordert, aber kein Spiel mit Achievements verfolgt');
    return;
  }

  /*
   * NIE ueber einem Spiel im exklusiven Vollbild.
   *
   * Ein solches Spiel besitzt den Bildschirm; erscheint ein anderes Fenster
   * darueber, verliert es das exklusive Vollbild und Windows minimiert es.
   * Steams Overlay ueberlebt das nur, weil es IM Spiel steckt - unseres ist
   * ein eigenes Fenster und kann das grundsaetzlich nicht.
   *
   * Nachgemessen, nicht vermutet: Dead Space meldet hier
   * QUNS_RUNNING_D3D_FULL_SCREEN, und dort ging Steams Overlay elfmal
   * hintereinander nach 0,4 s wieder zu. Bei Galaxy Burger (randlos) blieb
   * es 8 s offen. Siehe lib/vollbild.js.
   */
  const modus = await vollbild.istExklusivesVollbild();
  if (modus.exklusiv) {
    logger.info(
      `Übersicht nicht geöffnet: ${trackedGameName || 'das Spiel'} läuft im exklusiven ` +
        'Vollbild - ein Fenster darüber würde es minimieren'
    );
    meldeExklusivesVollbild();
    return;
  }
  if (modus.zustand === 'unbekannt' && modus.fehler) {
    logger.warn('Vollbild-Prüfung fehlgeschlagen: ' + modus.fehler);
  }

  // Waehrend der Pruefung kann sich einiges getan haben.
  if (nurWennSteamOffen && !steamOverlayOffen) return;
  if (trackedAppId === null) return;

  sendeSpielDaten();
  // showInactive statt show: show() wuerde den Fokus anfordern und damit
  // Steams Overlay im selben Moment stoeren, in dem es aufgeht.
  panelWindow.showInactive();
  panelWindow.setAlwaysOnTop(true, 'screen-saver', 1);
}

function sendToOverlay(kanal, nutzlast) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send(kanal, nutzlast);
}

/**
 * Meldet bei Steam an.
 *
 * @param {boolean} [stillerFehler] - true, wenn der Aufrufer die Fehlermeldung
 *   selbst anzeigt (das Anmeldefenster tut das in der Karte). Ohne das kaeme
 *   zusaetzlich ein Systemdialog hoch, und der Anwender muesste zweimal
 *   dasselbe wegklicken.
 * @returns {Promise<{ok: boolean, name?: string, grund?: string}>}
 */
async function handleLogin(stillerFehler = false) {
  try {
    currentUser = await steamClient.login();
    updateTrayStatus('Eingeloggt · aktuell kein Spiel offen');
    startPolling();
    ladeXpStand();
    return { ok: true, name: currentUser.displayName };
  } catch (err) {
    console.error('Login abgebrochen:', err.message);
    buildTrayMenu('Login abgebrochen');

    // Haeufigste Ursache fuer einen fehlgeschlagenen Login ist ein Problem
    // mit dem API-Schluessel - das gleich mitpruefen, statt den Nutzer mit
    // einer nackten Fehlermeldung von Steam alleinzulassen.
    let grund = 'Die Anmeldung wurde abgebrochen. Du kannst es gleich noch einmal versuchen.';
    try {
      const pruefung = await steamClient.keycheck();
      if (!pruefung.ok) {
        grund = `Vermutliche Ursache: der Steam-API-Schlüssel. ${pruefung.grund}`;
        if (!stillerFehler) {
          dialog.showMessageBox({
            type: 'warning',
            title: 'Anmeldung fehlgeschlagen',
            message: 'Vermutliche Ursache: der Steam-API-Schlüssel.',
            detail: `${pruefung.grund}\n\nZu prüfen in:\n${BENUTZER_CONFIG}\nZeile STEAM_API_KEY=...`,
            buttons: ['OK'],
          });
        }
      }
    } catch (e) {
      /* nicht kritisch */
    }
    return { ok: false, grund };
  }
}

function handleLogout() {
  // Keine Bilanz beim Abmelden: Das Spiel laeuft dann ja noch, die Sitzung
  // ist nicht zu Ende - nur wir schauen nicht mehr hin.
  sitzung = null;
  stopPolling();
  steamClient.logout();
  currentUser = null;
  diamondCelebrated.clear();
  buildTrayMenu();
}

let recorder = null;

/**
 * Schaltet den Autostart ein oder aus.
 *
 * @param {boolean} gewuenscht
 * @returns {boolean} der Stand, der danach wirklich gilt - nicht der
 *   gewuenschte. Der Schalter im Einstellungsfenster springt damit zurueck,
 *   wenn es nicht geklappt hat, statt eine Luege anzuzeigen.
 */
function setzeAutostart(gewuenscht) {
  const ok = autostart.setEnabled(gewuenscht);

  if (!ok) {
    dialog.showMessageBox({
      type: 'error',
      title: 'Autostart',
      message: 'Die Einstellung konnte nicht gespeichert werden.',
      buttons: ['OK'],
    });
    return autostart.isEnabled();
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

  return autostart.isEnabled();
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
      'Meldung zeigt, in den Einstellungen unter "Diagnose" auf\n' +
      '"Aufzeichnung beenden und speichern" klicken.\n\n' +
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
    // XP wie vom Backend fuer diese Anteile gerechnet (gleitende XP).
    { category: 'Kupfer', globalPercent: 74.3, xp: 26, name: 'Erste Schritte' },
    { category: 'Silber', globalPercent: 22.8, xp: 135, name: 'Auf halbem Weg' },
    { category: 'Gold', globalPercent: 7.1, xp: 340, name: 'Meisterprüfung' },
    { category: 'Platin', globalPercent: 1.4, xp: 553, name: 'Gegen alle Widerstände' },
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
      xp: stufe.xp,
    },
    true // nurTest: XP-Stand bleibt unveraendert
  );
}

/**
 * Spielt die Diamant-Feier zur Ansicht ab.
 *
 * Die echte gibt es pro Spiel genau einmal im Leben - wer sie einstellen oder
 * auch nur einmal sehen will, haette sonst keine Moeglichkeit dazu. Am Stand
 * aendert das nichts: Die Feier ist reine Anzeige, `diamondCelebrated` wird
 * nicht angefasst.
 */
function handleTestDiamant() {
  const echtesSymbol = [...achievementIndex.values()].find((a) => a.icon)?.icon;
  sendDiamondToOverlay({
    gameName: trackedGameName || 'Beispielspiel',
    icon: echtesSymbol || '../assets/app-icon.png',
  });
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
/**
 * Overlay und Uebersicht auf die aktuelle Groesse des gewaehlten Bildschirms
 * setzen.
 *
 * Gebraucht beim Wechsel des Bildschirms in den Einstellungen - und, das fehlte
 * bis hierher ganz, wenn sich der Bildschirm SELBST aendert: andere Aufloesung,
 * Monitor ab- oder angesteckt, Skalierung geaendert. Das Overlay blieb dann in
 * der alten Groesse stehen. Alles, was an seiner unteren rechten Ecke haengt
 * (die Meldungen!), lag danach womoeglich ausserhalb des sichtbaren Bereichs.
 *
 * @returns {boolean} true, wenn sich tatsaechlich etwas geaendert hat
 */
function passeFensterAnBildschirmAn() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;
  const soll = overlayRechteck(gewaehlterBildschirm().bounds, einstellungen.position);
  const ist = overlayWindow.getBounds();
  const gleich =
    ist.x === soll.x && ist.y === soll.y && ist.width === soll.width && ist.height === soll.height;
  if (gleich) return false;

  overlayWindow.setBounds({ x: soll.x, y: soll.y, width: soll.width, height: soll.height });
  // Nach dem Umsetzen die Ebene neu behaupten, sonst rutscht das Overlay auf
  // manchen Systemen hinter andere Fenster.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  // Die Uebersicht ist ein eigenes Fenster und muss mit umziehen.
  if (panelWindow && !panelWindow.isDestroyed()) {
    const m = panelMasse(gewaehlterBildschirm());
    panelWindow.setBounds({ x: m.x, y: m.y, width: m.breite, height: m.hoehe });
    panelWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  }
  logger.info(
    `Overlay an den Bildschirm angepasst: ${ist.width}x${ist.height} -> ${soll.width}x${soll.height}`
  );
  return true;
}

function wendeEinstellungenAn(vorher) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // Auch die Ecke zaehlt: Sie bestimmt, an welcher Seite das Overlay den
    // einen Pixel Rand laesst (siehe lib/overlayFlaeche.js).
    if (
      !vorher ||
      vorher.bildschirm !== einstellungen.bildschirm ||
      vorher.position !== einstellungen.position
    ) {
      passeFensterAnBildschirmAn();
    }
    sendToOverlay('einstellungen', einstellungenFuerOverlay());
  }

  if (!vorher || vorher.panelTaste !== einstellungen.panelTaste) setzeTastenkuerzel();

  // Das Status-Abzeichen haengt an einer Betriebsart, die sich geaendert
  // haben kann - neu aufsetzen, aber nur wenn gerade ein Spiel verfolgt wird.
  if (vorher && vorher.statusAbzeichen !== einstellungen.statusAbzeichen && trackedAppId !== null) {
    starteStatusAbzeichen();
  }
}

let loginWindow = null;

/**
 * Anmeldefenster.
 *
 * WARUM ES DAS GIBT: Ohne angemeldetes Steam-Konto kann die App gar nichts -
 * keine Bibliothek, keine Achievements, keine XP. Bisher stand das nur als
 * Zeile im Tray-Menue ("Bereit - bitte ueber das Tray-Menue mit Steam
 * anmelden"). Wer das nicht las, hatte ein Programm, das schweigend nichts
 * tat. Beim allerersten Start ist das der denkbar schlechteste Eindruck.
 *
 * Es geht direkt nach der Begruessung auf - und nur dann, wenn wirklich
 * niemand angemeldet ist.
 *
 * @returns {Promise<void>} erfuellt, sobald das Fenster geschlossen ist
 */
function zeigeAnmeldung() {
  return new Promise((fertig) => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.focus();
      fertig();
      return;
    }

    loginWindow = new BrowserWindow({
      width: 620,
      // Nachgemessen: Die Karte ist 501 px hoch, dazu die Titelleiste. Bei
      // 620 blieb unten ein Streifen leer, und ein Fenster mit Luft am Ende
      // sieht aus, als fehle dort etwas.
      height: 540,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Mit Steam anmelden',
      backgroundColor: '#171b23',
      // Erst zeigen, wenn fertig gezeichnet - sonst blitzt ein weisses
      // Fenster auf, und das ist hier das Erste, was man von der App sieht.
      show: false,
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'assets', 'app-icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'login', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    loginWindow.loadFile(path.join(__dirname, 'login', 'login.html'));
    loginWindow.once('ready-to-show', () => loginWindow.show());

    const behandler = {
      'anmeldung:pfad': () => BENUTZER_CONFIG,

      'anmeldung:starten': async () => {
        // stillerFehler: Das Fenster zeigt den Grund selbst in seiner Karte.
        const ergebnis = await handleLogin(true);
        if (ergebnis.ok) {
          // Kurz stehen lassen, damit die Bestaetigung lesbar ist.
          setTimeout(() => {
            if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
          }, 1800);
        }
        return ergebnis;
      },

      'anmeldung:spaeter': () => {
        if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
        return true;
      },
    };

    Object.entries(behandler).forEach(([kanal, fn]) => ipcMain.handle(kanal, fn));

    loginWindow.on('closed', () => {
      Object.keys(behandler).forEach((kanal) => ipcMain.removeHandler(kanal));
      loginWindow = null;
      if (!currentUser) {
        updateTrayStatus('Nicht angemeldet - über das Symbol in der Taskleiste nachholbar');
      }
      fertig();
    });
  });
}

let merkWindow = null;

/**
 * Merklisten-Fenster - ein GEWOEHNLICHES Fenster, kein Overlay.
 *
 * Warum getrennt vom Panel im Spiel: Die Liste zu pflegen heisst tippen, und
 * ein Fenster, das Tastatureingaben annimmt, muss den Fokus bekommen. Damit
 * ist man aus dem laufenden Spiel heraus - das laesst sich nicht
 * wegprogrammieren, es ist die Natur eines Overlays. Deshalb sind die beiden
 * Taetigkeiten getrennt:
 *
 *   im Spiel  - nachsehen und klicken (Haken, Zaehler), nie Fokus
 *   hier      - schreiben, umbenennen, aufraeumen, in Ruhe
 */
function zeigeMerkliste() {
  if (merkWindow && !merkWindow.isDestroyed()) {
    merkWindow.focus();
    return;
  }

  merkWindow = new BrowserWindow({
    width: 760,
    height: 820,
    minWidth: 620,
    minHeight: 520,
    title: 'Trophaeenschrank - Merkliste',
    backgroundColor: '#171b23',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'merkliste', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  merkWindow.loadFile(path.join(__dirname, 'merkliste', 'merkliste.html'));
  merkWindow.once('ready-to-show', () => merkWindow.show());
  merkWindow.on('closed', () => {
    merkWindow = null;
  });
}

/**
 * Antwort an das Merklisten-Fenster. Immer der vollstaendige Stand des
 * angefragten Spiels - so muss die Seite nie raten, was gespeichert wurde.
 */
function merkFensterAntwort(appId, grund = null) {
  return { merkliste: todoModul.fuerSpiel(merklisten, appId), grund };
}

/** Nach einer Aenderung auch das laufende Overlay auffrischen. */
function merkGeaendert(appId) {
  if (String(appId) === String(trackedAppId)) sendeSpielDaten();
  if (merkWindow && !merkWindow.isDestroyed()) merkWindow.webContents.send('merk-neu');
}

let settingsWindow = null;

/**
 * Der Teil des Zustands, den das Einstellungsfenster anzeigt, aber nicht
 * selbst kennt. Bewusst an einer Stelle: Jede Aktion dort gibt das hier
 * zurueck, damit das Fenster nach einem Klick nie einen veralteten Stand
 * zeigt - etwa "Angemeldet als ..." nach dem Abmelden.
 */
function programmStand() {
  return {
    version: app.getVersion(),
    angemeldetAls: currentUser ? currentUser.displayName : null,
    autostartVerfuegbar: autostart.isAvailable(),
    autostartAn: autostart.isAvailable() ? autostart.isEnabled() : false,
    zeichnetAuf: !!recorder,
    updatesMoeglich: app.isPackaged,
  };
}

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
      programm: programmStand(),
    }),

    // Alles ab hier ist aus dem Tray-Menue hierher gezogen. Es wird selten
    // gebraucht und braucht dann eine Erklaerung daneben - genau das, wofuer
    // in einem Kontextmenue kein Platz ist.
    'einst:programm': () => programmStand(),

    'einst:autostart': (_e, an) => setzeAutostart(!!an),

    'einst:abmelden': () => {
      handleLogout();
      return programmStand();
    },

    'einst:updates': () => {
      updater.jetztPruefen();
      return true;
    },

    'einst:beenden': () => {
      app.quit();
      return true;
    },

    'einst:test-diamant': () => {
      handleTestDiamant();
      return true;
    },

    'einst:diagnose': async () => {
      await handleDiagnose();
      return true;
    },

    'einst:keycheck': async () => {
      await handleKeycheck();
      return true;
    },

    'einst:protokoll': (_e, ordner) => {
      shell.openPath(ordner ? logger.logDir : logger.logFile);
      return true;
    },

    'einst:aufzeichnung': async () => {
      if (recorder) stopRecording();
      else await startRecording();
      return programmStand();
    },

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

/**
 * Tastenkuerzel fuer die Uebersicht.
 *
 * Warum nicht Shift+Tab: Das gehoert Steam. Es abzufangen wuerde das
 * Steam-Overlay selbst stoeren - und darauf ist im Spiel Verlass, auf uns
 * nicht. Stattdessen ein eigenes Kuerzel, das ueberall funktioniert, plus
 * das automatische Aufgehen, sobald Steams Overlay erkannt wird.
 */
/*
 * Testmeldung per Tastenkuerzel - IM SPIEL, ohne es zu verlassen.
 *
 * Die Testknoepfe in den Einstellungen taugen dafuer nicht: Um sie zu
 * druecken, muss man aus dem Spiel heraus, und genau das veraendert den
 * Zustand, der geprueft werden soll (Vollbild, Fensterreihenfolge).
 *
 * Entstanden bei der Fehlersuche zum exklusiven Vollbild: Vier Varianten der
 * Meldung - bis hin zu ihrem Aussehen vom 18.09. - waren ueber Dead Space
 * ALLE unsichtbar, waehrend Windows "exklusives Vollbild" meldete. Damit war
 * klar, dass es nicht am Aussehen lag. Die Varianten sind wieder entfernt;
 * das Kuerzel bleibt, weil es genau fuer solche Pruefungen gebraucht wird.
 */
const TEST_TASTE = 'Control+Alt+Shift+T';

function handleTestImSpiel() {
  handleTestAchievement();
  const fenster = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow.getBounds() : null;
  const bild = gewaehlterBildschirm().bounds;
  vollbild.istExklusivesVollbild({ frisch: true }).then((modus) => {
    logger.info(
      'Testmeldung per Tastenkürzel - ' +
        `Fenster ${fenster ? `${fenster.width}x${fenster.height}` : '-'}, ` +
        `Bildschirm ${bild.width}x${bild.height}, Windows meldet: ${modus.zustand}`
    );
  });
}

function setzeTastenkuerzel() {
  globalShortcut.unregisterAll();

  try {
    if (globalShortcut.register(TEST_TASTE, handleTestImSpiel)) {
      logger.info(`Testmeldung im Spiel: ${TEST_TASTE}`);
    } else {
      logger.warn(`Tastenkürzel ${TEST_TASTE} ist belegt - Testmeldung im Spiel nicht verfügbar`);
    }
  } catch (err) {
    logger.warn(`Tastenkürzel ${TEST_TASTE} nicht verwendbar: ${err.message}`);
  }

  const taste = (einstellungen.panelTaste || '').trim();
  if (!taste) return;

  try {
    const ok = globalShortcut.register(taste, () => zeigePanel());
    if (ok) logger.info(`Tastenkürzel für die Übersicht: ${taste}`);
    else logger.warn(`Tastenkürzel ${taste} ist belegt - Übersicht nur über das Tray-Menü`);
  } catch (err) {
    logger.warn(`Tastenkürzel ${taste} nicht verwendbar: ${err.message}`);
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(icon);
  buildTrayMenu();
}

// Merkliste und Mausfang gelten fuer die ganze Laufzeit, nicht nur solange
// ein Fenster offen ist - deshalb hier und nicht in einem Fensterbehandler.
/** Antwort an die Uebersicht - immer der vollstaendige, gerade gueltige Stand. */
function merklisteAntwort(grund = null) {
  return { merkliste: todoModul.fuerSpiel(merklisten, trackedAppId), grund };
}

ipcMain.handle('merk:laden', (_e, gewuenscht) => {
  // Welche Spiele hier ueberhaupt zur Auswahl stehen: das laufende, und
  // alle, fuer die schon einmal etwas eingetragen wurde. Andere waeren
  // sinnlos - ohne Achievement-Liste liesse sich dort nichts anhaken.
  const namen = new Map();
  if (trackedAppId !== null) {
    namen.set(String(trackedAppId), trackedGameName || `App ${trackedAppId}`);
  }
  Object.keys(merklisten).forEach((id) => {
    if (!namen.has(id)) namen.set(id, gemerkteSpielnamen[id] || `App ${id}`);
  });

  const spiele = [...namen.entries()].map(([id, name]) => ({
    appId: Number(id),
    name,
    laeuft: String(trackedAppId) === id,
  }));

  // Vorauswahl: das gewuenschte, sonst das laufende, sonst das erste.
  let appId = gewuenscht ?? trackedAppId ?? (spiele.length > 0 ? spiele[0].appId : null);
  if (appId !== null && !spiele.some((s) => s.appId === Number(appId))) appId = spiele[0]?.appId ?? null;

  return {
    appId,
    spiele,
    max: todoModul.MAX_JE_SPIEL,
    // Achievements gibt es nur fuer das laufende Spiel - fuer andere liegen
    // sie nicht im Speicher dieses Prozesses.
    achievements:
      String(appId) === String(trackedAppId) ? [...achievementIndex.values()] : [],
    merkliste: todoModul.fuerSpiel(merklisten, appId),
  };
});

ipcMain.handle('merk:haken', (_e, appId, apiName, angehakt) => {
  const r = todoModul.setze(merklisten, appId, apiName, angehakt);
  if (r.geaendert) {
    merklisten = todoModul.speichern(r.listen);
    merkGeaendert(appId);
  }
  return merkFensterAntwort(appId, r.grund);
});

ipcMain.handle('merk:notiz-hinzu', (_e, appId, daten) => {
  const r = todoModul.notizHinzufuegen(merklisten, appId, daten);
  if (r.notiz) {
    merklisten = todoModul.speichern(r.listen);
    merkGeaendert(appId);
    logger.info(`Merkliste: eigener Eintrag (${r.notiz.art}) angelegt fuer App ${appId}`);
  }
  return merkFensterAntwort(appId, r.grund);
});

ipcMain.handle('merk:notiz-aendern', (_e, appId, id, aenderung) => {
  const r = todoModul.notizAendern(merklisten, appId, id, aenderung);
  if (r.geaendert) {
    merklisten = todoModul.speichern(r.listen);
    merkGeaendert(appId);
  }
  return merkFensterAntwort(appId, r.grund);
});

ipcMain.handle('merk:notiz-weg', (_e, appId, id) => {
  const r = todoModul.notizEntfernen(merklisten, appId, id);
  if (r.geaendert) {
    merklisten = todoModul.speichern(r.listen);
    merkGeaendert(appId);
  }
  return merkFensterAntwort(appId);
});

ipcMain.handle('merk:schliessen', () => {
  if (merkWindow && !merkWindow.isDestroyed()) merkWindow.close();
  return true;
});

ipcMain.handle('merkliste:setzen', (_e, apiName, angehakt) => {
  const ergebnis = todoModul.setze(merklisten, trackedAppId, apiName, angehakt);
  if (ergebnis.geaendert) {
    merklisten = todoModul.speichern(ergebnis.listen);
    logger.info(`Merkliste: ${apiName} ${angehakt ? 'gesetzt' : 'entfernt'}`);
  }
  return merklisteAntwort(ergebnis.grund);
});

ipcMain.handle('merkliste:notiz-aendern', (_e, id, aenderung) => {
  const ergebnis = todoModul.notizAendern(merklisten, trackedAppId, id, aenderung);
  if (ergebnis.geaendert) {
    merklisten = todoModul.speichern(ergebnis.listen);
    logger.info(`Merkliste: eigener Eintrag geändert (App ${trackedAppId})`);
  }
  return merklisteAntwort(ergebnis.grund);
});

ipcMain.handle('panel:schliessen', () => {
  zeigePanel(false);
  return true;
});

/**
 * Nur EINE Instanz zulassen.
 *
 * Warum das hier fehlte, faellt mit dem Autostart zusammen: Faehrt der Rechner
 * hoch, startet die App - und wer sie danach von Hand noch einmal startet,
 * haette zwei Overlays, zwei Symbole in der Taskleiste und zwei Versuche, das
 * Backend auf demselben Port zu starten. Von aussen sieht das aus, als sei
 * die App kaputt.
 *
 * Der zweite Start beendet sich sofort wieder und meldet dem ersten Bescheid.
 */
const istEinzigeInstanz = app.requestSingleInstanceLock();
if (!istEinzigeInstanz) app.quit();

app.on('second-instance', () => {
  logger.info('Zweiter Start erkannt - es läuft bereits eine Instanz');
  // Es gibt kein Hauptfenster, das man nach vorn holen koennte. Wer die App
  // erneut startet, sucht sie meist - und wenn etwas offen ist, dann das
  // Anmeldefenster, weil ohne Konto ohnehin nichts geht.
  if (!currentUser) zeigeAnmeldung();
  else updateTrayStatus(trackedGameName ? `Verfolge: ${trackedGameName}` : 'Läuft bereits');
});

/**
 * Wie lange die Begruessung noch laeuft.
 *
 * Sie beginnt, sobald das Overlay geladen ist, und dauert 5,8 s (siehe
 * showWelcomeToast in overlay/overlay.js). Bis das Backend steht und Steam
 * geantwortet hat, ist davon meist schon einiges vorbei - gewartet wird
 * deshalb nur der Rest, nicht noch einmal die volle Zeit.
 */
const BEGRUESSUNG_MS = 5800;

function restDerBegruessung() {
  // Beim Start durchs Hochfahren gibt es gar keine Begruessung.
  if (autostart.wasAutoStarted() || !begruessungSeit) return 400;
  return Math.max(400, BEGRUESSUNG_MS - (Date.now() - begruessungSeit));
}

let begruessungSeit = null;

app.whenReady().then(async () => {
  // Beim zweiten Start ist app.quit() schon angestossen - hier nichts mehr
  // aufbauen, sonst blitzen Fenster auf, die gleich wieder verschwinden.
  if (!istEinzigeInstanz) return;

  createOverlayWindow();
  createPanelWindow();
  createTray();

  // Aufloesung geaendert, Monitor ab- oder angesteckt, Skalierung umgestellt:
  // Das Overlay muss mitwandern. Kurz verzoegert, weil Windows diese Meldungen
  // beim Umschalten oft mehrfach hintereinander schickt.
  let bildschirmTimer = null;
  const beiBildschirmAenderung = () => {
    clearTimeout(bildschirmTimer);
    bildschirmTimer = setTimeout(passeFensterAnBildschirmAn, 300);
  };
  screen.on('display-metrics-changed', beiBildschirmAenderung);
  screen.on('display-added', beiBildschirmAenderung);
  screen.on('display-removed', beiBildschirmAenderung);
  setzeTastenkuerzel();
  // Der Schluessel wird VOR dem Backend gebraucht: Es bekommt ihn beim
  // Starten als Umgebungsvariable mit. Liefe die Einrichtung erst danach,
  // arbeitete das Backend die ganze Sitzung ohne Schluessel weiter und die
  // App muesste doch neu gestartet werden.
  if (schluesselFehlt()) {
    logger.warn('Kein Steam-API-Schlüssel gesetzt - Einrichtung wird angeboten');
    updateTrayStatus('Einrichtung - Steam-Schlüssel fehlt');
    const eingerichtet = await zeigeEinrichtung();
    if (!eingerichtet) {
      meldeStartLevel(null);
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
    meldeStartLevel(null);
    console.error('Backend konnte nicht gestartet werden:', err.message);
    tray.setToolTip('Trophäenschrank Overlay\nBackend konnte nicht gestartet werden');
    buildTrayMenu('Backend nicht erreichbar - siehe README');
    return;
  }

  // Das Symbol bekommt es mit, weil dasselbe Fenster beim Anmelden sichtbar
  // geschaltet wird - ohne stuende dort Electrons Standardsymbol.
  steamClient = new SteamClient(BASE_URL, path.join(__dirname, 'assets', 'app-icon.png'));

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

  // Einen bereits bestehenden Autostart-Eintrag in die heutige Form bringen.
  // Wer ihn eingeschaltet hat, als er noch auf blankes Electron zeigte,
  // bekaeme sonst weiter beim Hochfahren ein leeres Electron-Fenster.
  if (autostart.pflegeEintrag()) {
    logger.info('Autostart-Eintrag in der aktuellen Form neu geschrieben');
  }

  let angemeldet = false;
  try {
    const existingUser = await steamClient.me();
    if (existingUser) {
      currentUser = existingUser;
      angemeldet = true;
      updateTrayStatus('Eingeloggt · aktuell kein Spiel offen');
      startPolling();
      ladeXpStand();
    }
  } catch (err) {
    /* Kein Konto erkannt - unten wird danach gefragt. */
  }

  if (!angemeldet) {
    meldeStartLevel(null);
    updateTrayStatus('Nicht angemeldet');
    // Erst die Begruessung zu Ende laufen lassen. Zwei Dinge, die
    // gleichzeitig um Aufmerksamkeit bitten, sind eines zu viel - und die
    // Begruessung ist genau dann am Bildschirm, wenn dieses Fenster aufginge.
    // Mindestens 1,1 s: So lange braucht die Karte, um nach dem "kein Level"
    // von eben auszublenden (0,4 s Nachlauf + 0,6 s Ausblenden).
    setTimeout(zeigeAnmeldung, Math.max(1100, restDerBegruessung()));
  }
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  stopLocalWatcher();
  if (backendChild) backendChild.kill();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});
