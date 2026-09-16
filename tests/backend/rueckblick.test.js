const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Eigener Ordner je Testlauf, damit nichts aus der echten Installation
// gelesen oder überschrieben wird.
const TESTDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trophaenschrank-rueckblick-'));
process.env.DATA_DIR = TESTDIR;
process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const history = require('../../backend/services/history');

test.after(() => {
  fs.rmSync(TESTDIR, { recursive: true, force: true });
});

/**
 * Der Rückblick steht in der Spielstart-Meldung: "Zuletzt vor 3 Wochen ·
 * Silber »Kapitel 5«". Die drei Dinge, die dabei schiefgehen können, sind
 * genau die hier geprüften: falsches Spiel, falscher Spieler, falscher
 * Eintrag als "der letzte".
 */

const ICH = '76561198000000001';
const ANDERER = '76561198000000002';

function melde({ appId, name, category, steamId = ICH, gameName = 'Testspiel' }) {
  history.achievementFreigeschaltet({
    steamId,
    appId,
    gameName,
    achievement: { apiName: 'A_' + name, name, category, globalPercent: 10 },
    xpZuwachs: 100,
    level: 5,
  });
}

// --- Die Zusicherungen --------------------------------------------------------

test('Ohne Einträge gibt es null - nicht etwa einen leeren Eintrag', () => {
  // Wichtig, weil die Meldung daran entscheidet, ob sie die Zeile überhaupt
  // zeigt. Ein leeres Objekt ergäbe "Zuletzt undefined".
  assert.strictEqual(history.rueckblick({ appId: 999999 }), null);
});

test('Ohne appId gibt es null statt irgendeines Spiels', () => {
  assert.strictEqual(history.rueckblick({ appId: null }), null);
  assert.strictEqual(history.rueckblick({}), null);
});

test('Der jüngste Eintrag des Spiels wird gefunden', () => {
  melde({ appId: 100, name: 'Erstes', category: 'Kupfer' });
  melde({ appId: 100, name: 'Zweites', category: 'Silber' });
  melde({ appId: 100, name: 'Drittes', category: 'Gold' });

  const r = history.rueckblick({ appId: 100 });
  assert.strictEqual(r.name, 'Drittes');
  assert.strictEqual(r.category, 'Gold');
  assert.strictEqual(r.anzahl, 3);
  assert.ok(r.ts > 0, 'ein Zeitstempel muss dabei sein');
});

test('Ein anderes Spiel färbt nicht ab', () => {
  melde({ appId: 200, name: 'Fremdes', category: 'Platin' });

  const r = history.rueckblick({ appId: 100 });
  assert.strictEqual(r.name, 'Drittes', 'der Eintrag von App 200 gehört hier nicht hin');
  assert.strictEqual(r.anzahl, 3);
});

test('Die appId darf als Zahl oder als Text kommen', () => {
  // Steam liefert sie mal so, mal so - und aus der Datei kommt sie als Text
  // zurück, während das Overlay eine Zahl schickt.
  assert.strictEqual(history.rueckblick({ appId: '100' }).name, 'Drittes');
  assert.strictEqual(history.rueckblick({ appId: 100 }).name, 'Drittes');
});

test('Einträge eines anderen Steam-Kontos zählen nicht mit', () => {
  // Ein gemeinsam genutzter Rechner darf nicht dazu führen, dass jemand
  // fremde Trophäen als seine letzten angezeigt bekommt.
  melde({ appId: 300, name: 'Von wem anders', category: 'Gold', steamId: ANDERER });
  melde({ appId: 300, name: 'Von mir', category: 'Kupfer', steamId: ICH });

  const meins = history.rueckblick({ appId: 300, steamId: ICH });
  assert.strictEqual(meins.name, 'Von mir');
  assert.strictEqual(meins.anzahl, 1, 'nur der eigene Eintrag');

  const fremd = history.rueckblick({ appId: 300, steamId: ANDERER });
  assert.strictEqual(fremd.name, 'Von wem anders');
  assert.strictEqual(fremd.anzahl, 1);
});

test('Ohne steamId werden alle Konten gezählt', () => {
  const alle = history.rueckblick({ appId: 300 });
  assert.strictEqual(alle.anzahl, 2);
});
