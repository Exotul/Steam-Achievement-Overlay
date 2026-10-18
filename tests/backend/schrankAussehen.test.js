const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const A = require(path.resolve(__dirname, '..', '..', 'overlay', 'lib', 'schrankAussehen.js'));

/**
 * Das Aussehen des Schranks: Holz, Wand, Rücken, Schrift.
 *
 * Zwei Dinge, die hier schiefgehen können und beide sichtbar wären:
 *
 *  1. Die abgeleiteten Holztöne. Aus EINER Farbe werden vier — Lichtkante,
 *     Fläche, Schattenseite, Innenraum. Stimmen die Abstände nicht, sieht das
 *     Regal nicht mehr nach Holz aus, sondern nach Pappe.
 *  2. Die Farbwerte landen in einem Stylesheet. Was nicht wie eine Farbe
 *     aussieht, darf gar nicht erst ankommen.
 */

// --- Was als Farbe durchgeht -------------------------------------------------

test('Farben werden erkannt, alles andere nicht', () => {
  for (const gut of ['#abc', '#a97b4a', '#A97B4AFF', 'rgb(10, 20, 30)', 'hsl(266, 32%, 34%)']) {
    assert.strictEqual(A.istFarbe(gut), true, gut);
  }
  // Der Grund für die Strenge: Diese Werte gehen in CSS.
  for (const schlecht of [
    'red; background: url(http://x)',
    'url(x)',
    'javascript:alert(1)',
    '#12',
    'expression(1)',
    '',
    null,
    undefined,
    42,
    {},
  ]) {
    assert.strictEqual(A.istFarbe(schlecht), false, JSON.stringify(schlecht));
  }
});

// --- Die vier Holztöne -------------------------------------------------------

test('Aus einer Holzfarbe entstehen vier abgestufte Töne', () => {
  const t = A.holzToene('#a97b4a');
  assert.strictEqual(t.normal, '#a97b4a', 'die Fläche ist die gewählte Farbe');

  // Reihenfolge der Helligkeit: hell > normal > dunkel > tief > wand.
  const hell = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  assert.ok(hell(t.hell) > hell(t.normal), 'Lichtkante heller als die Fläche');
  assert.ok(hell(t.normal) > hell(t.dunkel), 'Schattenseite dunkler als die Fläche');
  assert.ok(hell(t.dunkel) > hell(t.tief), 'Innenraum noch dunkler');
  assert.ok(hell(t.tief) >= hell(t.wand), 'die Rückwand am tiefsten');
});

test('Aufhellen läuft gegen Weiß, nicht über eine Multiplikation', () => {
  // Ein dunkles Braun mal 1,3 bleibt dunkles Braun - alle drei Kanäle wachsen
  // gleich. Gegen Weiß gemischt entsteht die Lichtkante, die ein Brett hat.
  const dunkel = A.holzToene('#2e2b28');
  assert.notStrictEqual(dunkel.hell, dunkel.normal);
  const r = parseInt(dunkel.hell.slice(1, 3), 16);
  assert.ok(r > 0x2e + 20, `Lichtkante muss deutlich heller sein, ist ${dunkel.hell}`);
});

test('Eine unbrauchbare Holzfarbe fällt auf die Vorgabe zurück', () => {
  assert.strictEqual(A.holzToene('url(boese)').normal, '#a97b4a');
  assert.strictEqual(A.holzToene(null).normal, '#a97b4a');
});

test('rgb() und hsl() werden durchgereicht, nicht verrechnet', () => {
  // Sie lassen sich nicht so einfach aufhellen; sie bleiben, wie sie sind.
  // Das ist richtiger, als sie stillschweigend zu verwerfen.
  const t = A.holzToene('rgb(169, 123, 74)');
  assert.strictEqual(t.normal, 'rgb(169, 123, 74)');
  assert.strictEqual(t.hell, 'rgb(169, 123, 74)');
});

// --- Die Wand ----------------------------------------------------------------

test('Die Wand bekommt oben Licht und unten Schatten', () => {
  const w = A.raumToene('#171310');
  const hell = (hex) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  assert.ok(hell(w.oben) > hell(w.grund));
  assert.ok(hell(w.unten) < hell(w.grund));
});

// --- Die Farbe einer Sammlung ------------------------------------------------

test('Dieselbe Sammlung bekommt immer denselben Ton', () => {
  // Auch nach einem Neustart und auf einem anderen Rechner. Ein Regal, das
  // sich bei jedem Start umfärbt, wäre unruhig.
  const a = A.sammlungsFarbe('Horror');
  const b = A.sammlungsFarbe('Horror');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, A.sammlungsFarbe('Strategie'));
});

test('Eine eigene Wahl sticht die Ableitung', () => {
  assert.strictEqual(A.sammlungsFarbe('Horror', { Horror: '#6b3b8a' }), '#6b3b8a');
  // Unsinn in der Datei zählt nicht als Wahl.
  assert.strictEqual(A.sammlungsFarbe('Horror', { Horror: 'url(x)' }), A.sammlungsFarbe('Horror'));
});

test('Die abgeleitete Farbe ist eine gültige CSS-Farbe', () => {
  for (const name of ['Horror', 'J&R + Action', 'TCG', 'Übersetzt: Ärger', '']) {
    assert.strictEqual(A.istFarbe(A.sammlungsFarbe(name)), true, name);
  }
});

test('Die abgeleitete Farbe ist Hex - der Farbwähler kennt nichts anderes', () => {
  // Mit hsl() stand im Einstellungsfenster neben „Horror" ein schwarzes Feld,
  // während der Schrank Violett zeigte.
  assert.match(A.sammlungsFarbe('Horror'), /^#[0-9a-f]{6}$/i);
  assert.match(A.sammlungsFarbe('J&R + Action'), /^#[0-9a-f]{6}$/i);
});

test('Horror ergibt von sich aus ein Violett', () => {
  // Zufall, aber ein hübscher - und ein guter Beleg dafür, dass die Ableitung
  // über den ganzen Farbkreis streut statt alles ins Braune zu ziehen.
  const [r, g, b] = A.sammlungsFarbe('Horror').slice(1).match(/../g).map((h) => parseInt(h, 16));
  assert.ok(r > g && b > g, `violett heißt: Rot und Blau über Grün, ist ${r},${g},${b}`);
});

test('Alle Fachfarben auf einmal, fertig aufgelöst', () => {
  // Das Schrankfenster soll nur noch nachschlagen. Dieselbe Formel an zwei
  // Stellen wären zwei Stellen, die auseinanderlaufen können.
  const farben = A.fachFarben(
    [{ name: 'Horror' }, { name: 'RPG' }, { name: 'Fast geschafft' }],
    { RPG: '#223344' }
  );
  assert.strictEqual(farben.RPG, '#223344', 'eigene Wahl');
  assert.strictEqual(farben.Horror, A.sammlungsFarbe('Horror'), 'abgeleitet');
  assert.strictEqual(Object.keys(farben).length, 3, 'jedes Fach bekommt eine Farbe');
});

test('Das Schrankfenster rechnet die Farbe nicht selbst aus', () => {
  // Der Grund, warum es diese Prüfung gibt: Die Formel stand dort schon
  // einmal ein zweites Mal.
  const quelle = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'overlay', 'schrank', 'schrank.js'),
    'utf8'
  );
  const abschnitt = quelle.slice(quelle.indexOf('function fachFarbe'));
  const code = abschnitt.slice(0, abschnitt.indexOf('\n}'));
  assert.ok(!/% 360/.test(code), 'keine eigene Farbrechnung im Schrankfenster');
  assert.ok(/sammlungsfarben/.test(code), 'es wird nachgeschlagen');
});

// --- Schriften ---------------------------------------------------------------

test('Jede angebotene Schrift hat eine Liste mit Rückfall', () => {
  for (const name of A.SCHRIFT_NAMEN) {
    const liste = A.schriftListe(name);
    assert.ok(liste.includes(','), `${name} braucht einen Rückfall: ${liste}`);
  }
});

test('Eine unbekannte Schrift ergibt die Vorgabe', () => {
  assert.strictEqual(A.schriftListe('comic'), A.SCHRIFTEN.standard);
  assert.strictEqual(A.schriftListe(undefined), A.SCHRIFTEN.standard);
});

// --- Das Ganze für das Schrankfenster ---------------------------------------

test('Ohne Einstellungen kommt ein vollständiger, gültiger Satz heraus', () => {
  const a = A.ausSichtDesSchranks({});
  assert.ok(A.istFarbe(a.holz.hell) && A.istFarbe(a.holz.tief));
  assert.ok(A.istFarbe(a.raum.oben) && A.istFarbe(a.raum.unten));
  assert.strictEqual(a.ruecken, 'bild');
  assert.strictEqual(a.verlauf, true);
  assert.deepStrictEqual(a.sammlungsfarben, {});
});

test('Der Verlauf lässt sich ausschalten, und nur ausdrücklich', () => {
  assert.strictEqual(A.ausSichtDesSchranks({ schrankVerlauf: false }).verlauf, false);
  assert.strictEqual(A.ausSichtDesSchranks({ schrankVerlauf: undefined }).verlauf, true);
});
