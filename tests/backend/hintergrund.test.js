const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const H = require('../../overlay/lib/hintergrund');

/**
 * Der Hintergrundmodus des Spieleschranks.
 *
 * Geprüft wird alles, was ohne Windows prüfbar ist: wie die Antwort des
 * PowerShell-Skripts gelesen wird und wo das Fenster danach liegen muss.
 */

test('Die Antwort des Skripts wird richtig gelesen', () => {
  assert.deepStrictEqual(H.deuteAntwort('OK 66620'), { ok: true, workerW: '66620', grund: null });
  assert.deepStrictEqual(H.deuteAntwort('GELOEST'), { ok: true, workerW: null, grund: null });
  assert.deepStrictEqual(H.deuteAntwort('FEHLER kein-progman'), {
    ok: false,
    workerW: null,
    grund: 'kein-progman',
  });
});

test('Warnungen vor der Antwort stören nicht', () => {
  // PowerShell schreibt gelegentlich Hinweise in dieselbe Ausgabe.
  const roh = 'WARNUNG: Irgendetwas\n\nOK 12345\n';
  assert.strictEqual(H.deuteAntwort(roh).workerW, '12345');
});

test('Der XML-Fortschrittsbericht von PowerShell gilt nicht als Antwort', () => {
  // Genau daran scheiterte es: PowerShell schiebt beim ersten Aufruf einen
  // Fortschrittsbericht auf die Fehlerausgabe. Er stand NACH unserer Zeile,
  // das Umhaengen hatte laengst geklappt - gemeldet wurde trotzdem ein
  // Fehler.
  const roh = [
    'OK 66620',
    '<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">',
    '<Obj S="progress"><MS><AV>Module werden vorbereitet.</AV></MS></Obj></Objs>',
  ].join('\n');
  assert.deepStrictEqual(H.deuteAntwort(roh), { ok: true, workerW: '66620', grund: null });
});

test('Steht gar keine unserer Zeilen da, ist es ein Fehlschlag', () => {
  assert.deepStrictEqual(H.deuteAntwort('<Objs>irgendwas</Objs>'), {
    ok: false,
    workerW: null,
    grund: 'keine-antwort',
  });
});

test('Eine leere Antwort gilt als Fehlschlag', () => {
  for (const nichts of ['', null, undefined, '   \n ']) {
    const a = H.deuteAntwort(nichts);
    assert.strictEqual(a.ok, false);
    assert.strictEqual(a.grund, 'keine-antwort');
  }
});

test('Die Fensterkennung wird aus dem Puffer gelesen', () => {
  const puffer = Buffer.alloc(8);
  puffer.writeBigUInt64LE(66620n);
  assert.strictEqual(H.lesbareKennung(puffer), '66620');

  // Ein Nullzeiger ist keine Kennung - damit darf nichts umgehängt werden.
  assert.strictEqual(H.lesbareKennung(Buffer.alloc(8)), null);
  assert.strictEqual(H.lesbareKennung(null), null);
  assert.strictEqual(H.lesbareKennung(Buffer.alloc(2)), null);
});

/**
 * Der Nullpunkt ist der Kern der Sache: Nach dem Umhängen zählen die
 * Koordinaten nicht mehr vom Hauptbildschirm, sondern von der linken oberen
 * Ecke ALLER Bildschirme zusammen.
 */
test('Bei einem Monitor links vom Hauptbildschirm verschiebt sich alles', () => {
  const bildschirme = [
    { bounds: { x: -1920, y: 0, width: 1920, height: 1080 } }, // links daneben
    { bounds: { x: 0, y: 0, width: 3840, height: 2160 } }, // Hauptbildschirm
  ];
  assert.deepStrictEqual(H.nullpunkt(bildschirme), { x: -1920, y: 0 });

  // Der linke Monitor liegt im Hintergrund bei 0, der Hauptbildschirm bei 1920.
  assert.deepStrictEqual(H.lageImHintergrund(bildschirme[0], bildschirme), {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  });
  assert.deepStrictEqual(H.lageImHintergrund(bildschirme[1], bildschirme), {
    x: 1920,
    y: 0,
    width: 3840,
    height: 2160,
  });
});

test('Zwei Bildschirme nebeneinander: der zweite behält seinen Abstand', () => {
  const bildschirme = [
    { bounds: { x: 0, y: 0, width: 3840, height: 2160 } },
    { bounds: { x: 3840, y: 0, width: 3840, height: 2160 } },
  ];
  assert.deepStrictEqual(H.nullpunkt(bildschirme), { x: 0, y: 0 });
  assert.strictEqual(H.lageImHintergrund(bildschirme[1], bildschirme).x, 3840);
});

test('Das PowerShell-Skript liegt da, wo das Modul es erwartet', () => {
  // Es wird mit der App ausgeliefert (overlay/lib/**). Fehlt es im Paket,
  // fällt der Hintergrundmodus beim Anwender aus, und zwar still.
  assert.ok(fs.existsSync(H.SKRIPT), H.SKRIPT);
  const quelle = fs.readFileSync(H.SKRIPT, 'utf8');
  assert.ok(quelle.includes('0x052C'), 'die Nachricht an Progman muss drinstehen');
  assert.ok(quelle.includes('[NullString]::Value'), 'sonst wird Progman nicht gefunden');
  assert.ok(quelle.includes('$env:TS_FENSTER'), 'die Werte kommen aus der Umgebung');
  // Kein param()-Block: Das Skript wird als TEXT uebergeben, weil es in der
  // installierten Fassung in app.asar liegt und PowerShell daraus nichts
  // starten kann.
  assert.ok(!/^param\(/m.test(quelle), 'ein param()-Block wuerde nie gefuellt');
});
