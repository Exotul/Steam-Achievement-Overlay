/**
 * Die Rueckenfarben der Spielepackungen.
 *
 * Sie werden aus dem Titelbild gewonnen (siehe schrank/schrank.js). Das
 * kostet pro Spiel ein geladenes Bild - bei 600 Spielen also 600 Bilder, nur
 * damit der Schrank in seinen Farben steht.
 *
 * Deshalb werden die gefundenen Farben hier gemerkt. Beim naechsten Start
 * stehen alle Ruecken sofort richtig, und die Bilder werden nur noch
 * nachgeladen, wo der Zeiger hinkommt. Eine Farbe aendert sich nur, wenn
 * Steam das Titelbild austauscht - dann ist sie beim naechsten Mal wieder da.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const ORDNER = process.env.DATA_DIR || path.join(os.homedir(), '.trophaenschrank');
const DATEI = path.join(ORDNER, 'schrank-farben.json');

// Eine Farbe ist ein kurzer Text wie "rgb(90, 74, 106)". Alles andere kommt
// nicht von uns und wird nicht uebernommen - die Datei ist von Hand
// bearbeitbar, und ein beliebiger Text landete sonst ungeprueft im CSS.
const FARBE = /^(rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|hsl\([^)]{1,30}\)|#[0-9a-f]{3,8})$/i;

let gemerkt = null;

function laden() {
  if (gemerkt) return gemerkt;
  try {
    const roh = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
    gemerkt = {};
    for (const [appId, farbe] of Object.entries(roh)) {
      if (/^\d+$/.test(appId) && typeof farbe === 'string' && FARBE.test(farbe.trim())) {
        gemerkt[appId] = farbe.trim();
      }
    }
  } catch (err) {
    // Noch nie gelaufen oder Datei kaputt - dann eben von vorn.
    gemerkt = {};
  }
  return gemerkt;
}

/** Neue Farben dazulegen. Gibt zurueck, wie viele wirklich neu waren. */
function ergaenze(neue) {
  if (!neue || typeof neue !== 'object') return 0;
  const alle = laden();
  let dazu = 0;
  for (const [appId, farbe] of Object.entries(neue)) {
    if (!/^\d+$/.test(appId)) continue;
    if (typeof farbe !== 'string' || !FARBE.test(farbe.trim())) continue;
    if (alle[appId] === farbe.trim()) continue;
    alle[appId] = farbe.trim();
    dazu++;
  }
  if (dazu === 0) return 0;

  try {
    fs.mkdirSync(ORDNER, { recursive: true });
    fs.writeFileSync(DATEI, JSON.stringify(alle), 'utf8');
  } catch (err) {
    logger.warn('Rueckenfarben konnten nicht gemerkt werden: ' + err.message);
  }
  return dazu;
}

module.exports = { DATEI, laden, ergaenze, _pruefeFarbe: (f) => FARBE.test(String(f).trim()) };
