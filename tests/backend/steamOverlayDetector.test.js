const test = require('node:test');
const assert = require('node:assert');

const { bewerteZeile } = require('../../overlay/lib/steamOverlayDetector');

/**
 * Diese Bewertung entscheidet, ob die App glaubt, Steams Overlay sei offen.
 * Sie war zweimal falsch, und beide Male mit spürbaren Folgen:
 *
 *  1. `enable` galt als "sichtbar". Steam schreibt beim Start Zeilen wie
 *     "GameOverlayRenderer enabled" - das heißt nur, dass die Funktion
 *     eingeschaltet ist. Die App hielt das Overlay dadurch von Anfang an für
 *     geöffnet und blendete ihre Übersicht dauerhaft ein.
 *  2. `activated` ohne Wortgrenze. In "deactivated" steckt "activated" - die
 *     Zeile, die das Schließen meldet, wurde als Öffnen gelesen. Damit ging
 *     das Overlay in der Wahrnehmung der App nie wieder zu.
 *
 * Das Format ist von Valve nicht zugesichert. Diese Tests halten deshalb
 * nicht fest, was Steam schreibt, sondern was die Bewertung daraus machen
 * muss - besonders in den Fällen, die schon einmal schiefgingen.
 */

// --- Echte Zeilen von einem Spielrechner --------------------------------------

/**
 * Aufgezeichnet aus gameoverlay_renderer.txt, während zweimal Shift+Tab
 * gedrückt wurde. Das sind keine ausgedachten Beispiele, sondern das, was
 * Steam tatsächlich schreibt - und damit der eigentliche Maßstab.
 */
const ECHT_AUF = [
  'Mon Sep 07 08:37:17 2026 UTC - Detected hot-key via base input, now requesting overlay enable',
  'Mon Sep 07 08:37:17 2026 UTC - Showing overlay and saving cursor show count: -7',
];
const ECHT_ZU = [
  'Mon Sep 07 08:37:24 2026 UTC - Detected hot-key via base input, now requesting overlay disable',
  'Mon Sep 07 08:37:24 2026 UTC - Hiding overlay and restoring cursor show count: -7',
];

test('Die echten Öffnen-Zeilen werden erkannt', () => {
  ECHT_AUF.forEach((z) => assert.strictEqual(bewerteZeile(z), 'auf', z));
});

test('Die echten Schließen-Zeilen werden erkannt', () => {
  ECHT_ZU.forEach((z) => assert.strictEqual(bewerteZeile(z), 'zu', z));
});

test('Die Wortstellung darf keine Rolle spielen', () => {
  // Der dritte Fehler: Das Muster verlangte "overlay" VOR dem Zustandswort.
  // Steam schreibt aber "Showing overlay ..." - damit wurde gar nichts
  // erkannt, obwohl die Zeile eindeutig war.
  assert.strictEqual(bewerteZeile('Showing overlay'), 'auf');
  assert.strictEqual(bewerteZeile('overlay is showing'), 'auf');
  assert.strictEqual(bewerteZeile('Hiding overlay'), 'zu');
  assert.strictEqual(bewerteZeile('overlay is hiding'), 'zu');
});

test('"cursor show count" wird nicht als "showing" missverstanden', () => {
  // Steht in BEIDEN echten Zeilen, auch in der zum Schließen.
  assert.strictEqual(bewerteZeile('Hiding overlay and restoring cursor show count: -9'), 'zu');
});

// --- Die beiden echten Fehler ------------------------------------------------

test('Eine Startzeile über die eingeschaltete Funktion ist KEIN offenes Overlay', () => {
  // Der Fehler, der die Übersicht dauerhaft eingeblendet hat. "enabled" heißt
  // nur, dass die Funktion bereitsteht - nicht, dass das Overlay offen ist.
  assert.strictEqual(bewerteZeile('GameOverlayRenderer enabled'), null);
  assert.strictEqual(bewerteZeile('Steam overlay: renderer enabled for this process'), null);
  assert.strictEqual(bewerteZeile('overlay hook installed, overlay is enabled'), null);

  // Die ausdrückliche Anforderung dagegen schon - sie ist eindeutig.
  assert.strictEqual(bewerteZeile('now requesting overlay enable'), 'auf');
  assert.strictEqual(bewerteZeile('now requesting overlay disable'), 'zu');
});

test('"deactivated" wird nicht als "activated" gelesen', () => {
  // Der Fehler, wegen dem sich die Übersicht nie wieder schloss.
  assert.strictEqual(bewerteZeile('Game overlay deactivated'), 'zu');
  assert.strictEqual(bewerteZeile('GameOverlay deactivated for appid 440'), 'zu');
});

test('Im Zweifel gilt "geschlossen"', () => {
  // Ein fälschlich geschlossenes Overlay kostet einen Tastendruck. Ein
  // fälschlich offenes blendet etwas ein, das niemand angefordert hat.
  assert.strictEqual(bewerteZeile('overlay activated ... now deactivated'), 'zu');
});

// --- Normale Fälle -----------------------------------------------------------

test('Eindeutige Meldungen werden richtig gelesen', () => {
  for (const zeile of ['Game overlay activated', 'overlay shown', 'Overlay is now visible']) {
    assert.strictEqual(bewerteZeile(zeile), 'auf', zeile);
  }
  for (const zeile of ['overlay hidden', 'Overlay closed', 'overlay dismissed']) {
    assert.strictEqual(bewerteZeile(zeile), 'zu', zeile);
  }
});

test('Die Schreibweise mit Zahlenwert wird erkannt', () => {
  assert.strictEqual(bewerteZeile('Setting overlay active: 1'), 'auf');
  assert.strictEqual(bewerteZeile('Setting overlay active: 0'), 'zu');
  assert.strictEqual(bewerteZeile('overlay active=1'), 'auf');
  assert.strictEqual(bewerteZeile('overlay active 0'), 'zu');
});

test('Der Zahlenwert schlägt eine mehrdeutige Formulierung', () => {
  // Er ist eindeutig, wo die Worte es nicht sind.
  assert.strictEqual(bewerteZeile('overlay enabled, active: 0'), 'zu');
});

// --- Alles andere ------------------------------------------------------------

test('Zeilen ohne Bezug zum Overlay werden nicht bewertet', () => {
  for (const zeile of ['', '   ', 'Loading shaders', 'activated something else', null, undefined]) {
    assert.strictEqual(bewerteZeile(zeile), null, String(zeile));
  }
});

test('Eine Overlay-Zeile ohne bekanntes Muster gilt als unbekannt', () => {
  // Sie wird nicht geraten, sondern zur Nachbesserung protokolliert.
  assert.strictEqual(bewerteZeile('overlay: something entirely new happened'), null);
});

test('Groß- und Kleinschreibung ist egal', () => {
  assert.strictEqual(bewerteZeile('GAME OVERLAY ACTIVATED'), 'auf');
  assert.strictEqual(bewerteZeile('game overlay HIDDEN'), 'zu');
});
