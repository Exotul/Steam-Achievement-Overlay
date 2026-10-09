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

// Die fuenf Stufen in ihrer Wertigkeit, mit den Farben aus den Meldungen.
const STUFEN = [
  ['Kupfer', '#c07a42'],
  ['Silber', '#b9c1cc'],
  ['Gold', '#d3a13a'],
  ['Platin', '#8b93e0'],
  ['Blutig', '#d8323c'],
];

let ruht = false;
let stand = null; // Level, XP, Trophaeen je Stufe
let laufendesSpiel = null;
let herausgezogen = null;
const felder = []; // { el, spiel, rechteck }
const farbspeicher = new Map(); // appId -> Ruecken-Farbe
let neueFarben = {};

// --- Aufbau ------------------------------------------------------------------

/*
 * WIE DAS REGAL AUFGETEILT WIRD
 *
 * Erste Fassung: festes Zellenraster, 26 Spiele je Fach, der Rest stand als
 * "26 von 113" auf dem Schild. Doppelt falsch - der Schrank soll die GANZE
 * Sammlung zeigen, und ein Fach mit 7 Spielen war so breit wie eines mit 44.
 *
 * Zweiter Versuch: Zellenraster mit mehreren Zellen je Fach. Ging auch nicht
 * auf, weil jedes Fach ganze Zellen belegen muss: Sieben Spiele in einer
 * Zelle, die 24 fasst, verschenken zwei Drittel der Flaeche - bei 31 Faechern
 * summiert sich das, und am Ende bleiben nur noch Ruecken von 7 px uebrig.
 *
 * Jetzt: BRETTER UND ZEILEN, wie in einem echten Regal.
 *
 *   - Das Regal hat einige Zeilen gleicher Hoehe. Je Zeile ergibt sich
 *     daraus, wie viele Boeden ein Fach uebereinander hat.
 *   - Die BREITE eines Fachs folgt direkt seiner Spielzahl:
 *         Breite = (Spiele / Boeden) * Rueckenbreite + Rand
 *   - Die Faecher werden der Reihe nach in die Zeile gelegt, bis sie voll
 *     ist; dann wird die Zeile genau auf die Regalbreite gestreckt.
 *
 * So ist ein Fach mit 44 Spielen sichtbar breiter als eines mit 7, und es
 * bleibt kein Platz ungenutzt. Gesucht wird die Aufteilung mit den BREITESTEN
 * Ruecken, bei der alle Faecher in die vorhandenen Zeilen passen.
 */

// Masse, bezogen auf einen 1000 px hohen Schrank; groessere wachsen mit.
const RUECKEN_BREITEN = [16, 14, 12, 10, 8];
const BODEN_MIN = 88; // darunter ist ein Ruecken nicht mehr zu lesen
const SCHILD_HOEHE = 26;
const FACH_RAND = 20; // Innenrand eines Fachs, links und rechts zusammen
const FACH_MIN = 70; // so schmal darf ein Fach hoechstens werden
const SPALT = 14; // Abstand zwischen den Faechern

function massstab() {
  return Math.max(0.72, Math.min(2.2, korpus.clientHeight / 1000));
}

/**
 * Teilt die Faecher in Zeilen auf - so, dass jede Zeile genau voll wird.
 *
 * @returns {Array<Array<{fach, breite, jeBoden}>>|null}
 */
function fuelleZeilen(bedarf, regalBreite, zeilenZahl, boeden, ruecken) {
  const zeilen = [];
  let zeile = [];
  let summe = 0;

  const abschliessen = (letzte = false) => {
    // Die Zeile genau auf die Regalbreite strecken. Nach oben ist das
    // unbedenklich (ein Fach bekommt mehr Luft, als es braucht), nach unten
    // nur wenig - sonst passen die Spiele nicht mehr hinein.
    //
    // Die LETZTE Zeile nur begrenzt: Sonst wuerde ein einzelnes Fach mit vier
    // Spielen ueber das halbe Regal gezogen. Was uebrig bleibt, bekommt
    // Krimskrams.
    const verfuegbar = regalBreite - SPALT * (zeile.length - 1);
    const faktor = letzte ? Math.min(verfuegbar / summe, 1.25) : verfuegbar / summe;
    zeile.forEach((e) => {
      e.breite = e.breite * faktor;
      e.jeBoden = Math.max(1, Math.floor((e.breite - FACH_RAND) / ruecken));
    });
    zeilen.push(zeile);
    zeile = [];
    summe = 0;
  };

  for (const eintrag of bedarf) {
    const dazu = summe + eintrag.breite + (zeile.length ? SPALT : 0);
    if (zeile.length && dazu > regalBreite) abschliessen();
    zeile.push({ ...eintrag });
    summe += eintrag.breite;
  }
  if (zeile.length) abschliessen(true);

  // Nach dem Strecken muss jedes Fach seine Spiele noch fassen koennen.
  for (const z of zeilen) {
    for (const e of z) {
      if (e.jeBoden * boeden < e.fach.anzahl) return null;
    }
  }
  return zeilen.length <= zeilenZahl ? zeilen : null;
}

/**
 * Sucht die Aufteilung mit den breitesten Rueckens, in der alles Platz hat.
 */
function planeRegal(faecher, sonderFaecher) {
  const faktor = massstab();
  const hoehe = korpus.clientHeight - 28;
  const breite = korpus.clientWidth - 28;
  const sonderBreite = sonderFaecher.reduce((s, f) => s + f.breite + SPALT, 0);

  for (const rohRuecken of RUECKEN_BREITEN) {
    const ruecken = rohRuecken * faktor;
    for (let zeilenZahl = 4; zeilenZahl <= 9; zeilenZahl++) {
      const zeilenHoehe = (hoehe - SPALT * (zeilenZahl - 1)) / zeilenZahl;
      const boeden = Math.floor((zeilenHoehe - SCHILD_HOEHE * faktor) / (BODEN_MIN * faktor));
      if (boeden < 1) continue;

      // Die Sonderfaecher stehen in der ersten Zeile; der Rest dieser Zeile
      // steht den Sammlungen zur Verfuegung.
      const bedarf = faecher.map((fach) => ({
        fach,
        breite: Math.max(
          FACH_MIN * faktor,
          Math.ceil(fach.anzahl / boeden) * ruecken + FACH_RAND
        ),
      }));

      const ersteZeile = [];
      let belegt = sonderBreite;
      while (bedarf.length && belegt + bedarf[0].breite + SPALT <= breite) {
        const e = bedarf.shift();
        ersteZeile.push(e);
        belegt += e.breite + SPALT;
      }

      const rest = fuelleZeilen(bedarf, breite, zeilenZahl - 1, boeden, ruecken);
      if (!rest) {
        // Zurueck in den Topf - die naechste Runde rechnet neu.
        bedarf.unshift(...ersteZeile);
        continue;
      }

      // Die erste Zeile auf volle Breite bringen, zusammen mit den
      // Sonderfaechern.
      const alleErsten = [...sonderFaecher, ...ersteZeile];
      const summe = alleErsten.reduce((s, e) => s + e.breite, 0);
      const faktorErste = (breite - SPALT * (alleErsten.length - 1)) / summe;
      alleErsten.forEach((e) => {
        e.breite *= faktorErste;
        if (e.fach) e.jeBoden = Math.max(1, Math.floor((e.breite - FACH_RAND) / ruecken));
      });
      const passtErste = alleErsten.every((e) => !e.fach || e.jeBoden * boeden >= e.fach.anzahl);
      if (!passtErste) {
        bedarf.unshift(...ersteZeile);
        continue;
      }

      return { zeilen: [alleErsten, ...rest], boeden, ruecken, zeilenHoehe };
    }
  }
  return null;
}

let letzteDaten = null;

/** Nur die Zahlen im Level-Fach nachziehen, ohne das Raster neu zu legen. */
function aktualisiereLevelFach() {
  const fach = korpus.querySelector('.fach--level');
  if (!fach || !stand) return;
  fach.querySelector('.level__zahl').textContent = stand.level;
  const anteil = stand.xpForThisLevel ? (stand.xpIntoLevel / stand.xpForThisLevel) * 100 : 0;
  fach.querySelector('.level__balken span').style.width = `${Math.min(100, anteil).toFixed(1)}%`;
  fach.querySelector('.level__rest').textContent =
    `${zahl(stand.xpIntoLevel)} / ${zahl(stand.xpForThisLevel)} XP`;
}

function aktualisiereSpielFach() {
  const fach = korpus.querySelector('.fach--spiel');
  if (!fach || !laufendesSpiel) return;
  const s = laufendesSpiel;
  if (Number.isFinite(s.unlockedCount) && s.totalCount > 0) {
    const anteil = (s.unlockedCount / s.totalCount) * 100;
    const balken = fach.querySelector('.level__balken span');
    if (balken) balken.style.width = `${anteil.toFixed(1)}%`;
    const text = fach.querySelector('.level__rest');
    if (text) text.textContent = `${s.unlockedCount} von ${s.totalCount} Achievements`;
  }
}

function baue(daten) {
  letzteDaten = daten;
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

  // Die Sonderfaecher stehen vorn - sie gehoeren dem Anwender, nicht seiner
  // Bibliothek. Ihre Breite ist fest; der Rest der Zeile gehoert den
  // Sammlungen.
  const faktor = massstab();
  const sonderFaecher = [];
  if (stand && Number.isFinite(stand.level)) {
    sonderFaecher.push({ el: baueLevelFach(), breite: 200 * faktor });
  }
  if (stand && stand.stufen) {
    sonderFaecher.push({ el: baueTrophaeenFach(), breite: 430 * faktor });
  }
  if (laufendesSpiel) {
    sonderFaecher.push({ el: baueSpielFach(), breite: 260 * faktor });
  }

  const regal = planeRegal(faecher, sonderFaecher);
  if (!regal) {
    hinweisEl.textContent = 'Der Schrank passt auf diesem Bildschirm nicht.';
    return;
  }
  korpus.style.setProperty('--ruecken-breite', `${regal.ruecken}px`);

  regal.zeilen.forEach((eintraege, nummer) => {
    const zeile = document.createElement('div');
    zeile.className = 'regal-zeile';

    eintraege.forEach((e) => {
      const el = e.el || baueFach(e, regal.boeden);
      el.style.flex = `0 0 ${e.breite}px`;
      zeile.appendChild(el);
    });

    // Bleibt am Ende der letzten Zeile etwas uebrig, kommt Krimskrams hinein -
    // ein halb leeres Brett saehe aus wie ein Fehler.
    if (nummer === regal.zeilen.length - 1) {
      const deko = baueDekoFach(nummer);
      deko.style.flex = '1 1 0';
      zeile.appendChild(deko);
    }

    korpus.appendChild(zeile);
  });

  hinweisEl.textContent = `${daten.anzahlSpiele} Spiele in ${faecher.length} Fächern · aus deinen Steam-Sammlungen`;
  // Erst messen, wenn das Regal wirklich steht.
  requestAnimationFrame(() => requestAnimationFrame(messeFelder));
}

/**
 * Ein Fach mit ALLEN seinen Spielen - auf seine Boeden verteilt.
 *
 * Die Spiele stehen nach Spielzeit sortiert; der oberste Boden bekommt die
 * meistgespielten. Jeder Boden hat seine eigene Vorderkante, wie ein
 * eingezogenes Zwischenbrett.
 */
function baueFach({ fach, jeBoden }, boeden) {
  const el = document.createElement('div');
  el.className = 'fach';

  const kasten = document.createElement('div');
  kasten.className = 'fach__boeden';

  // Gleichmaessig auf die Boeden verteilen statt den ersten vollzustopfen:
  // Ein Regal, in dem oben alles steht und unten drei Spiele, sieht aus wie
  // ein Versehen.
  const noetig = Math.max(1, Math.ceil(fach.anzahl / jeBoden));
  const proBoden = Math.ceil(fach.anzahl / Math.min(boeden, noetig));

  for (let i = 0; i < fach.spiele.length; i += proBoden) {
    const brett = document.createElement('div');
    brett.className = 'brett';
    fach.spiele.slice(i, i + proBoden).forEach((spiel) => brett.appendChild(baueKarton(spiel)));
    kasten.appendChild(brett);
  }

  const schild = document.createElement('div');
  schild.className = 'fach__schild';
  schild.innerHTML = `${escape(fach.name)}<span class="fach__schild-zahl">${fach.anzahl}</span>`;

  el.appendChild(kasten);
  el.appendChild(schild);
  return el;
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
 * Das Level-Fach.
 *
 * Kein Regal, sondern eine beleuchtete Vitrine: die Levelzahl gross, darunter
 * der Balken bis zum naechsten Level. Dieselben Zahlen wie in der Begruessung
 * und im Dashboard - der Hauptprozess schreibt sie nach jeder Trophaee fort.
 */
function baueLevelFach() {
  const el = document.createElement('div');
  el.className = 'fach fach--vitrine fach--level';
  const anteil = stand.xpForThisLevel
    ? Math.max(0, Math.min(100, (stand.xpIntoLevel / stand.xpForThisLevel) * 100))
    : 0;
  el.innerHTML = `
    <div class="vitrine__inhalt">
      <span class="level__zahl">${stand.level}</span>
      <div class="level__balken"><span style="width:${anteil.toFixed(1)}%"></span></div>
      <span class="level__rest">${zahl(stand.xpIntoLevel)} / ${zahl(stand.xpForThisLevel)} XP</span>
    </div>
    <div class="fach__schild">Dein Stand</div>
  `;
  return el;
}

/**
 * Das Fach fuer das laufende Spiel.
 *
 * Es gibt sich nur zu erkennen, solange wirklich gespielt wird - ein Fach,
 * das "gerade nichts" anzeigt, waere die meiste Zeit ein Loch im Schrank.
 */
function baueSpielFach() {
  const s = laufendesSpiel;
  const el = document.createElement('div');
  el.className = 'fach fach--vitrine fach--spiel';
  const hat = Number.isFinite(s.unlockedCount) && Number.isFinite(s.totalCount) && s.totalCount > 0;
  const anteil = hat ? (s.unlockedCount / s.totalCount) * 100 : 0;
  el.innerHTML = `
    <div class="spiel__bild" style="background-image:url('${s.libraryUrl}')"></div>
    <div class="vitrine__inhalt spiel__inhalt">
      <span class="spiel__laeuft">Läuft gerade</span>
      <span class="spiel__name">${escape(s.name || '')}</span>
      ${
        hat
          ? `<div class="level__balken"><span style="width:${anteil.toFixed(1)}%"></span></div>
             <span class="level__rest">${s.unlockedCount} von ${s.totalCount} Achievements</span>`
          : '<span class="level__rest">keine Achievements</span>'
      }
    </div>
    <div class="fach__schild">Im Spiel</div>
  `;
  return el;
}

/**
 * Das Trophaeenfach: fuenf Stufen mit ihrer Anzahl, dazu die Diamanten.
 *
 * Es steht im Regal und nicht nur oben auf dem Schrank: Oben ist Platz fuer
 * drei, vier Dinge, aber nicht fuer sechs Zahlen, die man lesen koennen soll.
 */
function baueTrophaeenFach() {
  const el = document.createElement('div');
  el.className = 'fach fach--vitrine fach--trophaeen';

  const eintraege = STUFEN.map(([name, farbe]) => ({
    name,
    farbe,
    anzahl: (stand.stufen && stand.stufen[name]) || 0,
    diamant: false,
  }));
  if (Number.isFinite(stand.diamanten)) {
    eintraege.push({ name: 'Diamant', farbe: '#5fd3e8', anzahl: stand.diamanten, diamant: true });
  }

  el.innerHTML = `
    <div class="trophaeen">
      ${eintraege
        .map(
          (e) => `
        <div class="trophaee" style="--pokal:${e.farbe}">
          <span class="pokal__koerper${e.diamant ? ' pokal__koerper--diamant' : ''}"></span>
          <span class="trophaee__zahl">${zahl(e.anzahl)}</span>
          <span class="trophaee__name">${e.name}</span>
        </div>`
        )
        .join('')}
    </div>
    <div class="fach__schild">Deine Trophäen</div>
  `;
  return el;
}

/**
 * Was in einem leeren Fach steht.
 *
 * Ein Regal, in dem Faecher einfach leer bleiben, sieht unfertig aus. Hier
 * steht deshalb Krimskrams, wie er sich in einem echten Schrank ansammelt -
 * gezeichnet, nicht geladen. Die Auswahl haengt an der Stelle im Raster und
 * ist damit bei jedem Start dieselbe; ein Schrank, der sich jedes Mal anders
 * einrichtet, waere unruhig.
 */
const DEKO = [
  // Ein Stapel liegender Huellen
  `<svg viewBox="0 0 100 100" class="deko__bild">
     <g stroke="rgba(0,0,0,.45)" stroke-width="1">
       <rect x="18" y="74" width="64" height="9" rx="2" fill="#7a5436"/>
       <rect x="21" y="65" width="58" height="9" rx="2" fill="#8d6243"/>
       <rect x="17" y="56" width="66" height="9" rx="2" fill="#6d4a30"/>
       <rect x="24" y="47" width="52" height="9" rx="2" fill="#9a6e4b"/>
     </g>
   </svg>`,
  // Eine Topfpflanze
  `<svg viewBox="0 0 100 100" class="deko__bild">
     <path d="M50 62 C40 50 34 36 36 22 C46 28 52 40 52 54" fill="#4c7a4a"/>
     <path d="M50 64 C62 54 70 42 70 28 C58 32 52 44 50 58" fill="#5c8f58"/>
     <path d="M50 66 C44 58 32 54 22 56 C30 66 40 70 50 70" fill="#416b40"/>
     <path d="M34 70 H66 L62 90 H38 Z" fill="#8a4a32"/>
     <rect x="32" y="66" width="36" height="6" rx="2" fill="#9c553a"/>
   </svg>`,
  // Ein Gamepad
  `<svg viewBox="0 0 100 100" class="deko__bild">
     <path d="M26 44 H74 C84 44 90 52 88 62 L85 74 C83 82 74 84 69 78 L62 70 H38 L31 78
              C26 84 17 82 15 74 L12 62 C10 52 16 44 26 44 Z" fill="#3b3f49"/>
     <rect x="27" y="56" width="14" height="4" rx="2" fill="#aab2c0"/>
     <rect x="32" y="51" width="4" height="14" rx="2" fill="#aab2c0"/>
     <circle cx="64" cy="55" r="3.4" fill="#d8323c"/>
     <circle cx="72" cy="62" r="3.4" fill="#d3a13a"/>
     <circle cx="64" cy="69" r="3.4" fill="#8b93e0"/>
     <circle cx="56" cy="62" r="3.4" fill="#6bd39a"/>
   </svg>`,
  // Schraeg stehende Buecher
  `<svg viewBox="0 0 100 100" class="deko__bild">
     <g stroke="rgba(0,0,0,.4)" stroke-width="1">
       <rect x="22" y="34" width="12" height="52" rx="2" fill="#6b4a6e"/>
       <rect x="35" y="30" width="10" height="56" rx="2" fill="#4a5c7a"/>
       <rect x="46" y="38" width="13" height="48" rx="2" fill="#7a5436"/>
       <g transform="rotate(16 66 86)">
         <rect x="60" y="40" width="11" height="46" rx="2" fill="#5c7a4a"/>
       </g>
     </g>
   </svg>`,
  // Eine Kerze auf einem Teller
  `<svg viewBox="0 0 100 100" class="deko__bild">
     <ellipse cx="50" cy="86" rx="22" ry="5" fill="#6d5b48"/>
     <rect x="41" y="46" width="18" height="38" rx="3" fill="#e8dcc4"/>
     <path d="M50 46 C46 40 46 34 50 28 C54 34 54 40 50 46 Z" fill="#ffc46b"/>
     <circle cx="50" cy="36" r="7" fill="#ffb347" opacity=".35"/>
   </svg>`,
];

function baueDekoFach(nummer) {
  const el = document.createElement('div');
  // Jedes dritte Fach bleibt wirklich leer - sonst wirkt der Schrank
  // vollgestellt, und die Durchblicke waren ja Absicht.
  if (nummer % 3 === 2) {
    el.className = 'fach fach--leer';
    return el;
  }
  el.className = 'fach fach--deko';
  el.innerHTML = `<div class="deko">${DEKO[nummer % DEKO.length]}</div>`;
  return el;
}

/**
 * Oben auf dem Schrank: die Trophaeen je Stufe mit ihrer Anzahl.
 *
 * Die Zahlen kommen aus derselben Berechnung, die auch das Level ermittelt -
 * sie faellt beim Durchgehen der Bibliothek ohnehin an.
 */
function baueAufsatz() {
  aufsatz.innerHTML = '';
  if (!stand || !stand.stufen) return;

  for (const [name, farbe] of STUFEN) {
    const anzahl = stand.stufen[name] || 0;
    const el = document.createElement('div');
    el.className = 'pokal';
    el.style.setProperty('--pokal', farbe);
    el.innerHTML = `
      <span class="pokal__koerper"></span>
      <span class="pokal__zahl">${zahl(anzahl)}</span>
      <span class="pokal__name">${name}</span>
    `;
    aufsatz.appendChild(el);
  }

  if (Number.isFinite(stand.diamanten)) {
    const d = document.createElement('div');
    d.className = 'pokal pokal--diamant';
    d.innerHTML = `
      <span class="pokal__koerper"></span>
      <span class="pokal__zahl">${zahl(stand.diamanten)}</span>
      <span class="pokal__name">Diamant</span>
    `;
    aufsatz.appendChild(d);
  }
}

const zahl = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('de-DE') : '–');

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
  window.schrankAPI.onStand((neu) => {
    const vorher = stand && stand.level;
    // Nur ERGAENZEN, nie ueberschreiben: Nach einer Trophaee meldet der
    // Hauptprozess sofort das neue Level, aber ohne Stufenzahlen - die
    // stammen aus der grossen Berechnung. Ein schlichtes Zusammenfuehren
    // wuerde die Zahlen oben auf dem Schrank dabei loeschen.
    const ergaenzt = { ...(stand || {}) };
    for (const [feld, wert] of Object.entries(neu || {})) {
      if (wert !== undefined && wert !== null) ergaenzt[feld] = wert;
    }
    stand = ergaenzt;
    baueAufsatz();
    if (letzteDaten && vorher !== stand.level) baue(letzteDaten);
    else aktualisiereLevelFach();
  });
  window.schrankAPI.onSpiel((spiel) => {
    const vorher = !!laufendesSpiel;
    laufendesSpiel = spiel;
    // Kommt oder geht das Fach, muss das Raster neu gelegt werden.
    if (letzteDaten && vorher !== !!spiel) baue(letzteDaten);
    else if (spiel) aktualisiereSpielFach();
  });
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
