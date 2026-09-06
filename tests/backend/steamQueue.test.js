const test = require('node:test');
const assert = require('node:assert');

// Enge Werte, damit die Tests schnell laufen.
process.env.STEAM_MIN_INTERVAL_MS = '10';
process.env.STEAM_MAX_CONCURRENT = '3';
process.env.LOG_DIR = require('node:path').join(require('node:os').tmpdir(), 'trophaenschrank-test-logs');

const queue = require('../../backend/services/steamQueue');

function warte(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Baut eine Aufgabe, die eine bestimmte Zeit läuft und ihren Start festhält. */
function aufgabe(name, dauerMs, protokoll) {
  return () =>
    new Promise((auf) => {
      protokoll.push(name);
      setTimeout(() => auf(name), dauerMs);
    });
}

test('Mehr als die erlaubte Anzahl läuft nicht gleichzeitig', async () => {
  queue._zuruecksetzen();
  let gleichzeitig = 0;
  let hoechststand = 0;

  const aufgaben = Array.from({ length: 12 }, () =>
    queue.einreihen(async () => {
      gleichzeitig += 1;
      hoechststand = Math.max(hoechststand, gleichzeitig);
      await warte(30);
      gleichzeitig -= 1;
    }, 'hintergrund')
  );

  await Promise.all(aufgaben);
  assert.ok(hoechststand <= 3, `höchstens 3 gleichzeitig, war aber ${hoechststand}`);
});

test('Dringende Anfragen werden vor wartenden Hintergrundanfragen gestartet', async () => {
  queue._zuruecksetzen();
  const protokoll = [];

  // Erst die Schlange mit Hintergrundarbeit füllen - so wie es die
  // Freundesprofile oder die XP-Erstberechnung tun.
  const hintergrund = Array.from({ length: 10 }, (_, i) =>
    queue.einreihen(aufgabe(`hintergrund${i}`, 40, protokoll), 'hintergrund')
  );

  // Kurz warten, damit die ersten Hintergrundaufgaben tatsächlich laufen,
  // dann etwas Dringendes nachschieben - das ist der Spielstart-Fall.
  await warte(25);
  const dringendPromise = queue.einreihen(aufgabe('DRINGEND', 5, protokoll), 'dringend');

  await Promise.all([...hintergrund, dringendPromise]);

  const position = protokoll.indexOf('DRINGEND');
  assert.ok(position >= 0, 'die dringende Aufgabe muss gelaufen sein');
  // Sie darf nicht hinten anstehen, obwohl 10 Hintergrundaufgaben vor ihr
  // eingereiht wurden.
  assert.ok(
    position < protokoll.length - 3,
    `dringende Aufgabe stand an Position ${position} von ${protokoll.length} - zu weit hinten`
  );
});

test('Der Mindestabstand zwischen Starts wird eingehalten', async () => {
  queue._zuruecksetzen();
  const startzeiten = [];

  await Promise.all(
    Array.from({ length: 6 }, () =>
      queue.einreihen(async () => {
        startzeiten.push(Date.now());
      }, 'hintergrund')
    )
  );

  startzeiten.sort((a, b) => a - b);
  const gesamt = startzeiten[startzeiten.length - 1] - startzeiten[0];
  // Sechs Anfragen mit je 10 ms Abstand brauchen mindestens ~40 ms
  // (Toleranz nach unten für Zeitgeber-Ungenauigkeit).
  assert.ok(gesamt >= 35, `Starts lagen nur ${gesamt}ms auseinander - Abstand greift nicht`);
});

test('Bei Drosselung durch Steam wird pausiert statt weiter dagegenzulaufen', async () => {
  queue._zuruecksetzen();

  const fehler = new Error('Too Many Requests');
  fehler.response = { status: 429 };

  await assert.rejects(() => queue.einreihen(() => Promise.reject(fehler), 'hintergrund'));

  const zustand = queue.status();
  assert.strictEqual(zustand.pausiert, true, 'nach HTTP 429 muss pausiert werden');
  assert.strictEqual(zustand.zaehler.gedrosselt, 1);
});

test('Ein gewöhnlicher Fehler löst KEINE Pause aus', async () => {
  queue._zuruecksetzen();

  const fehler = new Error('Netzwerk weg');
  await assert.rejects(() => queue.einreihen(() => Promise.reject(fehler), 'hintergrund'));

  assert.strictEqual(queue.status().pausiert, false);
  assert.strictEqual(queue.status().zaehler.gedrosselt, 0);
});

test('Die Vorrangstufe kommt aus dem Ausführungskontext', async () => {
  queue._zuruecksetzen();

  // Ohne Kontext ist alles Hintergrund - die sichere Voreinstellung.
  assert.strictEqual(queue.aktuellePrioritaet(), 'hintergrund');

  await queue.mitPrioritaet('dringend', async () => {
    assert.strictEqual(queue.aktuellePrioritaet(), 'dringend');
    // Auch in verschachtelten Aufrufen muss die Stufe erhalten bleiben,
    // sonst nützt der Kontext nichts.
    await (async () => {
      await warte(5);
      assert.strictEqual(queue.aktuellePrioritaet(), 'dringend');
    })();
  });

  assert.strictEqual(queue.aktuellePrioritaet(), 'hintergrund', 'danach wieder Voreinstellung');
});

test('Fehler und Ergebnisse werden korrekt durchgereicht', async () => {
  queue._zuruecksetzen();

  const wert = await queue.einreihen(async () => 42, 'dringend');
  assert.strictEqual(wert, 42);

  await assert.rejects(
    () => queue.einreihen(async () => {
      throw new Error('kaputt');
    }, 'dringend'),
    /kaputt/
  );
});
