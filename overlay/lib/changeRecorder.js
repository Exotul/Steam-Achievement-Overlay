const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Zeichnet auf, welche Dateien unterhalb des Steam-Ordners sich während einer
 * Spielsitzung tatsächlich ändern.
 *
 * Hintergrund: Valve sichert für die lokalen Statistikdateien kein Format zu,
 * und Vermutungen darüber haben sich als fehleranfällig erwiesen. Statt weiter
 * zu raten, sammelt dieser Rekorder belastbare Daten vom echten System - dann
 * lässt sich gezielt entscheiden, ob eine schnellere lokale Erkennung
 * überhaupt zuverlässig möglich ist.
 *
 * Es wird ausschließlich gelesen. Aufgezeichnet werden Dateipfade, Größen und
 * Änderungszeitpunkte - keine Dateiinhalte.
 */

const WATCH_SUBDIRS = ['logs', 'appcache/stats', 'userdata'];
const SCAN_INTERVAL_MS = 1000;
const MAX_DEPTH = 5;

class ChangeRecorder {
  constructor(steamPath, appId) {
    this.steamPath = steamPath;
    this.appId = appId ? String(appId) : null;
    this.baseline = new Map();
    this.events = [];
    this.timer = null;
    this.startedAt = null;
  }

  _walk(dir, depth = 0, out = []) {
    if (depth > MAX_DEPTH) return out;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return out;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // In userdata nur die Ordner des laufenden Spiels verfolgen, sonst
        // wird die Aufzeichnung unnötig groß.
        if (this.appId && dir.endsWith('userdata')) {
          this._walk(full, depth + 1, out);
        } else if (!this.appId || !full.includes('userdata') || full.includes(this.appId)) {
          this._walk(full, depth + 1, out);
        }
      } else {
        try {
          const st = fs.statSync(full);
          out.push({ path: full, size: st.size, mtimeMs: st.mtimeMs });
        } catch (err) {
          /* egal */
        }
      }
    }
    return out;
  }

  _scanRoots() {
    const all = [];
    for (const sub of WATCH_SUBDIRS) {
      const dir = path.join(this.steamPath, ...sub.split('/'));
      if (fs.existsSync(dir)) this._walk(dir, 0, all);
    }
    return all;
  }

  start() {
    this.startedAt = Date.now();
    this.events = [];
    this.baseline = new Map();
    this._scanRoots().forEach((f) => this.baseline.set(f.path, f));

    this.timer = setInterval(() => {
      const now = this._scanRoots();
      for (const f of now) {
        const prev = this.baseline.get(f.path);
        if (!prev) {
          this.events.push({
            at: Date.now() - this.startedAt,
            kind: 'neu',
            path: f.path,
            size: f.size,
          });
          this.baseline.set(f.path, f);
        } else if (f.mtimeMs > prev.mtimeMs || f.size !== prev.size) {
          this.events.push({
            at: Date.now() - this.startedAt,
            kind: 'geändert',
            path: f.path,
            size: f.size,
            sizeDelta: f.size - prev.size,
          });
          this.baseline.set(f.path, f);
        }
      }
    }, SCAN_INTERVAL_MS);

    return this.baseline.size;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Schreibt einen lesbaren Bericht auf den Schreibtisch. */
  writeReport() {
    const lines = [];
    lines.push('Trophäenschrank - Aufzeichnung lokaler Steam-Dateiänderungen');
    lines.push(`Steam-Ordner: ${this.steamPath}`);
    lines.push(`Verfolgte AppID: ${this.appId || '(kein Spiel erkannt)'}`);
    lines.push(`Dauer: ${Math.round((Date.now() - this.startedAt) / 1000)} Sekunden`);
    lines.push(`Beobachtete Dateien zu Beginn: ${this.baseline.size}`);
    lines.push('');
    lines.push('Es wurden nur Pfade, Größen und Zeitpunkte erfasst - keine Inhalte.');
    lines.push('');

    if (this.events.length === 0) {
      lines.push('KEINE Änderungen festgestellt.');
    } else {
      lines.push(`${this.events.length} Änderungen:`);
      lines.push('');
      this.events.forEach((e) => {
        const rel = e.path.startsWith(this.steamPath)
          ? e.path.slice(this.steamPath.length)
          : e.path;
        const delta = e.sizeDelta !== undefined ? ` (${e.sizeDelta >= 0 ? '+' : ''}${e.sizeDelta} Bytes)` : '';
        lines.push(`  +${String(Math.round(e.at / 1000)).padStart(4)}s  ${e.kind.padEnd(9)} ${rel}${delta}`);
      });
    }

    const outPath = path.join(os.homedir(), 'Desktop', 'trophaenschrank-aufzeichnung.txt');
    const fallback = path.join(os.homedir(), 'trophaenschrank-aufzeichnung.txt');
    try {
      fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
      return outPath;
    } catch (err) {
      fs.writeFileSync(fallback, lines.join('\n'), 'utf8');
      return fallback;
    }
  }
}

module.exports = ChangeRecorder;
