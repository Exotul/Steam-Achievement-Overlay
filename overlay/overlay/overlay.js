const TIERS = {
  Kupfer: { color: '#c07a42', glow: '#c07a4255', rank: 0 },
  Silber: { color: '#b9c1cc', glow: '#b9c1cc4d', rank: 1 },
  Gold: { color: '#d3a13a', glow: '#d3a13a55', rank: 2 },
  Platin: { color: '#8b93e0', glow: '#8b93e055', rank: 3 },
};

const stack = document.getElementById('stack');
const mitteLayer = document.getElementById('mitte-layer');
let audioCtx = null;

/**
 * Vom Hauptprozess gesetzte Einstellungen.
 *
 * Die Vorgaben hier sind bewusst dieselben wie in lib/einstellungen.js. Sie
 * greifen nur in dem kurzen Moment zwischen dem Laden der Seite und der
 * ersten Nachricht - ohne sie waere das Overlay in dieser Spanne unsichtbar
 * oder stumm, je nachdem was gerade fehlt.
 */
let einst = {
  position: 'unten-rechts',
  groesse: 1,
  anzeigeDauerSek: 8.5,
  lautstaerke: 0.22,
  eigenerTonUrl: null,
};

const POSITIONEN = ['oben-rechts', 'oben-links', 'unten-rechts', 'unten-links'];

function wendeEinstellungenAn(neue) {
  einst = { ...einst, ...neue };

  POSITIONEN.forEach((p) => document.body.classList.remove(`pos-${p}`));
  const pos = POSITIONEN.includes(einst.position) ? einst.position : 'unten-rechts';
  document.body.classList.add(`pos-${pos}`);

  document.documentElement.style.setProperty('--groesse', einst.groesse);
  document.documentElement.style.setProperty('--merkliste-groesse', einst.merklisteGroesse ?? 1);
  document.documentElement.style.setProperty('--abzeichen-groesse', einst.abzeichenGroesse ?? 1);
  // Aus welcher Richtung die Meldungen einfliegen: bei einer linken Ecke von
  // links, sonst von rechts. Alles andere sieht aus, als kaeme die Meldung
  // quer ueber den Bildschirm geflogen.
  document.documentElement.style.setProperty(
    '--flug-richtung',
    pos.endsWith('links') ? -1 : 1
  );
}

function getAudioCtx() {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function tone(ctx, { freq, start, dur, gainPeak = 0.22, type = 'sine' }) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Die eingestellte Lautstaerke wirkt als Faktor auf die vorgesehene
  // Spitze, damit das Verhaeltnis der Toene untereinander erhalten bleibt -
  // die hoeheren Stufen sollen weiterhin voller klingen.
  const spitze = gainPeak * (einst.lautstaerke / 0.22);
  gain.gain.setValueAtTime(0, now + start);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, spitze), now + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now + start);
  osc.stop(now + start + dur + 0.05);
}

// Tonhöhe steigt leicht mit der Stufe - Platin klingt "heller"/edler als Kupfer,
// bleibt aber im selben freundlichen Zweiklang-Muster.
/**
 * Spielt eine vom Benutzer hinterlegte Tondatei.
 *
 * Gibt false zurueck, wenn es keine gibt oder sie sich nicht abspielen laesst
 * - dann klingt der eingebaute Ton. Eine kaputte oder geloeschte Datei darf
 * nicht dazu fuehren, dass eine Freischaltung stumm bleibt.
 */
function spieleEigenenTon() {
  if (!einst.eigenerTonUrl || einst.lautstaerke <= 0) return false;
  try {
    const klang = new Audio(einst.eigenerTonUrl);
    klang.volume = Math.min(1, Math.max(0, einst.lautstaerke));
    const versuch = klang.play();
    if (versuch && typeof versuch.catch === 'function') {
      versuch.catch(() => {
        /* Datei weg oder Format nicht abspielbar - dann eben lautlos */
      });
    }
    return true;
  } catch (err) {
    return false;
  }
}

function playTierChime(category) {
  if (einst.lautstaerke <= 0) return;
  if (spieleEigenenTon()) return;

  const rank = TIERS[category]?.rank ?? 3;
  const base = 740 + rank * 60;
  const ctx = getAudioCtx();
  tone(ctx, { freq: base, start: 0, dur: 0.16 });
  tone(ctx, { freq: base * 1.5, start: 0.1, dur: 0.35 });
  if (rank >= 2) {
    tone(ctx, { freq: base * 2, start: 0.22, dur: 0.3, gainPeak: 0.14 });
  }
}

// Größere, mehrteilige Fanfare für den Diamant-Moment.
function playDiamondFanfare() {
  const ctx = getAudioCtx();
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((freq, i) => {
    tone(ctx, { freq, start: i * 0.09, dur: 0.5, gainPeak: 0.18 });
  });
  tone(ctx, { freq: 1567.98, start: notes.length * 0.09 + 0.05, dur: 0.9, gainPeak: 0.16 });
}

function spawnSparkles(container, { count, colors, size = [4, 7], distance = [22, 36], duration = [0.6, 1] }) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'sparkle';
    const angle = Math.round(Math.random() * 360);
    const dist = Math.round(distance[0] + Math.random() * (distance[1] - distance[0]));
    const dur = (duration[0] + Math.random() * (duration[1] - duration[0])).toFixed(2);
    const delay = (Math.random() * 0.18).toFixed(2);
    const sz = Math.round(size[0] + Math.random() * (size[1] - size[0]));
    el.style.setProperty('--angle', `${angle}deg`);
    el.style.setProperty('--dist', `${dist}px`);
    el.style.setProperty('--dur', `${dur}s`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--size', `${sz}px`);
    el.style.setProperty('--spark-color', colors[i % colors.length]);
    container.appendChild(el);
    setTimeout(() => el.remove(), (Number(dur) + Number(delay)) * 1000 + 100);
  }
}


// Das Logo der App als Diamant - eingefaerbt in der Farbe der jeweiligen
// Trophaeenstufe. Der Umriss wird beim Erscheinen "gezeichnet", danach fuellt
// sich die Flaeche und ein Glanzlicht laeuft einmal darueber.
function logoSvg(color, glow) {
  return `<svg class="toast__logo-svg" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient id="lg-${Math.random().toString(36).slice(2, 8)}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.12"/>
      </linearGradient>
    </defs>
    <path class="toast__logo-fill" d="M50 8 L92 50 L50 92 L8 50 Z" fill="${color}" opacity="0.16"/>
    <path class="toast__logo-shine" d="M50 8 L92 50 L50 50 Z" fill="#ffffff" opacity="0.18"/>
    <path class="toast__logo-outline" d="M50 8 L92 50 L50 92 L8 50 Z"
          fill="none" stroke="${color}" stroke-width="7" stroke-linejoin="round"/>
  </svg>`;
}

function showAchievementToast(achievement) {
  // Die Merkliste und die Uebersicht muessen denselben Stand zeigen wie die
  // Meldung - sonst steht eine gerade errungene Trophaee weiter als "offen"
  // oben links, genau waehrend die Meldung das Gegenteil behauptet.
  if (!achievement.nurTest) markiereErreicht(achievement.apiName);

  const tier = TIERS[achievement.category] || TIERS.Platin;
  // Versteckte Achievements liefern von Steam oft gar keine oder eine leere
  // Beschreibung - dann lassen wir die Zeile ganz weg, statt Leerraum zu zeigen.
  const description = (achievement.description || '').trim();

  const el = document.createElement('div');
  el.className = 'toast';
  // Metallischer, in der Stufe getoenter Grund - siehe .toast--metall im CSS.
  // Nur fuer bekannte Stufen: Eine unbekannte bekommt den neutralen Grund
  // statt einer geratenen Farbe.
  if (TIERS[achievement.category]) {
    el.classList.add('toast--metall', `toast--${achievement.category.toLowerCase()}`);
  }
  if (tier.rank >= 1) el.classList.add('toast--shine');
  if (tier.rank >= 2) el.classList.add('toast--glow');
  el.style.setProperty('--tier-color', tier.color);
  el.style.setProperty('--tier-glow', tier.glow);

  el.innerHTML = `
    <div class="toast__logo">${logoSvg(tier.color, tier.glow)}</div>
    <div class="toast__icon-wrap">
      ${tier.rank >= 3 ? '<div class="ring-pulse"></div>' : ''}
      <img class="toast__icon" src="${achievement.icon}" alt=""
           onerror="this.style.display='none'" />
    </div>
    <div class="toast__text">
      <p class="toast__eyebrow">Achievement freigeschaltet</p>
      <p class="toast__name">${escapeHtml(achievement.name)}</p>
      ${description ? `<p class="toast__desc">${escapeHtml(description)}</p>` : ''}
      <p class="toast__meta">${tier.rank >= 2 ? 'nur ' : ''}${achievement.globalPercent.toFixed(1)}% aller Spieler haben das</p>
    </div>
    <div class="toast__tier-badge">
      <span class="toast__tier-label">${achievement.category}</span>
    </div>
  `;
  stack.appendChild(el);

  playTierChime(achievement.category);

  if (tier.rank >= 2) {
    const iconWrap = el.querySelector('.toast__logo');
    spawnSparkles(iconWrap, {
      count: tier.rank === 2 ? 5 : 8,
      colors: [tier.color, '#ffffff'],
    });
  }

  // Anzeigedauer aus den Einstellungen. Das CSS blendet 0,5 s vor dem Ende
  // aus, deshalb bekommt die Animation den etwas kuerzeren Wert.
  const dauerMs = Math.max(1000, einst.anzeigeDauerSek * 1000);
  el.style.setProperty('--display-time', `${Math.max(0.5, einst.anzeigeDauerSek - 0.5)}s`);
  setTimeout(() => el.remove(), dauerMs + 100);

  // Die XP-Meldung folgt, sobald das Achievement-Popup verschwunden ist -
  // so ueberlagern sich die beiden nicht und die Abfolge bleibt lesbar.
  if (achievement.xp) {
    setTimeout(() => showXpToast(achievement.xp), dauerMs + 400);
  }
}

/**
 * Die Raute aus dem App-Symbol, die sich in einen geschliffenen Diamanten
 * verwandelt.
 *
 * Beide Umrisse haben mit Absicht dieselbe Bauart - ein M, vier L, ein Z.
 * Nur dann kann der Browser den einen in den anderen ueberfuehren; bei
 * unterschiedlich vielen Punkten springt die Form statt zu fliessen. Die
 * Spitze oben ist deshalb doppelt aufgefuehrt: Genau sie klappt beim Morph
 * nach links und rechts auf und wird zur Tafel des Schliffs.
 */
const RAUTE = 'M 50 6 L 50 6 L 94 50 L 50 94 L 6 50 Z';
const SCHLIFF = 'M 22 30 L 78 30 L 94 46 L 50 94 L 6 46 Z';

function diamantMarke() {
  // Eigene Kennung je Aufruf: Zwei gleichzeitig sichtbare Marken wuerden
  // sich sonst denselben Verlauf teilen.
  const id = `dm${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="diamant-marke">
      <span class="diamant-marke__schein"></span>
      <svg class="diamant-marke__svg" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="${id}" x1="0" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stop-color="#bff3fb" stop-opacity="0.55" />
            <stop offset="55%" stop-color="#5fd3e8" stop-opacity="0.30" />
            <stop offset="100%" stop-color="#9a8cf2" stop-opacity="0.45" />
          </linearGradient>
        </defs>
        <path class="diamant-marke__form" fill="url(#${id})" stroke="#7fe3f5"
              stroke-width="5" stroke-linejoin="round" />
        <g class="diamant-marke__facetten" fill="none" stroke="#bff3fb" stroke-width="2.4"
           stroke-linecap="round" opacity="0.75">
          <path d="M 22 30 L 50 94" />
          <path d="M 78 30 L 50 94" />
          <path d="M 6 46 L 94 46" />
        </g>
      </svg>
      <span class="diamant-marke__glanz"></span>
    </div>`;
}

// Muss zu den Verzoegerungen in overlay.css passen (.diamant-marke__form).
const MORPH_START_MS = 900;
const MORPH_DAUER_MS = 1100;

function showDiamondCelebration({ gameName, icon }) {
  const el = document.createElement('div');
  el.className = 'diamond-card';
  el.innerHTML = `
    ${diamantMarke()}
    <p class="diamond-card__eyebrow">Alle Achievements freigeschaltet</p>
    <h2 class="diamond-card__title">DIAMANT-STATUS</h2>
    <p class="diamond-card__game">
      ${icon ? `<img class="diamond-card__icon" src="${icon}" alt="" onerror="this.remove()" />` : ''}
      <span>${escapeHtml(gameName || 'Spiel abgeschlossen')}</span>
    </p>
  `;
  mitteLayer.appendChild(el);

  playDiamondFanfare();

  // Beide Funkenwolken gehen vom Stein aus, nicht von der Kartenmitte.
  // Vorher lagen sie mitten auf der Ueberschrift und sahen aus wie Schmutz
  // auf dem Text; aus dem Stein heraus lesen sie sich als sein Funkeln.
  const marke = el.querySelector('.diamant-marke');
  spawnSparkles(marke, {
    count: 16,
    colors: ['#5fd3e8', '#9a8cf2', '#ffffff'],
    size: [4, 8],
    distance: [55, 105],
    duration: [0.9, 1.5],
  });
  setTimeout(() => {
    if (marke.isConnected) {
      spawnSparkles(marke, {
        count: 14,
        colors: ['#bff3fb', '#ffffff', '#9a8cf2'],
        size: [3, 6],
        distance: [50, 95],
        duration: [0.7, 1.2],
      });
    }
  }, MORPH_START_MS + MORPH_DAUER_MS - 200);

  setTimeout(() => el.remove(), 8200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/*
 * Begruessungs-Jingle.
 *
 * AUSDRUECKLICH NICHT die Diamant-Fanfare: Die gehoert dem einen Moment, in
 * dem ein Spiel zu hundert Prozent steht, und verliert ihre Wirkung, wenn man
 * sie bei jedem Start hoert.
 *
 * Stattdessen ein A-Dur-Dreiklang, aufwaerts - ein Ton je gezeichneter Kante
 * des Logos, im selben Takt wie die Animation. Dass Bild und Ton denselben
 * Puls haben, ist das, was daraus mehr macht als Bild plus Ton. Zum Schluss
 * liegen alle drei Toene zusammen, leiser und laenger: Der Dreiklang loest
 * sich auf, statt einfach aufzuhoeren.
 */
const KANTEN_TAKT = [0.25, 0.43, 0.61, 0.79];

function playWelcomeChime() {
  const ctx = getAudioCtx();
  const stufen = [440, 554.37, 659.25, 880]; // A - Cis - E - A

  KANTEN_TAKT.forEach((start, i) => {
    tone(ctx, { freq: stufen[i], start, dur: 0.5, gainPeak: 0.13, type: 'triangle' });
    // Eine leise Oktave darueber gibt dem Ton etwas Glaesernes, ohne ihn
    // lauter zu machen.
    tone(ctx, { freq: stufen[i] * 2, start, dur: 0.3, gainPeak: 0.035 });
  });

  const schluss = KANTEN_TAKT[3] + 0.34;
  [440, 554.37, 659.25].forEach((freq) => {
    tone(ctx, { freq, start: schluss, dur: 1.5, gainPeak: 0.075, type: 'triangle' });
  });
}

/**
 * Zweiklang beim Spielstart.
 *
 * Bis eben lief hier der Begruessungs-Jingle mit. Der ist seit dem Umbau auf
 * die vier Kanten des Logos getaktet - vier Toene zu vier Strichen. Die
 * Spielstart-Meldung zeichnet aber gar kein Logo, sie zeigt es fertig. Vier
 * Toene ohne die zugehoerige Bewegung sind nur lang.
 *
 * Deshalb hier wieder der kurze Zweiklang, den die Begruessung vorher hatte:
 * hoerbar verwandt, aber klar kuerzer - "ich habe das Spiel erkannt", nicht
 * "das Programm ist gestartet".
 */
function playSpielStartChime() {
  const ctx = getAudioCtx();
  tone(ctx, { freq: 587.33, start: 0, dur: 0.24, gainPeak: 0.16 });
  tone(ctx, { freq: 880, start: 0.15, dur: 0.45, gainPeak: 0.16 });
}

/**
 * Das Logo als vier einzelne Kanten.
 *
 * Ein geschlossener Pfad liesse sich zwar auch "ziehen", aber nur als eine
 * durchgehende Linie. Vier Pfade heisst vier Striche, jeder mit eigenem
 * Einsatz - und genau darauf sitzen die vier Toene.
 */
function willkommenMarke() {
  const ecken = [
    [50, 6],
    [94, 50],
    [50, 94],
    [6, 50],
  ];
  const kanten = ecken
    .map((von, i) => {
      const nach = ecken[(i + 1) % 4];
      return `<path class="willkommen__kante" d="M ${von[0]} ${von[1]} L ${nach[0]} ${nach[1]}"
                    fill="none" stroke="#7fe3f5" stroke-width="7" stroke-linecap="round" />`;
    })
    .join('\n        ');

  return `
    <div class="willkommen__marke">
      <svg class="willkommen__svg" viewBox="0 0 100 100" aria-hidden="true">
        <path class="willkommen__flaeche" d="M 50 6 L 94 50 L 50 94 L 6 50 Z"
              fill="#1b2029" stroke="none" />
        <!-- Eigene Gruppe: Die Kanten muessen Kind 1 bis 4 sein, sonst
             greifen die gestaffelten Verzoegerungen im CSS daneben. -->
        <g class="willkommen__kanten">
        ${kanten}
        </g>
      </svg>
    </div>`;
}

/*
 * Die Begruessung - und darin, sobald bekannt, Level und XP.
 *
 * Die Karte schliesst nicht mehr nach fester Zeit. Frueher waren das 5,1 s;
 * der XP-Stand kommt aber erst, wenn das Backend laeuft, und das dauerte an
 * neun echten Starts 0,9 bis 6,7 s. Bei drei davon waere das Level zu spaet
 * gekommen. Jetzt gilt:
 *
 *   - Kommt das Level, bleibt die Karte danach noch LEVEL_STANDZEIT_MS.
 *   - Kommt ausdruecklich "kein Level" (nicht angemeldet, Erstberechnung
 *     laeuft noch), schliesst sie zur gewohnten Zeit.
 *   - Kommt gar nichts, schliesst sie spaetestens nach WARTEN_MAX_MS.
 *
 * Solange gewartet wird, zeigt sie einen Ladehinweis - eine Karte, die
 * mehrere Sekunden unveraendert dasteht, wirkt sonst eingefroren.
 */
const WILLKOMMEN_MIN_MS = 5100;
const LEVEL_STANDZEIT_MS = 4200;
const WARTEN_MAX_MS = 9500;
const WARTEHINWEIS_AB_MS = 1500;

let willkommen = null;

function showWelcomeToast() {
  const el = document.createElement('div');
  el.className = 'willkommen';
  el.innerHTML = `
    ${willkommenMarke()}
    <h2 class="willkommen__titel">Happy Trophy Hunting!</h2>
    <p class="willkommen__unter">Trophäenschrank ist bereit</p>
    <div class="willkommen__stand" hidden>
      <p class="willkommen__warten">Dein Stand wird geladen</p>
    </div>
  `;
  mitteLayer.appendChild(el);

  willkommen = { el, beginn: performance.now(), zuTimer: null, levelDa: false };

  playWelcomeChime();

  // Funken erst, wenn der Umriss geschlossen ist - vorher waeren sie nur
  // Unruhe neben einer Linie, die sich noch zeichnet.
  const marke = el.querySelector('.willkommen__marke');
  setTimeout(() => {
    if (marke.isConnected) {
      spawnSparkles(marke, {
        count: 10,
        colors: ['#7fe3f5', '#b9a8ff', '#ffffff'],
        size: [3, 6],
        distance: [45, 80],
        duration: [0.7, 1.2],
      });
    }
  }, 1150);

  // Ladehinweis erst, wenn die Karte fertig aufgebaut ist und noch nichts
  // gekommen ist. Bei einem schnellen Start erscheint er gar nicht.
  setTimeout(() => {
    if (willkommen && willkommen.el === el && !willkommen.levelDa && !willkommen.zuTimer) {
      el.querySelector('.willkommen__stand').hidden = false;
    }
  }, WARTEHINWEIS_AB_MS);

  // Sicherheitsnetz: Kommt ueberhaupt keine Nachricht, nicht ewig warten.
  setTimeout(() => {
    if (willkommen && willkommen.el === el && !willkommen.levelDa) schliesseWillkommen(0);
  }, WARTEN_MAX_MS);
}

/** Ausblenden - fruehestens zur gewohnten Zeit, nie mitten im Aufbau. */
function schliesseWillkommen(nachMs) {
  if (!willkommen) return;
  const w = willkommen;
  const bisMindestens = WILLKOMMEN_MIN_MS - (performance.now() - w.beginn);
  const warte = Math.max(nachMs, bisMindestens, 0);
  clearTimeout(w.zuTimer);
  w.zuTimer = setTimeout(() => {
    w.el.classList.add('willkommen--zu');
    setTimeout(() => w.el.remove(), 650);
    if (willkommen === w) willkommen = null;
  }, warte);
}

/** Zaehlt eine Zahl weich hoch - schnell am Anfang, langsam am Ende. */
function zaehleHoch(el, von, bis, dauerMs, format = (n) => String(n)) {
  const start = performance.now();
  const schritt = (jetzt) => {
    const t = Math.min(1, (jetzt - start) / dauerMs);
    const weich = 1 - Math.pow(1 - t, 3);
    el.textContent = format(Math.round(von + (bis - von) * weich));
    if (t < 1 && el.isConnected) requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
}

const tausender = (n) => n.toLocaleString('de-DE');

/**
 * Level und XP in die Begruessung einsetzen.
 *
 * @param {object|null} stand - null: kein Level zu zeigen, Karte schliesst
 *   zur gewohnten Zeit.
 */
function zeigeStartLevel(stand) {
  if (!willkommen) return;
  const w = willkommen;
  const block = w.el.querySelector('.willkommen__stand');

  if (!stand || !Number.isFinite(stand.level)) {
    // Den Ladehinweis nicht einfach stehen lassen - er versprach etwas.
    block.classList.add('willkommen__stand--weg');
    schliesseWillkommen(400);
    return;
  }

  w.levelDa = true;
  const anteil =
    stand.xpForThisLevel > 0 ? Math.min(1, Math.max(0, stand.xpIntoLevel / stand.xpForThisLevel)) : 0;
  const fehlt = Math.max(0, stand.xpForThisLevel - stand.xpIntoLevel);

  block.hidden = false;
  block.classList.add('willkommen__stand--da');
  block.innerHTML = `
    <div class="stand__kopf">
      <span class="stand__label">Level</span>
      <span class="stand__level">1</span>
    </div>
    <div class="stand__balken"><div class="stand__fuellung"></div></div>
    <p class="stand__zeile">
      <span class="stand__xp">0</span> / ${tausender(stand.xpForThisLevel)} XP
      <span class="stand__trenner">·</span>
      noch ${tausender(fehlt)} bis Level ${stand.level + 1}
    </p>
    <p class="stand__gesamt"><span class="stand__gesamt-zahl">0</span> XP insgesamt</p>
  `;

  // Erst die Zahl, dann der Balken, dann die Summe - nacheinander liest es
  // sich als Ablauf statt als ein Block, der auf einmal dasteht.
  zaehleHoch(block.querySelector('.stand__level'), 1, stand.level, 1100);
  setTimeout(() => {
    block.querySelector('.stand__fuellung').style.transform = `scaleX(${anteil})`;
    zaehleHoch(block.querySelector('.stand__xp'), 0, stand.xpIntoLevel, 1300, tausender);
  }, 350);
  setTimeout(() => {
    zaehleHoch(block.querySelector('.stand__gesamt-zahl'), 0, stand.totalXp, 1400, tausender);
  }, 600);

  schliesseWillkommen(LEVEL_STANDZEIT_MS);
}

/*
 * Bilanz am Ende einer Spielsitzung.
 *
 * Das Gegenstueck zur Begruessung: Die eine sagt "es geht los", diese sagt
 * "das war es". Beim Spielende passierte bisher gar nichts Sichtbares.
 *
 * Bewusst ruhiger als die Diamant-Feier - kein Fanfarenklang, keine
 * Funkenwolke. Das Spiel ist zu Ende, man sitzt vor dem Desktop; hier soll
 * etwas stehen, das man liest und dann zufrieden wegklickt, nicht etwas, das
 * einen anspringt.
 */
function playBilanzChime() {
  const ctx = getAudioCtx();
  // Absteigend statt aufsteigend - ein Schluss, keine Ankuendigung.
  tone(ctx, { freq: 659.25, start: 0, dur: 0.4, gainPeak: 0.11, type: 'triangle' });
  tone(ctx, { freq: 523.25, start: 0.16, dur: 0.6, gainPeak: 0.11, type: 'triangle' });
  tone(ctx, { freq: 392.0, start: 0.32, dur: 1.1, gainPeak: 0.09, type: 'triangle' });
}

/**
 * Die eigene Spielzeit - auf die Minute genau.
 *
 * Nicht formatDauer(): Die rundet auf halbe Stunden und ist fuer die
 * Komplettierungszeit ANDERER Spieler gedacht, wo "etwa 12 Std" genau richtig
 * ist. Die eigene Sitzung von eben kennt man aber; "2 Std" fuer 1 Std 47 wirkt
 * dort schlicht falsch.
 */
function sitzungsDauer(minuten) {
  if (minuten < 60) return `${minuten} Min`;
  const stunden = Math.floor(minuten / 60);
  const rest = minuten % 60;
  return rest === 0 ? `${stunden} Std` : `${stunden} Std ${rest} Min`;
}

/** "1x Gold, 2x Silber" - in der Reihenfolge der Wertigkeit, nicht zufaellig. */
function stufenZeile(nachStufe) {
  return ['Platin', 'Gold', 'Silber', 'Kupfer']
    .filter((name) => nachStufe[name] > 0)
    .map((name) => {
      const farbe = stufeVon(name).color;
      return `<span class="bilanz__stufe" style="--tier-color:${farbe}">
                <span class="bilanz__stufe-zahl">${nachStufe[name]}\u00d7</span> ${name}
              </span>`;
    })
    .join('');
}

function showSitzungsbilanz({ gameName, minuten, anzahl, nachStufe, xp, levelVorher, levelNachher }) {
  const aufstieg = Number.isFinite(levelVorher) && Number.isFinite(levelNachher)
    && levelNachher > levelVorher;

  const el = document.createElement('div');
  el.className = 'bilanz';
  el.innerHTML = `
    <p class="bilanz__augenbraue">Sitzung beendet</p>
    <h2 class="bilanz__spiel">${escapeHtml(gameName)}</h2>
    <p class="bilanz__dauer">${escapeHtml(sitzungsDauer(minuten))} gespielt</p>

    <div class="bilanz__zahlen">
      <div class="bilanz__kachel">
        <span class="bilanz__wert">${anzahl}</span>
        <span class="bilanz__label">${anzahl === 1 ? 'Trophäe' : 'Trophäen'}</span>
      </div>
      <div class="bilanz__kachel">
        <span class="bilanz__wert">+${xp}</span>
        <span class="bilanz__label">XP</span>
      </div>
      ${
        aufstieg
          ? `<div class="bilanz__kachel bilanz__kachel--aufstieg">
               <span class="bilanz__wert">${levelVorher} \u2192 ${levelNachher}</span>
               <span class="bilanz__label">Level</span>
             </div>`
          : Number.isFinite(levelNachher)
            ? `<div class="bilanz__kachel">
                 <span class="bilanz__wert">${levelNachher}</span>
                 <span class="bilanz__label">Level</span>
               </div>`
            : ''
      }
    </div>

    <div class="bilanz__stufen">${stufenZeile(nachStufe || {})}</div>
  `;
  mitteLayer.appendChild(el);

  playBilanzChime();
  setTimeout(() => el.remove(), 9000);
}

// --- Warteschlange -----------------------------------------------------------
// Letzte Absicherung: Selbst wenn mehrere Achievements gleichzeitig
// hereinkommen, werden sie nacheinander gezeigt statt alle auf einmal - so
// koennen sich Toene nie ueberlappen. Duplikate innerhalb kurzer Zeit werden
// verworfen, falls dieselbe Freischaltung auf zwei Wegen gemeldet wird
// (lokale Erkennung UND Web-Abgleich).
const QUEUE_GAP_MS = 1400;
// Etwas mehr Platz, weil die Spielstart-Meldung lange stehen bleibt und
// sonst einen der Plaetze dauerhaft belegen wuerde.
const MAX_VISIBLE = 4;

const queue = [];
let draining = false;
let lastShownAt = 0;
const recentlyShown = new Map(); // apiName -> Zeitstempel

function enqueueAchievement(achievement) {
  const key = achievement.apiName || achievement.name;
  const now = Date.now();

  // Dieselbe Freischaltung innerhalb von 30 Sekunden nicht zweimal zeigen.
  const last = recentlyShown.get(key);
  if (last && now - last < 30000) return;
  recentlyShown.set(key, now);

  queue.push(achievement);
  drainQueue();
}

async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      // Bei einem Schwung nicht den Bildschirm zupflastern.
      while (stack.childElementCount >= MAX_VISIBLE) {
        await wait(300);
      }
      // Mindestabstand seit der LETZTEN Anzeige einhalten - nicht abhaengig
      // davon, ob gerade noch etwas in der Schlange liegt. Die Meldungen
      // treffen einzeln nacheinander ein, deshalb waere die Schlange sonst
      // jedes Mal leer und der Abstand wuerde nie greifen (genau dadurch
      // haben sich die Toene ueberlappt).
      const since = Date.now() - lastShownAt;
      if (since < QUEUE_GAP_MS) await wait(QUEUE_GAP_MS - since);

      lastShownAt = Date.now();
      showAchievementToast(queue.shift());
    }
  } finally {
    // finally, damit ein Fehler in einer einzelnen Meldung die Schlange
    // nicht dauerhaft blockiert.
    draining = false;
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}


// --- Spielstart-Meldung ------------------------------------------------------

// Farbverlauf fuer die Schwierigkeit: hellgruen (0) -> gelb (5) -> dunkelrot (10)
function difficultyColor(wert) {
  const misch = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const gruen = [126, 217, 87];
  const gelb = [255, 210, 63];
  const rot = [139, 26, 26];
  const w = Math.min(10, Math.max(0, wert));
  const rgb = w <= 5 ? misch(gruen, gelb, w / 5) : misch(gelb, rot, (w - 5) / 5);
  return `rgb(${rgb.join(',')})`;
}

function difficultyLabel(wert) {
  if (wert < 1.5) return 'sehr leicht';
  if (wert < 3) return 'leicht';
  if (wert < 5) return 'mittel';
  if (wert < 7) return 'fordernd';
  if (wert < 8.5) return 'schwer';
  return 'brutal';
}

// Zuletzt gezeigte Spielstart-Meldung, damit die nachgereichte
// Komplettierungszeit noch eingesetzt werden kann.
let letzteSpielMeldung = null;

function formatDauer(minuten) {
  if (minuten < 60) return `${minuten} Min`;
  const stunden = minuten / 60;
  if (stunden < 10) return `${(Math.round(stunden * 2) / 2).toString().replace('.', ',')} Std`;
  return `${Math.round(stunden)} Std`;
}

function showCompletionTime({ sampleSize, medianMinutes }) {
  if (!letzteSpielMeldung || !letzteSpielMeldung.isConnected) return;
  const ziel = letzteSpielMeldung.querySelector('.toast__side');
  if (!ziel || ziel.querySelector('.playtime')) return;

  const el = document.createElement('div');
  el.className = 'playtime';
  el.innerHTML = `
    <span class="playtime__value">${formatDauer(medianMinutes)}</span>
    <span class="playtime__label">${sampleSize === 1 ? '1 Komplett.' : sampleSize + ' Komplett.'}</span>
  `;
  ziel.insertBefore(el, ziel.firstChild);
}

/**
 * "Zuletzt vor 3 Wochen · Silber »Kapitel 5«"
 *
 * Kommt nur, wenn im eigenen Verlauf wirklich etwas zu diesem Spiel steht.
 * Der Verlauf kennt nur, was seit der Einrichtung der App freigeschaltet
 * wurde - fuer ein Spiel ohne Eintraege bleibt die Zeile weg, statt etwas zu
 * behaupten.
 */
function rueckblickZeile(r) {
  if (!r || !r.wann) return '';

  const stufe = stufeVon(r.category);
  const trophaee = r.name
    ? `<span class="toast__rueckblick-stufe" style="--tier-color:${stufe.color}">${escapeHtml(
        r.category
      )}</span> ${escapeHtml(r.name)}`
    : '';

  return `<p class="toast__rueckblick">Zuletzt ${escapeHtml(r.wann)}${
    trophaee ? ` \u00b7 ${trophaee}` : ''
  }</p>`;
}

function showGameStartedToast({
  gameName,
  unlockedCount,
  totalCount,
  isDiamond,
  difficulty,
  displaySeconds,
  rueckblick,
}) {
  // Standzeit: deutlich laenger als bei Achievement-Meldungen, weil beim
  // Spielstart oft noch Ladezeiten und Menues folgen.
  const dauer = Number.isFinite(displaySeconds) ? displaySeconds : 30;
  const el = document.createElement('div');
  el.className = 'toast toast--shine toast--game';
  const color = isDiamond ? '#5fd3e8' : '#8b93e0';
  el.style.setProperty('--tier-color', color);
  el.style.setProperty('--tier-glow', color + '55');

  const hasCounts = Number.isFinite(totalCount) && totalCount > 0;
  const remaining = hasCounts ? totalCount - unlockedCount : null;
  const pct = hasCounts ? Math.round((unlockedCount / totalCount) * 100) : 0;

  let statusLine;
  if (!hasCounts) {
    statusLine = 'Keine Achievements in diesem Spiel';
  } else if (remaining === 0) {
    statusLine = `Alle ${totalCount} Achievements – komplett!`;
  } else {
    statusLine = `${unlockedCount} von ${totalCount} · noch ${remaining} offen`;
  }

  el.innerHTML = `
    <div class="toast__logo">${logoSvg(color, color + '55')}</div>
    <div class="toast__text">
      <p class="toast__eyebrow">Wird jetzt verfolgt</p>
      <p class="toast__name">${escapeHtml(gameName)}</p>
      <p class="toast__meta">${escapeHtml(statusLine)}</p>
      ${hasCounts ? `<div class="toast__progress"><div class="toast__progress-fill" style="width:${pct}%"></div></div>` : ''}
      ${rueckblickZeile(rueckblick)}
    </div>
    <div class="toast__side">
      ${
        Number.isFinite(difficulty)
          ? `<div class="difficulty" style="--diff-color:${difficultyColor(difficulty)}">
               <span class="difficulty__value">${difficulty.toFixed(1)}</span>
               <span class="difficulty__label">${difficultyLabel(difficulty)}</span>
             </div>`
          : ''
      }
      ${hasCounts ? `<div class="toast__tier-badge"><span class="toast__tier-label">${pct}%</span></div>` : ''}
    </div>
  `;
  // Ausblenden erst kurz vor Ablauf starten (die Animation dauert 0,45 s).
  el.style.setProperty('--display-time', `${Math.max(1, dauer - 0.5)}s`);

  stack.appendChild(el);
  letzteSpielMeldung = el;
  playSpielStartChime();
  setTimeout(() => el.remove(), dauer * 1000 + 200);
}

// --- XP-Meldung nach dem Achievement ----------------------------------------

function xpTonSpielen(levelUp) {
  const ctx = getAudioCtx();
  if (levelUp) {
    // Aufsteigende Folge fuer den Levelaufstieg.
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      tone(ctx, { freq, start: i * 0.11, dur: 0.55, gainPeak: 0.17 });
    });
  } else {
    // Kurzer, leiser Doppelton fuer den reinen Zuwachs.
    tone(ctx, { freq: 659.25, start: 0, dur: 0.12, gainPeak: 0.11 });
    tone(ctx, { freq: 880, start: 0.08, dur: 0.24, gainPeak: 0.11 });
  }
}

function showXpToast(xp) {
  const el = document.createElement('div');
  el.className = `xp-toast${xp.levelUp ? ' xp-toast--levelup' : ''}`;

  // Balken: von der Position vor dem Achievement zur neuen Position.
  //
  // NICHT auf ganze Prozent runden. Genau das stand hier vorher und hat den
  // Balken bei kleinen Zuwaechsen komplett stillstehen lassen: 8,91 % und
  // 9,29 % runden beide auf 9, die Animation lief also von 9 % nach 9 %.
  // Aus Sicht des Spielers hat ein errungenes Achievement dann gar nichts
  // bewirkt - der teuerste Moment der ganzen App, verschenkt an Math.round.
  const anteil = (drin, noetig) => (noetig > 0 ? (drin / noetig) * 100 : 0);
  const vonProzent = xp.levelUp ? 100 : anteil(xp.vorherXpIntoLevel, xp.vorherXpForThisLevel);
  const bisProzent = anteil(xp.xpIntoLevel, xp.xpForThisLevel);

  el.innerHTML = `
    <div class="xp-toast__level">
      <span class="xp-toast__level-num">${xp.level}</span>
      ${xp.levelUp ? '<span class="xp-toast__level-up">LEVEL UP</span>' : '<span class="xp-toast__level-label">Level</span>'}
    </div>
    <div class="xp-toast__body">
      <div class="xp-toast__row">
        <span class="xp-toast__gain">+${xp.zuwachs} XP</span>
        <span class="xp-toast__counts">${xp.xpIntoLevel} / ${xp.xpForThisLevel}</span>
      </div>
      <div class="xp-toast__bar">
        <div class="xp-toast__bar-fill" style="width:${vonProzent}%"></div>
      </div>
    </div>
  `;

  stack.appendChild(el);
  xpTonSpielen(xp.levelUp);

  // Balken erst nach dem Einfliegen wachsen lassen, damit die Bewegung
  // sichtbar ist statt schon im Endzustand anzukommen.
  const fill = el.querySelector('.xp-toast__bar-fill');
  setTimeout(() => {
    if (xp.levelUp) {
      // Erst volllaufen, kurz aufleuchten, dann von vorn beginnen.
      fill.style.width = '100%';
      setTimeout(() => {
        el.classList.add('xp-toast--flash');
        fill.style.transition = 'none';
        fill.style.width = '0%';
        requestAnimationFrame(() => {
          fill.style.transition = '';
          fill.style.width = `${bisProzent}%`;
        });
      }, 750);
    } else {
      fill.style.width = `${bisProzent}%`;
    }
  }, 700);

  if (xp.levelUp) {
    spawnSparkles(el.querySelector('.xp-toast__level'), {
      count: 12,
      colors: ['#5fd3e8', '#9a8cf2', '#ffffff'],
      distance: [30, 60],
      duration: [0.8, 1.3],
    });
  }

  const dauer = xp.levelUp ? 7000 : 5000;
  setTimeout(() => el.remove(), dauer);
}

/* ==========================================================================
   Achievements des laufenden Spiels
   ==========================================================================
   Das Overlay bekommt beim Spielstart die vollstaendige Liste und haelt sie
   hier. Alle drei Ansichten unten - Vorschau, Merkliste, Uebersicht - lesen
   daraus; keine davon fragt selbst etwas ab.
   ========================================================================== */

let spiel = {
  appId: null,
  name: '',
  achievements: [],
  // { achievements: [apiName], notizen: [{ id, text }] }
  merkliste: { achievements: [], notizen: [] },
};

/** Merkliste in eine einheitliche Anzeigeliste bringen. */
function merkEintraege() {
  const ausAchievements = (spiel.merkliste.achievements || [])
    .map((name) => spiel.achievements.find((a) => a.apiName === name))
    // Bereits Erreichtes gehoert nicht mehr auf die Liste. Der Hauptprozess
    // raeumt es zwar weg, aber zwischen Freischaltung und Aufraeumen liegen
    // Sekunden - und in genau diesen Sekunden soll es nicht mehr dastehen.
    .filter((a) => a && !a.unlocked)
    .map((a) => ({
      art: 'achievement',
      schluessel: a.apiName,
      text: a.name,
      farbe: stufeVon(a.category).color,
    }));

  const ausNotizen = (spiel.merkliste.notizen || []).map((n) => ({
    ...n,
    schluessel: n.id,
    farbe: '#6bd39a',
  }));

  // Eigene Eintraege ans Ende: Sie verschwinden nie von selbst und wuerden
  // sonst die wechselnden Achievements dauerhaft nach unten druecken. Ihre
  // Reihenfolge untereinander bleibt so, wie sie angelegt wurden - nur so
  // gliedern die Ueberschriften ueberhaupt etwas.
  return [...ausAchievements, ...ausNotizen];
}

function stufeVon(kategorie) {
  return TIERS[kategorie] || TIERS.Platin;
}

function setzeSpiel(daten) {
  const merk = daten.merkliste && typeof daten.merkliste === 'object' ? daten.merkliste : {};
  spiel = {
    appId: daten.appId ?? null,
    name: daten.gameName || '',
    achievements: Array.isArray(daten.achievements) ? daten.achievements : [],
    merkliste: {
      achievements: Array.isArray(merk.achievements) ? merk.achievements : [],
      notizen: Array.isArray(merk.notizen) ? merk.notizen : [],
    },
  };
  zeichneMerkliste();
}

/** Einzelnes Achievement als erreicht markieren, ohne alles neu zu laden. */
function markiereErreicht(apiName) {
  const treffer = spiel.achievements.find((a) => a.apiName === apiName);
  if (treffer) treffer.unlocked = true;

  // Aus der Merkliste nehmen - aber sichtbar, nicht heimlich. Genau in dem
  // Moment, in dem eine Aufgabe erfuellt ist, will man sie verschwinden
  // sehen, nicht einfach weg haben.
  const stand = spiel.merkliste.achievements || [];
  if (stand.includes(apiName)) {
    const eintrag = merklisteEl.querySelector(`[data-schluessel="${cssEscape(apiName)}"]`);
    spiel.merkliste.achievements = stand.filter((n) => n !== apiName);
    if (eintrag) {
      eintrag.classList.add('merkliste__eintrag--erledigt');
      setTimeout(zeichneMerkliste, 1700);
    } else {
      zeichneMerkliste();
    }
  }
}

/** Fuer Attributselektoren: Steam-API-Namen sind zwar zahm, aber nicht garantiert. */
function cssEscape(text) {
  return String(text).replace(/["\\]/g, '\\$&');
}

/* ==========================================================================
   Merkliste
   ========================================================================== */

const merklisteEl = document.getElementById('merkliste');

function zeichneMerkliste() {
  const aktiv = einst.merklisteAktiv !== false;
  const eintraege = merkEintraege();

  if (!aktiv || eintraege.length === 0) {
    merklisteEl.hidden = true;
    return;
  }

  merklisteEl.style.setProperty('--merkliste-groesse', einst.merklisteGroesse ?? 1);
  const liste = merklisteEl.querySelector('.merkliste__liste');
  liste.innerHTML = '';

  eintraege.forEach((e) => {
    const li = document.createElement('li');
    li.className = `merkliste__eintrag merkliste__eintrag--${e.art}`;
    li.dataset.schluessel = e.schluessel;

    if (e.art === 'abschnitt') {
      // Eine Ueberschrift ist kein Aufgabenpunkt - sie bekommt deshalb
      // keinen Punkt davor, sondern eine eigene Flaeche.
      li.innerHTML = `<span class="merkliste__abschnitt">${escapeHtml(e.text)}</span>`;
    } else if (e.art === 'tracker') {
      const anteil = e.ziel > 0 ? Math.min(100, (e.stand / e.ziel) * 100) : 0;
      const fertig = e.ziel > 0 && e.stand >= e.ziel;
      li.innerHTML = `
        <span class="merkliste__punkt" style="background:${e.farbe}"></span>
        <span class="merkliste__zaehler-text">
          <span class="merkliste__name" title="${escapeHtml(e.text)}">${escapeHtml(e.text)}</span>
          <span class="merkliste__zahl${fertig ? ' merkliste__zahl--fertig' : ''}">${e.stand} / ${e.ziel}</span>
        </span>
        <span class="merkliste__balken"><span style="width:${anteil}%"></span></span>
      `;
    } else {
      li.innerHTML = `
        <span class="merkliste__punkt" style="background:${e.farbe}"></span>
        <span class="merkliste__name" title="${escapeHtml(e.text)}">${escapeHtml(e.text)}</span>
      `;
    }

    liste.appendChild(li);
  });

  merklisteEl.hidden = false;
}

/* ==========================================================================
   Uebersicht
   ==========================================================================
   Liegt seit dem Minimier-Fehler in einem EIGENEN Fenster (overlay/panel/).

   Das hier ist ein transparentes, bildschirmfuellendes Fenster. Damit man
   die Liste bedienen konnte, musste es beim Betreten mit der Maus Klicks
   annehmen - und `setIgnoreMouseEvents(false)` nimmt einem transparenten
   Fenster unter Windows die Eigenschaft WS_EX_LAYERED. Nachgemessen:

       ruhend :  0x08080028  TRANSPARENT | LAYERED | NOACTIVATE | TOPMOST
       Maus   :  0x08000008                         NOACTIVATE | TOPMOST

   Ohne LAYERED muss der Desktop-Compositor die Fensterflaeche neu aufbauen.
   Das wirft ein Spiel aus dem exklusiven Vollbild, und Windows loest das
   durch Minimieren auf.

   Dieses Fenster nimmt jetzt NIE Klicks an und aendert seine Fensterstile
   deshalb nie mehr. Alles Bedienbare liegt in eigenen Fenstern.
   ========================================================================== */

window.overlayAPI.onAchievement(enqueueAchievement);
window.overlayAPI.onGameDiamond(showDiamondCelebration);
window.overlayAPI.onBilanz(showSitzungsbilanz);
window.overlayAPI.onWelcome(showWelcomeToast);
window.overlayAPI.onStartLevel(zeigeStartLevel);
window.overlayAPI.onEinstellungen((werte) => {
  wendeEinstellungenAn(werte);
  zeichneMerkliste();
});
window.overlayAPI.onSpielDaten(setzeSpiel);
// --- Ladebalken beim Start ---------------------------------------------------
// Der XP-Gesamtstand wird EINMAL beim Start ermittelt (danach nur noch
// fortgeschrieben). Das dauert bei grossen Bibliotheken einen Moment -
// deshalb hier ein sichtbarer Fortschritt statt stiller Wartezeit.

let ladeMeldung = null;

function zeigeLadefortschritt({ fertig, abbruch, phase, done, total, ausSpeicher, level }) {
  // Die Berechnung wurde aufgegeben. Die Meldung darf nicht stehenbleiben -
  // ein Ladebalken, der ewig haengt, ist schlimmer als gar keiner.
  if (abbruch) {
    if (!ladeMeldung) return;
    const weg = ladeMeldung;
    ladeMeldung = null;
    weg.querySelector('.xp-toast__bar-fill').classList.remove('xp-toast__bar-fill--unbestimmt');
    weg.querySelector('.xp-toast__gain').textContent = 'Trophäen konnten nicht gezählt werden';
    weg.querySelector('.xp-toast__counts').textContent = 'siehe Tray-Menü';
    setTimeout(() => weg.remove(), 6000);
    return;
  }

  if (fertig) {
    if (!ladeMeldung) return;
    const balken = ladeMeldung.querySelector('.xp-toast__bar-fill');
    balken.classList.remove('xp-toast__bar-fill--unbestimmt');
    balken.style.width = '100%';
    ladeMeldung.querySelector('.xp-toast__level-num').textContent = level;
    ladeMeldung.querySelector('.xp-toast__gain').textContent = 'Trophäenschrank bereit';
    ladeMeldung.querySelector('.xp-toast__counts').textContent = `Level ${level}`;
    const weg = ladeMeldung;
    ladeMeldung = null;
    setTimeout(() => weg.remove(), 2500);
    return;
  }

  if (!ladeMeldung) {
    ladeMeldung = document.createElement('div');
    ladeMeldung.className = 'xp-toast xp-toast--loading';
    ladeMeldung.innerHTML = `
      <div class="xp-toast__level">
        <span class="xp-toast__level-num">…</span>
        <span class="xp-toast__level-label">Level</span>
      </div>
      <div class="xp-toast__body">
        <div class="xp-toast__row">
          <span class="xp-toast__gain">Trophäen werden gezählt</span>
          <span class="xp-toast__counts"></span>
        </div>
        <div class="xp-toast__bar">
          <div class="xp-toast__bar-fill xp-toast__bar-fill--unbestimmt" style="width:0%"></div>
        </div>
      </div>
    `;
    stack.appendChild(ladeMeldung);
  }

  const text = ladeMeldung.querySelector('.xp-toast__gain');
  const zaehler = ladeMeldung.querySelector('.xp-toast__counts');
  const balken = ladeMeldung.querySelector('.xp-toast__bar-fill');

  // Solange die Bibliothek geholt wird, ist noch nicht bekannt, wie viele
  // Spiele zu pruefen sind. Frueher stand der Balken hier bei starren 0 % -
  // das sah nach einem Haenger aus, obwohl gearbeitet wurde. Ein wandernder
  // Balken sagt ehrlich "ich arbeite, weiss aber noch nicht wie lange".
  if (!(total > 0)) {
    text.textContent = 'Steam-Bibliothek wird geladen';
    zaehler.textContent = '';
    balken.classList.add('xp-toast__bar-fill--unbestimmt');
    balken.style.width = '100%';
    return;
  }

  balken.classList.remove('xp-toast__bar-fill--unbestimmt');
  text.textContent = 'Trophäen werden gezählt';
  zaehler.textContent = `${done} / ${total} Spiele`;
  // Nicht auf ganze Prozent runden - bei vielen Spielen bewegt sich der
  // Balken sonst je Spiel um nichts (derselbe Fehler wie beim XP-Balken).
  balken.style.width = `${(done / total) * 100}%`;
}

window.overlayAPI.onXpLoading(zeigeLadefortschritt);
window.overlayAPI.onGameStarted(showGameStartedToast);
window.overlayAPI.onCompletionTime(showCompletionTime);

// --- Status-Abzeichen unten rechts ------------------------------------------
// Zeigt an, dass die App laeuft, samt aktuellem Fortschritt. Wird ein- und
// ausgeblendet, nicht neu aufgebaut - so bleibt es ruhig, wenn das
// Steam-Overlay mehrfach hintereinander geoeffnet wird.
const badge = document.getElementById('status-badge');

window.overlayAPI.onStatusBadge(({ visible, gameName, unlockedCount, totalCount, panelTaste }) => {
  if (!visible) {
    badge.classList.add('status-badge--hidden');
    return;
  }

  badge.querySelector('.status-badge__game').textContent = gameName || 'Trophäenschrank';

  const hatZahlen = Number.isFinite(totalCount) && totalCount > 0;
  badge.querySelector('.status-badge__progress').textContent = hatZahlen
    ? `${unlockedCount} / ${totalCount} · ${Math.round((unlockedCount / totalCount) * 100)}%`
    : 'wird verfolgt';

  // Das Abzeichen erscheint genau dann, wenn Steams Overlay offen ist - also
  // in dem Moment, in dem die Uebersicht bedienbar ist. Der beste Platz, um
  // an das Kuerzel zu erinnern, ohne es dauerhaft ins Bild zu haengen.
  const tasteEl = badge.querySelector('.status-badge__taste');
  if (panelTaste) {
    tasteEl.textContent = `${lesbareTaste(panelTaste)} \u00b7 Achievements`;
    tasteEl.hidden = false;
  } else {
    tasteEl.hidden = true;
  }

  badge.classList.remove('status-badge--hidden');
});

/** "Control+Shift+A" liest sich auf Deutsch als "Strg+Umschalt+A". */
function lesbareTaste(taste) {
  return String(taste)
    .replace(/CommandOrControl|Control|Ctrl/gi, 'Strg')
    .replace(/Shift/gi, 'Umschalt')
    .replace(/Alt/gi, 'Alt')
    .replace(/\+/g, '+');
}
