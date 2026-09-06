/**
 * Ablauf des Einrichtungsfensters.
 *
 * Die eigentliche Pruefung und das Speichern liegen im Hauptprozess
 * (overlay/lib/steamKey.js) - hier steht nur, was der Benutzer sieht. Der
 * Schluessel verlaesst diese Seite ausschliesslich ueber setupAPI.
 */

const feld = document.getElementById('schluessel');
const meldung = document.getElementById('meldung');
const bestaetigen = document.getElementById('bestaetigen');
const spaeter = document.getElementById('spaeter');
const holen = document.getElementById('holen');
const pfad = document.getElementById('pfad');

// Zeigen, wohin der Schluessel tatsaechlich geschrieben wird. Eine Zusicherung
// ist wenig wert, wenn man nicht nachsehen kann, ob sie stimmt.
window.setupAPI.konfigPfad().then((p) => {
  pfad.textContent = p;
});

holen.addEventListener('click', () => {
  window.setupAPI.schluesselseiteOeffnen();
});

spaeter.addEventListener('click', () => {
  window.setupAPI.spaeter();
});

function sagen(text, art) {
  meldung.textContent = text;
  meldung.className = 'meldung' + (art ? ` meldung--${art}` : '');
  feld.classList.toggle('feld--fehler', art === 'fehler');
}

/**
 * Steam zeigt den Schluessel in Grossbuchstaben, kopiert wird aber gern mal
 * ein Leerzeichen mit. Beides still in Ordnung bringen, statt deswegen eine
 * Fehlermeldung zu zeigen - das ist kein Fehler des Benutzers.
 */
function aufraeumen(roh) {
  return String(roh || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

let laeuft = false;

async function absenden() {
  if (laeuft) return;

  const schluessel = aufraeumen(feld.value);
  if (schluessel.length === 0) {
    sagen('Bitte den Schlüssel einfügen.', 'fehler');
    feld.focus();
    return;
  }

  laeuft = true;
  bestaetigen.classList.add('knopf--laeuft');
  bestaetigen.disabled = true;
  spaeter.disabled = true;
  sagen('Schlüssel wird bei Steam geprüft…');

  let ergebnis;
  try {
    ergebnis = await window.setupAPI.schluesselSpeichern(schluessel);
  } catch (err) {
    ergebnis = { ok: false, grund: 'Unerwarteter Fehler: ' + (err && err.message) };
  }

  laeuft = false;
  bestaetigen.classList.remove('knopf--laeuft');
  bestaetigen.disabled = false;
  spaeter.disabled = false;

  if (ergebnis.ok) {
    // Das Fenster schliesst der Hauptprozess - hier nur noch bestaetigen,
    // damit der Moment nicht wortlos verschwindet.
    sagen('Passt. Der Trophäenschrank startet…', 'gut');
    feld.disabled = true;
    bestaetigen.disabled = true;
    return;
  }

  sagen(ergebnis.grund || 'Der Schlüssel wurde nicht angenommen.', 'fehler');
  feld.focus();
  feld.select();
}

bestaetigen.addEventListener('click', absenden);

feld.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') absenden();
});

// Sobald wieder getippt wird, ist die alte Fehlermeldung nicht mehr aktuell.
feld.addEventListener('input', () => {
  if (meldung.classList.contains('meldung--fehler')) sagen('');
});
