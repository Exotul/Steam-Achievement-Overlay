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
['bildschirm', 'vollbildZweitschirm', 'groesse', 'anzeigeDauerSek', 'spielStartDauerSek', 'lautstaerke',
 'statusAbzeichen', 'position', 'ton-name', 'ton-waehlen', 'ton-entfernen',
 'key-status', 'key-aendern', 'test', 'zuruecksetzen', 'schliessen', 'gespeichert',
 'merklisteAktiv', 'merklisteGroesse', 'abzeichenGroesse', 'panelTaste', 'panelBeiSteamOverlay',
 'sitzungsbilanz', 'schrankAktiv', 'schrankBildschirm', 'schrankRuheImSpiel',
 'schrankHintergrund', 'streamAktiv', 'streamUrl', 'stream-test', 'stream-status',
 // Aussehen des Schranks
 'schrankHolz', 'schrankWand', 'schrankRuecken', 'schrankVerlauf', 'schrankSchrift',
 'holz-vorrat', 'wand-vorrat', 'sammlungen', 'sammlungsfarben-zeile',
 // aus dem Tray-Menue hierher gezogen
 'test-diamant', 'konto-status', 'abmelden', 'autostart', 'autostart-zeile', 'version',
 'updates', 'beenden', 'diagnose', 'keycheck', 'protokoll', 'protokollordner', 'aufzeichnung',
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
const SCHALTER = [
  'vollbildZweitschirm',
  'schrankVerlauf',
  'merklisteAktiv',
  'panelBeiSteamOverlay',
  'sitzungsbilanz',
  'schrankAktiv',
  'schrankRuheImSpiel',
  'schrankHintergrund',
  'streamAktiv',
];

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
  if (document.activeElement !== els.streamUrl) els.streamUrl.value = w.streamUrl || '';

  els.statusAbzeichen.value = w.statusAbzeichen;
  els.schrankRuecken.value = w.schrankRuecken;
  els.schrankSchrift.value = w.schrankSchrift;
  // Der Farbwähler kennt nur #rrggbb. Steht etwas anderes in der Datei
  // (rgb(), hsl()), bleibt das Feld, wie es ist - der Schrank zeigt die Farbe
  // trotzdem richtig an.
  if (/^#[0-9a-f]{6}$/i.test(w.schrankHolz || '')) els.schrankHolz.value = w.schrankHolz;
  if (/^#[0-9a-f]{6}$/i.test(w.schrankWand || '')) els.schrankWand.value = w.schrankWand;
  els.bildschirm.value = w.bildschirm === null ? 'haupt' : String(w.bildschirm);
  els.schrankBildschirm.value =
    w.schrankBildschirm === null ? 'auto' : String(w.schrankBildschirm);

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

function zeigeBildschirme(liste, gewaehlt, gewaehltSchrank) {
  fuelleBildschirmliste(
    els.bildschirm,
    liste,
    'haupt',
    'Hauptbildschirm (folgt der Einstellung von Windows)',
    gewaehlt
  );
  // Der Schrank hat seine eigene Auswahl: Er gehoert auf einen ANDEREN
  // Bildschirm als die Meldungen, deshalb ist seine Vorgabe nicht
  // "Hauptbildschirm", sondern "automatisch".
  fuelleBildschirmliste(
    els.schrankBildschirm,
    liste,
    'auto',
    'Automatisch (ein anderer als für die Meldungen)',
    gewaehltSchrank
  );
}

function fuelleBildschirmliste(feld, liste, ersterWert, ersterText, gewaehlt) {
  feld.innerHTML = '';
  const erster = document.createElement('option');
  erster.value = ersterWert;
  erster.textContent = ersterText;
  feld.appendChild(erster);

  liste.forEach((s) => {
    const o = document.createElement('option');
    o.value = String(s.id);
    o.textContent = `${s.name} — ${s.breite} × ${s.hoehe}${s.istHaupt ? ' (aktuell Hauptbildschirm)' : ''}`;
    feld.appendChild(o);
  });

  feld.value = gewaehlt === null || gewaehlt === undefined ? ersterWert : String(gewaehlt);
}

function zeigeSchluessel(vorhanden) {
  els['key-status'].textContent = vorhanden
    ? 'Eingetragen und gespeichert.'
    : 'Noch nicht eingetragen — die App kann ohne ihn nichts abrufen.';
  els['key-aendern'].textContent = vorhanden ? 'Ändern…' : 'Jetzt eintragen…';
}

/**
 * Zeigt den Teil des Zustands, den nur der Hauptprozess kennt.
 *
 * Jede Aktion in den Abschnitten "Programm" und "Diagnose" gibt diesen Stand
 * zurueck. So steht nach dem Abmelden auch wirklich "Nicht angemeldet" da und
 * nicht mehr der Name von eben.
 */
function zeigeProgramm(st) {
  els['konto-status'].textContent = st.angemeldetAls
    ? `Angemeldet als ${st.angemeldetAls}.`
    : 'Nicht angemeldet \u2014 die Anmeldung l\u00e4uft \u00fcber das Symbol in der Taskleiste.';
  els.abmelden.disabled = !st.angemeldetAls;

  els.version.textContent = `Trophäenschrank ${st.version}`;
  // Ohne Installation gibt es keine Updates - dann waere der Knopf eine
  // Einladung zu einer Enttaeuschung.
  els.updates.disabled = !st.updatesMoeglich;
  els.updates.title = st.updatesMoeglich
    ? ''
    : 'Nur in der installierten Fassung - diese hier läuft aus dem Projektordner.';

  els['autostart-zeile'].hidden = !st.autostartVerfuegbar;
  els.autostart.checked = st.autostartAn;

  els.aufzeichnung.textContent = st.zeichnetAuf ? 'Beenden und speichern' : 'Starten\u2026';
  els.aufzeichnung.classList.toggle('knopf--laeuft', st.zeichnetAuf);
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
els.streamUrl.addEventListener('change', () => aendere({ streamUrl: els.streamUrl.value }));
els.streamUrl.addEventListener('blur', () => aendere({ streamUrl: els.streamUrl.value }));

els['stream-test'].addEventListener('click', async () => {
  els['stream-status'].textContent = 'Wird geschickt…';
  const antwort = await window.settingsAPI.streamTest();
  // Im Klartext, was passiert ist: Beim Einrichten ist "nichts zu sehen" die
  // nutzloseste aller Antworten.
  els['stream-status'].textContent = antwort && antwort.ok
    ? 'Angekommen. Die Meldung läuft jetzt im Stream-Overlay.'
    : antwort && antwort.grund === 'adresse'
      ? 'Die Adresse ist unbrauchbar — sie muss mit http:// beginnen.'
      : antwort && antwort.grund === 'zeit'
        ? 'Keine Antwort. Läuft das Overlay-Programm?'
        : `Nicht angekommen (${(antwort && (antwort.grund || antwort.status)) || 'unbekannt'}). Läuft das Overlay-Programm?`;
});

els.panelTaste.addEventListener('change', () => aendere({ panelTaste: els.panelTaste.value }));
els.panelTaste.addEventListener('blur', () => aendere({ panelTaste: els.panelTaste.value }));

els.bildschirm.addEventListener('change', () => {
  const v = els.bildschirm.value;
  aendere({ bildschirm: v === 'haupt' ? null : Number(v) });
});

els.schrankBildschirm.addEventListener('change', () => {
  const v = els.schrankBildschirm.value;
  aendere({ schrankBildschirm: v === 'auto' ? null : Number(v) });
});

/* ---------------------------------------------------------------------------
   Aussehen des Schranks
   --------------------------------------------------------------------------- */

// Ein paar Hölzer und Wände zur Auswahl - wer keine Farbe aussuchen will,
// klickt eines an. Die Namen sind das, was man beim Hinsehen denkt.
const HOELZER = [
  ['#a97b4a', 'Eiche'],
  ['#7a4b2a', 'Nussbaum'],
  ['#93362a', 'Kirsche'],
  ['#5d5a55', 'Grau'],
  ['#2e2b28', 'Anthrazit'],
];
const WAENDE = [
  ['#171310', 'Dunkel'],
  ['#101418', 'Blaugrau'],
  ['#181014', 'Weinrot'],
  ['#0e1410', 'Tannengrün'],
  ['#000000', 'Schwarz'],
];

function baueVorrat(behaelter, liste, feld, name) {
  behaelter.innerHTML = '';
  liste.forEach(([farbe, titel]) => {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'farbwahl__probe';
    knopf.style.background = farbe;
    knopf.title = titel;
    knopf.setAttribute('aria-label', titel);
    knopf.addEventListener('click', () => {
      feld.value = farbe;
      aendere({ [name]: farbe });
    });
    behaelter.appendChild(knopf);
  });
}

baueVorrat(els['holz-vorrat'], HOELZER, els.schrankHolz, 'schrankHolz');
baueVorrat(els['wand-vorrat'], WAENDE, els.schrankWand, 'schrankWand');

// Beim Ziehen im Farbwähler still anwenden, damit man die Farbe im Schrank
// wandern sieht; die Bestätigung erst beim Loslassen.
['schrankHolz', 'schrankWand'].forEach((name) => {
  els[name].addEventListener('input', () => aendere({ [name]: els[name].value }, { still: true }));
  els[name].addEventListener('change', () => bestaetige());
});

els.schrankSchrift.addEventListener('change', () =>
  aendere({ schrankSchrift: els.schrankSchrift.value })
);

els.schrankRuecken.addEventListener('change', async () => {
  await aendere({ schrankRuecken: els.schrankRuecken.value });
  zeigeSammlungsfarben();
});

/**
 * Die Farbwahl je Sammlung - nur in der Betriebsart "Nach Sammlung".
 *
 * Die Liste kommt aus dem Schrank selbst, samt der Farbe, die gerade gilt.
 * Ohne sie stünden hier lauter leere Felder und man müsste raten, welcher Ton
 * gerade wirkt.
 */
let sammlungenGeladen = false;

async function zeigeSammlungsfarben() {
  const an = els.schrankRuecken.value === 'sammlung';
  els['sammlungsfarben-zeile'].hidden = !an;
  if (!an || sammlungenGeladen) return;

  els.sammlungen.textContent = 'Wird geladen…';
  const liste = await window.settingsAPI.sammlungen();
  sammlungenGeladen = true;
  if (!liste || liste.length === 0) {
    els.sammlungen.textContent = 'Keine Sammlungen gefunden.';
    return;
  }

  els.sammlungen.innerHTML = '';
  liste.forEach((s) => {
    const zeile = document.createElement('div');
    zeile.className = 'sammlung';

    const feld = document.createElement('input');
    feld.type = 'color';
    feld.className = 'sammlung__farbe';
    // Der Farbwähler kann nur Hex. Abgeleitete Töne sind hsl() - dann bleibt
    // das Feld bei seiner Vorgabe, bis jemand etwas auswählt.
    if (/^#[0-9a-f]{6}$/i.test(s.farbe)) feld.value = s.farbe;
    feld.title = `Farbe für „${s.name}“`;

    const name = document.createElement('span');
    name.className = 'sammlung__name';
    name.textContent = s.name;

    const anzahl = document.createElement('span');
    anzahl.className = 'sammlung__anzahl';
    anzahl.textContent = s.anzahl;

    // Ein Ton, den man selbst gesetzt hat, lässt sich wieder abgeben.
    const zurueck = document.createElement('button');
    zurueck.type = 'button';
    zurueck.className = 'sammlung__zurueck';
    zurueck.textContent = '×';
    zurueck.title = 'Wieder aus dem Namen ableiten';
    zurueck.hidden = !s.eigen;

    const setze = (farbe) => {
      const alle = { ...(werte.schrankSammlungsfarben || {}) };
      if (farbe) alle[s.name] = farbe;
      else delete alle[s.name];
      zurueck.hidden = !farbe;
      aendere({ schrankSammlungsfarben: alle });
    };

    feld.addEventListener('change', () => setze(feld.value));
    zurueck.addEventListener('click', () => setze(null));

    zeile.append(feld, name, anzahl, zurueck);
    els.sammlungen.appendChild(zeile);
  });
}

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
els['test-diamant'].addEventListener('click', () => window.settingsAPI.testDiamant());

// --- Programm & Diagnose ----------------------------------------------------

els.autostart.addEventListener('change', async () => {
  // Den zurueckgemeldeten Stand setzen, nicht den angeklickten: Schlaegt das
  // Eintragen fehl, springt der Schalter zurueck statt zu behaupten, es habe
  // geklappt.
  els.autostart.checked = await window.settingsAPI.autostart(els.autostart.checked);
});

els.abmelden.addEventListener('click', async () => {
  zeigeProgramm(await window.settingsAPI.abmelden());
  bestaetige('Abgemeldet');
});

els.updates.addEventListener('click', () => window.settingsAPI.updatesPruefen());
els.beenden.addEventListener('click', () => window.settingsAPI.beenden());

els.diagnose.addEventListener('click', () => window.settingsAPI.diagnose());
els.keycheck.addEventListener('click', () => window.settingsAPI.keycheck());
els.protokoll.addEventListener('click', () => window.settingsAPI.protokoll(false));
els.protokollordner.addEventListener('click', () => window.settingsAPI.protokoll(true));

els.aufzeichnung.addEventListener('click', async () => {
  zeigeProgramm(await window.settingsAPI.aufzeichnung());
});

els.zuruecksetzen.addEventListener('click', async () => {
  zeigeWerte(await window.settingsAPI.zuruecksetzen());
  bestaetige('Zurückgesetzt');
});

els.schliessen.addEventListener('click', () => window.settingsAPI.schliessen());

// --- Start ------------------------------------------------------------------

window.settingsAPI.laden().then(({ einstellungen, bildschirme, schluesselVorhanden, programm }) => {
  zeigeBildschirme(bildschirme, einstellungen.bildschirm, einstellungen.schrankBildschirm);
  zeigeWerte(einstellungen);
  zeigeSchluessel(schluesselVorhanden);
  zeigeProgramm(programm);
  // Die Sammlungsliste erst, wenn sie gebraucht wird - sie kostet eine
  // Abfrage beim Hauptprozess.
  zeigeSammlungsfarben();
});

// Der Stand kann sich aendern, waehrend das Fenster offen steht - etwa wenn
// die Anmeldung im Browser abgeschlossen wird. Beim Zurueckwechseln also neu
// holen, statt Veraltetes stehen zu lassen.
window.addEventListener('focus', async () => {
  zeigeProgramm(await window.settingsAPI.programm());
});
