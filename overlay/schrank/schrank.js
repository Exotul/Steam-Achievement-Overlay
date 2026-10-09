/**
 * Der Spieleschrank: Faecher aus den Steam-Sammlungen, darin die Spiele als
 * Packungen mit sichtbarem Ruecken.
 *
 * Zwei Dinge sind hier anders als in einer normalen Oberflaeche:
 *
 *  1. KEINE MAUSEREIGNISSE. Das Fenster liegt im Hintergrund, der Zeiger
 *     erreicht es nie. Der Hauptprozess meldet stattdessen seine Position,
 *     und wir rechnen selbst aus, ueber welcher Packung er steht.
 *  2. DIE RUECKENFARBE kommt aus dem Titelbild. Steam liefert keine
 *     Buchruecken, also nehmen wir die kraeftigste Farbe des Bildes und
 *     zeichnen den Ruecken daraus.
 */

const korpus = document.getElementById('korpus');
const aufsatz = document.getElementById('aufsatz');
const hinweisEl = document.getElementById('hinweis');

// Wie viele Packungen in einem Fach ueberhaupt Platz finden. Mehr waeren nur
// noch Striche - Horror hat 113 Spiele, die passen in kein Fach der Welt.
const MAX_JE_FACH = 26;

let ruht = false;
let herausgezogen = null;
const felder = []; // { el, spiel, rechteck }
const farbspeicher = new Map(); // appId -> Ruecken-Farbe
let neueFarben = {};

// --- Aufbau ------------------------------------------------------------------

/**
 * Das unregelmaessige Raster.
 *
 * Vorbild ist ein Regal, bei dem einzelne Faecher doppelt so breit sind und
 * dazwischen Durchblicke offen bleiben. Die Verteilung ist bewusst NICHT
 * zufaellig: Der Schrank steht den ganzen Tag da, und ein Raster, das sich
 * bei jedem Start anders anordnet, wirkt unruhig. Dieselbe Bibliothek ergibt
 * deshalb immer denselben Schrank.
 *
 * Die Breite richtet sich nach dem Inhalt: Ein Fach mit vielen Spielen wird
 * doppelt so breit. Das ist nicht nur Zierde - in einem breiten Fach haben
 * die Ruecken mehr Platz und die Titel bleiben lesbar.
 */
function planeRaster(faecher, spalten) {
  const plan = [];
  let belegt = 0;
  faecher.forEach((fach, i) => {
    const platzInZeile = spalten - (belegt % spalten);
    // Voll genug fuer ein breites Fach? Und passt es noch in die Zeile?
    const breit = fach.anzahl >= 18 && platzInZeile >= 2;
    plan.push(breit ? 2 : 1);
    belegt += breit ? 2 : 1;
  });
  // Was in der letzten Zeile uebrig bleibt, wird zum offenen Durchblick -
  // besser als eine Luecke, die wie ein Fehler aussieht.
  const rest = (spalten - (belegt % spalten)) % spalten;
  return { plan, durchblicke: rest };
}

function spaltenFuer(anzahl) {
  // So viele Spalten, dass die Faecher moeglichst quadratisch bleiben.
  const verhaeltnis = window.innerWidth / Math.max(1, window.innerHeight * 0.86);
  return Math.max(4, Math.min(9, Math.round(Math.sqrt(anzahl * verhaeltnis))));
}

function baue(daten) {
  korpus.innerHTML = '';
  felder.length = 0;

  // Beim Start liegen die Rueckenfarben vom letzten Mal schon bereit - dann
  // steht der Schrank sofort farbig, ohne 600 Bilder zu laden.
  if (daten.farben) {
    for (const [appId, farbe] of Object.entries(daten.farben)) {
      farbspeicher.set(Number(appId), farbe);
    }
  }

  const faecher = daten.faecher || [];
  if (!faecher.length) {
    hinweisEl.textContent = hinweisZu(daten.grund);
    return;
  }

  const spalten = spaltenFuer(faecher.length);
  const { plan, durchblicke } = planeRaster(faecher, spalten);
  korpus.style.gridTemplateColumns = `repeat(${spalten}, 1fr)`;

  faecher.forEach((fach, i) => {
    const el = document.createElement('div');
    el.className = 'fach';
    if (plan[i] === 2) el.style.gridColumn = 'span 2';

    const reihe = document.createElement('div');
    reihe.className = 'fach__reihe';

    const sichtbar = fach.spiele.slice(0, MAX_JE_FACH);
    sichtbar.forEach((spiel) => reihe.appendChild(baueKarton(spiel)));

    const schild = document.createElement('div');
    schild.className = 'fach__schild';
    const rest = fach.anzahl - sichtbar.length;
    schild.innerHTML = `${escape(fach.name)}<span class="fach__schild-zahl">${
      rest > 0 ? `${sichtbar.length} von ${fach.anzahl}` : fach.anzahl
    }</span>`;

    el.appendChild(reihe);
    el.appendChild(schild);
    korpus.appendChild(el);
  });

  for (let i = 0; i < durchblicke; i++) {
    const leer = document.createElement('div');
    leer.className = 'fach fach--leer';
    korpus.appendChild(leer);
  }

  hinweisEl.textContent = `${daten.anzahlSpiele} Spiele in ${faecher.length} Fächern · aus deinen Steam-Sammlungen`;
  // Erst messen, wenn das Raster wirklich steht.
  requestAnimationFrame(() => requestAnimationFrame(messeFelder));
}

function baueKarton(spiel) {
  const el = document.createElement('div');
  el.className = 'packung' + (spiel.favorit ? ' packung--favorit' : '');
  el.style.setProperty('--spine', farbspeicher.get(spiel.appId) || notfarbe(spiel.appId));
  el.innerHTML = `
    <div class="packung__ruecken"><span class="packung__titel">${escape(spiel.name)}</span></div>
    <div class="packung__front"></div>
  `;
  felder.push({ el, spiel, rechteck: null });
  // Ein Bild NUR laden, wenn die Farbe noch fehlt. Beim ersten Start sind das
  // alle - danach keines mehr. Das Titelbild selbst kommt erst, wenn der
  // Zeiger die Packung herauszieht; 609 Bilder auf Vorrat waeren Unfug.
  if (!farbspeicher.has(spiel.appId)) bestimmeFarbe(spiel, el);
  return el;
}

/**
 * Farbe aus dem Titelbild.
 *
 * Gesucht ist nicht der Durchschnitt - der ist bei jedem Bild ein mattes
 * Braungrau. Gesucht ist die kraeftigste Farbe, so wie ein Verlag sie fuer
 * den Ruecken nehmen wuerde. Deshalb werden die Bildpunkte nach Buntheit
 * gewichtet und zu dunkle wie zu blasse uebergangen.
 */
function bestimmeFarbe(spiel, el) {
  if (farbspeicher.has(spiel.appId)) return;
  const bild = new Image();
  bild.crossOrigin = 'anonymous';
  bild.referrerPolicy = 'no-referrer';
  bild.onload = () => {
    let farbe;
    try {
      farbe = kraeftigsteFarbe(bild);
    } catch (err) {
      // Liefert der Bildserver keine Freigabe, ist die Leinwand gesperrt.
      // Dann bleibt es bei der Notfarbe - kein Grund, den Schrank zu stoeren.
      farbe = null;
    }
    const wert = farbe || notfarbe(spiel.appId);
    farbspeicher.set(spiel.appId, wert);
    neueFarben[spiel.appId] = wert;
    el.style.setProperty('--spine', wert);
  };
  bild.onerror = () => {
    // Kein hochformatiges Bild - dann das breite Kopfbild versuchen.
    if (bild.src !== spiel.headerUrl) bild.src = spiel.headerUrl;
  };
  bild.src = spiel.libraryUrl;
}

function kraeftigsteFarbe(bild) {
  const leinwand = document.createElement('canvas');
  const b = 24;
  const h = Math.max(1, Math.round((bild.height / bild.width) * b));
  leinwand.width = b;
  leinwand.height = h;
  const ctx = leinwand.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bild, 0, 0, b, h);
  const d = ctx.getImageData(0, 0, b, h).data;

  let beste = null;
  let bestWert = -1;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const bl = d[i + 2];
    const max = Math.max(r, g, bl);
    const min = Math.min(r, g, bl);
    const buntheit = max - min;
    const helligkeit = (max + min) / 2;
    if (helligkeit < 30 || helligkeit > 225) continue;
    const wert = buntheit * 2 + helligkeit * 0.35;
    if (wert > bestWert) {
      bestWert = wert;
      beste = [r, g, bl];
    }
  }
  if (!beste) return null;

  // Abdunkeln: Ein Ruecken im Regal liegt im Halbschatten, und heller Text
  // muss darauf lesbar bleiben.
  const [r, g, b2] = beste.map((v) => Math.round(v * 0.52));
  return `rgb(${r}, ${g}, ${b2})`;
}

/** Ohne Bild: eine ruhige Farbe, die zum Spiel passt und sich nie aendert. */
function notfarbe(appId) {
  const ton = (appId * 47) % 360;
  return `hsl(${ton}, 24%, 30%)`;
}

// --- Der Zeiger --------------------------------------------------------------

function messeFelder() {
  for (const f of felder) f.rechteck = f.el.getBoundingClientRect();
}

/**
 * Welche Packung liegt unter dem Zeiger?
 *
 * Der Fangbereich ist etwas breiter als der Ruecken: Bei 10 px Breite waere
 * er sonst kaum zu treffen, und der Schrank soll sich grosszuegig anfuehlen.
 */
function zeigerBei(x, y) {
  if (ruht || x === null) return setzeHeraus(null);
  let treffer = null;
  for (const f of felder) {
    const r = f.rechteck;
    if (!r) continue;
    if (y < r.top - 6 || y > r.bottom + 6) continue;
    if (x < r.left - 5 || x > r.right + 5) continue;
    treffer = f;
    break;
  }
  setzeHeraus(treffer);
}

let ausgabeEl = null;

function setzeHeraus(feld) {
  if (herausgezogen === feld) return;
  if (herausgezogen) herausgezogen.el.classList.remove('packung--heraus');
  herausgezogen = feld;
  if (!ausgabeEl) {
    ausgabeEl = document.createElement('div');
    ausgabeEl.className = 'ausgabe';
    document.getElementById('raum').appendChild(ausgabeEl);
  }
  if (!feld) {
    ausgabeEl.classList.remove('ausgabe--an');
    return;
  }
  feld.el.classList.add('packung--heraus');
  zeigeDeckel(feld);
  const std = Math.round(feld.spiel.spielzeitMin / 60);
  ausgabeEl.innerHTML = `<span>${escape(feld.spiel.name)}</span><span class="ausgabe__zeit">${
    std > 0 ? `${std} Std gespielt` : 'noch nie gespielt'
  }</span>`;
  ausgabeEl.classList.add('ausgabe--an');
}

/**
 * Das Titelbild der herausgezogenen Packung.
 *
 * Es wird erst hier geladen: Beim Darueberfahren braucht es einen Moment,
 * bis es da ist, und genau solange zeigt die Packung ihre Rueckenfarbe -
 * das sieht aus wie eine Packung, die sich zum Betrachter dreht, und nicht
 * wie ein Ladevorgang.
 */
function zeigeDeckel(feld) {
  const front = feld.el.querySelector('.packung__front');
  if (!front || front.dataset.geladen) return;
  front.dataset.geladen = '1';
  const bild = new Image();
  bild.onload = () => {
    front.style.backgroundImage = `url("${bild.src}")`;
  };
  bild.onerror = () => {
    if (bild.src !== feld.spiel.headerUrl) bild.src = feld.spiel.headerUrl;
  };
  bild.referrerPolicy = 'no-referrer';
  bild.src = feld.spiel.libraryUrl;
}

// --- Kleinkram ----------------------------------------------------------------

function escape(text) {
  const d = document.createElement('div');
  d.textContent = String(text ?? '');
  return d.innerHTML;
}

function hinweisZu(grund) {
  switch (grund) {
    case 'kein-steam':
      return 'Steam wurde auf diesem Rechner nicht gefunden.';
    case 'keine-datei':
    case 'kein-konto':
      return 'Für dieses Steam-Konto liegen auf diesem Rechner keine Sammlungen.';
    case 'unlesbar':
      return 'Die Sammlungen von Steam ließen sich nicht lesen.';
    default:
      return 'Noch keine Spiele im Schrank.';
  }
}

// --- Anschluss an den Hauptprozess ---------------------------------------------

if (window.schrankAPI) {
  window.schrankAPI.onDaten((daten) => baue(daten));
  window.schrankAPI.onZeiger((p) => zeigerBei(p ? p.x : null, p ? p.y : null));
  window.schrankAPI.onRuhe((r) => {
    ruht = !!r;
    document.body.classList.toggle('ruhe', ruht);
    if (ruht) setzeHeraus(null);
  });
  window.schrankAPI.bereit();

  // Gefundene Farben sammeln und gelegentlich sichern - beim naechsten Start
  // steht der Schrank dann sofort in seinen Farben, ohne 600 Bilder.
  setInterval(() => {
    if (Object.keys(neueFarben).length === 0) return;
    window.schrankAPI.farbenMerken(neueFarben);
    neueFarben = {};
  }, 4000);
}

window.addEventListener('resize', () => {
  clearTimeout(window.__messen);
  window.__messen = setTimeout(messeFelder, 200);
});
