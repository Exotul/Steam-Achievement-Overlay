const storage = require('./storage');

/**
 * Zwischenspeicher mit Ablaufzeit, zusätzlich auf der Platte.
 *
 * Warum überhaupt auf der Platte: Früher lag alles nur im Arbeitsspeicher.
 * Nach einem Neustart des Rechners war damit ALLES kalt - auch die Dinge, die
 * sich praktisch nie ändern (Achievement-Beschreibungen, weltweite
 * Prozentsätze). Beim ersten Spielstart nach dem Hochfahren mussten die alle
 * gleichzeitig neu geholt werden, was die Steam-API ausbremst und genau dann
 * Verzögerungen erzeugt, wo sie am meisten stören: bei der
 * Achievement-Erkennung.
 *
 * WARUM MEHRERE DATEIEN STATT EINER (nachgemessen, nicht vermutet):
 *
 * Bis hierher lag alles in einer einzigen `cache.json`. Die war auf 19 MB
 * angewachsen und wurde
 *
 *   - bei jedem Start vollständig gelesen und geparst, und
 *   - bei JEDER Änderung vollständig neu geschrieben.
 *
 * Beim Öffnen des Dashboards passierte Letzteres mehrfach hintereinander.
 * Seit das Schreiben zusätzlich ein fsync erzwingt (siehe storage.js, dort
 * steht warum), ist ein solcher Vollschrieb noch teurer geworden.
 *
 * Deshalb liegt jetzt jede Art in ihrer eigenen Datei unter `cache/`. Eine
 * Änderung an den Spielerständen schreibt nur noch die Spielerstände neu, und
 * gelesen wird eine Art erst, wenn sie zum ersten Mal gebraucht wird - der
 * Start wartet also nicht mehr auf zehn Megabyte Schema-Daten, die erst
 * beim ersten Spielstart gebraucht werden.
 *
 * Nebenbei der wichtigste Gewinn: Eine beschädigte Datei kostet nicht mehr
 * alles, sondern nur ihre eigene Art.
 */

const PERSIST_MIN_TTL_MS = 10 * 60 * 1000;
const SPEICHER_VERZOEGERUNG_MS = 5000;

// Der Teil vor dem ersten Doppelpunkt eines Schlüssels benennt die Art:
// "schema:440" -> "schema". Schlüssel ohne Doppelpunkt landen in "sonstiges".
const ART_MUSTER = /^([a-z0-9-]+):/i;

const store = new Map();

// Welche Arten schon von der Platte gelesen wurden, und welche seit dem
// letzten Schreiben verändert wurden.
const geladeneArten = new Set();
const schmutzigeArten = new Set();

let speicherTimer = null;
let uebernahmeGeprueft = false;

function artVon(key) {
  const treffer = ART_MUSTER.exec(String(key));
  return treffer ? treffer[1].toLowerCase() : 'sonstiges';
}

const dateiFuer = (art) => `cache/${art}`;

/**
 * Übernimmt eine noch vorhandene alte `cache.json` in die neue Aufteilung.
 *
 * Sie einfach liegen zu lassen wäre bequem, würde aber einen gewachsenen
 * Zwischenspeicher wegwerfen - und der ist bei einer großen Bibliothek
 * hunderte Steam-Abfragen wert.
 */
function uebernehmeAlteAblage() {
  if (uebernahmeGeprueft) return;
  uebernahmeGeprueft = true;

  const alt = storage.ladeSnapshot('cache', null);
  if (!alt || Object.keys(alt).length === 0) return;

  const logger = require('./logger');
  const jetzt = Date.now();
  const nachArt = new Map();
  let uebernommen = 0;

  for (const [key, entry] of Object.entries(alt)) {
    if (!entry || typeof entry.expiresAt !== 'number' || entry.expiresAt <= jetzt) continue;
    const art = artVon(key);
    if (!nachArt.has(art)) nachArt.set(art, {});
    nachArt.get(art)[key] = entry;
    uebernommen += 1;
  }

  for (const [art, daten] of nachArt.entries()) {
    storage.speichereSnapshot(dateiFuer(art), daten);
  }

  // Erst umbenennen, wenn alles geschrieben ist - bricht es vorher ab, soll
  // die alte Datei beim nächsten Start noch da sein.
  storage.benenneSnapshotUm('cache', 'cache.uebernommen');
  logger.info(
    `Zwischenspeicher übernommen: ${uebernommen} Einträge aus cache.json ` +
      `auf ${nachArt.size} Dateien verteilt`
  );
}

/** Liest eine Art von der Platte - genau einmal, und erst wenn sie gebraucht wird. */
function ladeArt(art) {
  if (geladeneArten.has(art)) return;
  geladeneArten.add(art);
  uebernehmeAlteAblage();

  const daten = storage.ladeSnapshot(dateiFuer(art));
  const jetzt = Date.now();
  let uebernommen = 0;

  for (const [key, entry] of Object.entries(daten)) {
    if (entry && entry.expiresAt > jetzt) {
      store.set(key, entry);
      uebernommen += 1;
    }
  }

  if (uebernommen > 0) {
    require('./logger').info(`Zwischenspeicher "${art}": ${uebernommen} Einträge noch gültig`);
  }
}

function planeSpeichern(art) {
  schmutzigeArten.add(art);
  if (speicherTimer) return;
  // Sammeln statt bei jedem Eintrag schreiben.
  speicherTimer = setTimeout(() => {
    speicherTimer = null;
    speichern();
  }, SPEICHER_VERZOEGERUNG_MS);
}

/**
 * Schreibt nur die Arten, an denen sich seit dem letzten Mal etwas geändert hat.
 * @returns {string[]} die tatsächlich geschriebenen Arten
 */
function speichern() {
  if (schmutzigeArten.size === 0) return [];

  const jetzt = Date.now();
  const nachArt = new Map();
  for (const art of schmutzigeArten) nachArt.set(art, {});
  schmutzigeArten.clear();

  for (const [key, entry] of store.entries()) {
    if (entry.fluechtig) continue;
    const art = artVon(key);
    if (!nachArt.has(art)) continue;
    // Was ohnehin gleich abläuft, muss nicht auf die Platte.
    if (entry.expiresAt - jetzt <= PERSIST_MIN_TTL_MS) continue;
    nachArt.get(art)[key] = entry;
  }

  const geschrieben = [];
  for (const [art, daten] of nachArt.entries()) {
    storage.speichereSnapshot(dateiFuer(art), daten);
    geschrieben.push(art);
  }
  return geschrieben.sort();
}

function get(key) {
  ladeArt(artVon(key));
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * @param {object} [optionen]
 * @param {boolean} [optionen.persistent] - ausdrückliche Entscheidung, ob der
 *   Eintrag auf die Platte soll. Ohne Angabe entscheidet die Laufzeit.
 *
 *   Gebraucht wird das für große, kurzlebige Einträge: Die Achievement-Listen
 *   aller Spiele würden die Datei auf ein Vielfaches aufblähen, obwohl sie
 *   nach Minuten ohnehin wertlos sind. Sie gehören in den Arbeitsspeicher.
 */
function set(key, value, ttlMs, optionen = {}) {
  const art = artVon(key);
  ladeArt(art);

  const persistent =
    optionen.persistent === undefined ? ttlMs > PERSIST_MIN_TTL_MS : optionen.persistent;
  store.set(key, { value, expiresAt: Date.now() + ttlMs, fluechtig: !persistent });
  if (persistent) planeSpeichern(art);
}

/** Holt aus dem Speicher, oder ruft fn() auf, legt das Ergebnis ab und gibt es zurück. */
async function remember(key, ttlMs, fn, optionen = {}) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await fn();
  set(key, value, ttlMs, optionen);
  return value;
}

// Beim Beenden noch offene Änderungen sichern.
process.on('exit', () => {
  if (speicherTimer) {
    clearTimeout(speicherTimer);
    speichern();
  }
});

module.exports = { get, set, remember, _artVon: artVon, _speichern: speichern };
