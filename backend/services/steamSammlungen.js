/**
 * Die Spielesammlungen des Anwenders - aus dem Steam-Client auf dieser
 * Maschine, nicht aus dem Netz.
 *
 * WARUM NICHT DIE OFFIZIELLEN GENRES: Die Steam-Web-API kennt keine Genres.
 * Der Store liefert welche, ist aber scharf gedrosselt (rund 200 Anfragen je
 * 5 Minuten), und seine Genres sind grob ("Action, Indie"). "Horror" ist dort
 * gar kein Genre, sondern ein Nutzer-Schlagwort.
 *
 * Die Sammlungen, die jemand sich in der Steam-Bibliothek selbst angelegt
 * hat, sind beides nicht: Sie sind die EIGENE Ordnung des Anwenders, sie sind
 * sofort da, und sie kosten keine einzige Anfrage. Nachgesehen: 36 Stueck,
 * darunter Horror, RPG, Soulslike, Racing, Point and Click.
 *
 * WO SIE LIEGEN: Steam legt sie als lesbares JSON unter
 *   <Steam>/userdata/<Kontonummer>/config/cloudstorage/
 *     cloud-storage-namespace-1.json
 * ab - eine Liste aus [Schluessel, Eintrag]-Paaren. Fuer uns zaehlen die
 * Schluessel, die mit "user-collections." beginnen; alles andere in der Datei
 * sind Einstellungen der Bibliotheksansicht.
 *
 * Die Datei ist der lokale Spiegel der Steam-Cloud. Sie ist also auch dann
 * aktuell, wenn die Sammlungen an einem anderen Rechner angelegt wurden -
 * sobald Steam hier einmal lief. Geschrieben wird sie von Steam; wir lesen
 * ausschliesslich.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

const execFileAsync = promisify(execFile);

// Steam zaehlt Konten intern ohne diesen Sockel. Der Ordner unter userdata
// heisst nach der so gekuerzten Nummer.
const KONTO_SOCKEL = 76561197960265728n;

// Die beiden Sammlungen, die Steam selbst fuehrt. Sie haben feste Schluessel
// und eine andere Bedeutung als selbst angelegte: "Versteckt" soll gar nicht
// erscheinen, "Favoriten" ist eine Auszeichnung, keine Art von Spiel.
const SONDERSCHLUESSEL = {
  'user-collections.favorite': 'favorit',
  'user-collections.hidden': 'versteckt',
};

/**
 * Kontonummer aus der SteamID.
 * @param {string|number|bigint} steamId - die 17-stellige SteamID64
 * @returns {string|null}
 */
function kontoNummer(steamId) {
  try {
    const nummer = BigInt(String(steamId).trim());
    if (nummer <= KONTO_SOCKEL) return null;
    return String(nummer - KONTO_SOCKEL);
  } catch (err) {
    return null;
  }
}

/**
 * Wertet den Inhalt der Steam-Datei aus - ohne Dateizugriff, damit genau
 * diese Auswertung sich pruefen laesst.
 *
 * Robust gegen alles, was Steam dort schon hinterlassen hat: geloeschte
 * Eintraege ohne Wert, Eintraege mit kaputtem JSON, Sammlungen ohne Namen.
 * Ein einziger solcher Eintrag darf nie die ganze Liste kosten.
 *
 * @param {Array} roh - der geparste Dateiinhalt
 * @returns {Array<{id: string, name: string, appIds: number[], dynamisch: boolean, art: string}>}
 */
function deuteSammlungen(roh) {
  if (!Array.isArray(roh)) return [];
  const sammlungen = [];

  for (const paar of roh) {
    if (!Array.isArray(paar) || paar.length < 2) continue;
    const [schluessel, eintrag] = paar;
    if (typeof schluessel !== 'string' || !schluessel.startsWith('user-collections.')) continue;
    if (!eintrag || typeof eintrag !== 'object') continue;
    // Geloeschte Sammlungen bleiben als Grabstein stehen, damit die Cloud sie
    // auch auf anderen Rechnern loescht. Sie haben keinen Wert mehr.
    if (eintrag.is_deleted || typeof eintrag.value !== 'string') continue;

    let daten;
    try {
      daten = JSON.parse(eintrag.value);
    } catch (err) {
      continue;
    }
    if (!daten || typeof daten !== 'object') continue;

    const hinzu = Array.isArray(daten.added) ? daten.added : [];
    const raus = new Set(Array.isArray(daten.removed) ? daten.removed : []);
    const appIds = [...new Set(hinzu.filter((id) => Number.isFinite(id) && !raus.has(id)))];

    sammlungen.push({
      id: typeof daten.id === 'string' ? daten.id : schluessel,
      name: typeof daten.name === 'string' && daten.name.trim() ? daten.name.trim() : 'Ohne Namen',
      appIds,
      // Dynamische Sammlungen ("alle Spiele mit Schlagwort Shooter") fuehren
      // ihre Treffer trotzdem als fertige Liste mit - nachgesehen an einer
      // echten Datei. Wir muessen Steams Filter also nicht nachbauen; der
      // Hinweis bleibt nur, weil sich eine solche Sammlung von selbst
      // aendern kann.
      dynamisch: !!daten.filterSpec,
      art: SONDERSCHLUESSEL[schluessel] || 'eigene',
    });
  }

  return sammlungen;
}

// Einmal gefundener Steam-Ordner. Er wandert nicht, solange die App laeuft.
let gemerkterOrdner;

/**
 * Wo Steam installiert ist.
 *
 * Zuerst die Registry - sie ist die einzige Quelle, die auch bei einer
 * Installation auf einem anderen Laufwerk stimmt (hier zum Beispiel
 * "d:/programme/steam_programm"). Erst danach die ueblichen Pfade.
 */
async function steamOrdner() {
  if (gemerkterOrdner !== undefined) return gemerkterOrdner;

  try {
    const { stdout } = await execFileAsync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { windowsHide: true, timeout: 5000 }
    );
    const treffer = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    const pfad = treffer && treffer[1].trim();
    if (pfad && fs.existsSync(pfad)) {
      gemerkterOrdner = path.normalize(pfad);
      return gemerkterOrdner;
    }
  } catch (err) {
    // Kein Windows, keine Registry, Steam nie installiert - alles kein
    // Fehlerfall, es gibt dann eben keinen Schrank.
  }

  const ueblich = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    path.join(process.env.LOCALAPPDATA || '', 'Steam'),
  ];
  gemerkterOrdner = ueblich.find((p) => p && fs.existsSync(p)) || null;
  return gemerkterOrdner;
}

/** Die Datei, in der die Sammlungen dieses Kontos stehen. */
function sammlungsDatei(ordner, steamId) {
  const konto = kontoNummer(steamId);
  if (!ordner || !konto) return null;
  return path.join(
    ordner,
    'userdata',
    konto,
    'config',
    'cloudstorage',
    'cloud-storage-namespace-1.json'
  );
}

/**
 * Liest die Sammlungen des angemeldeten Kontos.
 *
 * Schlaegt nie fehl, sondern sagt im Klartext, woran es lag - der Schrank
 * zeigt dann einen Hinweis statt einer leeren Wand.
 *
 * @param {string} steamId
 * @returns {Promise<{sammlungen: Array, datei: string|null, stand: number|null, grund: string|null}>}
 */
async function leseSammlungen(steamId) {
  const ordner = await steamOrdner();
  if (!ordner) return { sammlungen: [], datei: null, stand: null, grund: 'kein-steam' };

  const datei = sammlungsDatei(ordner, steamId);
  if (!datei) return { sammlungen: [], datei: null, stand: null, grund: 'kein-konto' };

  try {
    const [inhalt, info] = await Promise.all([fsp.readFile(datei, 'utf8'), fsp.stat(datei)]);
    const sammlungen = deuteSammlungen(JSON.parse(inhalt));
    return { sammlungen, datei, stand: info.mtimeMs, grund: null };
  } catch (err) {
    // ENOENT heisst in aller Regel: Dieses Konto war auf diesem Rechner noch
    // nie in Steam angemeldet. Das ist etwas anderes als eine kaputte Datei.
    const grund = err.code === 'ENOENT' ? 'keine-datei' : 'unlesbar';
    if (grund === 'unlesbar') logger.warn('Sammlungen nicht lesbar: ' + err.message);
    return { sammlungen: [], datei, stand: null, grund };
  }
}

/**
 * Meldet, wenn sich die Sammlungen aendern - damit der Schrank sich
 * umsortiert, sobald in Steam etwas verschoben wird.
 *
 * Steam schreibt die Datei in mehreren Schueben; ohne die Beruhigungszeit
 * kaeme der Rueckruf mehrfach je Aenderung.
 *
 * @returns {Promise<() => void>} Funktion zum Beenden der Ueberwachung
 */
async function ueberwache(steamId, rueckruf, beruhigungMs = 1500) {
  const ordner = await steamOrdner();
  const datei = sammlungsDatei(ordner, steamId);
  if (!datei || !fs.existsSync(datei)) return () => {};

  let timer = null;
  let beobachter;
  try {
    // Den ORDNER beobachten, nicht die Datei: Steam schreibt sie neu, statt
    // sie zu aendern. Ein Beobachter auf der Datei selbst verliert dabei
    // seinen Bezug und meldet danach nie wieder etwas.
    beobachter = fs.watch(path.dirname(datei), (_art, name) => {
      if (name && !String(name).startsWith('cloud-storage-namespace-1')) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        leseSammlungen(steamId).then(rueckruf).catch(() => {});
      }, beruhigungMs);
    });
  } catch (err) {
    logger.warn('Sammlungen koennen nicht ueberwacht werden: ' + err.message);
    return () => {};
  }

  return () => {
    clearTimeout(timer);
    beobachter.close();
  };
}

module.exports = {
  KONTO_SOCKEL,
  kontoNummer,
  deuteSammlungen,
  steamOrdner,
  sammlungsDatei,
  leseSammlungen,
  ueberwache,
};
