/**
 * Ablauf des Anmeldefensters.
 *
 * Bewusst ohne eigene Logik zum Anmelden: Das Fenster stößt nur an und zeigt,
 * was zurückkommt. Alles Weitere — Steams Fenster öffnen, auf die Sitzung
 * warten, bei einem Fehlschlag den API-Schlüssel gegenprüfen — macht der
 * Hauptprozess, und zwar auf demselben Weg wie die Anmeldung über das Symbol
 * in der Taskleiste. Zwei Wege zur Anmeldung, die sich unterschiedlich
 * verhalten, wären eine Fehlerquelle ohne Gegenwert.
 */

const els = {};
['anmelden', 'spaeter', 'meldung', 'pfad'].forEach((id) => {
  els[id] = document.getElementById(id);
});

let laeuft = false;

function melde(text, art = null) {
  els.meldung.textContent = text;
  els.meldung.classList.remove('meldung--fehler', 'meldung--gut');
  if (art) els.meldung.classList.add(`meldung--${art}`);
}

function setzeLaeuft(an) {
  laeuft = an;
  els.anmelden.classList.toggle('knopf--laeuft', an);
  els.anmelden.disabled = an;
  // "Später" während des Wartens zu sperren ist Absicht: Das Fenster hier zu
  // schließen, während Steams Fenster noch offen steht, ließe den Anwender
  // vor einem Fenster zurück, das zu nichts mehr gehört.
  els.spaeter.disabled = an;
}

els.anmelden.addEventListener('click', async () => {
  if (laeuft) return;
  setzeLaeuft(true);
  melde('Steams Anmeldefenster ist offen — bitte dort anmelden.');

  const antwort = await window.loginAPI.anmelden();

  if (antwort && antwort.ok) {
    // Kurz stehen lassen, statt sofort zu verschwinden: Man soll sehen, dass
    // es geklappt hat, und unter welchem Namen.
    melde(`Angemeldet als ${antwort.name}. Viel Erfolg bei der Jagd!`, 'gut');
    els.anmelden.classList.remove('knopf--laeuft');
    els.anmelden.querySelector('.knopf__text').textContent = 'Fertig';
    return;
  }

  setzeLaeuft(false);
  melde(
    (antwort && antwort.grund) || 'Die Anmeldung wurde abgebrochen.',
    'fehler'
  );
});

els.spaeter.addEventListener('click', () => {
  if (laeuft) return;
  window.loginAPI.spaeter();
});

window.loginAPI.ablagePfad().then((pfad) => {
  if (pfad) els.pfad.textContent = pfad;
});
