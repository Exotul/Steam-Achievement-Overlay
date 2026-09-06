const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

/**
 * Lokale Beschleunigung der Achievement-Erkennung.
 *
 * WICHTIG - was diese Datei tut und was nicht:
 *  - Sie LIEST ausschließlich Dateien, die der Steam-Client selbst auf diesem
 *    PC anlegt. Nichts wird geschrieben, verändert oder gelöscht.
 *  - Sie spricht NICHT mit Steam-Servern, nutzt NICHT das Steamworks-SDK,
 *    klinkt sich NICHT in Steam oder ein Spiel ein und gibt sich gegenüber
 *    Steam nicht als etwas aus, das sie nicht ist.
 *
 * Zwei Signalquellen, beide von Valve öffentlich dokumentiert:
 *  1. %steam%\logs\stats_log.txt - Valve nennt diese Datei in der offiziellen
 *     Steamworks-Dokumentation als Ort für Debug-Informationen beim Speichern
 *     von Statistiken/Achievements.
 *  2. %steam%\userdata\<konto>\<appId>\stats\ - der lokale Zwischenspeicher
 *     der Statistik- und Achievement-Daten.
 *
 * Da das Format dieser Dateien von Valve nicht zugesichert wird, arbeitet der
 * Parser bewusst tolerant: Er sucht in neu angehängtem Text nach den bereits
 * bekannten API-Namen der Achievements des laufenden Spiels. Findet er einen,
 * ist das ein Volltreffer (sofortige Anzeige). Ändert sich nur irgendeine
 * Datei, ohne dass ein Name erkennbar ist, gilt das als schwächeres Signal
 * ("gerade ist etwas passiert") und löst sofort eine Abfrage der Web-API aus.
 */

const WINDOWS_FALLBACKS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
];

function findSteamPathWindows() {
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { timeout: 4000 },
      (err, stdout) => {
        if (!err && stdout) {
          const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/i);
          if (match) {
            const p = match[1].trim().replace(/\//g, '\\');
            if (fs.existsSync(p)) return resolve(p);
          }
        }
        resolve(WINDOWS_FALLBACKS.find((p) => fs.existsSync(p)) || null);
      }
    );
  });
}

function findSteamPathUnix() {
  const candidates = [
    path.join(os.homedir(), '.steam', 'steam'),
    path.join(os.homedir(), '.local', 'share', 'Steam'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Steam'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function findSteamPath() {
  if (process.platform === 'win32') return findSteamPathWindows();
  return findSteamPathUnix();
}

class LocalWatcher {
  constructor({ onGenericChange, onStatus }) {
    this.onGenericChange = onGenericChange;
    this.onStatus = onStatus;

    this.steamPath = null;
    this.logPath = null;
    this.logOffset = 0;
    this.watchers = [];
    this.apiNames = [];
    this.reported = new Set();
    this.appId = null;
    this.lastGenericSignal = 0;
    this.stats = { namedHits: 0, genericHits: 0, logGrewBytes: 0, startedAt: null };
  }

  async init() {
    this.steamPath = await findSteamPath();
    if (!this.steamPath) {
      this.onStatus?.({ available: false, reason: 'Steam-Installation nicht gefunden' });
      return false;
    }
    const logPath = path.join(this.steamPath, 'logs', 'stats_log.txt');
    this.logPath = fs.existsSync(logPath) ? logPath : null;
    this.onStatus?.({
      available: true,
      steamPath: this.steamPath,
      hasLog: !!this.logPath,
    });
    return true;
  }

  /** Beginnt, für ein bestimmtes Spiel auf lokale Änderungen zu achten. */
  start(appId, apiNames) {
    this.stop();
    this.appId = appId;
    this.apiNames = apiNames;
    this.reported = new Set();
    this.stats = { namedHits: 0, genericHits: 0, logGrewBytes: 0, startedAt: Date.now() };

    if (this.logPath) {
      try {
        // Nur ab dem aktuellen Ende mitlesen - alles davor ist Vergangenheit.
        this.logOffset = fs.statSync(this.logPath).size;
      } catch (err) {
        this.logOffset = 0;
      }
    }

    // Bewusst fs.watchFile (Groessen-Abfrage) statt fs.watch: Unter Windows
    // meldet fs.watch Anhaenge-Vorgaenge eines anderen Prozesses oft gar nicht
    // oder erst stark verzoegert. Das Abfragen der Dateigroesse alle 400 ms ist
    // dagegen zuverlaessig und kostet praktisch nichts, weil es nur ein
    // Datei-Status-Aufruf ist.
    this.pollTimer = setInterval(() => {
      this._readLogTail();
      this._checkUserdataMtime();
    }, 400);

    this._collectUserdataDirs(appId);
  }

  _collectUserdataDirs(appId) {
    this.userdataDirs = [];
    this.userdataMtimes = new Map();

    // WICHTIG: appcache/stats zuerst. Eine echte Aufzeichnung hat gezeigt,
    // dass Steam die Achievement-Daten dort ablegt
    // (UserGameStats_<konto>_<appid>.bin) und diese Datei im Moment des
    // Erfolgs schreibt - eine Sekunde bevor etwas im Log landet. Frueher
    // wurde hier nur userdata beobachtet, weshalb das Signal viel zu spaet
    // kam.
    const appcacheStats = path.join(this.steamPath, 'appcache', 'stats');
    if (fs.existsSync(appcacheStats)) {
      this.userdataDirs.push(appcacheStats);
      try {
        fs.readdirSync(appcacheStats)
          .filter((f) => f.includes(`_${appId}.bin`) || f.includes(`_${appId}_`))
          .forEach((f) => {
            const full = path.join(appcacheStats, f);
            try {
              this.userdataMtimes.set(full, fs.statSync(full).mtimeMs);
            } catch (err) {
              /* egal */
            }
          });
      } catch (err) {
        /* egal */
      }
    }

    const userdataRoot = path.join(this.steamPath, 'userdata');
    if (!fs.existsSync(userdataRoot)) return;

    let accounts = [];
    try {
      accounts = fs.readdirSync(userdataRoot);
    } catch (err) {
      return;
    }

    accounts.forEach((account) => {
      const statsDir = path.join(userdataRoot, account, String(appId), 'stats');
      if (!fs.existsSync(statsDir)) return;
      this.userdataDirs.push(statsDir);
      try {
        fs.readdirSync(statsDir).forEach((f) => {
          const full = path.join(statsDir, f);
          this.userdataMtimes.set(full, fs.statSync(full).mtimeMs);
        });
      } catch (err) {
        /* egal */
      }
    });
  }

  _checkUserdataMtime() {
    if (!this.userdataDirs || this.userdataDirs.length === 0) return;
    for (const dir of this.userdataDirs) {
      let files = [];
      try {
        files = fs.readdirSync(dir);
      } catch (err) {
        continue;
      }
      for (const f of files) {
        // In appcache/stats liegen die Dateien aller Spiele - nur die des
        // verfolgten Spiels ist relevant, sonst gaebe es staendig Signale.
        if (dir.endsWith('stats') && dir.includes('appcache')) {
          if (!f.includes(`_${this.appId}.bin`) && !f.includes(`_${this.appId}_`)) continue;
        }
        const full = path.join(dir, f);
        let mtime;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch (err) {
          continue;
        }
        const prev = this.userdataMtimes.get(full);
        if (prev === undefined || mtime > prev) {
          this.userdataMtimes.set(full, mtime);
          if (prev !== undefined) this._signalGeneric();
        }
      }
    }
  }

  _signalGeneric() {
    // Datei-Ereignisse feuern oft mehrfach - kurz entprellen.
    const now = Date.now();
    if (now - this.lastGenericSignal < 800) return;
    this.lastGenericSignal = now;
    this.stats.genericHits += 1;
    this.onGenericChange?.();
  }

  _readLogTail() {
    if (!this.logPath) return;
    let size;
    try {
      size = fs.statSync(this.logPath).size;
    } catch (err) {
      return;
    }
    if (size < this.logOffset) this.logOffset = 0; // Datei wurde neu angelegt
    if (size === this.logOffset) return;

    const stream = fs.createReadStream(this.logPath, {
      start: this.logOffset,
      end: size - 1,
      encoding: 'utf8',
    });
    let chunk = '';
    stream.on('data', (d) => {
      chunk += d;
    });
    stream.on('end', () => {
      this.stats.logGrewBytes += size - this.logOffset;
      this.logOffset = size;
      this._scanText(chunk);
    });
    stream.on('error', () => {});
  }

  // Steam schreibt beim Speichern von Statistiken haeufig die KOMPLETTE
  // Achievement-Liste in die Logdatei, nicht nur das neu Freigeschaltete.
  // Ein reiner Namensabgleich wuerde dann auf einen Schlag alle Achievements
  // des Spiels melden. Deshalb: Findet ein einzelner Durchlauf mehr als
  // MAX_PLAUSIBLE_AT_ONCE Namen, ist das mit Sicherheit so ein Komplettabzug
  // und kein echter Mehrfach-Freischaltmoment -> nichts melden, nur ein
  // generisches Signal ausloesen und die Web-API entscheiden lassen.
  _scanText(text) {
    if (!text) return;

    // WICHTIG - bewusste Entscheidung nach Fehlalarmen im echten Einsatz:
    // Frueher wurde hier nach Achievement-API-Namen im Logtext gesucht und
    // ein Fund als Freischaltung gewertet. Das ist falsch: Ein Name kann aus
    // vielen Gruenden im Log stehen (Abfragen, Schema-Ladevorgaenge,
    // Fortschritts-Statistiken), ohne dass das Achievement errungen wurde.
    // Das hat Meldungen fuer laengst nicht erreichte Achievements erzeugt.
    //
    // Deshalb gilt jetzt: Lokale Dateien liefern NUR das Signal "gerade ist
    // etwas passiert". WAS genau passiert ist, entscheidet ausschliesslich
    // die Web-API - die einzige Quelle, die verlaesslich zwischen
    // "freigeschaltet" und "nicht freigeschaltet" unterscheidet.
    if (text.includes(String(this.appId))) {
      this._signalGeneric();
    }
  }

  /** Diagnose für das Tray-Menü: was wurde gefunden, was nicht. */
  async diagnose(appId) {
    const lines = [];
    const steamPath = this.steamPath || (await findSteamPath());
    if (!steamPath) {
      return ['Steam-Installation wurde nicht gefunden.'];
    }
    lines.push(`Steam gefunden: ${steamPath}`);

    const logPath = path.join(steamPath, 'logs', 'stats_log.txt');
    if (fs.existsSync(logPath)) {
      const size = fs.statSync(logPath).size;
      lines.push(`stats_log.txt vorhanden (${Math.round(size / 1024)} KB)`);
    } else {
      lines.push('stats_log.txt NICHT vorhanden');
    }

    const userdataRoot = path.join(steamPath, 'userdata');
    if (fs.existsSync(userdataRoot) && appId) {
      const accounts = fs.readdirSync(userdataRoot);
      const hits = accounts.filter((a) =>
        fs.existsSync(path.join(userdataRoot, a, String(appId), 'stats'))
      );
      lines.push(
        hits.length > 0
          ? `Lokaler Statistik-Ordner für App ${appId} gefunden`
          : `Kein lokaler Statistik-Ordner für App ${appId}`
      );
    } else {
      lines.push('userdata-Ordner nicht gefunden');
    }

    // Laufende Sitzung: was hat die lokale Erkennung bisher tatsächlich gebracht?
    if (this.stats.startedAt) {
      const mins = Math.max(1, Math.round((Date.now() - this.stats.startedAt) / 60000));
      lines.push('');
      lines.push(`Seit Spielstart (ca. ${mins} Min.):`);
      lines.push(`  Logdatei gewachsen um: ${this.stats.logGrewBytes} Bytes`);
      lines.push(`  Sonstige lokale Signale: ${this.stats.genericHits}`);

      if (this.stats.logGrewBytes === 0) {
        lines.push('');
        lines.push('WICHTIG: Die Logdatei wächst nicht.');
        lines.push('Steam schreibt sie nur mit aktivierter API-Protokollierung.');
        lines.push('Lösung: Steam-Verknüpfung -> Eigenschaften -> Ziel ergänzen um');
        lines.push('   -debug_steamapi');
        lines.push('Danach Steam komplett neu starten.');
      }
    }

    return lines;
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.watchers.forEach((w) => {
      try {
        w.close();
      } catch (err) {
        /* egal */
      }
    });
    this.watchers = [];
    this.apiNames = [];
    this.appId = null;
  }
}

module.exports = { LocalWatcher, findSteamPath };
