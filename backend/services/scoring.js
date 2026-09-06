/**
 * Reine Bewertungslogik - Trophäenstufen und Schwierigkeit.
 *
 * Bewusst OHNE Netzwerk- oder Dateizugriff: Diese Funktionen sind das Herz
 * der App und müssen sich ohne Steam-Zugang und ohne Abhängigkeiten prüfen
 * lassen. Vorher steckten sie in derselben Datei wie die Steam-Aufrufe,
 * wodurch die Tests axios brauchten.
 */

// Schwellenwerte der Trophaeenstufen, ueber die .env anpassbar.
//
// Warum die Standardwerte deutlich niedriger liegen als urspruenglich:
// Steam berechnet die Prozentsaetze ueber ALLE Besitzer eines Spiels - auch
// die, die es nie gestartet haben. Dadurch liegen die allermeisten
// Achievements ohnehin unter 60 %, und die alte Grenze Kupfer/Silber bei 60 %
// hatte zur Folge, dass fast nichts Kupfer wurde. Mit 30 % faellt der
// Grossteil der normalen Achievements in Kupfer, und die hoeheren Stufen
// bleiben das, was sie sein sollen: selten.
const TIER_THRESHOLDS = {
  kupfer: Number(process.env.TIER_KUPFER_MIN) || 30, // >= 30 %
  silber: Number(process.env.TIER_SILBER_MIN) || 10, // >= 10 %
  gold: Number(process.env.TIER_GOLD_MIN) || 3, // >= 3 %
  // alles darunter: Platin
};

function categorize(percent) {
  if (percent >= TIER_THRESHOLDS.kupfer) return 'Kupfer';
  if (percent >= TIER_THRESHOLDS.silber) return 'Silber';
  if (percent >= TIER_THRESHOLDS.gold) return 'Gold';
  return 'Platin';
}

// --- Relative Einstufung innerhalb eines Spiels -----------------------------

const STUFEN_ORDNUNG = ['Kupfer', 'Silber', 'Gold', 'Platin'];

// Obergrenzen, damit ein haeufiges Achievement niemals hochgestuft wird.
// Ein Achievement, das 60 % der Spieler haben, ist auch dann nicht "Gold",
// wenn es innerhalb seines Spiels das seltenste ist.
const OBERGRENZEN = {
  Platin: Number(process.env.TIER_REL_PLATIN_MAX) || 25,
  Gold: Number(process.env.TIER_REL_GOLD_MAX) || 45,
  Silber: Number(process.env.TIER_REL_SILBER_MAX) || 70,
};

// Ab welchem Verhaeltnis (leichtestes zu seltenstem Achievement) ein Spiel
// ueberhaupt genug Spreizung hat, dass eine relative Einstufung sinnvoll ist.
const MIN_SPREIZUNG = Number(process.env.TIER_REL_MIN_SPREAD) || 2.5;

/**
 * Baut den Zusammenhang, in dem die Achievements eines Spiels stehen.
 *
 * Hintergrund: Rein absolute Grenzen benachteiligen Spiele, die viele
 * Menschen tatsaechlich durchspielen. Bei einem gut zugaenglichen Titel liegt
 * selbst das schwerste Achievement vielleicht bei 12 % - nach absoluten
 * Grenzen gaebe es dort nie Gold oder Platin, obwohl es innerhalb des Spiels
 * eindeutig die anspruchsvollsten sind.
 *
 * Umgekehrt soll ein Spiel, bei dem praktisch jeder alles bekommt, auch
 * weiterhin nur Kupfer und Silber vergeben. Unterschieden wird das an der
 * Spreizung: Wie stark faellt der Anteil vom leichtesten zum seltensten
 * Achievement ab? Genau der Wert zeigt, wie viele Leute wirklich bis zum
 * Ende durchhalten.
 */
function buildTierContext(percents) {
  const sortiert = [...percents].filter((p) => typeof p === 'number' && p > 0).sort((a, b) => a - b);

  if (sortiert.length < 5) {
    return { relativAktiv: false, sortiert: [] };
  }

  const seltenstes = sortiert[0];
  const leichtestes = sortiert[sortiert.length - 1];
  const spreizung = leichtestes / Math.max(seltenstes, 0.01);

  return {
    relativAktiv: spreizung >= MIN_SPREIZUNG,
    spreizung,
    sortiert,
  };
}

/**
 * Stuft ein Achievement ein: absolute Grenze und relative Stellung innerhalb
 * des Spiels, wobei die hoehere von beiden gilt - begrenzt durch die
 * Obergrenzen oben.
 */
function categorizeInContext(percent, context) {
  const absolut = categorize(percent);
  if (!context || !context.relativAktiv) return absolut;

  const { sortiert } = context;
  // Position im Feld: 0 = seltenstes Achievement des Spiels, 1 = haeufigstes
  const index = sortiert.findIndex((p) => p >= percent);
  const position = index <= 0 ? 0 : index / (sortiert.length - 1);

  let relativ;
  if (position <= 0.05) relativ = 'Platin';
  else if (position <= 0.2) relativ = 'Gold';
  else if (position <= 0.5) relativ = 'Silber';
  else relativ = 'Kupfer';

  // Obergrenze anwenden: haeufige Achievements werden heruntergestuft.
  while (relativ !== 'Kupfer' && percent > OBERGRENZEN[relativ]) {
    relativ = STUFEN_ORDNUNG[STUFEN_ORDNUNG.indexOf(relativ) - 1];
  }

  // Die hoehere der beiden Einstufungen gewinnt.
  return STUFEN_ORDNUNG.indexOf(relativ) > STUFEN_ORDNUNG.indexOf(absolut) ? relativ : absolut;
}

/**
 * Schaetzt die Schwierigkeit der Komplettierung auf einer Skala von 0 bis 10.
 *
 * WICHTIG: Das ist eine BERECHNUNG aus den Seltenheitswerten, keine von
 * Menschen vergebene Bewertung. Es gibt keine oeffentliche Schnittstelle fuer
 * echte Schwierigkeitsbewertungen (Seiten wie TrueSteamAchievements pflegen
 * solche Werte, bieten sie aber nicht als API an). Die Schaetzung kann
 * deshalb nicht erkennen, ob ein Achievement verpassbar ist oder ob ein Spiel
 * einen besonderen Ruf hat - sie misst nur, wie wenige Leute es geschafft
 * haben.
 *
 * Drei Bestandteile:
 *  1. Das seltenste Achievement - es ist der Flaschenhals fuer 100 %.
 *  2. Der Median aller Achievements - zeigt, ob das ganze Spiel zaeh ist
 *     oder nur ein einzelnes Achievement heraussticht.
 *  3. Die Anzahl - viele Achievements bedeuten Aufwand, auch wenn jedes
 *     einzelne machbar ist.
 */
function estimateDifficulty(achievements) {
  const percents = achievements
    .map((a) => a.globalPercent)
    .filter((p) => typeof p === 'number' && p > 0)
    .sort((a, b) => a - b);

  if (percents.length === 0) return null;

  const rarest = Math.max(percents[0], 0.01); // Untergrenze gegen Ausreisser
  const easiest = percents[percents.length - 1]; // meist das erste Achievement
  const median = percents[Math.floor(percents.length / 2)];

  // 1) Das seltenste Achievement - der Flaschenhals fuer 100 %.
  // Logarithmisch, weil der Unterschied zwischen 5 % und 1 % viel schwerer
  // wiegt als der zwischen 60 % und 56 %.
  const vomSeltensten = 2.4 * (1.7 - Math.log10(rarest));

  // 2) Der Absturz vom leichtesten zum seltensten Achievement.
  // Wenn 75 % der Spieler das erste Achievement haben, aber nur 0,01 % das
  // letzte, ist das ein Faktor von 7500. So ein Absturz deutet stark auf
  // verpassbare oder ausgesprochen harte Achievements hin - ein Spiel, das
  // fast jeder anspielt und fast niemand abschliesst. Bei einem Spiel, das
  // gleichmaessig durchlaeuft (90 % bis 45 %), faellt dieser Anteil weg.
  const abfallFaktor = Math.log10(easiest / rarest); // z. B. 75/0,01 -> 3,88
  const vomAbfall = Math.min(3, Math.max(0, (abfallFaktor - 0.8) * 1.1));

  // 3) Ein durchgehend niedriger Median deutet auf ein insgesamt zaehes Spiel.
  const vomMedian = median < 20 ? (20 - median) / 40 : 0; // 0 bis 0,5

  // 4) Aufwand durch schiere Menge.
  const vonDerAnzahl =
    percents.length > 150 ? 1.0 : percents.length > 80 ? 0.7 : percents.length > 40 ? 0.35 : 0;

  const wert = vomSeltensten + vomAbfall + vomMedian + vonDerAnzahl;
  return Math.round(Math.min(10, Math.max(0, wert)) * 10) / 10;
}


module.exports = {
  TIER_THRESHOLDS,
  OBERGRENZEN,
  MIN_SPREIZUNG,
  categorize,
  categorizeInContext,
  buildTierContext,
  estimateDifficulty,
};
