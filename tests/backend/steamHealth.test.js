const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');

const health = require('../../backend/services/steamHealth');

function netzwerkfehler(code) {
  const fehler = new Error(code);
  fehler.code = code;
  return fehler;
}

function antwortMitStatus(status) {
  const fehler = new Error(`HTTP ${status}`);
  fehler.response = { status };
  return fehler;
}

test('Ein einzelner Aussetzer schaltet noch nicht um', () => {
  health._zuruecksetzen();
  health.fehlschlag(netzwerkfehler('ETIMEDOUT'));
  assert.strictEqual(health.istOffline(), false, 'ein Fehler darf noch nichts auslösen');
});

test('Mehrere Netzwerkfehler in Folge lösen den eingeschränkten Betrieb aus', () => {
  health._zuruecksetzen();
  for (let i = 0; i < health.FEHLER_BIS_OFFLINE; i++) {
    health.fehlschlag(netzwerkfehler('ENOTFOUND'));
  }
  assert.strictEqual(health.istOffline(), true);
  assert.strictEqual(health.status().letzterFehler, 'ENOTFOUND');
});

/**
 * Der wichtigste Test hier: Ein abgelehnter API-Schlüssel (403) oder eine
 * Drosselung (429) bedeutet, dass Steam sehr wohl erreichbar ist. Würde das
 * als Ausfall gewertet, käme die App in den eingeschränkten Betrieb, obwohl
 * das Problem ein ganz anderes ist - und die eigentliche Ursache bliebe
 * unentdeckt.
 */
test('Antworten mit Statuscode gelten NICHT als Ausfall', () => {
  health._zuruecksetzen();
  for (let i = 0; i < 10; i++) {
    health.fehlschlag(antwortMitStatus(403));
    health.fehlschlag(antwortMitStatus(429));
    health.fehlschlag(antwortMitStatus(500));
  }
  assert.strictEqual(health.istOffline(), false, 'Steam antwortet - also kein Ausfall');
});

test('Fehler ohne bekannten Netzwerkcode werden ignoriert', () => {
  health._zuruecksetzen();
  for (let i = 0; i < 10; i++) health.fehlschlag(new Error('irgendein Programmfehler'));
  assert.strictEqual(health.istOffline(), false);
});

test('Eine erfolgreiche Antwort führt zurück in den Normalbetrieb', () => {
  health._zuruecksetzen();
  for (let i = 0; i < health.FEHLER_BIS_OFFLINE; i++) {
    health.fehlschlag(netzwerkfehler('ECONNREFUSED'));
  }
  assert.strictEqual(health.istOffline(), true);

  health.erfolg();
  assert.strictEqual(health.istOffline(), false, 'muss selbsttätig zurückkehren');
  assert.strictEqual(health.status().letzterFehler, null);
});

test('Ein Erfolg zwischendurch setzt den Zähler zurück', () => {
  health._zuruecksetzen();
  health.fehlschlag(netzwerkfehler('ETIMEDOUT'));
  health.fehlschlag(netzwerkfehler('ETIMEDOUT'));
  health.erfolg();
  health.fehlschlag(netzwerkfehler('ETIMEDOUT'));
  assert.strictEqual(
    health.istOffline(),
    false,
    'nach einem Erfolg muss wieder von vorn gezählt werden'
  );
});

test('Der Zustand nennt Beginn und Grund des Ausfalls', () => {
  health._zuruecksetzen();
  const vorher = Date.now();
  for (let i = 0; i < health.FEHLER_BIS_OFFLINE; i++) {
    health.fehlschlag(netzwerkfehler('EAI_AGAIN'));
  }
  const z = health.status();
  assert.strictEqual(z.steamErreichbar, false);
  assert.ok(z.seit >= vorher, 'Zeitpunkt muss festgehalten werden');
  assert.strictEqual(z.letzterFehler, 'EAI_AGAIN');
});
