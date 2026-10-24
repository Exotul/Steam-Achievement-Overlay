/**
 * Das Walkthrough-Fenster.
 *
 * Es bekommt alles vom Hauptprozess: Spiel, Guide-Liste, Achievements und den
 * gemerkten Stand. Dieses Fenster fragt weder Steam noch das Backend - wie der
 * Schrank und die Uebersicht.
 *
 * Seine eine eigene Aufgabe: den SCROLLSTAND der Guide-Seite lesen und
 * zurueckgeben. Das geht nur von hier aus, weil die Seite in einem eigenen
 * Prozess laeuft (webview).
 */

const el = {
  spiel: document.getElementById('spiel'),
  guideTitel: document.getElementById('guide-titel'),
  web: document.getElementById('web'),
  laedt: document.getElementById('laedt'),
  stand: document.getElementById('stand'),
  liste: document.getElementById('liste'),
  taste: document.getElementById('taste'),
  andere: document.getElementById('andere'),
  steam: document.getElementById('steam'),
  zu: document.getElementById('zu'),
  auswahl: document.getElementById('auswahl'),
  auswahlListe: document.getElementById('auswahl-liste'),
  auswahlZu: document.getElementById('auswahl-zu'),
};

const STUFEN = {
  Kupfer: '#c07a42',
  Silber: '#b9c1cc',
  Gold: '#d3a13a',
  Platin: '#8b93e0',
  Blutig: '#d8323c',
};

let daten = null;
let aktiverGuide = null;
let gemerkterStand = 0;
let standGesetzt = false;
// Solange die Seite noch von selbst herumrutscht, wird NICHTS gemerkt - sonst
// wandert die Fundstelle (siehe springeZumStand).
let darfMelden = false;

function escape(text) {
  const d = document.createElement('div');
  d.textContent = String(text ?? '');
  return d.innerHTML;
}

// --- Die Achievement-Spalte ---------------------------------------------------

function eintrag(a) {
  const li = document.createElement('li');
  li.className = `eintrag ${a.unlocked ? 'eintrag--erreicht' : 'eintrag--offen'}`;
  li.style.setProperty('--stufe', STUFEN[a.category] || '#7a6a58');

  const gemerkt = (daten.merkliste || []).includes(a.apiName);
  const anteil = typeof a.globalPercent === 'number' ? `${a.globalPercent.toFixed(1)} %` : '';

  li.innerHTML = `
    <button class="eintrag__haken" type="button" aria-pressed="${gemerkt}"
            title="${gemerkt ? 'Von der Merkliste nehmen' : 'Auf die Merkliste setzen'}">✓</button>
    <div class="eintrag__text">
      <p class="eintrag__name">${escape(a.name)}</p>
      <p class="eintrag__meta">${escape(a.category || '')} · ${anteil}</p>
    </div>`;

  const haken = li.querySelector('.eintrag__haken');
  haken.addEventListener('click', async () => {
    const neu = haken.getAttribute('aria-pressed') !== 'true';
    haken.setAttribute('aria-pressed', String(neu));
    // Die Antwort ist die Wahrheit: Die Merkliste hat eine Obergrenze, der
    // Haken kann also abgelehnt werden.
    const antwort = await window.guideAPI.merkliste(a.apiName, neu);
    if (antwort && Array.isArray(antwort.merkliste)) {
      daten.merkliste = antwort.merkliste;
      haken.setAttribute('aria-pressed', String(antwort.merkliste.includes(a.apiName)));
    }
  });

  return li;
}

function zeigeSpalte() {
  const liste = daten.achievements || [];
  const erreicht = liste.filter((a) => a.unlocked).length;
  el.stand.textContent = liste.length
    ? `${erreicht} von ${liste.length} erreicht`
    : 'Keine Achievements';

  el.liste.innerHTML = '';
  // Offene zuerst - das ist die Arbeitsliste zum Guide.
  const sortiert = [...liste].sort((a, b) => {
    if (!!a.unlocked !== !!b.unlocked) return a.unlocked ? 1 : -1;
    return (b.globalPercent || 0) - (a.globalPercent || 0);
  });
  sortiert.forEach((a) => el.liste.appendChild(eintrag(a)));
}

// --- Der Guide --------------------------------------------------------------

function zeigeGuide(guide) {
  if (!guide) {
    el.laedt.textContent = 'Kein passender Guide gefunden (englisch oder deutsch).';
    el.laedt.hidden = false;
    return;
  }
  aktiverGuide = guide;
  el.guideTitel.textContent =
    `${guide.titel} · ${guide.stimmenHoch}/${guide.stimmenGesamt} Stimmen`;
  el.laedt.textContent = 'Guide wird geladen…';
  el.laedt.hidden = false;
  standGesetzt = false;
  darfMelden = false;
  el.web.src = guide.url;
}

// Wie weit darf der Stand sich von selbst bewegen, ohne dass es als "der
// Anwender hat gescrollt" gilt? Nachgemessen: Die Seite ruckt nach dem Laden
// um bis zu 85 px. Ein Dreh am Mausrad bewegt deutlich mehr.
const EIGENBEWEGUNG = 200;

// Abstaende zwischen den Versuchen (in ms, jeweils zum vorigen). Nachgemessen:
// Die Seitenhoehe stand nach 1,3 s; der letzte Versuch ist Reserve.
const NACHFASSEN = [0, 300, 700, 1300, 1500];

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Nach dem Laden an die gemerkte Stelle springen.
 *
 * WARUM MEHRMALS UND MIT NACHLESEN: Direkt nach dem Laden ist die Seite noch
 * nicht so hoch, wie sie wird. Chromium kappt einen Sprung dann auf das
 * damalige Seitenende - nachgemessen bei Dead Space: aus 4200 wurden 3752.
 * Wer nur einmal springt, landet daneben; und weil anschliessend genau dieser
 * Wert gemerkt wird, waere die Fundstelle nach wenigen Abenden weit abgewandert.
 *
 * Deshalb wird nach jedem Setzen NACHGELESEN, was wirklich angekommen ist, und
 * noch einmal gesetzt, sobald die Seite hoch genug ist. Verglichen wird dabei
 * gegen den selbst gesetzten Wert, nicht gegen das Ziel: Sonst gilt eine
 * Kappung als "da scrollt jemand" - und dann bleibt es beim falschen Stand.
 *
 * Wer waehrenddessen selbst scrollt, wird nicht zurueckgerissen: Bewegt sich
 * der Stand, OBWOHL er gerade gesetzt wurde, hoert das Nachfassen auf.
 */
async function springeZumStand() {
  if (standGesetzt) return;
  standGesetzt = true;

  const ziel = Number(gemerkterStand) || 0;
  let gesetzt = null;

  for (const ms of NACHFASSEN) {
    await warte(ms);
    if (!aktiverGuide) return;
    try {
      const ist = await el.web.executeJavaScript('document.scrollingElement.scrollTop');
      if (gesetzt !== null && Number.isFinite(ist) && Math.abs(ist - gesetzt) > EIGENBEWEGUNG) {
        break; // da scrollt ein Mensch - ab hier gilt seine Stelle
      }
      if (!ziel) {
        gesetzt = ist; // nichts wiederherzustellen, nur auf Ruhe warten
        continue;
      }
      await el.web.executeJavaScript(`document.scrollingElement.scrollTop = ${ziel}; true`);
      // Nicht abbrechen, auch wenn es schon passt: Das Rucken der Seite kommt
      // teils erst danach, und genau das soll hier mitkorrigiert werden.
      gesetzt = await el.web.executeJavaScript('document.scrollingElement.scrollTop');
    } catch (err) {
      /* Seite weg oder laedt neu - dann bleibt der alte Stand. */
    }
  }
  darfMelden = true;
}

/** Den Scrollstand holen und melden - der Hauptprozess schreibt ihn weg. */
async function meldeStand() {
  if (!aktiverGuide || !darfMelden) return;
  try {
    const stand = await el.web.executeJavaScript('document.scrollingElement.scrollTop');
    if (Number.isFinite(stand)) window.guideAPI.stand(aktiverGuide.id, Math.round(stand));
  } catch (err) {
    /* Die Seite ist weg oder laedt gerade - dann bleibt der alte Stand. */
  }
}

el.web.addEventListener('dom-ready', () => {
  el.laedt.hidden = true;
  springeZumStand();
});
el.web.addEventListener('did-finish-load', () => {
  el.laedt.hidden = true;
  springeZumStand();
});
el.web.addEventListener('did-fail-load', (e) => {
  // -3 ist ein abgebrochener Ladevorgang (etwa beim Wechsel) - kein Fehler.
  if (e.errorCode === -3) return;
  el.laedt.textContent = 'Die Guide-Seite ließ sich nicht laden.';
  el.laedt.hidden = false;
});

// Regelmaessig merken, nicht nur beim Schliessen: Wird das Fenster hart
// beendet (Neustart der App, Absturz), waere der Stand sonst weg.
setInterval(meldeStand, 5000);
window.addEventListener('beforeunload', meldeStand);

// --- Die Guide-Auswahl ---------------------------------------------------------

function zeigeAuswahl() {
  const guides = daten.guides || [];
  el.auswahlListe.innerHTML = '';
  if (guides.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Keine Guides gefunden.';
    el.auswahlListe.appendChild(li);
  }
  guides.forEach((g) => {
    const li = document.createElement('li');
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className =
      'auswahl__eintrag' + (aktiverGuide && g.id === aktiverGuide.id ? ' auswahl__eintrag--aktiv' : '');
    knopf.innerHTML = `
      <span class="auswahl__titel">${escape(g.titel)}</span>
      <span class="auswahl__meta">${g.stimmenHoch}/${g.stimmenGesamt} Stimmen ·
        ${g.aufrufe.toLocaleString('de-DE')} Aufrufe · ${escape(g.sprachen.join(', '))}</span>`;
    knopf.addEventListener('click', async () => {
      el.auswahl.hidden = true;
      await meldeStand(); // den Stand des alten Guides noch sichern
      gemerkterStand = 0;
      window.guideAPI.waehle(g.id, g.titel);
      zeigeGuide(g);
    });
    li.appendChild(knopf);
    el.auswahlListe.appendChild(li);
  });
  el.auswahl.hidden = false;
}

el.andere.addEventListener('click', zeigeAuswahl);
el.auswahlZu.addEventListener('click', () => {
  el.auswahl.hidden = true;
});
el.steam.addEventListener('click', () => {
  if (aktiverGuide) window.guideAPI.imBrowser(aktiverGuide.url);
});
el.zu.addEventListener('click', async () => {
  await meldeStand();
  window.guideAPI.schliessen();
});
window.addEventListener('keydown', async (e) => {
  if (e.key !== 'Escape') return;
  if (!el.auswahl.hidden) {
    el.auswahl.hidden = true;
    return;
  }
  await meldeStand();
  window.guideAPI.schliessen();
});

// --- Anschluss ------------------------------------------------------------------

if (window.guideAPI) {
  window.guideAPI.onDaten((neu) => {
    daten = neu || {};
    el.spiel.textContent = daten.name || `App ${daten.appId}`;
    if (daten.panelTaste) el.taste.textContent = daten.panelTaste;
    gemerkterStand = Number(daten.stand) || 0;
    zeigeSpalte();
    // Der zuletzt gewaehlte Guide gewinnt gegen den bestbewerteten: Wer sich
    // einmal fuer einen entschieden hat, will nicht beim naechsten Mal wieder
    // den Vorschlag der Automatik lesen.
    const guides = daten.guides || [];
    zeigeGuide(guides.find((g) => g.id === daten.gewaehlt) || guides[0] || null);
  });
  window.guideAPI.bereit();
}
