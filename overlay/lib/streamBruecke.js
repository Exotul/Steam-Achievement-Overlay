/**
 * Meldungen an ein Stream-Overlay schicken (OBS).
 *
 * WARUM NICHT DIE MELDUNG ABFILMEN: Das Overlay des Trophaeenschranks liegt
 * ueber dem Spiel. Wer es in den Stream holen will, muesste den ganzen
 * Bildschirm abgreifen - samt Taskleiste, Mauszeiger und allem, was sonst
 * noch aufpoppt. Stattdessen schickt die App das Ereignis als Text an das
 * Overlay-Programm, und DAS zeichnet es in seinem eigenen Stil und an seiner
 * eigenen Stelle. Im Stream sieht es dadurch besser aus als im Spiel.
 *
 * Bewusst einseitig: Die App schickt und vergisst. Laeuft das Overlay nicht,
 * ist niemand erreichbar oder antwortet der Server langsam, darf das die
 * Achievement-Erkennung nicht aufhalten - ein Spiel laeuft weiter, egal was
 * ein Stream-Programm gerade tut.
 *
 * Das Gegenstueck liegt im Overlay-Projekt (POST /api/trophaee).
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const logger = require('./logger');

// Laenger warten bringt nichts: Das Overlay laeuft ueblicherweise auf
// demselben Rechner. Antwortet es nicht in zwei Sekunden, laeuft es nicht.
const FRIST_MS = 2000;

// Texte gekuerzt schicken. Ein Spielname kann beliebig lang sein, und im
// Stream-Overlay ist der Platz begrenzt.
const MAX_TEXT = 140;

const kurz = (wert, grenze = MAX_TEXT) =>
  typeof wert === 'string' ? wert.trim().slice(0, grenze) : '';

/**
 * Baut die Nachricht - ohne Netzzugriff, damit genau das pruefbar ist.
 *
 * @param {string} art - 'achievement' | 'level' | 'diamant' | 'test'
 * @param {object} daten
 */
function baueMeldung(art, daten = {}) {
  const grund = { art, zeit: Date.now() };

  if (art === 'achievement') {
    return {
      ...grund,
      name: kurz(daten.name),
      beschreibung: kurz(daten.beschreibung),
      spiel: kurz(daten.spiel, 60),
      stufe: kurz(daten.stufe, 20) || 'Kupfer',
      prozent: Number.isFinite(daten.prozent) ? Number(daten.prozent) : null,
      xp: Number.isFinite(daten.xp) ? Math.round(daten.xp) : null,
      symbol: kurz(daten.symbol, 300),
      level: Number.isFinite(daten.level) ? daten.level : null,
    };
  }

  if (art === 'level') {
    return {
      ...grund,
      level: Number.isFinite(daten.level) ? daten.level : null,
      xpIntoLevel: Number.isFinite(daten.xpIntoLevel) ? Math.round(daten.xpIntoLevel) : null,
      xpForThisLevel: Number.isFinite(daten.xpForThisLevel)
        ? Math.round(daten.xpForThisLevel)
        : null,
    };
  }

  if (art === 'diamant') {
    return {
      ...grund,
      spiel: kurz(daten.spiel, 60),
      symbol: kurz(daten.symbol, 300),
      anzahl: Number.isFinite(daten.anzahl) ? daten.anzahl : null,
    };
  }

  return { ...grund, art: 'test' };
}

/**
 * Prueft die Adresse, bevor etwas hinausgeht.
 *
 * Nur http und https: Eine Adresse aus einer Einstellungsdatei koennte sonst
 * `file:` oder Schlimmeres sein. Was dort steht, hat der Anwender selbst
 * eingetragen - trotzdem wird es nicht blind benutzt.
 */
function pruefeAdresse(roh) {
  if (typeof roh !== 'string' || !roh.trim()) return null;
  try {
    const adresse = new URL(roh.trim());
    if (adresse.protocol !== 'http:' && adresse.protocol !== 'https:') return null;
    return adresse;
  } catch (err) {
    return null;
  }
}

/**
 * Schickt eine Meldung los.
 *
 * Wirft nie: Jeder Fehlschlag wird gemeldet, aber nicht weitergereicht.
 *
 * @returns {Promise<{ok: boolean, status?: number, grund?: string}>}
 */
function sende(url, meldung) {
  const adresse = pruefeAdresse(url);
  if (!adresse) return Promise.resolve({ ok: false, grund: 'adresse' });

  const koerper = Buffer.from(JSON.stringify(meldung), 'utf8');
  const modul = adresse.protocol === 'https:' ? https : http;

  return new Promise((fertig) => {
    const anfrage = modul.request(
      adresse,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': koerper.length,
        },
        timeout: FRIST_MS,
      },
      (antwort) => {
        // Die Antwort interessiert nicht, muss aber gelesen werden, sonst
        // bleibt die Verbindung offen.
        antwort.resume();
        fertig({ ok: antwort.statusCode >= 200 && antwort.statusCode < 300, status: antwort.statusCode });
      }
    );

    anfrage.on('timeout', () => {
      anfrage.destroy();
      fertig({ ok: false, grund: 'zeit' });
    });
    anfrage.on('error', (fehler) => fertig({ ok: false, grund: fehler.code || 'fehler' }));
    anfrage.end(koerper);
  });
}

/**
 * Bequemer Weg fuer den Hauptprozess: bauen, schicken, Fehlschlag notieren.
 * Gibt nichts zurueck, worauf jemand warten muesste.
 */
function melde(einstellungen, art, daten) {
  if (!einstellungen || !einstellungen.streamAktiv) return;
  sende(einstellungen.streamUrl, baueMeldung(art, daten)).then((ergebnis) => {
    if (!ergebnis.ok) {
      // Nur als Notiz: Ein laufender Stream ist nicht die Aufgabe dieser App,
      // und ein nicht gestartetes Overlay ist kein Fehler des Anwenders.
      logger.debug(`Stream-Meldung nicht zugestellt (${ergebnis.grund || ergebnis.status})`);
    }
  });
}

module.exports = { FRIST_MS, baueMeldung, pruefeAdresse, sende, melde };
