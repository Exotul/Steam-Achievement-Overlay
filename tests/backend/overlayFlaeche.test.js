const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { overlayRechteck } = require(
  path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'overlayFlaeche.js')
);

/**
 * Das Overlay-Fenster muss zwei Dinge gleichzeitig erfuellen - und beides ist
 * nachgemessen, nicht vermutet:
 *
 *  - Die eingestellte Ecke exakt treffen, damit unsere Meldung Steams Meldung
 *    vollstaendig verdeckt.
 *  - Den Bildschirm NICHT exakt abdecken. Sonst haelt Windows das Overlay fuer
 *    eine Vollbild-Anwendung und unterdrueckt systemweit Benachrichtigungen.
 */

const BILDSCHIRM = { x: 0, y: 0, width: 3840, height: 2160 };
const ZWEITER = { x: 3840, y: 0, width: 3840, height: 2160 };
const POSITIONEN = ['oben-rechts', 'oben-links', 'unten-rechts', 'unten-links'];

const rechts = (r) => r.x + r.width;
const unten = (r) => r.y + r.height;

test('Nie exakt bildschirmgross - bei keiner Position', () => {
  for (const pos of POSITIONEN) {
    const r = overlayRechteck(BILDSCHIRM, pos);
    const exakt =
      r.x === BILDSCHIRM.x && r.y === BILDSCHIRM.y &&
      r.width === BILDSCHIRM.width && r.height === BILDSCHIRM.height;
    assert.ok(!exakt, `${pos}: exakt bildschirmgross - Windows wuerde Benachrichtigungen unterdruecken`);
  }
});

test('Genau ein Pixel frei, nicht mehr', () => {
  // Mehr Rand braucht es nicht (gemessen), und jeder weitere Pixel waere
  // ein Stueck Bildschirm, auf dem keine Meldung stehen kann.
  for (const pos of POSITIONEN) {
    const r = overlayRechteck(BILDSCHIRM, pos);
    const frei = BILDSCHIRM.width * BILDSCHIRM.height - r.width * r.height;
    assert.strictEqual(frei, BILDSCHIRM.width, `${pos}: genau eine Pixelzeile frei`);
  }
});

test('Die eingestellte Ecke wird exakt getroffen', () => {
  const erwartet = {
    'unten-rechts': (r) => rechts(r) === rechts(BILDSCHIRM) && unten(r) === unten(BILDSCHIRM),
    'unten-links': (r) => r.x === BILDSCHIRM.x && unten(r) === unten(BILDSCHIRM),
    'oben-rechts': (r) => rechts(r) === rechts(BILDSCHIRM) && r.y === BILDSCHIRM.y,
    'oben-links': (r) => r.x === BILDSCHIRM.x && r.y === BILDSCHIRM.y,
  };
  for (const [pos, trifft] of Object.entries(erwartet)) {
    assert.ok(trifft(overlayRechteck(BILDSCHIRM, pos)), `${pos}: Ecke verfehlt`);
  }
});

test('Der freie Pixel liegt der eingestellten Ecke gegenueber', () => {
  // Unten verankert: oben frei. Oben verankert: unten frei.
  assert.strictEqual(overlayRechteck(BILDSCHIRM, 'unten-rechts').y, 1);
  assert.strictEqual(overlayRechteck(BILDSCHIRM, 'unten-links').y, 1);
  assert.strictEqual(unten(overlayRechteck(BILDSCHIRM, 'oben-rechts')), 2159);
  assert.strictEqual(unten(overlayRechteck(BILDSCHIRM, 'oben-links')), 2159);
});

test('Auf einem zweiten Bildschirm stimmt die Lage ebenso', () => {
  // Der zweite Monitor beginnt nicht bei x = 0. Ein Rechenfehler, der das
  // uebersieht, legt das Overlay auf den falschen Bildschirm.
  const r = overlayRechteck(ZWEITER, 'unten-rechts');
  assert.strictEqual(r.x, 3840);
  assert.strictEqual(rechts(r), 7680);
  assert.strictEqual(unten(r), 2160);
});

test('Eine unbekannte Position ergibt trotzdem kein exakt deckendes Fenster', () => {
  const r = overlayRechteck(BILDSCHIRM, 'mitte');
  assert.ok(r.width * r.height < BILDSCHIRM.width * BILDSCHIRM.height);
});
