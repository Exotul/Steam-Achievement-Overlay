const { execFile } = require('child_process');

/**
 * Welches Spiel laeuft gerade? - gefragt beim Steam-Client auf diesem
 * Rechner, nicht bei Steams Servern.
 *
 * WARUM DAS BESSER IST ALS DIE WEB-ABFRAGE
 *
 * Bisher fragte die App alle zehn Sekunden die Steam-Web-API: rund 360
 * Anfragen je Stunde, rund um die Uhr, fuer diese eine Frage. Und die Antwort
 * kommt nur, wenn zwei Haken richtig stehen - Spieldetails oeffentlich und
 * Status nicht auf "Unsichtbar". Genau daran lag es schon einmal, dass die
 * App scheinbar nichts tat: Steam veroeffentlichte das Spiel nicht, also sah
 * sie keines.
 *
 * Der Steam-Client schreibt dieselbe Angabe lokal in die Registry:
 *
 *     HKCU\Software\Valve\Steam  ->  RunningAppID  (REG_DWORD)
 *
 * 0 heisst "kein Spiel". Das kostet keine Steam-Anfrage, haengt an keiner
 * Datenschutzeinstellung und ist sofort da.
 *
 * Abgefragt wird mit reg.exe statt ueber ein natives Modul: Native
 * Abhaengigkeiten sind in diesem Projekt ausgeschlossen (sie stuerzen unter
 * Electrons eigener Node-Fassung ohne abfangbaren Fehler ab). Nachgemessen
 * kostet eine Abfrage 22,7 ms - bei einem Takt von drei Sekunden faellt das
 * nicht ins Gewicht, und es ersetzt eine Netzanfrage.
 *
 * Die Web-Abfrage bleibt: Von dort kommt der Spielname, und sie ist der
 * Rueckfall, falls dieser Weg auf einem Rechner nichts liefert.
 */

const SCHLUESSEL = 'HKCU\\Software\\Valve\\Steam';

/**
 * Deutet die Ausgabe von reg.exe.
 *
 * Eigene Funktion, weil das der Teil ist, der sich ohne Windows pruefen
 * laesst - und weil eine unverstaendliche Ausgabe NICHT als "kein Spiel"
 * durchgehen darf. Das waere die stille Variante des alten Fehlers: Die App
 * saehe dann nie ein Spiel und niemand wuesste warum.
 *
 * @param {string} ausgabe - stdout von `reg query ... /v RunningAppID`
 * @returns {number|null} AppID, 0 fuer "kein Spiel", null fuer "keine Antwort"
 */
function deuteAusgabe(ausgabe) {
  // Zeilenform: "    RunningAppID    REG_DWORD    0x4a2"
  const treffer = String(ausgabe || '').match(/RunningAppID\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
  if (!treffer) return null;
  const wert = parseInt(treffer[1], 16);
  return Number.isFinite(wert) ? wert : null;
}

/**
 * Fragt die Registry.
 *
 * @returns {Promise<number|null>}
 */
function leseAppId() {
  return new Promise((fertig) => {
    if (process.platform !== 'win32') {
      fertig(null);
      return;
    }
    execFile(
      'reg',
      ['query', SCHLUESSEL, '/v', 'RunningAppID'],
      { windowsHide: true, timeout: 5000 },
      (fehler, stdout) => fertig(fehler ? null : deuteAusgabe(stdout))
    );
  });
}

/**
 * Entscheidet, was sich geaendert hat.
 *
 * Getrennt von der Abfrage, damit die Regeln pruefbar sind. Die eine Regel,
 * auf die es ankommt: Eine fehlende Antwort (null) ist KEIN Spielende. Sonst
 * beendete ein einzelner Fehlschlag der Abfrage mitten im Spiel die Sitzung
 * samt Bilanz.
 *
 * @param {number|null} vorher
 * @param {number|null} jetzt
 * @returns {{art: 'start'|'ende'|'nichts', appId: number|null}}
 */
function wechsel(vorher, jetzt) {
  if (jetzt === null) return { art: 'nichts', appId: null };
  if (jetzt > 0 && jetzt !== vorher) return { art: 'start', appId: jetzt };
  if (jetzt === 0 && vorher !== null && vorher > 0) return { art: 'ende', appId: vorher };
  return { art: 'nichts', appId: jetzt > 0 ? jetzt : null };
}

/**
 * Beobachtet die Registry und meldet Wechsel.
 *
 * `onTauglich` kommt beim ERSTEN verstaendlichen Wert - auch bei 0. Das ist
 * der Beleg, dass dieser Weg auf diesem Rechner traegt; erst dann darf die
 * Web-Abfrage heruntergetaktet werden. Auf das erste Spiel zu warten waere
 * zu spaet: Bis dahin liefe sie weiter im Fuenf-Sekunden-Takt.
 *
 * @param {{takt?: number, onStart?: (appId:number)=>void, onEnde?: ()=>void,
 *          onTauglich?: ()=>void, onUnbrauchbar?: ()=>void}} o
 * @returns {{stop: () => void, letzte: () => number|null}}
 */
function ueberwache({ takt = 3000, onStart, onEnde, onTauglich, onUnbrauchbar } = {}) {
  let letzte = null;
  let laeuft = false;
  let fehlschlaege = 0;
  let gemeldet = false;
  let tauglichGemeldet = false;

  const pruefen = async () => {
    if (laeuft) return;
    laeuft = true;
    const jetzt = await leseAppId();
    laeuft = false;

    if (jetzt === null) {
      fehlschlaege += 1;
      // Dreimal hintereinander nichts: Auf diesem Rechner ist der Weg
      // untauglich. Einmal sagen, damit die Web-Abfrage nicht stillschweigend
      // im Schongang bleibt.
      if (fehlschlaege === 3 && !gemeldet) {
        gemeldet = true;
        if (onUnbrauchbar) onUnbrauchbar();
      }
      return;
    }
    fehlschlaege = 0;
    if (!tauglichGemeldet) {
      tauglichGemeldet = true;
      if (onTauglich) onTauglich();
    }

    const w = wechsel(letzte, jetzt);
    letzte = jetzt;
    if (w.art === 'start' && onStart) onStart(w.appId);
    if (w.art === 'ende' && onEnde) onEnde();
  };

  pruefen();
  const uhr = setInterval(pruefen, takt);

  return {
    stop() {
      clearInterval(uhr);
    },
    letzte: () => letzte,
  };
}

module.exports = { SCHLUESSEL, deuteAusgabe, leseAppId, wechsel, ueberwache };
