/*
 * Übersicht aller Achievements des laufenden Spiels.
 *
 * Eigenes Fenster seit dem Fehler, bei dem sich das Spiel minimierte, sobald
 * man mit der Maus über die Liste fuhr — die Begründung steht in panel.html.
 *
 * Dieses Fenster hält seine eigene Kopie der Spieldaten. Es könnte sie sich
 * auch vom Overlay reichen lassen, aber zwei Fenster, die sich gegenseitig
 * Zustand zuschieben, sind genau die Art Kopplung, die später niemand mehr
 * versteht. Der Hauptprozess schickt beiden dasselbe.
 */

const TIERS = {
  Kupfer: { color: '#c07a42', rank: 0 },
  Silber: { color: '#b9c1cc', rank: 1 },
  Gold: { color: '#d3a13a', rank: 2 },
  Platin: { color: '#8b93e0', rank: 3 },
  Blutig: { color: '#d8323c', rank: 4 },
};

const panelEl = document.getElementById('panel');
let panelFilter = 'offen';

let spiel = {
  appId: null,
  name: '',
  achievements: [],
  merkliste: { achievements: [], notizen: [] },
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function stufeVon(kategorie) {
  return TIERS[kategorie] || TIERS.Platin;
}

/** Wie viele Einträge gerade auf der Merkliste stehen - nur für den Hinweis. */
function anzahlGemerkt() {
  const offen = (spiel.merkliste.achievements || []).filter((name) => {
    const a = spiel.achievements.find((x) => x.apiName === name);
    return a && !a.unlocked;
  }).length;
  return offen + (spiel.merkliste.notizen || []).length;
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
  zeichnePanel();
}

/**
 * Einzelnes Achievement als erreicht markieren, ohne alles neu zu laden.
 *
 * Der Hauptprozess räumt es auch aus der Merkliste - aber zwischen
 * Freischaltung und Aufräumen liegen Sekunden, und in genau diesen Sekunden
 * soll es hier nicht mehr als "offen" stehen.
 */
function markiereErreicht(apiName) {
  const treffer = spiel.achievements.find((a) => a.apiName === apiName);
  if (treffer) treffer.unlocked = true;
  spiel.merkliste.achievements = (spiel.merkliste.achievements || []).filter(
    (n) => n !== apiName
  );
  zeichnePanel();
}

// --- Zeichnen -----------------------------------------------------------------

function zeichnePanel() {
  const alle = spiel.achievements;
  const erreicht = alle.filter((a) => a.unlocked).length;

  panelEl.querySelector('.panel__spiel').textContent = spiel.name || 'Kein Spiel erkannt';
  panelEl.querySelector('.panel__stand').textContent = alle.length
    ? `${erreicht} von ${alle.length} erreicht · ${alle.length - erreicht} offen`
    : 'Keine Achievements bekannt';

  panelEl.querySelectorAll('.panel__filter-knopf').forEach((k) => {
    k.setAttribute('aria-pressed', String(k.dataset.filter === panelFilter));
  });

  const gefiltert = alle
    .filter((a) => {
      if (panelFilter === 'offen' && a.unlocked) return false;
      if (panelFilter === 'erreicht' && !a.unlocked) return false;
      return true;
    })
    // Seltenes zuerst: Das ist das, was am ehesten eine Planung wert ist.
    .sort((a, b) => a.globalPercent - b.globalPercent);

  const liste = panelEl.querySelector('.panel__liste');
  liste.innerHTML = '';

  if (gefiltert.length === 0) {
    const leer = document.createElement('li');
    leer.className = 'panel__leer';
    leer.textContent =
      panelFilter === 'offen' ? 'Alles erreicht. Nichts mehr offen.' : 'Noch nichts erreicht.';
    liste.appendChild(leer);
  } else {
    gefiltert.forEach((a) => liste.appendChild(panelEintrag(a)));
  }

  zeichneNotizen();

  const gemerkt = anzahlGemerkt();
  panelEl.querySelector('.panel__hinweis').textContent =
    (gemerkt ? `${gemerkt} auf der Merkliste · ` : '') +
    'Eigene Einträge im Tray-Menü unter „Merkliste bearbeiten…“';
}

/**
 * Eigene Einträge stehen über der Achievement-Liste - sie sind wenige und
 * sollen nicht zwischen hunderten Achievements untergehen.
 */
function zeichneNotizen() {
  const alt = panelEl.querySelector('.panel__notizen');
  if (alt) alt.remove();

  const notizen = spiel.merkliste.notizen || [];
  if (notizen.length === 0) return;

  const kasten = document.createElement('div');
  kasten.className = 'panel__notizen';
  kasten.innerHTML = '<p class="panel__notizen-titel">Eigene Einträge</p>';

  notizen.forEach((n) => {
    const zeile = document.createElement('div');
    zeile.className = `panel-notiz panel-notiz--${n.art}`;

    const mitte =
      n.art === 'tracker'
        ? `<span class="panel-notiz__text">${escapeHtml(n.text)}</span>
           <span class="panel-notiz__zahl">${n.stand} / ${n.ziel}</span>`
        : `<span class="panel-notiz__text">${escapeHtml(n.text)}</span>`;

    // Hier gibt es bewusst nur Knöpfe, kein Textfeld: Dieses Fenster nimmt
    // den Fokus nicht, sonst wäre man aus dem Spiel heraus. Ein Zähler lässt
    // sich damit hoch- und runterzählen - alles Weitere (Text ändern,
    // anlegen, löschen) im Merklisten-Fenster.
    zeile.innerHTML = `
      ${n.art === 'abschnitt' ? '' : '<span class="panel-notiz__punkt"></span>'}
      ${mitte}
      ${
        n.art === 'tracker'
          ? `<button class="panel-notiz__minus" type="button" title="Einen zurück"
                     ${n.stand <= 0 ? 'disabled' : ''}>−</button>
             <button class="panel-notiz__plus" type="button" title="Einen hochzählen"
                     ${n.stand >= n.ziel ? 'disabled' : ''}>+</button>`
          : ''
      }
    `;

    // Hoch- und runterzählen ist der einzige Griff, der im Spiel wirklich
    // gebraucht wird - "ich habe gerade eine gefunden".
    zeile.querySelector('.panel-notiz__plus')?.addEventListener('click', async () => {
      uebernimmAntwort(await window.panelAPI.notizAendern(n.id, { stand: n.stand + 1 }));
    });
    zeile.querySelector('.panel-notiz__minus')?.addEventListener('click', async () => {
      uebernimmAntwort(await window.panelAPI.notizAendern(n.id, { stand: n.stand - 1 }));
    });
    kasten.appendChild(zeile);
  });

  panelEl.querySelector('.panel__liste').before(kasten);
}

/** Antwort des Hauptprozesses übernehmen - er kennt den gültigen Stand. */
function uebernimmAntwort(antwort) {
  if (!antwort) return;
  if (antwort.merkliste && typeof antwort.merkliste === 'object') {
    spiel.merkliste = {
      achievements: antwort.merkliste.achievements || [],
      notizen: antwort.merkliste.notizen || [],
    };
    zeichnePanel();
  }
  if (antwort.grund) panelEl.querySelector('.panel__hinweis').textContent = antwort.grund;
}

function panelEintrag(a) {
  const stufe = stufeVon(a.category);
  const gemerkt = (spiel.merkliste.achievements || []).includes(a.apiName);

  const li = document.createElement('li');
  li.className = `panel-eintrag ${a.unlocked ? 'panel-eintrag--erreicht' : 'panel-eintrag--offen'}`;
  li.style.setProperty('--tier-color', stufe.color);
  li.innerHTML = `
    <img class="panel-eintrag__icon" src="${a.icon || '../assets/app-icon.png'}" alt=""
         onerror="this.style.visibility='hidden'" />
    <div class="panel-eintrag__text">
      <p class="panel-eintrag__name">${escapeHtml(a.name)}</p>
      ${a.description ? `<p class="panel-eintrag__desc">${escapeHtml(a.description)}</p>` : ''}
    </div>
    <div class="panel-eintrag__meta">
      <span class="panel-eintrag__stufe">${a.category}</span>
      ${a.globalPercent.toFixed(1)}%
    </div>
    <button class="panel-eintrag__haken" type="button"
            aria-pressed="${gemerkt}"
            title="${gemerkt ? 'Von der Merkliste nehmen' : 'Auf die Merkliste setzen'}">\u2713</button>
  `;

  li.querySelector('.panel-eintrag__haken').addEventListener('click', async () => {
    uebernimmAntwort(await window.panelAPI.merklisteSetzen(a.apiName, !gemerkt));
  });

  return li;
}

// --- Bedienung ----------------------------------------------------------------

panelEl.querySelector('.panel__zu').addEventListener('click', () => window.panelAPI.schliessen());

panelEl.querySelectorAll('.panel__filter-knopf').forEach((k) => {
  k.addEventListener('click', () => {
    panelFilter = k.dataset.filter;
    zeichnePanel();
  });
});

window.panelAPI.onSpielDaten(setzeSpiel);
window.panelAPI.onErreicht(markiereErreicht);
