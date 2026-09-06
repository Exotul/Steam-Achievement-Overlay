const path = require('path');
const fs = require('fs');
const http = require('http');
const { fork } = require('child_process');

const CANDIDATE_PATHS = [
  path.join(__dirname, '..', '..', 'backend', 'server.js'), // Entwicklungs-Layout (Geschwisterordner)
  path.join(process.resourcesPath || '', 'backend', 'server.js'), // gepackte App
];

function findBackendEntry() {
  return CANDIDATE_PATHS.find((p) => p && fs.existsSync(p));
}

function waitForHealth(baseUrl, { retries = 40, delayMs = 300 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryOnce = () => {
      attempt += 1;
      const req = http.get(`${baseUrl}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1500, () => req.destroy());
    };
    const retry = () => {
      if (attempt >= retries) return reject(new Error('Backend antwortet nicht rechtzeitig.'));
      setTimeout(tryOnce, delayMs);
    };
    tryOnce();
  });
}

/**
 * Startet das Backend als eigenen Node-Prozess (falls es nicht schon von
 * jemand anderem - z. B. manuell zu Entwicklungszwecken - gestartet wurde)
 * und wartet, bis es tatsächlich antwortet.
 */
async function ensureBackendRunning(baseUrl, env) {
  // Läuft evtl. schon (z. B. manuell gestartet)? Dann nichts tun.
  try {
    await waitForHealth(baseUrl, { retries: 1, delayMs: 0 });
    return { alreadyRunning: true, child: null };
  } catch (err) {
    // noch nicht erreichbar -> selbst starten
  }

  const entry = findBackendEntry();
  if (!entry) {
    throw new Error(
      'Backend-Ordner wurde nicht gefunden. Erwartet als Geschwisterordner "backend" neben "overlay".'
    );
  }

  // Wichtig: Werte mit undefined herausfiltern. Node macht daraus beim
  // Weiterreichen unter Windows den Text "undefined" - ein fehlender
  // STEAM_API_KEY wuerde so als Schluessel "undefined" beim Backend ankommen
  // und Steam mit "403 - Check your API key is correct" antworten.
  const zusatz = Object.fromEntries(
    Object.entries(env).filter(([, wert]) => wert !== undefined && wert !== null && wert !== '')
  );

  const child = fork(entry, [], {
    cwd: path.dirname(entry),
    env: { ...process.env, ...zusatz },
    silent: false,
  });

  child.on('exit', (code) => {
    console.log(`Backend-Prozess beendet (Code ${code}).`);
  });

  await waitForHealth(baseUrl);
  return { alreadyRunning: false, child };
}

module.exports = { ensureBackendRunning };
