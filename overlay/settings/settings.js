/**
 * Ablauf des Einstellungsfensters.
 *
 * Bewusst ohne Speichern-Knopf: Jede Änderung wird sofort übernommen und
 * angewendet. Bei Einstellungen, deren Wirkung man sehen will - Größe,
 * Position, Lautstärke - ist "erst einstellen, dann speichern, dann
 * ausprobieren" ein unnötiger Umweg. Die kurze Bestätigung unten sagt, dass
 * es angekommen ist.
 */

const els = {};
['bildschirm', 'groesse', 'anzeigeDauerSek', 'spielStartDauerSek', 'lautstaerke',
 'statusAbzeichen', 'position', 'ton-name', 'ton-waehlen', 'ton-entfernen',
 'key-status', 'key-aendern', 'test', 'zuruecksetzen', 'schliessen', 'gespeichert',
 'merklisteAktiv', 'merklisteGroesse', 'abzeichenGroesse', 'panelTaste', 'panelBeiSteamOverlay',
].forEach((id) => {
  els[id] = document.getElementById(id);
});

const REGLER = {
  groesse: (v) => `${Math.round(v * 100)} %`,
  anzeigeDauerSek: (v) => `${Number(v).toFixed(1).replace('.', ',')} s`,
  spielStartDauerSek: (v) => `${Math.round(v)} s`,
  lautstaerke: (v) => (Number(v) === 0 ? 'stumm' : `${Math.round(v * 100)} %`),
  merklisteGroesse: (v) => `${Math.round(v * 100)} %`,
  abzeichenGroesse: (v) => `${Math.round(v * 100)} %`,
};

// Einstellungen, die nur an oder aus kennen.
const SCHALTER = ['merklisteAktiv', 'panelBeiSteamOverlay'];

let werte = null;
let bestaetigungTimer = null;

// --- Anzeigen ---------------------------------------------------------------

function zeigeWerte(w) {
  werte = w;

  Object.keys(REGLER).forEach((name) => {
    els[name].value = w[name];
    document.getElementById(`${name}-wert`).textContent = REGLER[name](w[name]);
  });

  SCHALTER.forEach((name) => {
    els[name].checked = !!w[name];
  });

  // Nur schreiben, wenn das Feld gerade nicht bearbeitet wird - sonst
  // springt der Cursor beim Tippen ans Ende.
  if (document.activeElement !== els.panelTaste) els.panelTaste.value = w.panelTaste || '';

  els.statusAbzeichen.value = w.statusAbzeichen;
  els.bildschirm.value = w.bildschirm === null ? 'haupt' : String(w.bildschirm);

  els.position.querySelectorAll('.ecke').forEach((knopf) => {
    knopf.setAttribute('aria-checked', String(knopf.dataset.wert === w.position));
  });

  if (w.eigenerTon) {
    els['ton-name'].textContent = w.eigenerTon;
    els['ton-entfernen'].hidden = false;
    els['ton-waehlen'].textContent = 'Andere Datei…';
  } else {
    els['ton-name'].textContent = 'Kein eigener Ton — es klingt der eingebaute.';
    els['ton-entfernen'].hidden = true;
    els['ton-waehlen'].textContent = 'Datei wählen…';
  }
}

function zeigeBildschirme(liste, gewaehlt) {
  els.bildschirm.innerHTML = '';

  const haupt = document.createElement('option');
  haupt.value = 'haupt';
  haupt.textContent = 'Hauptbildschirm (folgt der Einstellung von Windows)';
  els.bildschirm.appendChild(haupt);

  liste.forEach((s) => {
    const o = document.createElement('option');
    o.value = String(s.id);
    o.textContent = `${s.name} — ${s.breite} × ${s.hoehe}${s.istHaupt ? ' (aktuell Hauptbildschirm)' : ''}`;
    els.bildschirm.appendChild(o);
  });

  els.bildschirm.value = gewaehlt === null ? 'haupt' : String(gewaehlt);
}

function zeigeSchluessel(vorhanden) {
  els['key-status'].textContent = vorhanden
    ? 'Eingetragen und gespeichert.'
    : 'Noch nicht eingetragen — die App kann ohne ihn nichts abrufen.';
  els['key-aendern'].textContent = vorhanden ? 'Ändern…' : 'Jetzt eintragen…';
}

function bestaetige(text = 'Gespeichert') {
  els.gespeichert.textContent = text;
  els.gespeichert.classList.add('gespeichert--sichtbar');
  clearTimeout(bestaetigungTimer);
  bestaetigungTimer = setTimeout(() => {
    els.gespeichert.classList.remove('gespeichert--sichtbar');
  }, 1600);
}

// --- Speichern --------------------------------------------------------------

async function aendere(teil, { still = false } = {}) {
  const antwort = await window.settingsAPI.speichern({ ...werte, ...teil });
  zeigeWerte(antwort);
  if (!still) bestaetige();
}

// --- Verdrahtung ------------------------------------------------------------

Object.keys(REGLER).forEach((name) => {
  // Waehrend des Ziehens nur die Zahl mitlaufen lassen und still anwenden -
  // sonst blinkt bei jedem Pixel eine Bestaetigung auf.
  els[name].addEventListener('input', () => {
    const wert = Number(els[name].value);
    document.getElementById(`${name}-wert`).textContent = REGLER[name](wert);
    aendere({ [name]: wert }, { still: true });
  });
  // Erst beim Loslassen bestaetigen.
  els[name].addEventListener('change', () => bestaetige());
});

els.statusAbzeichen.addEventListener('change', () => {
  aendere({ statusAbzeichen: els.statusAbzeichen.value });
});

SCHALTER.forEach((name) => {
  els[name].addEventListener('change', () => aendere({ [name]: els[name].checked }));
});

// Erst beim Verlassen des Feldes uebernehmen: Waehrend des Tippens waere
// jede Zwischenstufe eine ungueltige Tastenkombination, und der
// Hauptprozess wuerde sie reihenweise vergeblich zu belegen versuchen.
els.panelTaste.addEventListener('change', () => aendere({ panelTaste: els.panelTaste.value }));
els.panelTaste.addEventListener('blur', () => aendere({ panelTaste: els.panelTaste.value }));

els.bildschirm.addEventListener('change', () => {
  const v = els.bildschirm.value;
  aendere({ bildschirm: v === 'haupt' ? null : Number(v) });
});

els.position.querySelectorAll('.ecke').forEach((knopf) => {
  knopf.addEventListener('click', () => aendere({ position: knopf.dataset.wert }));
});

els['ton-waehlen'].addEventListener('click', async () => {
  const pfad = await window.settingsAPI.tonWaehlen();
  if (pfad) aendere({ eigenerTon: pfad });
});

els['ton-entfernen'].addEventListener('click', () => aendere({ eigenerTon: null }));

els['key-aendern'].addEventListener('click', async () => {
  const vorhanden = await window.settingsAPI.schluesselAendern();
  zeigeSchluessel(vorhanden);
});

els.test.addEventListener('click', () => window.settingsAPI.testMeldung());

els.zuruecksetzen.addEventListener('click', async () => {
  zeigeWerte(await window.settingsAPI.zuruecksetzen());
  bestaetige('Zurückgesetzt');
});

els.schliessen.addEventListener('click', () => window.settingsAPI.schliessen());

// --- Start ------------------------------------------------------------------

window.settingsAPI.laden().then(({ einstellungen, bildschirme, schluesselVorhanden }) => {
  zeigeBildschirme(bildschirme, einstellungen.bildschirm);
  zeigeWerte(einstellungen);
  zeigeSchluessel(schluesselVorhanden);
});
