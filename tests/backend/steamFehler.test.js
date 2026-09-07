const test = require('node:test');
const assert = require('node:assert');

const F = require('../../backend/services/steamFehler');

/**
 * Diese Einordnung entscheidet, ob die App es noch einmal versucht oder
 * aufgibt. Das ist keine Kosmetik: Bei einem zurückgezogenen API-Schlüssel
 * antwortet Steam mit 401, und daran ändert sich durch Wiederholen nichts.
 * Vorher stand deshalb fünfzehnmal "Request failed with status code 401" im
 * Protokoll - jede Zeile eine weitere sinnlose Anfrage an Steam, und keine
 * davon mit einem Hinweis darauf, was zu tun wäre.
 */

const mitStatus = (status) => ({ response: { status }, message: `Request failed with status code ${status}` });

// --- Schlüsselprobleme: endgültig --------------------------------------------

test('401 und 403 gelten als Schlüsselproblem und als endgültig', () => {
  for (const status of [401, 403]) {
    const r = F.beschreibe(mitStatus(status));
    assert.strictEqual(r.schluesselProblem, true, `Status ${status}`);
    assert.strictEqual(r.endgueltig, true, `Status ${status} darf nicht wiederholt werden`);
    assert.strictEqual(r.status, status);
  }
});

test('Die Meldung sagt, was zu tun ist', () => {
  // Ein Grund ohne Handlungsanweisung ist für den Betroffenen wertlos.
  const r = F.beschreibe(mitStatus(401));
  assert.ok(r.grund.includes('401'), 'der Statuscode gehört hinein');
  assert.ok(/Einstellungen/i.test(r.grund), `kein Hinweis auf den Weg: ${r.grund}`);
});

// --- Vorübergehendes: darf wiederholt werden ---------------------------------

test('Drosselung ist nicht endgültig', () => {
  const r = F.beschreibe(mitStatus(429));
  assert.strictEqual(r.endgueltig, false);
  assert.strictEqual(r.schluesselProblem, false);
});

test('Serverfehler bei Steam sind nicht endgültig', () => {
  for (const status of [500, 502, 503]) {
    const r = F.beschreibe(mitStatus(status));
    assert.strictEqual(r.endgueltig, false, `Status ${status}`);
    assert.strictEqual(r.schluesselProblem, false);
  }
});

test('Ein unerwarteter Statuscode wird nicht als endgültig behandelt', () => {
  // Im Zweifel weiterversuchen - lieber eine Anfrage zu viel als eine App,
  // die grundlos aufgibt.
  const r = F.beschreibe(mitStatus(418));
  assert.strictEqual(r.endgueltig, false);
  assert.ok(r.grund.includes('418'));
});

// --- Gar keine Antwort -------------------------------------------------------

test('Netzwerkfehler nennt den Code und ist nicht endgültig', () => {
  const r = F.beschreibe({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' });
  assert.strictEqual(r.status, null);
  assert.strictEqual(r.endgueltig, false, 'ohne Netz kann es jederzeit weitergehen');
  assert.strictEqual(r.schluesselProblem, false);
  assert.ok(r.grund.includes('ENOTFOUND'));
});

test('Auch ein Fehler ohne alles liefert eine brauchbare Aussage', () => {
  for (const eingabe of [undefined, null, {}, new Error('irgendwas')]) {
    const r = F.beschreibe(eingabe);
    assert.strictEqual(typeof r.grund, 'string');
    assert.ok(r.grund.length > 0, `leerer Grund bei ${JSON.stringify(eingabe)}`);
    assert.strictEqual(r.endgueltig, false);
  }
});

test('Der Schlüssel selbst taucht in keiner Meldung auf', () => {
  // Die Meldung landet im Protokoll und wird weitergegeben.
  const fehler = {
    response: { status: 401 },
    config: { url: 'https://api.steampowered.com/x/?key=0123456789ABCDEF0123456789ABCDEF' },
    message: 'Request failed with status code 401',
  };
  assert.ok(!F.beschreibe(fehler).grund.includes('0123456789ABCDEF'));
});
