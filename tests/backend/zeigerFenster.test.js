const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const Z = require(path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'zeigerFenster.js'));

/**
 * Darf der Klickfänger an dieser Stelle auf einen Doppelklick warten?
 *
 * DER FEHLER, DEN DIESE ENTSCHEIDUNG BEHEBT: Der Fänger liegt auf der
 * obersten Fensterebene und lag damit auch über einem Browser oder Editor, in
 * dem gerade gearbeitet wurde. Nachgemessen, mit einem fokussierten Fenster
 * darunter: Fänger bekommt den Doppelklick (1x), Arbeitsfenster nichts (0x).
 * Genau so hat ein Doppelklick im Arbeitsfenster ein Spiel gestartet.
 *
 * Irrt die Entscheidung in die eine Richtung, schluckt der Schrank fremde
 * Klicks. Irrt sie in die andere, lässt sich kein Spiel mehr starten. Beide
 * Richtungen stehen hier.
 */

const zeile = (hwnd, klasse, wurzel, wurzelKlasse) =>
  `${hwnd} ${klasse} ${wurzel} ${wurzelKlasse}`;

// --- Die Antwort des Skripts deuten -----------------------------------------

test('Eine Antwortzeile wird in ihre vier Teile zerlegt', () => {
  const a = Z.deuteZeile(zeile(66606, 'WorkerW', 66606, 'WorkerW'));
  assert.deepStrictEqual(a, { hwnd: 66606, klasse: 'WorkerW', wurzel: 66606, wurzelKlasse: 'WorkerW' });
});

test('Unbrauchbare Ausgabe ergibt null, nicht etwas Geratenes', () => {
  for (const unsinn of ['', '   ', 'FEHLER irgendwas', '123 nur zwei', null, undefined, '\r\n']) {
    assert.strictEqual(Z.deuteZeile(unsinn), null, JSON.stringify(unsinn));
  }
});

test('Zeilenenden und zusätzliche Leerzeichen stören nicht', () => {
  const a = Z.deuteZeile('  131072   Chrome_WidgetWin_1   66606   WorkerW  \r\n');
  assert.strictEqual(a.hwnd, 131072);
  assert.strictEqual(a.wurzelKlasse, 'WorkerW');
});

// --- Die Entscheidung --------------------------------------------------------

test('Unser eigenes Schrankfenster zählt - auch als Kind von WorkerW', () => {
  // Im Hintergrundmodus ist der Schrank ein KIND von WorkerW. Unter dem
  // Zeiger liegt dann unser Fenster, sein oberster Vorfahr ist der Desktop.
  const a = Z.deuteZeile(zeile(131072, 'Chrome_WidgetWin_1', 66606, 'WorkerW'));
  assert.strictEqual(Z.istSchrankSichtbar(a, [131072]), true);
});

test('Der blanke Desktop zählt auch ohne unsere Fensternummer', () => {
  assert.strictEqual(Z.istSchrankSichtbar(Z.deuteZeile(zeile(1, 'WorkerW', 1, 'WorkerW')), []), true);
  assert.strictEqual(Z.istSchrankSichtbar(Z.deuteZeile(zeile(2, 'Progman', 2, 'Progman')), []), true);
});

test('Die Symbolliste des Desktops zählt mit', () => {
  // Sie liegt ÜBER dem Hintergrundbild. Zählte sie nicht mit, wäre der
  // Schrank ausgerechnet dort tot, wo die Desktop-Symbole stehen.
  const a = Z.deuteZeile(zeile(300, 'SysListView32', 2, 'Progman'));
  assert.strictEqual(Z.istSchrankSichtbar(a, []), true);
  const b = Z.deuteZeile(zeile(301, 'SHELLDLL_DefView', 2, 'Progman'));
  assert.strictEqual(Z.istSchrankSichtbar(b, []), true);
});

test('Ein fremdes Fenster darüber sperrt den Fänger', () => {
  // Der eigentliche Fall: ein Browser über dem Schrank.
  const a = Z.deuteZeile(zeile(900, 'Chrome_WidgetWin_1', 900, 'Chrome_WidgetWin_1'));
  assert.strictEqual(Z.istSchrankSichtbar(a, [131072]), false);
  // Und ein Explorer-Fenster ebenso.
  const b = Z.deuteZeile(zeile(901, 'CabinetWClass', 901, 'CabinetWClass'));
  assert.strictEqual(Z.istSchrankSichtbar(b, [131072]), false);
});

test('Keine Antwort heißt: kein Fänger', () => {
  // Lieber kein Fänger als einer, der fremde Klicks schluckt. Antwortet die
  // Prüfung nicht (nicht gestartet, zu langsam, PowerShell gesperrt), bleibt
  // er zu - das Starten per Doppelklick entfällt dann, mehr nicht.
  assert.strictEqual(Z.istSchrankSichtbar(null, [131072]), false);
  assert.strictEqual(Z.istSchrankSichtbar(undefined, []), false);
});

test('Unsinnige Fensternummern werden nicht als unsere gezählt', () => {
  const a = Z.deuteZeile(zeile(900, 'Chrome_WidgetWin_1', 900, 'Chrome_WidgetWin_1'));
  assert.strictEqual(Z.istSchrankSichtbar(a, [NaN, undefined, null]), false);
});

test('Die Desktop-Klassen sind vollständig benannt', () => {
  // Fehlt eine davon, ist der Schrank auf einem Teil des Desktops tot.
  for (const k of ['Progman', 'WorkerW', 'SHELLDLL_DefView', 'SysListView32']) {
    assert.ok(Z.DESKTOP.has(k), k);
  }
});

// --- Das Skript selbst --------------------------------------------------------

test('Das PowerShell-Skript liegt neben dem Modul und antwortet je Zeile', () => {
  // Es wird eingelesen und als Text übergeben - in der installierten Fassung
  // liegt es in app.asar, und daraus kann PowerShell nichts starten.
  const fs = require('node:fs');
  const skript = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'zeigerFenster.ps1'),
    'utf8'
  );
  assert.ok(/WindowFromPoint/.test(skript), 'muss WindowFromPoint benutzen');
  assert.ok(/GetAncestor/.test(skript), 'muss den obersten Vorfahr ermitteln');
  assert.ok(/ReadLine/.test(skript), 'muss dauerhaft auf Zeilen warten');
  assert.ok(/BEREIT/.test(skript), 'muss seine Bereitschaft melden');
});

/* ==========================================================================
   Verspätete Antworten
   ==========================================================================
   DER FEHLER: Eine Frage, die in die Zeitgrenze lief, wurde aus der Schlange
   genommen — ihre Antwort kam aber trotzdem und landete beim NÄCHSTEN Frager.
   Von da an war jede Antwort eine zu alt, und der Klickfänger entschied anhand
   einer Zeigerposition von vorhin.

   Beim Messen fiel es so auf: Drei Abfragen an drei verschiedenen Stellen
   lieferten dreimal dasselbe Fenster.
   ========================================================================== */

test('Eine verspätete Antwort wird übersprungen, nicht weitergereicht', () => {
  // Geprüft am Quelltext, weil der Ablauf an einem laufenden PowerShell-Prozess
  // hängt: Was zählt, ist dass die Zeitgrenze sich die Antwort vormerkt und
  // der Empfang sie wegwirft.
  const fs = require('node:fs');
  const quelle = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'zeigerFenster.js'),
    'utf8'
  );
  assert.ok(/ueberspringen \+= 1/.test(quelle), 'die Zeitgrenze muss sich das vormerken');
  assert.ok(
    /if \(ueberspringen > 0\)[\s\S]{0,80}continue/.test(quelle),
    'der Empfang muss eine vorgemerkte Antwort wegwerfen'
  );
  // Und beim Neustart des Helfers darf nichts davon übrig bleiben.
  const beende = quelle.slice(quelle.indexOf('function beende'));
  assert.ok(/ueberspringen = 0/.test(beende.slice(0, 400)), 'beim Beenden zurücksetzen');
});

test('main.js: Die Wache kann den Fänger auch anlegen, nicht nur zeigen', () => {
  // DER FEHLER: Sie stieg aus, wenn es das Fenster noch gar nicht gab. Nach
  // einem Fehlschlag der ersten Prüfung - etwa während der ein bis zwei
  // Sekunden, die der Zeigerhelfer zum Starten braucht - blieb der Fänger für
  // diese Packung für immer weg.
  const fs = require('node:fs');
  const quelle = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'overlay', 'main.js'),
    'utf8'
  );
  const wache = quelle.slice(quelle.indexOf('function starteKlickWache'));
  const code = wache.slice(0, wache.indexOf('}, 250);'));
  assert.ok(
    !/if \(!klickFenster \|\| klickFenster\.isDestroyed\(\)\) return;/.test(code),
    'die Wache darf bei fehlendem Fenster nicht aussteigen'
  );
  assert.ok(/zeigeFaenger\(letztesKlickziel\)/.test(code), 'sie muss ihn anlegen können');
});
