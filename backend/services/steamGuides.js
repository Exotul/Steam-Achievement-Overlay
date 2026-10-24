/**
 * Den 100-%-Walkthrough zu einem Spiel finden.
 *
 * WOHER: Steam-Guides sind "published files" wie Workshop-Inhalte, und dafuer
 * gibt es eine offizielle Schnittstelle - IPublishedFileService/QueryFiles.
 * Es muss also NICHTS von einer Webseite abgegriffen werden, und der
 * vorhandene API-Schluessel reicht. Nachgesehen an Dead Space (Remake):
 *
 *     145 Guides insgesamt
 *      60 mit dem Tag "Achievements"
 *      21 davon auf Englisch
 *       1 auf Deutsch
 *
 * Ganz oben steht dort "100% Achievement Guide: Dead Space (Remake)" mit
 * 302 von 306 Stimmen und 14.474 Aufrufen - genau das Gesuchte.
 *
 * ZWEI DINGE, DIE NACHGEMESSEN SIND UND NICHT GERATEN:
 *
 * 1. filetype=10 (IntegratedGuide) sind die Community-Guides. filetype=9
 *    (WebGuide) liefert fuer jedes gepruefte Spiel null Treffer.
 *
 * 2. Das Feld `language` taugt NICHT zum Filtern: Russische Guides stehen
 *    dort teils auf 0, genau wie englische. Verlaesslich ist der Sprach-TAG
 *    ("english", "russian", "Ukrainian" - die Schreibweise wechselt, deshalb
 *    wird klein verglichen). Und der laesst sich serverseitig filtern.
 *
 * Gesucht wird deshalb zweimal, einmal je gewuenschter Sprache, und das
 * Ergebnis zusammengelegt. Zwei Abfragen je Spiel, tagelang gemerkt - Guides
 * aendern sich selten.
 */

const { steamGet, key } = require('./steamApi');
const logger = require('./logger');

const BASE = 'https://api.steampowered.com';

// Nur diese beiden Sprachen - ausdruecklich so gewuenscht.
const SPRACHEN = ['english', 'german'];

// Community-Guides. Nachgemessen: 9 liefert nichts, 10 ist richtig.
const DATEITYP_GUIDE = 10;

// Nach Bewertung sortiert (query_type 0 = RankedByVote).
const SORTIERUNG = 0;

const WOERTER_STARK = [
  '100%',
  '100 %',
  'all achievements',
  'alle achievements',
  'alle erfolge',
  'achievement guide',
  'erfolge-guide',
  'komplettlösung',
  'full completion',
];

const WOERTER_SCHWACH = ['walkthrough', 'komplett', 'achievements', 'erfolge', 'guide'];

/**
 * Wie gut passt dieser Guide auf "100 % Walkthrough mit allen Achievements"?
 *
 * Eigene, reine Funktion - das ist die Entscheidung, die der Anwender spaeter
 * beurteilt, und sie soll sich ohne Netz pruefen lassen.
 *
 * WARUM NICHT EINFACH DER BESTBEWERTETE: Nachgemessen bei Dead Space steht auf
 * Platz 2 der Bewertung eine russische Sprachdatei, die den Tag
 * "Achievements" ebenfalls traegt, und auf Platz 3 ein englischer Guide ueber
 * einen Spruch von Isaac. Die Stimmen allein treffen es also nicht; der Titel
 * muss mitreden.
 *
 * @param {{titel?: string, kurz?: string, punktzahl?: number, aufrufe?: number}} g
 * @returns {number}
 */
function bewerte(g) {
  const text = `${g.titel || ''} ${g.kurz || ''}`.toLowerCase();

  let punkte = 0;
  // Die Bewertung durch andere Spieler ist die Grundlage - aber nur die
  // Grundlage.
  punkte += (Number(g.punktzahl) || 0) * 50;

  if (WOERTER_STARK.some((w) => text.includes(w))) punkte += 60;
  if (WOERTER_SCHWACH.some((w) => text.includes(w))) punkte += 12;

  // Steht "100" und "achievement" zusammen im TITEL, ist es so gut wie sicher
  // der gesuchte Guide.
  const titel = String(g.titel || '').toLowerCase();
  if (/100\s*%/.test(titel) && /(achievement|erfolg)/.test(titel)) punkte += 40;

  // Aufrufe als leiser Hinweis auf Brauchbarkeit, gedeckelt: Ein Guide mit
  // 200.000 Aufrufen ist nicht zwanzigmal besser als einer mit 10.000.
  punkte += Math.min(15, Math.log10(Math.max(1, Number(g.aufrufe) || 0)) * 3);

  return Math.round(punkte * 10) / 10;
}

/** Die Sprach-Tags eines Eintrags, klein geschrieben. */
function sprachen(tags) {
  return (tags || [])
    .map((t) => String((t && t.tag) || t || '').toLowerCase())
    .filter((t) => SPRACHEN.includes(t));
}

/**
 * Macht aus einem Eintrag der Schnittstelle das, was die App braucht.
 *
 * @returns {object|null} null, wenn Pflichtangaben fehlen
 */
function deuteEintrag(roh) {
  const id = String((roh && roh.publishedfileid) || '').trim();
  if (!/^\d+$/.test(id)) return null;

  const stimmenHoch = Number(roh.vote_data?.votes_up) || 0;
  const stimmenRunter = Number(roh.vote_data?.votes_down) || 0;

  const g = {
    id,
    titel: String(roh.title || '').trim() || `Guide ${id}`,
    kurz: String(roh.short_description || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    bild: typeof roh.preview_url === 'string' ? roh.preview_url : null,
    stimmenHoch,
    stimmenGesamt: stimmenHoch + stimmenRunter,
    punktzahl: Number(roh.vote_data?.score) || 0,
    aufrufe: Number(roh.views) || 0,
    geaendert: Number(roh.time_updated) || Number(roh.time_created) || 0,
    sprachen: sprachen(roh.tags),
    // Die Seite, die spaeter im Fenster steht. Gelesen wird sie dort von
    // Steam selbst - die App kopiert keine fremden Texte.
    url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`,
  };
  g.punkte = bewerte(g);
  return g;
}

/**
 * Sortiert und entdoppelt eine Sammlung von Eintraegen.
 *
 * Entdoppeln ist noetig, weil zweimal gefragt wird (je Sprache) und ein Guide
 * beide Tags tragen kann.
 */
function ordne(eintraege) {
  const nachId = new Map();
  for (const g of eintraege) {
    if (!g) continue;
    if (!nachId.has(g.id)) nachId.set(g.id, g);
  }
  return [...nachId.values()].sort(
    (a, b) => b.punkte - a.punkte || b.aufrufe - a.aufrufe || a.titel.localeCompare(b.titel, 'de')
  );
}

/** Eine Abfrage an die Schnittstelle. */
async function frage(appId, sprache, anzahl) {
  const { data } = await steamGet(`${BASE}/IPublishedFileService/QueryFiles/v1/`, {
    params: {
      key: key(),
      appid: appId,
      filetype: DATEITYP_GUIDE,
      query_type: SORTIERUNG,
      numperpage: anzahl,
      'requiredtags[0]': 'Achievements',
      'requiredtags[1]': sprache,
      return_metadata: 1,
      return_vote_data: 1,
      return_tags: 1,
      return_short_description: 1,
    },
  });
  return data?.response?.publishedfiledetails || [];
}

/**
 * Die besten Guides zu einem Spiel - englisch und deutsch.
 *
 * @param {number|string} appId
 * @param {{anzahl?: number}} [o]
 * @returns {Promise<{guides: Array, gefunden: number}>}
 */
async function sucheGuides(appId, { anzahl = 12 } = {}) {
  const treffer = await Promise.all(
    SPRACHEN.map((sprache) =>
      frage(appId, sprache, anzahl).catch((err) => {
        logger.debug(`Guides (${sprache}) für ${appId} nicht abrufbar: ${err.message}`);
        return [];
      })
    )
  );

  const guides = ordne(treffer.flat().map(deuteEintrag));
  return { guides, gefunden: guides.length };
}

module.exports = {
  SPRACHEN,
  DATEITYP_GUIDE,
  bewerte,
  sprachen,
  deuteEintrag,
  ordne,
  sucheGuides,
};
