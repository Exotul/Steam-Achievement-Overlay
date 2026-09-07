const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const T = require('../../overlay/lib/todo');

/**
 * Die Merkliste ist das Einzige in dieser App, was jemand von Hand
 * zusammenträgt. Alles andere kommt von Steam und lässt sich neu holen -
 * eine selbst geschriebene Notiz nicht. Deshalb gelten hier zwei
 * Zusicherungen, die diese Tests festhalten:
 *
 *  1. Nichts geht verloren. Auch nicht beim Wechsel des Dateiformats, auch
 *     nicht bei beschädigtem Inhalt, auch nicht beim Aufräumen erreichter
 *     Achievements.
 *  2. Eigene Einträge verschwinden NIE von selbst. Ob eine Notiz erledigt
 *     ist, weiß nur derjenige, der sie geschrieben hat.
 */

// --- Übernahme des älteren Formats -------------------------------------------

test('Eine Merkliste im alten Format geht beim Update nicht verloren', () => {
  // Früher stand je Spiel nur eine Liste von API-Namen. Sie zu verwerfen
  // wäre der bequeme Weg gewesen - und genau der Fall, den es nie geben soll.
  const alt = { '440': ['ACH_A', 'ACH_B'], '620': ['ACH_C'] };
  const neu = T.bereinige(alt);

  assert.deepStrictEqual(neu['440'].achievements, ['ACH_A', 'ACH_B']);
  assert.deepStrictEqual(neu['440'].notizen, []);
  assert.deepStrictEqual(neu['620'].achievements, ['ACH_C']);
});

test('Gemischte Formate nebeneinander werden beide übernommen', () => {
  const neu = T.bereinige({
    '440': ['ACH_A'],
    '620': { achievements: ['ACH_B'], notizen: [{ id: 'n1', text: 'Alles sammeln' }] },
  });
  assert.deepStrictEqual(neu['440'].achievements, ['ACH_A']);
  assert.strictEqual(neu['620'].notizen.length, 1);
});

// --- Bereinigung -------------------------------------------------------------

test('Aus beliebigem Unsinn wird eine leere, benutzbare Ablage', () => {
  for (const eingabe of [undefined, null, 'kaputt', 42, [], [1, 2]]) {
    assert.deepStrictEqual(T.bereinige(eingabe), {}, `bei ${JSON.stringify(eingabe)}`);
  }
});

test('Ein Spiel ohne Einträge liefert trotzdem eine vollständige Form', () => {
  // Sonst müsste jede aufrufende Stelle auf undefined prüfen.
  assert.deepStrictEqual(T.fuerSpiel({}, 999), { achievements: [], notizen: [] });
});

test('Notizen ohne Text fallen weg, Notizen ohne Kennung bekommen eine', () => {
  const neu = T.bereinige({
    '1': { achievements: [], notizen: [{ text: '  ' }, { text: 'Bleibt' }, { id: 'x' }] },
  });
  assert.strictEqual(neu['1'].notizen.length, 1);
  assert.strictEqual(neu['1'].notizen[0].text, 'Bleibt');
  assert.ok(neu['1'].notizen[0].id, 'ohne Kennung liesse sie sich nie entfernen');
});

test('Doppelte Kennungen werden aufgelöst', () => {
  const neu = T.bereinige({
    '1': { achievements: [], notizen: [{ id: 'gleich', text: 'A' }, { id: 'gleich', text: 'B' }] },
  });
  const ids = neu['1'].notizen.map((n) => n.id);
  assert.strictEqual(new Set(ids).size, 2, 'zwei Einträge brauchen zwei Kennungen');
});

test('Zeilenumbrüche im Text werden zu Leerzeichen', () => {
  // Die Einblendung ist einzeilig; ein Umbruch würde sie sprengen.
  const r = T.notizHinzufuegen({}, 1, 'Erste Zeile\nZweite   Zeile');
  assert.strictEqual(r.notiz.text, 'Erste Zeile Zweite Zeile');
});

test('Sehr langer Text wird gekürzt statt abgelehnt', () => {
  const r = T.notizHinzufuegen({}, 1, 'x'.repeat(500));
  assert.strictEqual(r.notiz.text.length, T.MAX_TEXT_LAENGE);
});

// --- Achievement-Haken -------------------------------------------------------

test('Ein Haken setzt den Eintrag, ein zweiter nimmt ihn weg', () => {
  const gesetzt = T.setze({}, 440, 'ACH_A', true);
  assert.strictEqual(gesetzt.geaendert, true);
  assert.deepStrictEqual(gesetzt.listen['440'].achievements, ['ACH_A']);

  const weg = T.setze(gesetzt.listen, 440, 'ACH_A', false);
  assert.deepStrictEqual(weg.listen, {}, 'ein leeres Spiel verschwindet ganz');
});

test('Zweimal dasselbe setzen ändert nichts und meldet keinen Fehler', () => {
  const einmal = T.setze({}, 1, 'A', true);
  const nochmal = T.setze(einmal.listen, 1, 'A', true);
  assert.strictEqual(nochmal.geaendert, false);
  assert.strictEqual(nochmal.grund, null);
});

test('Spiele stören sich nicht gegenseitig', () => {
  let listen = T.setze({}, 440, 'A', true).listen;
  listen = T.notizHinzufuegen(listen, 620, 'Notiz im anderen Spiel').listen;

  listen = T.setze(listen, 440, 'A', false).listen;
  assert.strictEqual(listen['440'], undefined);
  assert.strictEqual(listen['620'].notizen.length, 1, 'das andere Spiel bleibt unberührt');
});

// --- Eigene Einträge ---------------------------------------------------------

test('Ein eigener Eintrag wird angelegt und behält seinen Text', () => {
  const r = T.notizHinzufuegen({}, 7813, 'Alle Audionotizen sammeln');
  assert.ok(r.notiz);
  assert.strictEqual(r.notiz.text, 'Alle Audionotizen sammeln');
  assert.strictEqual(r.grund, null);
  assert.deepStrictEqual(r.listen['7813'].notizen, [r.notiz]);
});

test('Ein leerer Eintrag wird mit Begründung abgelehnt', () => {
  for (const text of ['', '   ', null, undefined]) {
    const r = T.notizHinzufuegen({}, 1, text);
    assert.strictEqual(r.notiz, null);
    assert.ok(r.grund, 'ohne Begründung passiert für den Benutzer scheinbar nichts');
  }
});

test('Derselbe Text wird nicht zweimal angelegt', () => {
  // Fast immer ein Doppelklick.
  const erst = T.notizHinzufuegen({}, 1, 'Alles sammeln');
  const nochmal = T.notizHinzufuegen(erst.listen, 1, '  alles SAMMELN ');
  assert.strictEqual(nochmal.notiz, null);
  assert.ok(nochmal.grund);
  assert.strictEqual(nochmal.listen['1'].notizen.length, 1);
});

test('Ein eigener Eintrag lässt sich gezielt entfernen', () => {
  const erst = T.notizHinzufuegen({}, 1, 'Erste', 'id-a');
  const zweit = T.notizHinzufuegen(erst.listen, 1, 'Zweite', 'id-b');

  const weg = T.notizEntfernen(zweit.listen, 1, 'id-a');
  assert.strictEqual(weg.geaendert, true);
  assert.deepStrictEqual(weg.listen['1'].notizen.map((n) => n.text), ['Zweite']);
});

test('Eine unbekannte Kennung zu entfernen ist kein Fehler', () => {
  const erst = T.notizHinzufuegen({}, 1, 'Erste', 'id-a');
  const r = T.notizEntfernen(erst.listen, 1, 'gibt-es-nicht');
  assert.strictEqual(r.geaendert, false);
  assert.strictEqual(r.listen['1'].notizen.length, 1);
});

// --- Die drei Arten ----------------------------------------------------------

test('Alle drei Arten werden angelegt und behalten ihre Form', () => {
  let l = T.notizHinzufuegen({}, 7670, { art: 'abschnitt', text: 'Kapitel 1' }).listen;
  l = T.notizHinzufuegen(l, 7670, { art: 'tracker', text: 'Audionotizen', stand: 12, ziel: 52 }).listen;
  l = T.notizHinzufuegen(l, 7670, { art: 'notiz', text: 'Forschungskamera' }).listen;

  const n = T.fuerSpiel(l, 7670).notizen;
  assert.deepStrictEqual(n.map((x) => x.art), ['abschnitt', 'tracker', 'notiz']);
  assert.strictEqual(n[1].stand, 12);
  assert.strictEqual(n[1].ziel, 52);
});

test('Die Reihenfolge bleibt, wie sie angelegt wurde', () => {
  // Sonst gliedern die Überschriften nichts.
  let l = T.notizHinzufuegen({}, 1, { art: 'abschnitt', text: 'A' }).listen;
  l = T.notizHinzufuegen(l, 1, { art: 'notiz', text: 'unter A' }).listen;
  l = T.notizHinzufuegen(l, 1, { art: 'abschnitt', text: 'B' }).listen;
  assert.deepStrictEqual(T.fuerSpiel(l, 1).notizen.map((n) => n.text), ['A', 'unter A', 'B']);
});

test('Ein blosser Text bleibt eine Notiz', () => {
  // Ältere Aufrufe und ältere Dateien dürfen nicht kaputtgehen.
  assert.strictEqual(T.notizHinzufuegen({}, 1, 'nur Text').notiz.art, 'notiz');
  assert.strictEqual(
    T.bereinige({ 1: { notizen: [{ id: 'a', text: 'ohne Art' }] } })['1'].notizen[0].art,
    'notiz'
  );
});

test('Eine unbekannte Art wird zur Notiz statt verworfen', () => {
  const n = T.notizHinzufuegen({}, 1, { art: 'quatsch', text: 'bleibt' }).notiz;
  assert.strictEqual(n.art, 'notiz');
  assert.strictEqual(n.text, 'bleibt');
});

// --- Tracker: die Zahlen -----------------------------------------------------

test('Ein Tracker ohne Ziel ist eine Notiz', () => {
  // Ein Ziel von 0 wäre eine Division durch null in der Anzeige und sagt
  // ohnehin nichts aus.
  for (const ziel of [0, -5, undefined, 'abc']) {
    const n = T.notizHinzufuegen({}, 1, { art: 'tracker', text: 'X', ziel }).notiz;
    assert.strictEqual(n.art, 'notiz', `bei Ziel ${ziel}`);
    assert.strictEqual(n.stand, undefined);
  }
});

test('Der Stand kann nie über dem Ziel liegen', () => {
  // Sonst zeigt der Balken mehr als voll und die Zahl widerspricht sich.
  const n = T.notizHinzufuegen({}, 1, { art: 'tracker', text: 'X', stand: 99, ziel: 10 }).notiz;
  assert.strictEqual(n.stand, 10);
});

test('Negative und krumme Zahlen werden geradegezogen', () => {
  const n = T.notizHinzufuegen({}, 1, { art: 'tracker', text: 'X', stand: -4, ziel: 12.6 }).notiz;
  assert.strictEqual(n.stand, 0);
  assert.strictEqual(n.ziel, 13);
});

test('Absurd große Zahlen werden begrenzt', () => {
  // Darüber passt die Zahl nicht mehr neben den Text.
  const n = T.notizHinzufuegen({}, 1, { art: 'tracker', text: 'X', stand: 1e9, ziel: 1e9 }).notiz;
  assert.strictEqual(n.ziel, T.MAX_ZAHL);
});

// --- Bearbeiten --------------------------------------------------------------

test('Ein Zählerstand lässt sich ändern, ohne den Text zu verlieren', () => {
  // Der häufigste Griff überhaupt: "12 von 52" wird zu "13 von 52".
  const erst = T.notizHinzufuegen({}, 1, { art: 'tracker', text: 'Audionotizen', stand: 12, ziel: 52 });
  const geaendert = T.notizAendern(erst.listen, 1, erst.notiz.id, { stand: 13 });

  assert.strictEqual(geaendert.geaendert, true);
  assert.strictEqual(geaendert.notiz.stand, 13);
  assert.strictEqual(geaendert.notiz.text, 'Audionotizen', 'der Text muss bleiben');
  assert.strictEqual(geaendert.notiz.ziel, 52, 'das Ziel muss bleiben');
});

test('Die Kennung bleibt beim Bearbeiten erhalten', () => {
  // Sonst rutscht der Eintrag in der Liste an eine andere Stelle.
  const erst = T.notizHinzufuegen({}, 1, { art: 'notiz', text: 'alt' });
  const geaendert = T.notizAendern(erst.listen, 1, erst.notiz.id, { text: 'neu' });
  assert.strictEqual(geaendert.notiz.id, erst.notiz.id);
  assert.strictEqual(geaendert.notiz.text, 'neu');
});

test('Die Art lässt sich nachträglich wechseln', () => {
  const erst = T.notizHinzufuegen({}, 1, { art: 'notiz', text: 'Audionotizen' });
  const geaendert = T.notizAendern(erst.listen, 1, erst.notiz.id, {
    art: 'tracker',
    stand: 3,
    ziel: 52,
  });
  assert.strictEqual(geaendert.notiz.art, 'tracker');
  assert.strictEqual(geaendert.notiz.ziel, 52);
});

test('Ein Eintrag lässt sich nicht leer machen', () => {
  const erst = T.notizHinzufuegen({}, 1, { art: 'notiz', text: 'da' });
  const leer = T.notizAendern(erst.listen, 1, erst.notiz.id, { text: '   ' });
  assert.strictEqual(leer.geaendert, false);
  assert.ok(leer.grund);
  assert.strictEqual(T.fuerSpiel(leer.listen, 1).notizen[0].text, 'da', 'der alte Text bleibt');
});

test('Eine unbekannte Kennung zu ändern meldet einen Grund', () => {
  const r = T.notizAendern({}, 1, 'gibt-es-nicht', { text: 'x' });
  assert.strictEqual(r.geaendert, false);
  assert.ok(r.grund);
});

test('Zwei Überschriften mit demselben Text sind erlaubt', () => {
  // Bei Notizen wäre das ein Doppelklick, bei einer Gliederung nicht.
  const erst = T.notizHinzufuegen({}, 1, { art: 'abschnitt', text: 'Kapitel' });
  const zweit = T.notizHinzufuegen(erst.listen, 1, { art: 'abschnitt', text: 'Kapitel' });
  assert.ok(zweit.notiz, 'darf nicht als Doppelklick abgelehnt werden');
  assert.strictEqual(T.fuerSpiel(zweit.listen, 1).notizen.length, 2);
});

// --- DIE zentrale Zusicherung ------------------------------------------------

test('Eigene Einträge überleben das Aufräumen erreichter Achievements', () => {
  // Der wichtigste Test dieser Datei. Eine Notiz zu verlieren, weil zufällig
  // ein Achievement fiel, würde genau die Arbeit vernichten, für die es die
  // Notiz überhaupt gibt.
  let listen = T.setze({}, 7813, 'ACH_A', true).listen;
  listen = T.setze(listen, 7813, 'ACH_B', true).listen;
  listen = T.notizHinzufuegen(listen, 7813, 'Alle Audionotizen sammeln').listen;

  const r = T.entferneErreichte(listen, 7813, ['ACH_A', 'ACH_B']);

  assert.deepStrictEqual(r.entfernt, ['ACH_A', 'ACH_B']);
  assert.deepStrictEqual(r.listen['7813'].achievements, []);
  assert.strictEqual(r.listen['7813'].notizen.length, 1, 'die Notiz MUSS bleiben');
  assert.strictEqual(r.listen['7813'].notizen[0].text, 'Alle Audionotizen sammeln');
});

test('Eine Notiz überlebt beliebig viele Spielstarts', () => {
  // Genau der gemeldete Wunsch: nicht bei jedem Spielstart neu tippen.
  let listen = T.notizHinzufuegen({}, 7813, 'Alle Audionotizen sammeln').listen;

  for (let start = 0; start < 25; start++) {
    // So läuft es bei jedem Spielstart: erreichte Achievements ausräumen.
    listen = T.entferneErreichte(listen, 7813, ['IRGENDEIN_ACH']).listen;
    listen = T.bereinige(listen); // wie beim Laden von der Platte
  }

  assert.strictEqual(listen['7813'].notizen[0].text, 'Alle Audionotizen sammeln');
});

test('Erreichte Achievements verschwinden, andere Spiele bleiben unberührt', () => {
  let listen = T.setze({}, 440, 'A', true).listen;
  listen = T.setze(listen, 620, 'A', true).listen;

  const r = T.entferneErreichte(listen, 440, ['A']);
  assert.strictEqual(r.listen['440'], undefined);
  assert.deepStrictEqual(r.listen['620'].achievements, ['A']);
});

// --- Obergrenze --------------------------------------------------------------

test('Die Obergrenze gilt für beide Arten zusammen', () => {
  // Sonst stünden bis zu 24 Einträge auf dem Bildschirm und verdeckten das
  // Spiel - die Grenze soll den Bildschirm schützen, nicht eine Kategorie.
  let listen = {};
  for (let i = 0; i < T.MAX_JE_SPIEL - 1; i++) {
    listen = T.setze(listen, 1, `ACH_${i}`, true).listen;
  }
  const letzte = T.notizHinzufuegen(listen, 1, 'Passt gerade noch');
  assert.ok(letzte.notiz, 'der letzte freie Platz muss nutzbar sein');

  const zuviel = T.notizHinzufuegen(letzte.listen, 1, 'Einer zu viel');
  assert.strictEqual(zuviel.notiz, null);
  assert.ok(zuviel.grund.includes(String(T.MAX_JE_SPIEL)));

  const hakenZuviel = T.setze(letzte.listen, 1, 'NOCH_EIN_ACH', true);
  assert.strictEqual(hakenZuviel.geaendert, false, 'auch der Haken muss abgelehnt werden');
});

// --- Lesen und Schreiben -----------------------------------------------------

function frischeDatei(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `trophaenschrank-todo-${name}-`));
  return { dir, datei: path.join(dir, 'merkliste.json') };
}

test('Gespeichertes kommt vollständig zurück - Haken wie Notizen', () => {
  const { dir, datei } = frischeDatei('rundlauf');
  let listen = T.setze({}, 7813, 'ACH_A', true).listen;
  listen = T.notizHinzufuegen(listen, 7813, 'Alle Audionotizen sammeln').listen;

  const gespeichert = T.speichern(listen, datei);
  const gelesen = T.laden(datei);

  assert.deepStrictEqual(gelesen, gespeichert);
  assert.deepStrictEqual(gelesen['7813'].achievements, ['ACH_A']);
  assert.strictEqual(gelesen['7813'].notizen[0].text, 'Alle Audionotizen sammeln');
  assert.ok(!fs.existsSync(`${datei}.tmp`), 'die Nebendatei muss umbenannt worden sein');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine im alten Format gespeicherte Datei wird beim Lesen übernommen', () => {
  const { dir, datei } = frischeDatei('altes-format');
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify({ '440': ['ACH_ALT'] }), 'utf8');

  assert.deepStrictEqual(T.laden(datei)['440'].achievements, ['ACH_ALT']);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine beschädigte Datei führt zu leeren Listen, nicht zum Absturz', () => {
  const { dir, datei } = frischeDatei('kaputt');
  fs.writeFileSync(datei, '{ kein JSON', 'utf8');
  assert.deepStrictEqual(T.laden(datei), {});
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Eine fehlende Datei führt zu leeren Listen', () => {
  assert.deepStrictEqual(T.laden(path.join(os.tmpdir(), 'gibt-es-nicht-8123', 'x.json')), {});
});

test('Die Ablage liegt außerhalb des Programmordners', () => {
  // Damit sie Updates übersteht, beim Deinstallieren bleibt und niemals in
  // einem Repository landet.
  const p = T.DATEI.replace(/\\/g, '/');
  assert.ok(p.includes('.trophaenschrank'), `unerwarteter Ort: ${T.DATEI}`);
  assert.ok(
    !p.includes('/overlay/') && !p.includes('steam-achievements-app'),
    `die Datei darf nicht im Projektordner liegen: ${T.DATEI}`
  );
});
