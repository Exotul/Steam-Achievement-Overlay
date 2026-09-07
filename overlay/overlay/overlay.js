const TIERS = {
  Kupfer: { color: '#c07a42', glow: '#c07a4255', rank: 0 },
  Silber: { color: '#b9c1cc', glow: '#b9c1cc4d', rank: 1 },
  Gold: { color: '#d3a13a', glow: '#d3a13a55', rank: 2 },
  Platin: { color: '#8b93e0', glow: '#8b93e055', rank: 3 },
};

const stack = document.getElementById('stack');
const diamondLayer = document.getElementById('diamond-layer');
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
  position: 'oben-rechts',
  groesse: 1,
  anzeigeDauerSek: 8.5,
  lautstaerke: 0.22,
  eigenerTonUrl: null,
};

const POSITIONEN = ['oben-rechts', 'oben-links', 'unten-rechts', 'unten-links'];

function wendeEinstellungenAn(neue) {
  einst = { ...einst, ...neue };

  POSITIONEN.forEach((p) => document.body.classList.remove(`pos-${p}`));
  const pos = POSITIONEN.includes(einst.position) ? einst.position : 'oben-rechts';
  document.body.classList.add(`pos-${pos}`);

  document.documentElement.style.setProperty('--groesse', einst.groesse);
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
  const tier = TIERS[achievement.category] || TIERS.Platin;
  // Versteckte Achievements liefern von Steam oft gar keine oder eine leere
  // Beschreibung - dann lassen wir die Zeile ganz weg, statt Leerraum zu zeigen.
  const description = (achievement.description || '').trim();

  const el = document.createElement('div');
  el.className = 'toast';
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

function showDiamondCelebration({ gameName, icon }) {
  const el = document.createElement('div');
  el.className = 'diamond-card';
  el.innerHTML = `
    ${icon ? `<img class="diamond-card__icon" src="${icon}" alt="" />` : ''}
    <p class="diamond-card__eyebrow">Alle Achievements freigeschaltet</p>
    <h2 class="diamond-card__title">DIAMANT-STATUS</h2>
    <p class="diamond-card__game">${escapeHtml(gameName || 'Spiel abgeschlossen')}</p>
  `;
  diamondLayer.appendChild(el);

  playDiamondFanfare();
  spawnSparkles(el, {
    count: 18,
    colors: ['#5fd3e8', '#9a8cf2', '#ffffff'],
    size: [4, 8],
    distance: [60, 140],
    duration: [0.9, 1.5],
  });

  setTimeout(() => el.remove(), 8200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Sanfter Begrüßungs-Zweiklang - bewusst ruhiger als die Erfolgs-Sounds,
// damit klar ist "Overlay ist bereit", nicht "du hast etwas erreicht".
function playWelcomeChime() {
  const ctx = getAudioCtx();
  tone(ctx, { freq: 587.33, start: 0, dur: 0.24, gainPeak: 0.16 });
  tone(ctx, { freq: 880, start: 0.15, dur: 0.45, gainPeak: 0.16 });
}

function showWelcomeToast() {
  const el = document.createElement('div');
  el.className = 'toast toast--shine toast--glow';
  el.style.setProperty('--tier-color', '#5fd3e8');
  el.style.setProperty('--tier-glow', '#5fd3e855');

  el.innerHTML = `
    <div class="toast__logo">${logoSvg('#5fd3e8', '#5fd3e855')}</div>
    <div class="toast__text">
      <p class="toast__eyebrow">Trophäenschrank</p>
      <p class="toast__name">Happy Trophy Hunting!</p>
      <p class="toast__meta">Overlay ist bereit</p>
    </div>
    <div class="toast__tier-badge">
      <span class="toast__tier-label">Bereit</span>
    </div>
  `;
  stack.appendChild(el);

  playWelcomeChime();
  spawnSparkles(el.querySelector('.toast__logo'), {
    count: 6,
    colors: ['#5fd3e8', '#9a8cf2', '#ffffff'],
  });

  setTimeout(() => el.remove(), 8600);
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

function showGameStartedToast({
  gameName,
  unlockedCount,
  totalCount,
  isDiamond,
  difficulty,
  displaySeconds,
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
  playWelcomeChime();
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

window.overlayAPI.onAchievement(enqueueAchievement);
window.overlayAPI.onGameDiamond(showDiamondCelebration);
window.overlayAPI.onWelcome(showWelcomeToast);
window.overlayAPI.onEinstellungen(wendeEinstellungenAn);
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

window.overlayAPI.onStatusBadge(({ visible, gameName, unlockedCount, totalCount }) => {
  if (!visible) {
    badge.classList.add('status-badge--hidden');
    return;
  }

  badge.querySelector('.status-badge__game').textContent = gameName || 'Trophäenschrank';

  const hatZahlen = Number.isFinite(totalCount) && totalCount > 0;
  badge.querySelector('.status-badge__progress').textContent = hatZahlen
    ? `${unlockedCount} / ${totalCount} · ${Math.round((unlockedCount / totalCount) * 100)}%`
    : 'wird verfolgt';

  badge.classList.remove('status-badge--hidden');
});
