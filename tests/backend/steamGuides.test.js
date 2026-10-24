const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const G = require('../../backend/services/steamGuides');

/**
 * Welcher Guide ist DER 100-%-Walkthrough?
 *
 * Die Stimmen allein treffen es nicht — nachgemessen an echten Daten:
 *
 *   Dead Space, nach Bewertung sortiert:
 *     Platz 2  eine russische Sprachdatei (trägt den Tag „Achievements")
 *     Platz 3  ein englischer Guide über einen Spruch von Isaac
 *
 *   Valheim:
 *     „A Mega Guide" hat 400 Stimmen und 35.344 Aufrufe
 *     „Valheim: 100% Achievement Guide" nur 321 und 14.835
 *
 * Gesucht ist der zweite. Deshalb redet der Titel mit.
 */

const guide = (titel, o = {}) => ({
  titel,
  kurz: o.kurz || '',
  punktzahl: o.punktzahl ?? 0.85,
  aufrufe: o.aufrufe ?? 10000,
});

// --- Die Bewertung -----------------------------------------------------------

test('Ein 100-%-Achievement-Guide schlägt den populäreren Allgemein-Guide', () => {
  // Genau der Valheim-Fall.
  const hundert = G.bewerte(guide('Valheim: 100% Achievement Guide', { punktzahl: 0.86, aufrufe: 14835 }));
  const mega = G.bewerte(guide('A Mega Guide - Valheim', { punktzahl: 0.88, aufrufe: 35344 }));
  assert.ok(hundert > mega, `100 % muss gewinnen: ${hundert} gegen ${mega}`);
});

test('Auch ohne Prozentzeichen im Titel zählt „all achievements"', () => {
  const alle = G.bewerte(guide('Valheim 100% Achievements'));
  const nichts = G.bewerte(guide('Recruiting the Shadow'));
  assert.ok(alle > nichts, `${alle} gegen ${nichts}`);
});

test('Die Beschreibung zählt mit, wenn der Titel nichts hergibt', () => {
  const mitText = G.bewerte(
    guide('Mein Leitfaden', { kurz: 'This is a comprehensive 100% achievement guide' })
  );
  const ohne = G.bewerte(guide('Mein Leitfaden'));
  assert.ok(mitText > ohne + 40, `die Beschreibung muss deutlich zählen: ${mitText} / ${ohne}`);
});

test('Mehr Aufrufe helfen, aber nur ein bisschen', () => {
  // Ein Guide mit 200.000 Aufrufen ist nicht zwanzigmal besser als einer mit
  // 10.000 - sonst gewinnt am Ende immer der bekannteste, nicht der passende.
  const viel = G.bewerte(guide('Irgendein Guide', { aufrufe: 200000 }));
  const wenig = G.bewerte(guide('Irgendein Guide', { aufrufe: 1000 }));
  assert.ok(viel - wenig < 10, `der Abstand darf klein bleiben: ${viel - wenig}`);
});

test('Deutsche Titel werden genauso erkannt', () => {
  const de = G.bewerte(guide('Alle Erfolge - Komplettlösung'));
  const nichts = G.bewerte(guide('Ein paar Tipps zum Einstieg'));
  assert.ok(de > nichts, `${de} gegen ${nichts}`);
});

// --- Die Sprache -------------------------------------------------------------

test('Nur Englisch und Deutsch gelten als Sprache', () => {
  // Ausdrücklich so gewünscht.
  assert.deepStrictEqual(G.SPRACHEN, ['english', 'german']);
  assert.deepStrictEqual(G.sprachen([{ tag: 'english' }, { tag: 'Achievements' }]), ['english']);
  assert.deepStrictEqual(G.sprachen([{ tag: 'russian' }]), []);
});

test('Die Schreibweise des Sprach-Tags wechselt - klein vergleichen', () => {
  // In den echten Daten steht „english" klein, „Ukrainian" aber groß.
  assert.deepStrictEqual(G.sprachen([{ tag: 'English' }]), ['english']);
  assert.deepStrictEqual(G.sprachen([{ tag: 'GERMAN' }]), ['german']);
  assert.deepStrictEqual(G.sprachen(['german']), ['german'], 'auch als bloßer Text');
});

/**
 * WARUM NICHT DAS FELD `language`: Es lügt. An echten Daten nachgesehen -
 * russische Guides stehen dort teils auf 0, genau wie englische:
 *
 *     language=0  Tag=["english"]   "100% Achievement Guide: Dead Space"
 *     language=0  Tag=["russian"]   "Достижения - 100%"
 *     language=8  Tag=["russian"]   "100 % Достижений - Dead Space Remake"
 */
test('Das Feld „language" wird nicht zum Filtern benutzt', () => {
  const fs = require('node:fs');
  const quelle = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'backend', 'services', 'steamGuides.js'),
    'utf8'
  );
  assert.ok(
    !/roh\.language/.test(quelle),
    'das Feld language taugt nicht - russische Guides stehen dort auf 0'
  );
  assert.ok(/requiredtags\[1\]/.test(quelle), 'gefiltert wird über den Sprach-Tag');
});

// --- Ein Eintrag aus der Antwort ---------------------------------------------

const ROH = {
  publishedfileid: '3389709405',
  title: '100% Achievement Guide: Dead Space (Remake)',
  short_description: 'This is a comprehensive 100% Achievement guide   detailing\na walkthrough',
  preview_url: 'https://images.steamusercontent.com/ugc/333117/B1BB.jpg',
  views: 14474,
  time_updated: 1778544000,
  tags: [{ tag: 'Achievements' }, { tag: 'english' }],
  vote_data: { score: 0.867, votes_up: 302, votes_down: 4 },
};

test('Aus einem Eintrag wird, was die App braucht', () => {
  const g = G.deuteEintrag(ROH);
  assert.strictEqual(g.id, '3389709405');
  assert.strictEqual(g.stimmenHoch, 302);
  assert.strictEqual(g.stimmenGesamt, 306);
  assert.deepStrictEqual(g.sprachen, ['english']);
  assert.strictEqual(
    g.url,
    'https://steamcommunity.com/sharedfiles/filedetails/?id=3389709405'
  );
  // Zeilenumbrüche und Mehrfach-Leerzeichen raus - die Beschreibung steht in
  // einer Zeile.
  assert.ok(!/\s{2}|\n/.test(g.kurz), g.kurz);
  assert.ok(g.punkte > 100);
});

test('Ohne brauchbare Nummer gibt es keinen Eintrag', () => {
  // Die Nummer landet in einer Adresse - dort gehört nur hinein, was von
  // Steam kommt.
  for (const unsinn of [
    {},
    null,
    { publishedfileid: '' },
    { publishedfileid: 'abc' },
    { publishedfileid: '123; rm -rf' },
    { publishedfileid: '../../etc' },
  ]) {
    assert.strictEqual(G.deuteEintrag(unsinn), null, JSON.stringify(unsinn));
  }
});

test('Fehlende Stimmen oder Aufrufe stürzen nicht ab', () => {
  const g = G.deuteEintrag({ publishedfileid: '42', title: 'Ohne alles' });
  assert.strictEqual(g.stimmenGesamt, 0);
  assert.strictEqual(g.aufrufe, 0);
  assert.strictEqual(g.bild, null);
});

// --- Sortieren und Entdoppeln -------------------------------------------------

test('Derselbe Guide steht nur einmal in der Liste', () => {
  // Es wird zweimal gefragt (je Sprache), und ein Guide kann beide Tags
  // tragen.
  const a = G.deuteEintrag(ROH);
  const b = G.deuteEintrag(ROH);
  assert.strictEqual(G.ordne([a, b]).length, 1);
});

test('Die Liste steht nach Punkten, nicht nach Zufall', () => {
  const liste = G.ordne([
    G.deuteEintrag({ publishedfileid: '2', title: 'Irgendein Tipp', views: 10 }),
    G.deuteEintrag({ publishedfileid: '1', title: '100% Achievement Guide', views: 1000 }),
  ]);
  assert.deepStrictEqual(liste.map((g) => g.id), ['1', '2']);
});

test('Leere oder kaputte Eingaben ergeben eine leere Liste', () => {
  assert.deepStrictEqual(G.ordne([]), []);
  assert.deepStrictEqual(G.ordne([null, undefined]), []);
});
