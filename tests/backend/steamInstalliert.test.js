const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const I = require('../../backend/services/steamInstalliert');

/**
 * Welche Spiele liegen auf diesem Rechner?
 *
 * Steam führt je installiertem Spiel eine Datei
 * `<Bibliothek>/steamapps/appmanifest_<appid>.acf`. Das kostet keine
 * Steam-Abfrage — die Web-API kennt die Angabe ohnehin nicht.
 *
 * Der Irrtum, der hier teuer wäre: „Datei da = installiert". Ein Manifest
 * entsteht auch für ein Spiel, das gerade erst heruntergeladen wird. Ein
 * grüner Balken an einem Spiel, das erst noch geladen werden muss, wäre eine
 * Falschaussage.
 */

// --- Der Zustand aus StateFlags ---------------------------------------------

test('Bit 4 heißt installiert - auch zusammen mit anderen Bits', () => {
  // An den 179 Manifesten dieses Rechners nachgezählt: 172x StateFlags 4,
  // 6x StateFlags 6 (fertig + Update fällig), 1x 518 (fertig + Update
  // pausiert). Alle drei sind installiert.
  assert.strictEqual(I.istFertig(4), true, 'fertig');
  assert.strictEqual(I.istFertig(6), true, 'fertig, Update fällig');
  assert.strictEqual(I.istFertig(518), true, 'fertig, Update pausiert');
});

test('Ohne Bit 4 ist nichts installiert', () => {
  // 1026 = 1024 (Update läuft) + 2 (Update nötig): wird gerade geladen.
  assert.strictEqual(I.istFertig(1026), false, 'lädt noch');
  assert.strictEqual(I.istFertig(0), false);
  assert.strictEqual(I.istFertig(2), false, 'nur Update nötig');
  assert.strictEqual(I.istFertig(1), false, 'deinstalliert');
});

test('Eine fehlende oder unsinnige Angabe gilt nicht als installiert', () => {
  for (const unsinn of [undefined, null, '', 'viel', NaN, {}]) {
    assert.strictEqual(I.istFertig(unsinn), false, JSON.stringify(unsinn));
  }
  // Eine Zahl als Text ist dagegen in Ordnung - so steht sie in der Datei.
  assert.strictEqual(I.istFertig('4'), true);
});

// --- Die Bibliotheksliste ----------------------------------------------------

const VDF = `"libraryfolders"
{
	"0"
	{
		"path"		"D:\\\\Programme\\\\Steam_Programm"
		"label"		""
		"apps"
		{
			"228280"		"3346563019"
		}
	}
	"1"
	{
		"path"		"E:\\\\SteamLibrary"
		"label"		""
	}
}`;

test('Die Pfade werden aus libraryfolders.vdf gelesen', () => {
  // Genau der Fall dieses Rechners: zwei Bibliotheken auf zwei Laufwerken.
  assert.deepStrictEqual(I.bibliotheken(VDF), ['D:\\Programme\\Steam_Programm', 'E:\\SteamLibrary']);
});

test('Doppelte Pfade stehen nur einmal in der Liste', () => {
  const doppelt = '"path" "D:\\\\Steam"\n"path" "D:\\\\Steam"';
  assert.deepStrictEqual(I.bibliotheken(doppelt), ['D:\\Steam']);
});

test('Eine kaputte oder leere Datei ergibt eine leere Liste', () => {
  for (const unsinn of ['', null, undefined, 'kein VDF', '{"json": true}']) {
    assert.deepStrictEqual(I.bibliotheken(unsinn), [], JSON.stringify(unsinn));
  }
});

// --- Ein einzelnes Manifest --------------------------------------------------

const MANIFEST = `"AppState"
{
	"appid"		"1150690"
	"universe"		"1"
	"name"		"OMORI"
	"StateFlags"		"4"
	"installdir"		"OMORI"
}`;

test('AppID, Zustand und Name werden aus dem Manifest gelesen', () => {
  assert.deepStrictEqual(I.deuteManifest(MANIFEST), {
    appId: 1150690,
    flags: 4,
    name: 'OMORI',
  });
});

test('Ohne AppID ist das Manifest wertlos', () => {
  assert.strictEqual(I.deuteManifest('"AppState" { "name" "Ohne Nummer" }'), null);
  assert.strictEqual(I.deuteManifest(''), null);
  assert.strictEqual(I.deuteManifest(null), null);
});

test('Ein Manifest ohne StateFlags zählt nicht als installiert', () => {
  // Zusammen mit istFertig(): Das Spiel fiele durch, statt still durchzugehen.
  const ohne = I.deuteManifest('"AppState" { "appid" "123" "name" "X" }');
  assert.strictEqual(ohne.appId, 123);
  assert.strictEqual(I.istFertig(ohne.flags), false);
});
