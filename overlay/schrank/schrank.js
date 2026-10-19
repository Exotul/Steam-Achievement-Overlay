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
/*
 * Das Aussehen kommt vom Hauptprozess (lib/schrankAussehen.js): Holztoene,
 * Wandfarbe, Schrift und die Betriebsart der Rueckenfarbe. Bis es da ist,
 * gilt, was im CSS steht - sonst staende der Schrank beim Start einen Moment
 * lang farblos da.
 */
let aussehen = { ruecken: 'bild', verlauf: true, sammlungsfarben: {} };
// Welches Fach gerade gebaut wird - fuer die Betriebsart "sammlung".
let fachImBau = null;
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

  // Die Abstaende ZWISCHEN den Faechern gehoeren mitgerechnet. Ohne sie wird
  // jede Zeile um ein paar Pixel zu voll, muss beim Strecken also schrumpfen -
  // und dann passen die Spiele nicht mehr hinein. Das Ergebnis war: "Der
  // Schrank passt auf diesem Bildschirm nicht."
  const abstaende = (anzahl) => SPALT * Math.max(0, anzahl - 1);

  for (const eintrag of bedarf) {
    if (zeile.length && summe + eintrag.breite + abstaende(zeile.length + 1) > regalBreite) {
      abschliessen();
    }
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
      // Nichts von den Sammlungen passt mehr in die erste Zeile? Dann ist das
      // kein Grund aufzugeben - die uebrigen Zeilen koennen es trotzdem.


      const rest = fuelleZeilen(bedarf, breite, zeilenZahl - 1, boeden, ruecken);
      if (!rest) {
        // Zurueck in den Topf - die naechste Runde rechnet neu.
        bedarf.unshift(...ersteZeile);
        continue;
      }

      // Die erste Zeile auf volle Breite bringen, zusammen mit den
      // Sonderfaechern - aber begrenzt, genau wie die letzte Zeile.
      //
      // Ohne die Grenze wurde ein kleines Fach ueber das halbe Regal gezogen:
      // "Fast geschafft" mit 20 Spielen war 1070 px breit, die Ruecken
      // fuellten davon 550, und rechts stand ein leeres Brett. Was uebrig
      // bleibt, bekommt Krimskrams - dafuer gibt es die Dekofaecher.
      const alleErsten = [...sonderFaecher, ...ersteZeile];
      const summe = alleErsten.reduce((s, e) => s + e.breite, 0);
      const faktorErste = Math.min((breite - SPALT * (alleErsten.length - 1)) / summe, 1.25);
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

/**
 * Holz, Wand, Schrift und Verlauf setzen.
 *
 * Nur CSS-Variablen am Wurzelelement - kein Neuaufbau. Wer am Holzregler
 * dreht, soll die Farbe wandern sehen, nicht 611 Packungen neu entstehen.
 * Die RUECKENFARBE ist die Ausnahme: Sie steckt in jeder einzelnen Packung,
 * deshalb wird bei einer Umstellung neu gebaut (siehe unten beim Empfang).
 */
/* ---------------------------------------------------------------------------
   Das Aufblitzen der Diamanten
   ---------------------------------------------------------------------------
   Die Animation laeuft NICHT dauernd. Nachgemessen am echten Schrank mit 630
   Packungen (Leerlauf, Median aus acht Proben):

       ohne Auszeichnung              0,01 % der CPU
       Deckkraft dauerhaft            1,02 %
       fahrender Streifen             3,49 %   (0,42 Kerne)

   Die Ruecken sind rund und beschneiden ihren Inhalt, deshalb bekommt ein
   bewegter Streifen keine eigene Ebene und zwingt bei jedem Bild zum
   Neuzeichnen - bei 4K teuer. Also wird die Animation nur fuer die Dauer des
   Blitzes eingeschaltet: gut eine Sekunde alle neun. Im Mittel bleibt davon
   rund ein Achtel uebrig, und es sieht besser aus als ein Dauerflackern.
   --------------------------------------------------------------------------- */

/*
 * DER EIGENTLICHE KOSTENTREIBER ist nicht der Schimmer, sondern dass ueberhaupt
 * etwas animiert wird: Solange eine Animation laeuft, setzt die Grafik das
 * ganze 4K-Bild Bild fuer Bild neu zusammen - egal, wie klein die Aenderung
 * ist. Nachgemessen am laufenden Programm (Leerlauf, ganze App):
 *
 *     ohne Glanz                           0,02 % der CPU
 *     Glanz im Ruecken, alle 9 s           1,00 %
 *     Glanz auf der Packung, alle 9 s      0,71 %
 *     Glanz auf der Packung, alle 20 s     siehe README
 *
 * Die eigene Ebene (auf der Packung statt im beschnittenen Ruecken) bringt
 * also etwas, aber das meiste macht der Takt. Deshalb selten und kurz: ein
 * Glanz, den man nebenbei auffaengt, nicht einer, der um Aufmerksamkeit
 * bittet.
 */
const GLANZ_ABSTAND_MS = 20000;
const GLANZ_DAUER_MS = 950;
let glanzUhr = null;
let glanzAus = null;

function starteGlanz() {
  stoppeGlanz();
  // Nichts zu tun, wenn es nichts auszuzeichnen gibt.
  if (!aussehen.diamant || ruht) return;
  if (!korpus.querySelector('.packung--diamant')) return;

  const blitz = () => {
    if (ruht) return;
    document.body.classList.add('glanz');
    glanzAus = setTimeout(() => document.body.classList.remove('glanz'), GLANZ_DAUER_MS);
  };
  // Nicht sofort: Beim Aufbau des Schranks ist ohnehin genug los.
  glanzUhr = setInterval(blitz, GLANZ_ABSTAND_MS);
  setTimeout(blitz, 2000);
}

function stoppeGlanz() {
  clearInterval(glanzUhr);
  clearTimeout(glanzAus);
  glanzUhr = null;
  glanzAus = null;
  document.body.classList.remove('glanz');
}

/** Die Auszeichnungsschalter als ein Wert - fuer den Vergleich. */
const auszeichnungsStand = () =>
  [aussehen.rahmenNie, aussehen.rueckenNie, aussehen.diamant, aussehen.balkenInstalliert]
    .map((an) => (an ? 1 : 0))
    .join('');

function wendeAussehenAn(neu) {
  if (!neu) return;
  aussehen = { ...aussehen, ...neu };
  const s = document.documentElement.style;
  if (neu.holz) {
    s.setProperty('--holz-hell', neu.holz.hell);
    s.setProperty('--holz', neu.holz.normal);
    s.setProperty('--holz-dunkel', neu.holz.dunkel);
    s.setProperty('--holz-tief', neu.holz.tief);
    s.setProperty('--holz-wand', neu.holz.wand);
  }
  if (neu.raum) {
    s.setProperty('--raum', neu.raum.grund);
    s.setProperty('--raum-oben', neu.raum.oben);
    s.setProperty('--raum-unten', neu.raum.unten);
  }
  if (neu.schrift) s.setProperty('--schrift', neu.schrift);
  document.body.classList.toggle('flach', neu.verlauf === false);
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

  // Platz fuer die Taskleiste: Der Schrank liegt dahinter, sonst schnitte sie
  // ihm unten ein Stueck ab. Die Werte kommen aus Windows selbst.
  if (daten.raender) {
    const r = daten.raender;
    const stil = document.getElementById('raum').style;
    stil.paddingTop = `${r.oben}px`;
    stil.paddingBottom = `${r.unten}px`;
    stil.paddingLeft = `${r.links}px`;
    stil.paddingRight = `${r.rechts}px`;
    // Die Hinweiszeile schwebt - sie muss den Rand selbst beachten, sonst
    // steht sie hinter der Taskleiste.
    hinweisEl.style.bottom = `${r.unten + 6}px`;
    hinweisEl.style.right = `${r.rechts + 14}px`;
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

    // Bleibt in einer Zeile etwas uebrig, kommt Krimskrams hinein - ein halb
    // leeres Brett saehe aus wie ein Fehler. Das betrifft die letzte Zeile
    // (dort bleibt fast immer etwas) und seit der Begrenzung oben auch die
    // erste.
    const belegt = eintraege.reduce((s, e) => s + e.breite, 0) + SPALT * (eintraege.length - 1);
    if (nummer === regal.zeilen.length - 1 || belegt < korpus.clientWidth - 28 - 40) {
      const deko = baueDekoFach(nummer);
      deko.style.flex = '1 1 0';
      zeile.appendChild(deko);
    }

    korpus.appendChild(zeile);
  });

  // Die Spiegelfaecher zaehlen hier nicht mit - sie enthalten keine weiteren
  // Spiele, sondern zeigen vorhandene ein zweites Mal.
  const echte = faecher.filter((f) => !f.spiegel).length;
  hinweisEl.textContent = `${daten.anzahlSpiele} Spiele in ${echte} Fächern · aus deinen Steam-Sammlungen`;
  // Erst messen, wenn das Regal wirklich steht.
  requestAnimationFrame(() => requestAnimationFrame(messeFelder));
  // Und erst jetzt steht fest, ob es ueberhaupt Diamanten zu zeigen gibt.
  starteGlanz();
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
  // Fuer die Betriebsart "sammlung": Die Packungen entstehen weiter unten und
  // brauchen den Fachnamen.
  fachImBau = fach.name;

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

  // Spiegelfaecher ("Fast geschafft", "Zuletzt gespielt") zeigen Spiele, die
  // zusaetzlich in ihrem Sammlungsfach stehen. Das Schild sagt es, damit
  // niemand zweimal dieselbe Packung sucht und einen Fehler vermutet.
  if (fach.spiegel) {
    el.classList.add('fach--spiegel');
    schild.classList.add('fach__schild--spiegel');
  }

  el.appendChild(kasten);
  el.appendChild(schild);
  return el;
}

function baueKarton(spiel) {
  const el = document.createElement('div');
  const nie = nieGespielt(spiel);
  const diamant = istDiamant(spiel);
  el.className =
    'packung' +
    (spiel.favorit ? ' packung--favorit' : '') +
    (nie && aussehen.rahmenNie ? ' packung--nie-rahmen' : '') +
    (diamant && aussehen.diamant ? ' packung--diamant' : '') +
    // Nur bei einem ausdruecklichen true: undefined heisst "unbekannt"
    // (Steam nicht gefunden) und darf keinen Balken ergeben.
    (spiel.installiert === true && aussehen.balkenInstalliert ? ' packung--installiert' : '');
  el.style.setProperty('--spine', rueckenFarbe(spiel, nie, diamant));
  el.innerHTML = `
    <div class="packung__ruecken"><span class="packung__titel">${escape(spiel.name)}</span></div>
  `;
  felder.push({ el, spiel, rechteck: null });
  // Ein Bild NUR laden, wenn die Farbe noch fehlt - und nur, wenn sie
  // ueberhaupt gebraucht wird. Beim ersten Start sind das alle, danach keines
  // mehr. Das Titelbild selbst kommt erst, wenn der Zeiger die Packung
  // herauszieht; 609 Bilder auf Vorrat waeren Unfug.
  const braucheBild =
    aussehen.ruecken === 'bild' &&
    !(diamant && aussehen.diamant) &&
    !(nie && aussehen.rueckenNie);
  if (braucheBild && !farbspeicher.has(spiel.appId)) bestimmeFarbe(spiel, el);
  return el;
}

/**
 * Woher die Farbe eines Rueckens kommt.
 *
 * ZUERST die Auszeichnungen, dann die Betriebsart:
 *
 *   Diamant    - die Diamantfarbe, dazu ein wandernder Glanz (CSS). Sie sticht
 *                alles andere: Ein Spiel, in dem ALLES geholt ist, soll man
 *                finden, ohne zu suchen.
 *   nie        - gedaempftes Orange.
 *   bild       - die kraeftigste Farbe des Titelbilds (die Vorgabe)
 *   sammlung   - alle Spiele eines Fachs in einem Ton; so sieht man auf einen
 *                Blick, wo ein Fach anfaengt und aufhoert
 *   zufall     - ein fester Ton je Spiel, aus der AppID abgeleitet. "Zufall"
 *                heisst NICHT "jedes Mal anders": Ein Regal, das sich bei
 *                jedem Start umfaerbt, waere unruhig.
 *
 * Beides zugleich - nie gespielt UND Diamant - kann es nicht geben: Fuer alle
 * Achievements muss man gespielt haben. Die Reihenfolge steht trotzdem fest,
 * damit nicht die Datenlage entscheidet.
 */
function rueckenFarbe(spiel, nie, diamant) {
  if (diamant && aussehen.diamant) return DIAMANT_FARBE;
  if (nie && aussehen.rueckenNie) return NIE_RUECKEN;
  if (aussehen.ruecken === 'sammlung') return fachFarbe(fachImBau);
  if (aussehen.ruecken === 'zufall') return notfarbe(spiel.appId);
  return farbspeicher.get(spiel.appId) || notfarbe(spiel.appId);
}

/*
 * Nie gespielt und Diamant - dieselben Regeln wie in lib/schrankAussehen.js.
 *
 * Sie stehen hier ein zweites Mal, weil dieses Fenster nichts nachladen darf.
 * Anders als bei den Fachfarben geht es hier nicht um eine Farbformel, sondern
 * um zwei Vergleiche auf Daten, die ohnehin in jeder Packung stecken - und das
 * ist auch der Grund, warum sie hier stehen und nicht vorberechnet ankommen:
 * Die Schalter lassen sich umlegen, ohne den Schrankinhalt neu zu holen.
 */
const NIE_RUECKEN = '#8d4f15';
const DIAMANT_FARBE = '#2c7f91';

function nieGespielt(spiel) {
  // Nicht allein an der Spielzeit: Bei alten Titeln liefert Steam ein Datum,
  // aber keine gezaehlten Stunden. Dieselbe Regel wie in der Anzeige beim
  // Darueberfahren - sonst stuende dort "zuletzt November 2015" an einer
  // Packung, die als "nie gespielt" markiert ist.
  return !(spiel.spielzeitMin > 0) && !(spiel.zuletztGespielt > 0);
}

function istDiamant(spiel) {
  // gesamt > 0 ist nicht nur Vorsicht: Ein Spiel ganz ohne Achievements haette
  // sonst "alle" erreicht und straehlte als Diamant, obwohl es dort nichts zu
  // holen gibt.
  return (
    Number.isFinite(spiel.gesamt) &&
    Number.isFinite(spiel.erreicht) &&
    spiel.gesamt > 0 &&
    spiel.erreicht >= spiel.gesamt
  );
}

/**
 * Die Farbe einer Sammlung - nur nachgeschlagen, nicht gerechnet.
 *
 * Der Hauptprozess loest alle Fachfarben auf und schickt sie mit (eigene Wahl
 * oder aus dem Namen abgeleitet, siehe lib/schrankAussehen.js). Dieselbe
 * Formel hier ein zweites Mal waere eine zweite Stelle, die auseinanderlaufen
 * kann - und dann faerbten Einstellungsfenster und Schrank unterschiedlich.
 */
function fachFarbe(name) {
  return (aussehen.sammlungsfarben || {})[name] || '#4a4452';
}

/**
 * Farbe aus dem Titelbild.
 *
 * Gesucht ist nicht der Durchschnitt - der ist bei jedem Bild ein mattes
 * Braungrau. Gesucht ist die kraeftigste Farbe, so wie ein Verlag sie fuer
 * den Ruecken nehmen wuerde. Deshalb werden die Bildpunkte nach Buntheit
 * gewichtet und zu dunkle wie zu blasse uebergangen.
 */
// Beim allerersten Start fehlen ALLE Farben. Ohne Bremse laedt der Schrank
// dann 609 Bilder gleichzeitig, entschluesselt sie und wertet sie aus - der
// Rechner schnauft hoerbar, und zwar genau in dem Moment, in dem man ihn
// gerade eingeschaltet hat. Deshalb: sechs auf einmal, der Rest wartet.
const farbSchlange = [];
let farbLaeuft = 0;
const FARBEN_GLEICHZEITIG = 6;

function naechsteFarbe() {
  while (farbLaeuft < FARBEN_GLEICHZEITIG && farbSchlange.length) {
    farbLaeuft += 1;
    farbSchlange.shift()();
  }
}

function bestimmeFarbe(spiel, el) {
  if (farbspeicher.has(spiel.appId)) return;
  farbSchlange.push(() => ladeFarbe(spiel, el));
  naechsteFarbe();
}

function ladeFarbe(spiel, el) {
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
    farbLaeuft -= 1;
    naechsteFarbe();
  };
  bild.onerror = () => {
    // Kein hochformatiges Bild - dann das breite Kopfbild versuchen.
    if (bild.src !== spiel.headerUrl) {
      bild.src = spiel.headerUrl;
      return;
    }
    // Auch das nicht: Notfarbe merken, sonst versucht es der naechste Start
    // wieder - und der Platz in der Schlange wird frei.
    farbspeicher.set(spiel.appId, notfarbe(spiel.appId));
    farbLaeuft -= 1;
    naechsteFarbe();
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
 *
 * Gerechnet wird erst im naechsten Bild: Der Hauptprozess meldet den Zeiger
 * oefter, als der Bildschirm neu zeichnet. Ohne das Sammeln suchen wir
 * mehrmals je Bild durch 600 Packungen und werfen das Ergebnis weg.
 */
let zeigerWartet = null;
let zeigerGeplant = false;

function zeigerBei(x, y) {
  zeigerWartet = x === null ? null : { x, y };
  if (zeigerGeplant) return;
  zeigerGeplant = true;
  requestAnimationFrame(() => {
    zeigerGeplant = false;
    werteZeigerAus();
  });
}

function werteZeigerAus() {
  const punkt = zeigerWartet;
  if (ruht || !punkt) return setzeHeraus(null);

  let treffer = null;
  for (const f of felder) {
    const r = f.rechteck;
    if (!r) continue;
    if (punkt.y < r.top - 6 || punkt.y > r.bottom + 6) continue;
    if (punkt.x < r.left - 5 || punkt.x > r.right + 5) continue;
    treffer = f;
    break;
  }
  setzeHeraus(treffer);
}

let ausgabeEl = null;
let ausgabeName = null;
let ausgabeZeit = null;

/**
 * Das Titelbild liegt in EINER eigenen Schicht ueber dem Regal.
 *
 * Vorher steckte es in der Packung, und damit es nicht hinter den Nachbarn
 * verschwand, wurden Fach UND Regalzeile nach vorn gehoben. Das kostete:
 * Jede Bewegung der Maus ordnete grosse Teile des 4K-Bildes neu und liess
 * den Rechner hoerbar arbeiten - gemessen 12,9 % Prozessorlast, davon 5 %
 * allein fuers Zusammensetzen des Bildes.
 *
 * Jetzt bewegt sich beim Darueberfahren nur noch dieser eine kleine Kasten.
 * Das Regal selbst wird nicht mehr angefasst.
 */
let deckelEl = null;

function holeDeckel() {
  if (deckelEl) return deckelEl;
  deckelEl = document.createElement('div');
  deckelEl.className = 'deckel';
  document.getElementById('raum').appendChild(deckelEl);
  return deckelEl;
}

// Einmal geladene Titelbilder: Wer zweimal ueber dieselbe Packung faehrt,
// soll kein zweites Mal warten.
const bildspeicher = new Map();

// Grundmass des Deckels. Die tatsaechliche Groesse entsteht durch Skalieren -
// siehe zeigeDeckel().
const DECKEL_HOEHE = 200;

/**
 * Wo das Titelbild liegt - in Fensterkoordinaten.
 *
 * Eigene Funktion, weil zwei Stellen dieselbe Rechnung brauchen: das Zeichnen
 * und der Klickfaenger im Hauptprozess (siehe meldeKlickziel). Zwei getrennte
 * Rechnungen waeren zwei Gelegenheiten, auseinanderzulaufen.
 */
function deckelMasse(feld) {
  const r = feld.rechteck || feld.el.getBoundingClientRect();
  const hoehe = r.height * 1.18;
  // Steams hochformatige Bilder haben das Verhaeltnis 2:3.
  const breite = (hoehe * 2) / 3;
  return {
    x: Math.round(r.left + r.width / 2 - breite / 2),
    y: Math.round(r.bottom - hoehe + r.height * 0.1),
    breite: Math.round(breite),
    hoehe: Math.round(hoehe),
  };
}

function zeigeDeckel(feld) {
  const deckel = holeDeckel();
  const { x, y, hoehe } = deckelMasse(feld);

  // NUR verschieben und skalieren, keine Groessen setzen: left/top/width/height
  // zwingen den Browser zu einer neuen Seitenberechnung samt Neuzeichnen -
  // bei jeder Mausbewegung. Eine Verschiebung erledigt die Grafikkarte.
  const massstab = hoehe / DECKEL_HOEHE;
  deckel.style.transform = `translate(${x}px, ${y}px) scale(${massstab.toFixed(3)}) rotate(-1.5deg)`;

  const gemerkt = bildspeicher.get(feld.spiel.appId);
  deckel.style.backgroundImage = gemerkt ? `url("${gemerkt}")` : 'none';
  deckel.classList.add('deckel--an');

  if (gemerkt) return;
  // Erst beim Darueberfahren laden: 609 Titelbilder auf Vorrat waeren Unfug.
  const bild = new Image();
  bild.referrerPolicy = 'no-referrer';
  bild.onload = () => {
    bildspeicher.set(feld.spiel.appId, bild.src);
    // Nur setzen, wenn immer noch dieselbe Packung heraussteht - sonst
    // springt das Bild einer laengst verlassenen Packung ins Bild.
    if (herausgezogen === feld) deckel.style.backgroundImage = `url("${bild.src}")`;
  };
  bild.onerror = () => {
    if (bild.src !== feld.spiel.headerUrl) bild.src = feld.spiel.headerUrl;
  };
  bild.src = feld.spiel.libraryUrl;
}

let ausgabeStart = null;

/**
 * Was unter dem Namen steht: Achievement-Stand, Spielzeit, letztes Mal.
 *
 * Reiner Text statt innerHTML - das hier laeuft bei jeder neuen Packung, und
 * innerHTML wuerde jedes Mal Knoten wegwerfen und neu anlegen.
 */
function ausgabeText(spiel) {
  const teile = [];
  if (Number.isFinite(spiel.erreicht) && spiel.gesamt > 0) {
    const fehlend = spiel.gesamt - spiel.erreicht;
    teile.push(
      fehlend === 0
        ? `alle ${spiel.gesamt} Achievements`
        : `${spiel.erreicht} von ${spiel.gesamt} Achievements` +
            (fehlend <= 5 ? ` — noch ${fehlend}` : '')
    );
  }
  const std = Math.round(spiel.spielzeitMin / 60);
  if (std > 0) teile.push(`${std} Std gespielt`);
  else if (spiel.spielzeitMin > 0) teile.push('unter 1 Std gespielt');
  // "noch nie gespielt" NUR, wenn Steam auch kein Datum kennt. Sonst stand
  // dort "noch nie gespielt · zuletzt November 2015" - beides zugleich, und
  // beides von Steam: Bei alten Titeln gibt es ein Datum, aber keine
  // gezaehlte Spielzeit.
  else if (!spiel.zuletztGespielt) teile.push('noch nie gespielt');
  if (spiel.zuletztGespielt > 0) teile.push(`zuletzt ${vorZeit(spiel.zuletztGespielt)}`);
  return teile.join(' · ');
}

/** "heute", "gestern", "vor 3 Tagen", sonst das Datum. */
function vorZeit(sekunden) {
  const tage = Math.floor((Date.now() - sekunden * 1000) / 86400000);
  if (tage <= 0) return 'heute';
  if (tage === 1) return 'gestern';
  if (tage < 30) return `vor ${tage} Tagen`;
  return new Date(sekunden * 1000).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  });
}

function setzeHeraus(feld) {
  if (herausgezogen === feld) return;
  if (herausgezogen) herausgezogen.el.classList.remove('packung--heraus');
  herausgezogen = feld;

  if (!ausgabeEl) {
    ausgabeEl = document.createElement('div');
    ausgabeEl.className = 'ausgabe';
    ausgabeName = document.createElement('span');
    ausgabeZeit = document.createElement('span');
    ausgabeZeit.className = 'ausgabe__zeit';
    ausgabeStart = document.createElement('span');
    ausgabeStart.className = 'ausgabe__start';
    ausgabeStart.textContent = 'Doppelklick startet das Spiel';
    ausgabeEl.append(ausgabeName, ausgabeZeit, ausgabeStart);
    document.getElementById('raum').appendChild(ausgabeEl);
  }
  if (!feld) {
    ausgabeEl.classList.remove('ausgabe--an');
    if (deckelEl) deckelEl.classList.remove('deckel--an');
    meldeKlickziel(null);
    zeigeFehlende(null);
    return;
  }

  feld.el.classList.add('packung--heraus');
  zeigeDeckel(feld);

  ausgabeName.textContent = feld.spiel.name;
  ausgabeZeit.textContent = ausgabeText(feld.spiel);
  ausgabeEl.classList.add('ausgabe--an');
  meldeKlickziel(feld);
  planeFehlende(feld);
}

/* ---------------------------------------------------------------------------
   Was fehlt noch?
   ---------------------------------------------------------------------------
   Das Fach "Fast geschafft" sagt, DASS noch drei fehlen - nicht welche. Genau
   das will man wissen, bevor man ein Spiel noch einmal anfaengt.

   Erst auf Nachfrage, und erst nach einem Moment Verweilen: Beim Streifen ueber
   ein Regal mit 600 Ruecken waere sonst je Packung eine Steam-Abfrage faellig.
   Einmal geholte Listen bleiben gemerkt.
   --------------------------------------------------------------------------- */

const FEHLENDE_NACH_MS = 700;
const fehlendeSpeicher = new Map(); // appId -> Antwort (auch null = "nichts zu holen")
let fehlendeUhr = null;
let fehlendeEl = null;
let fehlendeFuer = null;

function holeFehlendeEl() {
  if (fehlendeEl) return fehlendeEl;
  fehlendeEl = document.createElement('div');
  fehlendeEl.className = 'fehlende';
  document.getElementById('raum').appendChild(fehlendeEl);
  return fehlendeEl;
}

function planeFehlende(feld) {
  clearTimeout(fehlendeUhr);
  zeigeFehlende(null);

  const spiel = feld.spiel;
  // Nur wo wirklich etwas offen ist. Ein fertiges Spiel hat nichts zu zeigen,
  // und bei einem nie begonnenen waere die Liste schlicht die ganze Liste.
  if (!Number.isFinite(spiel.erreicht) || !(spiel.gesamt > 0)) return;
  if (spiel.erreicht >= spiel.gesamt || spiel.erreicht === 0) return;

  fehlendeUhr = setTimeout(async () => {
    if (!herausgezogen || herausgezogen.spiel.appId !== spiel.appId) return;
    let antwort = fehlendeSpeicher.get(spiel.appId);
    if (antwort === undefined) {
      antwort = window.schrankAPI ? await window.schrankAPI.fehlende(spiel.appId) : null;
      fehlendeSpeicher.set(spiel.appId, antwort);
    }
    // Waehrend des Holens kann der Zeiger laengst woanders stehen.
    if (!herausgezogen || herausgezogen.spiel.appId !== spiel.appId) return;
    zeigeFehlende(antwort);
  }, FEHLENDE_NACH_MS);
}

function zeigeFehlende(antwort) {
  if (!antwort || !antwort.fehlende || antwort.fehlende.length === 0) {
    if (fehlendeEl) fehlendeEl.classList.remove('fehlende--an');
    fehlendeFuer = null;
    return;
  }
  if (fehlendeFuer === antwort.appId) return;
  fehlendeFuer = antwort.appId;

  const el = holeFehlendeEl();
  const offen = antwort.gesamt - antwort.erreicht;
  el.innerHTML =
    `<span class="fehlende__kopf">Es fehlen noch ${offen}</span>` +
    antwort.fehlende
      .map(
        (a) =>
          `<span class="fehlende__zeile">${escape(a.name)}` +
          (Number.isFinite(a.prozent)
            ? `<span class="fehlende__anteil">${a.prozent.toFixed(1)} %</span>`
            : '') +
          '</span>'
      )
      .join('') +
    (offen > antwort.fehlende.length
      ? `<span class="fehlende__rest">… und ${offen - antwort.fehlende.length} weitere</span>`
      : '');
  el.classList.add('fehlende--an');
}

/**
 * Dem Hauptprozess sagen, wo das Titelbild gerade liegt.
 *
 * WARUM DER UMWEG: Dieses Fenster haengt hinter den Desktop-Symbolen und
 * bekommt vom Fenstersystem keine Mausklicks - nachgemessen: Bewegungen
 * kommen an, Klicks nicht. Der Hauptprozess legt deshalb ein winziges,
 * unsichtbares Fenster genau ueber das herausgezogene Titelbild; ein
 * Doppelklick darauf startet das Spiel.
 */
function meldeKlickziel(feld) {
  if (!window.schrankAPI || !window.schrankAPI.klickziel) return;
  if (!feld) {
    window.schrankAPI.klickziel(null);
    return;
  }
  const m = deckelMasse(feld);
  window.schrankAPI.klickziel({
    appId: feld.spiel.appId,
    name: feld.spiel.name,
    x: m.x,
    y: m.y,
    breite: m.breite,
    hoehe: m.hoehe,
  });
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

const zahl = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('de-DE') : '–');

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
  window.schrankAPI.onDaten((daten) => {
    // Das Aussehen VOR dem Bauen setzen: Die Rueckenfarben entstehen beim
    // Bauen, und sie haengen an der Betriebsart.
    if (daten && daten.aussehen) wendeAussehenAn(daten.aussehen);
    baue(daten);
  });

  // Aenderungen aus den Einstellungen, ohne dass der Schrank neu geladen wird.
  if (window.schrankAPI.onAussehen) {
    window.schrankAPI.onAussehen((neu) => {
      const vorher = aussehen.ruecken;
      const vorherFarben = JSON.stringify(aussehen.sammlungsfarben || {});
      const vorherAuszeichnung = auszeichnungsStand();
      wendeAussehenAn(neu);
      // Neu bauen nur, wenn sich die RUECKENFARBEN geaendert haben - die
      // stecken in jeder einzelnen Packung. Holz, Wand, Schrift und Verlauf
      // sind Variablen und wirken ohne Neuaufbau.
      const andereHerkunft = neu && neu.ruecken !== vorher;
      const andereFachfarben =
        aussehen.ruecken === 'sammlung' &&
        JSON.stringify(aussehen.sammlungsfarben || {}) !== vorherFarben;
      // Die Auszeichnungen haengen als Klasse und Farbe an jeder einzelnen
      // Packung - ein Umlegen dieser Schalter braucht deshalb einen Neuaufbau.
      const andereAuszeichnung = vorherAuszeichnung !== auszeichnungsStand();
      if ((andereHerkunft || andereFachfarben || andereAuszeichnung) && letzteDaten) {
        baue(letzteDaten);
      }
    });
  }
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
    // Kommen die Stufenzahlen erst jetzt, fehlt das Trophaeenfach noch -
    // dann muss das Regal neu aufgeteilt werden.
    const trophaeenFehlen = stand.stufen && !korpus.querySelector('.fach--trophaeen');
    if (letzteDaten && (vorher !== stand.level || trophaeenFehlen)) baue(letzteDaten);
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
    // Waehrend ein Spiel laeuft, blitzt auch nichts.
    if (ruht) stoppeGlanz();
    else starteGlanz();
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
