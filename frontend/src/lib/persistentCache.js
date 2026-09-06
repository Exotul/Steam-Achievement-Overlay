const VERSION = 1;

function key(steamId) {
  return `trophaenschrank:v${VERSION}:${steamId}`;
}

export function loadSnapshot(steamId) {
  try {
    const raw = localStorage.getItem(key(steamId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export function saveSnapshot(steamId, snapshot) {
  try {
    localStorage.setItem(key(steamId), JSON.stringify({ ...snapshot, savedAt: Date.now() }));
  } catch (err) {
    // z. B. Speicher voll oder localStorage deaktiviert - nicht kritisch,
    // die App funktioniert dann einfach ohne Zwischenspeicher weiter.
  }
}
