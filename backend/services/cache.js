const storage = require('./storage');

/**
 * Zwischenspeicher mit Ablaufzeit - jetzt zusaetzlich auf der Platte.
 *
 * Warum: Frueher lag alles nur im Arbeitsspeicher. Nach einem Neustart des
 * Rechners war damit ALLES kalt - auch die Dinge, die sich praktisch nie
 * aendern (Achievement-Beschreibungen, weltweite Prozentsaetze,
 * Komplettierungszeiten). Beim ersten Spielstart nach dem Hochfahren mussten
 * die alle gleichzeitig neu geholt werden, was die Steam-API ausbremst und
 * genau dann Verzoegerungen erzeugt, wo sie am meisten stoeren: bei der
 * Achievement-Erkennung.
 *
 * Gespeichert werden nur langlebige Eintraege (Ablaufzeit ueber 10 Minuten).
 * Kurzlebiges wie der aktuelle Spielstatus bleibt bewusst fluechtig.
 */

const store = new Map();

const PERSIST_MIN_TTL_MS = 10 * 60 * 1000;

let speicherTimer = null;
let geladen = false;

function laden() {
  if (geladen) return;
  geladen = true;
  const daten = storage.ladeSnapshot('cache');
  const jetzt = Date.now();
  let uebernommen = 0;
  Object.entries(daten).forEach(([key, entry]) => {
    if (entry && entry.expiresAt > jetzt) {
      store.set(key, entry);
      uebernommen += 1;
    }
  });
  if (uebernommen > 0) {
    require('./logger').info(`Zwischenspeicher geladen: ${uebernommen} Einträge noch gültig`);
  }
}

function planeSpeichern() {
  if (speicherTimer) return;
  // Sammeln statt bei jedem Eintrag schreiben.
  speicherTimer = setTimeout(() => {
    speicherTimer = null;
    speichern();
  }, 5000);
}

function speichern() {
  const jetzt = Date.now();
  const daten = {};
  for (const [key, entry] of store.entries()) {
    const restlaufzeit = entry.expiresAt - jetzt;
    if (restlaufzeit > PERSIST_MIN_TTL_MS) daten[key] = entry;
  }
  storage.speichereSnapshot('cache', daten);
}

function get(key) {
  laden();
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  laden();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (ttlMs > PERSIST_MIN_TTL_MS) planeSpeichern();
}

/** Holt aus dem Speicher, oder ruft fn() auf, legt das Ergebnis ab und gibt es zurück. */
async function remember(key, ttlMs, fn) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await fn();
  set(key, value, ttlMs);
  return value;
}

// Beim Beenden noch offene Änderungen sichern.
process.on('exit', () => {
  if (speicherTimer) {
    clearTimeout(speicherTimer);
    speichern();
  }
});

module.exports = { get, set, remember };
