const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');

/**
 * Das Walkthrough-Fenster, geprüft am Quelltext.
 *
 * Warum am Quelltext und nicht an Funktionen: Alles, was hier schiefgehen
 * kann, steckt in der Verdrahtung - im Fenster selbst, im CSS und in den drei
 * Stellen, über die es aufgeht. Dafür gibt es keine reine Funktion, die man
 * aufrufen könnte; sehr wohl aber Entscheidungen, die nicht still
 * zurückgedreht werden dürfen.
 *
 * Jeder Test hier steht für einen Fehler, der beim Bauen tatsächlich passiert
 * ist oder der die ausdrückliche Auflage verletzen würde: Das Fenster DARF
 * während des Spielens offen bleiben.
 */

const WURZEL = path.resolve(__dirname, '..', '..');
const lies = (...teile) => fs.readFileSync(path.join(WURZEL, ...teile), 'utf8');

const main = lies('overlay', 'main.js');
const guideJs = lies('overlay', 'schrank', 'guide.js');
const guideCss = lies('overlay', 'schrank', 'guide.css');
const klickHtml = lies('overlay', 'schrank', 'klick.html');

// --- Es darf beim Spielen offen bleiben --------------------------------------

test('Das Fenster nimmt beim Aufgehen nie den Fokus', () => {
  // show() statt showInactive() würde ein Vollbildspiel minimieren - genau
  // das, was dieses Fenster niemals tun darf.
  assert.ok(/guideFenster\.showInactive\(\)/.test(main), 'showInactive() muss es sein');
  const stelle = main.indexOf('async function zeigeGuide');
  const abschnitt = main.slice(stelle, stelle + 3000);
  assert.ok(
    !/alwaysOnTop:\s*true/.test(abschnitt),
    'der Walkthrough darf nicht über anderen Fenstern liegen'
  );
});

test('Der Klickfänger tritt zurück, solange der Walkthrough offen ist', () => {
  // Der Fänger liegt ganz oben, der Walkthrough bewusst nicht. Ohne diese
  // Abfrage nähme ein unsichtbares Fenster dem Walkthrough die Klicks weg -
  // derselbe Fehler, der schon einmal ein Spiel gestartet hat.
  assert.ok(
    /guideFenster && !guideFenster\.isDestroyed\(\)[\s\S]{0,120}verbergeFaenger\(\)/.test(main),
    'bei offenem Walkthrough muss verbergeFaenger() greifen'
  );
});

// --- Die drei Wege hinein ------------------------------------------------------

test('Mittlere Maustaste im Schrank und Knopf in der Liste', () => {
  assert.ok(/e\.button === 1/.test(klickHtml), 'auxclick muss auf Taste 1 prüfen');
  assert.ok(/klickAPI\.guide\(\)/.test(klickHtml), 'der Klickfänger muss guide() rufen');
  assert.ok(/ipcMain\.on\('schrank:guide'/.test(main), "'schrank:guide' muss es geben");
  assert.ok(/ipcMain\.on\('liste:guide'/.test(main), "'liste:guide' muss es geben");
});

test('Welches Spiel gemeint ist, sagt nie das Fenster', () => {
  // Im Walkthrough läuft eine fremde Webseite. Ein Fenster, das seine eigene
  // appId mitschickt, wäre ein Fenster, dem man glauben müsste.
  const stelle = main.indexOf("ipcMain.on('liste:guide'");
  const abschnitt = main.slice(stelle, stelle + 500);
  assert.ok(/listeDaten\.appId/.test(abschnitt), 'die appId muss aus listeDaten kommen');
});

// --- Die fremde Seite bleibt eingesperrt ----------------------------------------

test('Die Guide-Seite kommt an nichts von der App heran', () => {
  assert.ok(/will-attach-webview/.test(main), 'das Webview muss beschnitten werden');
  const stelle = main.indexOf('will-attach-webview');
  const abschnitt = main.slice(stelle, stelle + 400);
  assert.ok(/delete webPreferences\.preload/.test(abschnitt), 'kein Preload im Webview');
  assert.ok(/nodeIntegration = false/.test(abschnitt), 'kein Node im Webview');
  assert.ok(/contextIsolation = true/.test(abschnitt), 'getrennte Welten im Webview');
});

test('Nur Webadressen gehen nach draußen', () => {
  // Ohne diese Prüfung wäre ein Link auf der fremden Seite der Weg, mit dem
  // eine Webseite etwas auf diesem Rechner startet (file:, javascript:, …).
  const stelle = main.indexOf('function oeffneExtern');
  const abschnitt = main.slice(stelle, stelle + 700);
  assert.ok(/protocol !== 'http:'/.test(abschnitt), 'http muss geprüft werden');
  assert.ok(/protocol !== 'https:'/.test(abschnitt), 'https muss geprüft werden');
  assert.ok(
    abschnitt.indexOf('shell.openExternal') > abschnitt.indexOf("protocol !== 'https:'"),
    'erst prüfen, dann öffnen'
  );
});

// --- Das, was im Bild zu sehen war ----------------------------------------------

test('Zugeklappte Überlagerungen sind auch wirklich weg', () => {
  // Nachgesehen im Bild: `display: flex` sticht das eingebaute `hidden` aus.
  // Ohne diese beiden Regeln blieb die Ladedecke über dem Guide liegen und
  // der leere Auswahlkasten stand beim Aufgehen mitten im Fenster.
  assert.ok(/\.laedt\[hidden\]\s*\{\s*display:\s*none/.test(guideCss), '.laedt[hidden] fehlt');
  assert.ok(
    /\.auswahl\[hidden\]\s*\{\s*display:\s*none/.test(guideCss),
    '.auswahl[hidden] fehlt'
  );
});

// --- Der gemerkte Scrollstand ------------------------------------------------------

test('Nach dem Springen wird nachgelesen, was angekommen ist', () => {
  /*
   * Nachgemessen bei Dead Space: Direkt nach dem Laden ist die Seite noch
   * nicht so hoch, wie sie wird, und Chromium kappt den Sprung auf das
   * damalige Seitenende - aus 4200 wurden 3752. Wer nur einmal springt und
   * nicht nachliest, merkt sich den falschen Stand, und die Fundstelle
   * wandert mit jedem Abend weiter ab.
   */
  const stelle = guideJs.indexOf('async function springeZumStand');
  assert.ok(stelle > 0, 'springeZumStand() muss es geben');
  const abschnitt = guideJs.slice(stelle, stelle + 1600);
  assert.ok(/for \(const ms of NACHFASSEN\)/.test(abschnitt), 'es muss nachgefasst werden');
  assert.ok(
    /gesetzt = await el\.web\.executeJavaScript\('document\.scrollingElement\.scrollTop'\)/.test(
      abschnitt
    ),
    'nach dem Setzen muss nachgelesen werden'
  );
  // Verglichen wird gegen den selbst gesetzten Wert, NICHT gegen das Ziel:
  // Sonst gilt die Kappung als "da scrollt jemand", und es bleibt beim
  // falschen Stand - genau dieser Fehler war schon einmal drin.
  assert.ok(
    /Math\.abs\(ist - gesetzt\) > EIGENBEWEGUNG/.test(abschnitt),
    'der Vergleich muss gegen den gesetzten Wert gehen'
  );
});

test('Gemerkt wird erst, wenn die Seite still hält', () => {
  assert.ok(/if \(!aktiverGuide \|\| !darfMelden\) return/.test(guideJs), 'meldeStand() muss warten');
  assert.ok(/darfMelden = false/.test(guideJs), 'beim Guide-Wechsel muss es zurückgesetzt werden');
});
