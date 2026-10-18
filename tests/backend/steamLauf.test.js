const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const L = require(path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'steamLauf.js'));

/**
 * Welches Spiel läuft - gefragt beim Steam-Client auf diesem Rechner.
 *
 * WARUM DIESER WEG: Die Web-Abfrage antwortet nur, wenn im Steam-Profil die
 * Spieldetails öffentlich stehen und der Status nicht auf "Unsichtbar" ist.
 * Genau daran lag es schon einmal, dass die App scheinbar nichts tat. Die
 * Registry weiß es ohne beides - und ohne Steam-Anfrage.
 *
 * Die beiden Irrtümer, die hier teuer wären: Eine fehlende Antwort als "kein
 * Spiel" zu lesen (dann endet mitten im Spielen die Sitzung samt Bilanz), und
 * eine unverständliche Ausgabe als AppID (dann verfolgt die App ein Spiel, das
 * es nicht gibt).
 */

// --- Was reg.exe ausgibt -----------------------------------------------------

const AUSGABE = (hex) => `
HKEY_CURRENT_USER\\Software\\Valve\\Steam
    RunningAppID    REG_DWORD    0x${hex}
`;

test('Die laufende AppID wird aus der Ausgabe gelesen', () => {
  // 0x4a2 = 1186. Hexadezimal, wie reg.exe es schreibt.
  assert.strictEqual(L.deuteAusgabe(AUSGABE('4a2')), 1186);
  assert.strictEqual(L.deuteAusgabe(AUSGABE('205f26')), 2121510, 'Tenebris Somnia');
  assert.strictEqual(L.deuteAusgabe(AUSGABE('205F26')), 2121510, 'auch in Großbuchstaben');
});

test('0 heißt: kein Spiel', () => {
  // Das ist der Normalfall und ausdrücklich eine Antwort, kein Fehlen.
  assert.strictEqual(L.deuteAusgabe(AUSGABE('0')), 0);
});

test('Eine unverständliche Ausgabe ergibt null, keine erfundene AppID', () => {
  for (const unsinn of [
    '',
    '   ',
    null,
    undefined,
    'FEHLER: Der angegebene Schlüssel wurde nicht gefunden.',
    'RunningAppID REG_SZ irgendwas',
    '    EineAndereZahl    REG_DWORD    0x4a2',
  ]) {
    assert.strictEqual(L.deuteAusgabe(unsinn), null, JSON.stringify(unsinn));
  }
});

test('Andere Werte im selben Schlüssel stören nicht', () => {
  const ausgabe = `
HKEY_CURRENT_USER\\Software\\Valve\\Steam
    SteamPath    REG_SZ    d:/programme/steam_programm
    RunningAppID    REG_DWORD    0x3e7
    SteamExe    REG_SZ    d:/programme/steam_programm/steam.exe
`;
  assert.strictEqual(L.deuteAusgabe(ausgabe), 999);
});

// --- Was ein Wechsel bedeutet ------------------------------------------------

test('Von nichts auf eine AppID ist ein Spielstart', () => {
  assert.deepStrictEqual(L.wechsel(0, 1186), { art: 'start', appId: 1186 });
  assert.deepStrictEqual(L.wechsel(null, 1186), { art: 'start', appId: 1186 });
});

test('Von einer AppID auf 0 ist ein Spielende', () => {
  assert.deepStrictEqual(L.wechsel(1186, 0), { art: 'ende', appId: 1186 });
});

test('Direkt von einem Spiel ins nächste zählt als Start', () => {
  // Steam setzt den Wert um, ohne über 0 zu gehen.
  assert.deepStrictEqual(L.wechsel(1186, 420), { art: 'start', appId: 420 });
});

test('Keine Antwort beendet NIEMALS eine Sitzung', () => {
  // Der teure Irrtum: Ein einzelner Fehlschlag der Abfrage mitten im Spiel
  // würde sonst die Sitzung samt Bilanz beenden - und die Bilanz gibt es pro
  // Sitzung nur einmal.
  assert.deepStrictEqual(L.wechsel(1186, null), { art: 'nichts', appId: null });
  assert.deepStrictEqual(L.wechsel(null, null), { art: 'nichts', appId: null });
});

test('Unveränderter Stand meldet nichts', () => {
  assert.strictEqual(L.wechsel(1186, 1186).art, 'nichts');
  assert.strictEqual(L.wechsel(0, 0).art, 'nichts');
  // Beim allerersten Blick steht dort 0 - das ist kein Spielende.
  assert.strictEqual(L.wechsel(null, 0).art, 'nichts');
});

test('Der Schlüssel ist der von Steam', () => {
  assert.strictEqual(L.SCHLUESSEL, 'HKCU\\Software\\Valve\\Steam');
});
