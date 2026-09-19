const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

/**
 * Der XP-Gesamtstand - geprüft mit der ECHTEN Berechnungsfunktion.
 *
 * WARUM ES DIESEN TEST GIBT: Dieselben 376 Spiele ergaben einmal 24.096 XP
 * (Level 15) und einmal 188.250 XP (Level 51). Ursache war eine einzige
 * Zeile:
 *
 *     totalXp += await spielXp(...);
 *
 * ausgeführt von acht gleichzeitigen Arbeitern. `x += await f()` liest den
 * alten Wert von x, BEVOR gewartet wird. Jeder Arbeiter schrieb danach
 * "alter Stand + mein Spiel" zurück und überschrieb, was die anderen sieben
 * inzwischen addiert hatten. Übrig blieb fast genau ein Achtel.
 *
 * Aufgefallen ist es nur, weil eine spätere Rechnung mit nur EINEM offenen
 * Spiel lief - ein Arbeiter, keine Überschneidung, richtige Summe. Die
 * Erstberechnung dagegen war bei jedem neuen Anwender falsch.
 *
 * Steam wird hier durch Attrappen ersetzt, die mit ZUFÄLLIGER Verzögerung
 * antworten. Ohne Verzögerung liefe alles in fester Reihenfolge durch, und
 * der Fehler bliebe unsichtbar - genau wie er es lange war.
 */

const DIENSTE = path.resolve(__dirname, '..', '..', 'backend', 'services');
const modul = (name) => require.resolve(path.join(DIENSTE, name));

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const zufall = () => warte(Math.random() * 6);

/**
 * Lädt xpSummary frisch mit Attrappen für alles, was Steam oder die Platte
 * berührt. xpMath, xpPlan und steamFehler bleiben echt - um genau deren
 * Zusammenspiel geht es.
 */
function ladeMitAttrappen({ spiele, errungenJeSpiel = 1, prozent = 50, spielStand = null }) {
  ['xpSummary.js', 'steamApi.js', 'steamQueue.js', 'cache.js', 'logger.js'].forEach((n) => {
    delete require.cache[modul(n)];
  });

  const speicher = new Map();
  const attrappe = (name, exporte) => {
    require.cache[modul(name)] = {
      id: modul(name),
      filename: modul(name),
      loaded: true,
      exports: exporte,
    };
  };

  attrappe('steamApi.js', {
    getOwnedGames: async () => {
      await zufall();
      return spiele;
    },
    getPlayerAchievements: async () => {
      await zufall();
      if (spielStand) return spielStand.map(({ apiname, achieved }) => ({ apiname, achieved }));
      return Array.from({ length: errungenJeSpiel }, (_, i) => ({
        apiname: 'A' + i,
        achieved: 1,
      }));
    },
    getGlobalAchievementPercentages: async () => {
      await zufall();
      if (spielStand) return Object.fromEntries(spielStand.map((a) => [a.apiname, a.prozent]));
      const p = {};
      for (let i = 0; i < errungenJeSpiel; i++) p['A' + i] = prozent;
      return p;
    },
  });
  attrappe('steamQueue.js', { mitPrioritaet: (_stufe, fn) => fn() });
  attrappe('cache.js', {
    get: (k) => speicher.get(k),
    set: (k, v) => speicher.set(k, v),
  });
  attrappe('logger.js', { info() {}, warn() {}, error() {} });

  return { xpSummary: require(modul('xpSummary.js')), speicher };
}

const { achievementXp } = require(path.join(DIENSTE, 'xpMath.js'));
const gespielt = (n) =>
  Array.from({ length: n }, (_, i) => ({ appid: 1000 + i, playtime_forever: 60 + i }));

// --- Die Zusicherung, um die es geht ------------------------------------------

test('Die Erstberechnung zählt JEDES Spiel - auch mit acht Arbeitern', async () => {
  const spiele = gespielt(376);
  const { xpSummary } = ladeMitAttrappen({ spiele });

  const ergebnis = await xpSummary._berechneIntern('ich', {});
  const erwartet = Math.round(376 * achievementXp('Kupfer', 50));

  assert.strictEqual(
    ergebnis.totalXp,
    erwartet,
    `Summe ${ergebnis.totalXp} statt ${erwartet} - ` +
      `ein Achtel davon (${Math.round(erwartet / 8)}) hieße: Additionen gehen verloren`
  );
});

test('Mehrmals hintereinander immer dieselbe Summe', async () => {
  // Der Fehler war vom Zufall abhängig: 23.500, 24.000, 23.500 ... Eine
  // korrekte Rechnung liefert jedes Mal exakt dasselbe.
  const spiele = gespielt(120);
  const summen = [];
  for (let i = 0; i < 5; i++) {
    const { xpSummary } = ladeMitAttrappen({ spiele, errungenJeSpiel: 3 });
    summen.push((await xpSummary._berechneIntern('ich', {})).totalXp);
  }
  assert.strictEqual(new Set(summen).size, 1, `schwankt: ${summen.join(', ')}`);
});

test('Frisch gerechnet und aus dem Speicher ergeben dieselbe Summe', async () => {
  // Genau das war der sichtbare Widerspruch: Level 15 frisch, Level 51 aus
  // dem Speicher. Beide Wege müssen zum selben Ergebnis kommen.
  const spiele = gespielt(200);
  const { xpSummary } = ladeMitAttrappen({ spiele });

  const frisch = await xpSummary._berechneIntern('ich', {});
  // Zweiter Lauf im selben Modul: Alle Spielwerte liegen jetzt im Speicher.
  const job = {};
  const ausSpeicher = await xpSummary._berechneIntern('ich', job);

  assert.strictEqual(job.ausSpeicher, 200, 'der zweite Lauf muss alles aus dem Speicher nehmen');
  assert.strictEqual(ausSpeicher.totalXp, frisch.totalXp);
  assert.strictEqual(ausSpeicher.level, frisch.level);
});

test('Ein einzelnes fehlschlagendes Spiel kostet nur seinen eigenen Beitrag', async () => {
  // Wenn Steam für ein Spiel scheitert, darf das den Rest nicht mitreißen -
  // weder durch einen Abbruch noch durch ein verschobenes Aufaddieren.
  const spiele = gespielt(50);
  const { xpSummary } = ladeMitAttrappen({ spiele });
  const api = require(modul('steamApi.js'));
  const echt = api.getPlayerAchievements;
  api.getPlayerAchievements = async (steamId, appId) => {
    if (appId === 1007) throw new Error('HTTP 403');
    return echt(steamId, appId);
  };

  const ergebnis = await xpSummary._berechneIntern('ich', {});
  assert.strictEqual(ergebnis.totalXp, Math.round(49 * achievementXp('Kupfer', 50)));
});

// --- Dieselbe Stufe wie in der Meldung -----------------------------------------

test('Die Levelberechnung stuft wie die Meldung ein - mit dem Zusammenhang des Spiels', async () => {
  // Ein gut zugaengliches Spiel: Selbst das schwerste Achievement haben 12 %.
  // Nach festen Grenzen waere das Silber, im Spiel ist es das seltenste und
  // die Meldung zeigt Platin. Vorher zaehlte die Levelberechnung beim Start
  // trotzdem Silber - das Level fiel nach einem Neustart scheinbar zurueck.
  const spielStand = [
    { apiname: 'Start', achieved: 1, prozent: 80 },
    { apiname: 'Kapitel2', achieved: 1, prozent: 60 },
    { apiname: 'Kapitel3', achieved: 1, prozent: 50 },
    { apiname: 'Kapitel4', achieved: 0, prozent: 40 },
    { apiname: 'Ende', achieved: 0, prozent: 30 },
    { apiname: 'Meister', achieved: 1, prozent: 12 },
  ];
  const { xpSummary } = ladeMitAttrappen({ spiele: gespielt(1), spielStand });

  // Erwartung aus derselben Einstufung, die die Meldung benutzt - ueber das
  // GANZE Spiel, auch die noch fehlenden Achievements.
  const { stufeImSpiel } = require(path.join(DIENSTE, 'scoring.js'));
  const stufe = stufeImSpiel(spielStand, Object.fromEntries(spielStand.map((a) => [a.apiname, a.prozent])));
  assert.strictEqual(stufe(12), 'Platin', 'Voraussetzung des Tests: 12 % ist hier Platin');

  const erwartet = Math.round(
    spielStand.filter((a) => a.achieved).reduce((s, a) => s + achievementXp(stufe(a.prozent), a.prozent), 0)
  );
  const ergebnis = await xpSummary._berechneIntern('ich', {});
  assert.strictEqual(ergebnis.totalXp, erwartet);
});
