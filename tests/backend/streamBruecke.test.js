const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const B = require('../../overlay/lib/streamBruecke');

/**
 * Die Brücke zum Stream-Overlay.
 *
 * Zwei Dinge müssen stimmen: Was rausgeht, muss vollständig und begrenzt
 * sein - und ein nicht laufendes Overlay darf die App nie aufhalten.
 */

test('Eine Achievement-Meldung bringt alles mit, was das Overlay zeichnet', () => {
  const m = B.baueMeldung('achievement', {
    name: 'Nur die Härtesten',
    beschreibung: 'Ohne einen einzigen Tod.',
    spiel: 'Dead Space',
    stufe: 'Blutig',
    prozent: 0.1,
    xp: 899.4,
    symbol: 'https://beispiel/icon.jpg',
    level: 78,
  });
  assert.strictEqual(m.art, 'achievement');
  assert.strictEqual(m.name, 'Nur die Härtesten');
  assert.strictEqual(m.stufe, 'Blutig');
  assert.strictEqual(m.prozent, 0.1);
  assert.strictEqual(m.xp, 899, 'XP werden gerundet geschickt');
  assert.ok(m.zeit > 0);
});

test('Lange Texte werden gekürzt, statt das Overlay zu sprengen', () => {
  const m = B.baueMeldung('achievement', { name: 'x'.repeat(500), spiel: 'y'.repeat(500) });
  assert.strictEqual(m.name.length, 140);
  assert.strictEqual(m.spiel.length, 60);
});

test('Fehlende Angaben werden zu null, nicht zu NaN', () => {
  // NaN überlebt JSON nicht - aus ihm würde unterwegs null, aber erst nach
  // einer stillen Umwandlung. Lieber gleich ehrlich.
  const m = B.baueMeldung('achievement', { prozent: 'keine Zahl', xp: undefined });
  assert.strictEqual(m.prozent, null);
  assert.strictEqual(m.xp, null);
  assert.strictEqual(m.stufe, 'Kupfer', 'ohne Stufe die unterste');
});

test('Level- und Diamant-Meldungen haben ihre eigenen Felder', () => {
  const l = B.baueMeldung('level', { level: 79, xpIntoLevel: 120.6, xpForThisLevel: 3000 });
  assert.deepStrictEqual(
    { ...l, zeit: 0 },
    { art: 'level', zeit: 0, level: 79, xpIntoLevel: 121, xpForThisLevel: 3000 }
  );

  const d = B.baueMeldung('diamant', { spiel: 'Hollow Knight', symbol: 'bild.png', anzahl: 24 });
  assert.strictEqual(d.art, 'diamant');
  assert.strictEqual(d.spiel, 'Hollow Knight');
  assert.strictEqual(d.anzahl, 24);
});

test('Eine unbekannte Art wird zur Testmeldung, nicht zu etwas Halbem', () => {
  assert.strictEqual(B.baueMeldung('quatsch').art, 'test');
});

// --- Die Adresse -----------------------------------------------------------

test('Nur http und https sind erlaubte Adressen', () => {
  // Die Adresse steht in einer Datei, die jeder bearbeiten kann. Sie wird
  // nicht blind benutzt.
  assert.ok(B.pruefeAdresse('http://127.0.0.1:6660/api/trophaee'));
  assert.ok(B.pruefeAdresse('https://stream.example/api'));
  for (const murks of ['file:///C:/Windows/system32', 'ftp://host/x', 'kein-url', '', null, 42]) {
    assert.strictEqual(B.pruefeAdresse(murks), null, String(murks));
  }
});

// --- Das Schicken ----------------------------------------------------------

test('Die Meldung kommt als JSON an', async () => {
  const empfangen = [];
  const server = http.createServer((req, res) => {
    let roh = '';
    req.on('data', (d) => (roh += d));
    req.on('end', () => {
      empfangen.push({ methode: req.method, typ: req.headers['content-type'], daten: JSON.parse(roh) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/trophaee`;

  const ergebnis = await B.sende(url, B.baueMeldung('achievement', { name: 'Test', stufe: 'Gold' }));
  assert.strictEqual(ergebnis.ok, true);
  assert.strictEqual(ergebnis.status, 200);
  assert.strictEqual(empfangen[0].methode, 'POST');
  assert.ok(empfangen[0].typ.includes('application/json'));
  assert.strictEqual(empfangen[0].daten.name, 'Test');
  assert.strictEqual(empfangen[0].daten.stufe, 'Gold');

  server.close();
});

test('Läuft kein Overlay, gibt es einen Grund statt eines Fehlers', async () => {
  // Der häufigste Fall überhaupt: Das Overlay ist nicht gestartet. Das darf
  // die Achievement-Erkennung nicht aufhalten und nichts werfen.
  const ergebnis = await B.sende('http://127.0.0.1:1/api/trophaee', B.baueMeldung('test'));
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.grund, 'ein Grund muss dabeistehen');
});

test('Eine unbrauchbare Adresse wird gar nicht erst angefunkt', async () => {
  const ergebnis = await B.sende('file:///C:/Windows', B.baueMeldung('test'));
  assert.deepStrictEqual(ergebnis, { ok: false, grund: 'adresse' });
});

test('Ein hängender Server blockiert die App nicht', async () => {
  // Antwortet das Overlay gar nicht, wird nach der Frist abgebrochen.
  const server = http.createServer(() => {
    /* absichtlich keine Antwort */
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/trophaee`;

  const start = Date.now();
  const ergebnis = await B.sende(url, B.baueMeldung('test'));
  const dauer = Date.now() - start;

  assert.strictEqual(ergebnis.ok, false);
  assert.strictEqual(ergebnis.grund, 'zeit');
  assert.ok(dauer < B.FRIST_MS + 1500, `hat ${dauer} ms gedauert`);

  server.closeAllConnections?.();
  server.close();
});

test('Ausgeschaltet geht gar nichts hinaus', () => {
  // melde() ist der Weg, den der Hauptprozess nimmt. Ohne Schalter passiert
  // nichts - auch kein Versuch, der im Protokoll landet.
  assert.doesNotThrow(() => B.melde({ streamAktiv: false, streamUrl: 'http://127.0.0.1:1/' }, 'test', {}));
  assert.doesNotThrow(() => B.melde(null, 'test', {}));
});
