/**
 * Die Achievement-Liste eines Spiels aus dem Schrank.
 *
 * Sie bekommt ihre Daten vom Hauptprozess - dieses Fenster fragt weder Steam
 * noch das Backend. Dasselbe Vorgehen wie beim Schrank und bei der Uebersicht:
 * Sonst braeuchte jedes Fenster die Anmeldung samt Sitzungszeugnis.
 */

const el = {
  bild: document.getElementById('bild'),
  name: document.getElementById('name'),
  stand: document.getElementById('stand'),
  balken: document.getElementById('balken'),
  laedt: document.getElementById('laedt'),
  liste: document.getElementById('liste'),
  zu: document.getElementById('zu'),
};

// Dieselben Farben wie in den Meldungen und im Trophaeenfach.
const STUFEN = {
  Kupfer: '#c07a42',
  Silber: '#b9c1cc',
  Gold: '#d3a13a',
  Platin: '#8b93e0',
  Blutig: '#d8323c',
};

function escape(text) {
  const d = document.createElement('div');
  d.textContent = String(text ?? '');
  return d.innerHTML;
}

function eintrag(a) {
  const li = document.createElement('li');
  li.className = `eintrag ${a.unlocked ? 'eintrag--erreicht' : 'eintrag--offen'}`;
  li.style.setProperty('--stufe', STUFEN[a.category] || '#7a6a58');
  const anteil = typeof a.globalPercent === 'number' ? `${a.globalPercent.toFixed(1)} %` : '';
  li.innerHTML = `
    <!--
      no-referrer wie im Schrank: Aus einer Seite, die von der Festplatte
      kommt (file://), schickt der Browser sonst einen Verweis mit, den
      Steams Bildserver nicht mag - und dann bleibt das Symbol leer.
    -->
    <img class="eintrag__icon" src="${escape(a.icon || '../assets/app-icon.png')}" alt=""
         referrerpolicy="no-referrer" loading="lazy"
         onerror="this.style.visibility='hidden'" />
    <div class="eintrag__text">
      <p class="eintrag__name">${escape(a.name)}</p>
      ${a.description ? `<p class="eintrag__desc">${escape(a.description)}</p>` : ''}
    </div>
    <div class="eintrag__meta">
      <span class="eintrag__stufe">${escape(a.category || '')}</span>
      ${anteil}
    </div>`;
  return li;
}

function trenner(text) {
  const li = document.createElement('li');
  li.className = 'trenner';
  li.textContent = text;
  return li;
}

function zeige(daten) {
  el.laedt.hidden = true;
  el.name.textContent = daten.name || `App ${daten.appId}`;
  el.bild.referrerPolicy = 'no-referrer';
  el.bild.src = daten.libraryUrl || '';
  el.bild.onerror = () => {
    el.bild.style.visibility = 'hidden';
  };

  const liste = daten.achievements || [];
  if (liste.length === 0) {
    el.stand.textContent = 'Dieses Spiel hat keine Achievements.';
    el.liste.innerHTML = '<li class="leer">Nichts zu holen — und nichts zu verpassen.</li>';
    return;
  }

  const erreicht = liste.filter((a) => a.unlocked).length;
  const offen = liste.length - erreicht;
  el.stand.textContent =
    erreicht === liste.length
      ? `Alle ${liste.length} Achievements — Diamant`
      : `${erreicht} von ${liste.length} · es fehlen noch ${offen}`;
  el.balken.style.width = `${((erreicht / liste.length) * 100).toFixed(1)}%`;

  // Die Reihenfolge kommt fertig aus dem Hauptprozess (lib/schrankListe.js):
  // offene zuerst, darin die haeufigsten oben.
  el.liste.innerHTML = '';
  let warErreicht = null;
  for (const a of liste) {
    if (!!a.unlocked !== warErreicht) {
      warErreicht = !!a.unlocked;
      // Nur dort eine Ueberschrift, wo es auch etwas zu trennen gibt.
      if (erreicht > 0 && offen > 0) {
        el.liste.appendChild(trenner(warErreicht ? `Erreicht (${erreicht})` : `Offen (${offen})`));
      }
    }
    el.liste.appendChild(eintrag(a));
  }
}

// --- Bedienung ---------------------------------------------------------------

el.zu.addEventListener('click', () => window.listeAPI.schliessen());

// Der Walkthrough zu diesem Spiel. Welches gemeint ist, weiss der
// Hauptprozess - er hat dieses Fenster dafuer geoeffnet.
document.getElementById('guide').addEventListener('click', () => window.listeAPI.guide());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.listeAPI.schliessen();
});

if (window.listeAPI) {
  window.listeAPI.onDaten((daten) => zeige(daten));
  window.listeAPI.bereit();
}
