/**
 * Ablauf des Merklisten-Fensters.
 *
 * Der Hauptprozess hält die Wahrheit: Jeder Aufruf gibt den vollständigen,
 * gerade gültigen Stand zurück, und die Seite zeichnet daraufhin neu. Sie
 * führt keinen eigenen Zustand mit, den sie nachpflegen müsste - das ist die
 * Quelle der meisten Ungereimtheiten in solchen Ansichten.
 */

const el = (id) => document.getElementById(id);
const ARTEN_HILFE = {
  notiz: 'Eine Zeile Text. Verschwindet nur, wenn du sie entfernst.',
  tracker:
    'Text mit Zählerstand, etwa „Audionotizen 12 / 52“. Für alles, was das Spiel nicht selbst mitzählt — im Spiel lässt sich der Stand mit + und − ändern.',
  abschnitt: 'Eine Überschrift, um längere Listen zu gliedern.',
};

let stand = { appId: null, spiele: [], achievements: [], merkliste: { achievements: [], notizen: [] } };
let art = 'notiz';
let bearbeitet = null; // Kennung des Eintrags, der gerade geändert wird
let meldungTimer = null;

// --- Hilfen ------------------------------------------------------------------

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text == null ? '' : String(text);
  return d.innerHTML;
}

function sage(text, klasse = '') {
  el('meldung').textContent = text;
  el('meldung').className = 'meldung' + (klasse ? ` meldung--${klasse}` : '');
  clearTimeout(meldungTimer);
  if (text && klasse === 'gut') {
    meldungTimer = setTimeout(() => sage(''), 2000);
  }
}

/** Antwort des Hauptprozesses übernehmen - er kennt den gültigen Stand. */
function uebernimm(antwort) {
  if (!antwort) return;
  if (antwort.merkliste) stand.merkliste = antwort.merkliste;
  zeichne();
  if (antwort.grund) sage(antwort.grund, 'fehler');
}

// --- Eigene Einträge ---------------------------------------------------------

function zeichneNotizen() {
  const liste = el('notizen');
  liste.innerHTML = '';
  const notizen = stand.merkliste.notizen || [];

  if (notizen.length === 0) {
    const leer = document.createElement('li');
    leer.className = 'leer';
    leer.textContent = 'Noch keine eigenen Einträge. Unten anlegen.';
    liste.appendChild(leer);
    return;
  }

  notizen.forEach((n) => {
    const li = document.createElement('li');
    li.className = `notiz notiz--${n.art}` + (bearbeitet === n.id ? ' notiz--wird-bearbeitet' : '');

    const zahlen =
      n.art === 'tracker'
        ? `<span class="notiz__zahl">${n.stand} / ${n.ziel}</span>
           <span class="notiz__balken"><span style="width:${(n.stand / n.ziel) * 100}%"></span></span>`
        : '';

    li.innerHTML = `
      ${n.art === 'abschnitt' ? '' : '<span class="notiz__punkt"></span>'}
      <span class="notiz__text">${escapeHtml(n.text)}</span>
      ${zahlen}
      <span class="notiz__knoepfe">
        <button class="mini mini--hoch" type="button" title="Bearbeiten">&#9998;</button>
        <button class="mini mini--weg" type="button" title="Entfernen">&#10005;</button>
      </span>
    `;

    li.querySelector('.mini--hoch').addEventListener('click', () => bearbeiteNotiz(n));
    li.querySelector('.mini--weg').addEventListener('click', async () => {
      if (bearbeitet === n.id) beendeBearbeitung();
      uebernimm(await window.merkAPI.notizEntfernen(stand.appId, n.id));
      sage('Entfernt.', 'gut');
    });

    liste.appendChild(li);
  });
}

function setzeArt(neu) {
  art = neu;
  document.querySelectorAll('.art').forEach((k) => {
    k.setAttribute('aria-pressed', String(k.dataset.art === neu));
  });
  el('zahlen').hidden = neu !== 'tracker';
  el('art-hilfe').textContent = ARTEN_HILFE[neu];
  el('text').placeholder =
    neu === 'tracker'
      ? 'Wofür der Zähler steht, z. B. „Audionotizen“'
      : neu === 'abschnitt'
        ? 'Überschrift, z. B. „Kapitel 2“'
        : 'z. B. „Alle Audionotizen sammeln“';
}

function bearbeiteNotiz(n) {
  bearbeitet = n.id;
  setzeArt(n.art);
  el('text').value = n.text;
  el('stand').value = n.art === 'tracker' ? n.stand : 0;
  el('ziel').value = n.art === 'tracker' ? n.ziel : '';
  el('speichern').textContent = 'Speichern';
  el('abbrechen').hidden = false;
  el('text').focus();
  el('text').select();
  zeichneNotizen();
}

function beendeBearbeitung() {
  bearbeitet = null;
  el('text').value = '';
  el('stand').value = 0;
  el('ziel').value = '';
  el('speichern').textContent = 'Hinzufügen';
  el('abbrechen').hidden = true;
  setzeArt('notiz');
  zeichneNotizen();
}

// --- Achievements ------------------------------------------------------------

function zeichneAchievements() {
  const liste = el('achievements');
  liste.innerHTML = '';

  if (stand.achievements.length === 0) {
    el('ach-hinweis').textContent = stand.appId
      ? 'Für dieses Spiel sind keine Achievements bekannt. Sie werden geladen, sobald es läuft.'
      : 'Kein Spiel ausgewählt.';
    return;
  }

  const suche = el('suche').value.trim().toLowerCase();
  const gemerkt = stand.merkliste.achievements || [];

  // Offene zuerst, darin die seltensten - das ist die Reihenfolge, in der man
  // eine Liste zusammenstellt.
  const sichtbar = stand.achievements
    .filter((a) => !suche || a.name.toLowerCase().includes(suche) ||
      (a.description || '').toLowerCase().includes(suche))
    .sort((a, b) => Number(a.unlocked) - Number(b.unlocked) || a.globalPercent - b.globalPercent);

  el('ach-hinweis').textContent = 'Haken setzen, um ein Achievement im Spiel einzublenden.';

  sichtbar.forEach((a) => {
    const drin = gemerkt.includes(a.apiName);
    const li = document.createElement('li');
    li.className = `ach ${a.unlocked ? 'ach--erreicht' : 'ach--offen'}`;
    li.innerHTML = `
      <button class="ach__haken" type="button" aria-pressed="${drin}"
              ${a.unlocked ? 'disabled title="Bereits erreicht"' : ''}>&#10003;</button>
      <img class="ach__icon" src="${a.icon || ''}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="ach__text">
        <p class="ach__name">${escapeHtml(a.name)}</p>
        ${a.description ? `<p class="ach__desc">${escapeHtml(a.description)}</p>` : ''}
      </div>
      <span class="ach__stufe">${a.category} · ${a.globalPercent.toFixed(1)}%</span>
    `;

    li.querySelector('.ach__haken').addEventListener('click', async () => {
      uebernimm(await window.merkAPI.setzeHaken(stand.appId, a.apiName, !drin));
    });

    liste.appendChild(li);
  });
}

// --- Gesamtbild --------------------------------------------------------------

function zeichne() {
  zeichneNotizen();
  zeichneAchievements();

  const n = (stand.merkliste.achievements || []).length + (stand.merkliste.notizen || []).length;
  el('zaehler').textContent = stand.appId
    ? `${n} von höchstens ${stand.max} Einträgen`
    : 'Kein Spiel ausgewählt';
}

function zeichneSpiele() {
  const wahl = el('spiel');
  wahl.innerHTML = '';

  if (stand.spiele.length === 0) {
    const o = document.createElement('option');
    o.textContent = 'Kein Spiel — starte eines, oder lege zuerst eine Liste an';
    wahl.appendChild(o);
    wahl.disabled = true;
    return;
  }

  wahl.disabled = false;
  stand.spiele.forEach((s) => {
    const o = document.createElement('option');
    o.value = String(s.appId);
    o.textContent = s.name + (s.laeuft ? '  (läuft gerade)' : '');
    wahl.appendChild(o);
  });
  wahl.value = String(stand.appId);
}

async function lade(appId) {
  const antwort = await window.merkAPI.laden(appId);
  stand = { ...stand, ...antwort };
  zeichneSpiele();
  zeichne();
}

// --- Verdrahtung -------------------------------------------------------------

document.querySelectorAll('.art').forEach((k) => {
  k.addEventListener('click', () => {
    setzeArt(k.dataset.art);
    el('text').focus();
  });
});

el('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = el('text').value.trim();
  if (!text) {
    sage('Bitte etwas eintragen.', 'fehler');
    return;
  }

  const daten = { art, text };
  if (art === 'tracker') {
    daten.stand = Number(el('stand').value) || 0;
    daten.ziel = Number(el('ziel').value) || 0;
    if (daten.ziel <= 0) {
      sage('Ein Tracker braucht ein Ziel — sonst wird daraus eine Notiz.', 'fehler');
    }
  }

  const antwort = bearbeitet
    ? await window.merkAPI.notizAendern(stand.appId, bearbeitet, daten)
    : await window.merkAPI.notizHinzufuegen(stand.appId, daten);

  if (antwort && antwort.grund) {
    uebernimm(antwort);
    return;
  }

  const warBearbeitung = !!bearbeitet;
  beendeBearbeitung();
  uebernimm(antwort);
  sage(warBearbeitung ? 'Gespeichert.' : 'Hinzugefügt.', 'gut');
});

el('abbrechen').addEventListener('click', beendeBearbeitung);
el('suche').addEventListener('input', zeichneAchievements);
el('spiel').addEventListener('change', () => lade(Number(el('spiel').value)));
el('schliessen').addEventListener('click', () => window.merkAPI.schliessen());

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (bearbeitet) beendeBearbeitung();
  else window.merkAPI.schliessen();
});

setzeArt('notiz');
lade(null);
