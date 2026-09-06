const session = require('express-session');
const storage = require('./storage');

/**
 * Speichert Sitzungen in einer Datei statt im Arbeitsspeicher.
 *
 * Warum das noetig ist: express-session nutzt standardmaessig einen Speicher
 * im Arbeitsspeicher. Die Overlay-App startet das Backend bei jedem
 * Programmstart neu - damit waren alle Sitzungen weg und man musste sich
 * jedes Mal erneut bei Steam anmelden, obwohl es derselbe Rechner und
 * derselbe Account war.
 *
 * Bewusst ohne zusaetzliche Abhaengigkeit und bewusst simpel: Es geht um
 * genau einen Nutzer auf einem privaten Rechner, nicht um einen Server mit
 * vielen gleichzeitigen Sitzungen.
 */

const Store = session.Store;

class FileSessionStore extends Store {
  constructor(options = {}) {
    super(options);
    this.name = options.name || 'sessions';
    this.sessions = new Map();
    this.saveTimer = null;
    this._load();
  }

  _load() {
    const daten = storage.ladeSnapshot(this.name);
    const jetzt = Date.now();
    Object.entries(daten).forEach(([sid, eintrag]) => {
      // Abgelaufene Sitzungen beim Laden gleich aussortieren.
      if (!eintrag.expires || eintrag.expires > jetzt) {
        this.sessions.set(sid, eintrag);
      }
    });
  }

  /** Sammelt Schreibvorgaenge kurz, damit nicht bei jedem Aufruf die Platte anfaesst. */
  _scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this._saveNow();
    }, 400);
  }

  _saveNow() {
    storage.speichereSnapshot(this.name, Object.fromEntries(this.sessions));
  }

  get(sid, callback) {
    const eintrag = this.sessions.get(sid);
    if (!eintrag) return callback(null, null);
    if (eintrag.expires && eintrag.expires <= Date.now()) {
      this.sessions.delete(sid);
      this._scheduleSave();
      return callback(null, null);
    }
    try {
      return callback(null, JSON.parse(eintrag.data));
    } catch (err) {
      return callback(null, null);
    }
  }

  set(sid, sess, callback) {
    const ablauf = sess.cookie?.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + (sess.cookie?.originalMaxAge || 7 * 24 * 60 * 60 * 1000);

    this.sessions.set(sid, { data: JSON.stringify(sess), expires: ablauf });
    this._scheduleSave();
    if (callback) callback(null);
  }

  destroy(sid, callback) {
    this.sessions.delete(sid);
    this._scheduleSave();
    if (callback) callback(null);
  }

  touch(sid, sess, callback) {
    const eintrag = this.sessions.get(sid);
    if (eintrag) {
      eintrag.expires = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : eintrag.expires;
      this._scheduleSave();
    }
    if (callback) callback(null);
  }

  length(callback) {
    callback(null, this.sessions.size);
  }

  clear(callback) {
    this.sessions.clear();
    this._saveNow();
    if (callback) callback(null);
  }
}

module.exports = FileSessionStore;
