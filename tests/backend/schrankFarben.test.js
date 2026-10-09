const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

process.env.LOG_DIR = path.join(os.tmpdir(), 'trophaenschrank-testlogs');
// Eigener Datenordner, damit der Test nicht die echten Farben anfasst.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'schrankfarben-'));

const F = require('../../overlay/lib/schrankFarben');

/**
 * Die gemerkten Rückenfarben landen unverändert im CSS des Schranks
 * (`--spine`). Die Datei liegt im Benutzerordner und ist von Hand
 * bearbeitbar - deshalb kommt hier nur durch, was wirklich eine Farbe ist.
 */

test('Nur echte Farbangaben werden übernommen', () => {
  const dazu = F.ergaenze({
    730: 'rgb(90, 74, 106)',
    570: '#3a2b1f',
    440: 'hsl(210, 24%, 30%)',
    // Alles Folgende darf nicht durchkommen:
    123: 'red; background: url(http://fremd/bild.png)',
    124: 'expression(alert(1))',
    125: '',
    126: 42,
    'nicht-numerisch': 'rgb(1,2,3)',
  });
  assert.strictEqual(dazu, 3);

  const alle = F.laden();
  assert.deepStrictEqual(Object.keys(alle).sort(), ['440', '570', '730']);
});

test('Was schon gemerkt ist, wird nicht erneut geschrieben', () => {
  assert.strictEqual(F.ergaenze({ 730: 'rgb(90, 74, 106)' }), 0);
  assert.strictEqual(F.ergaenze({ 730: 'rgb(12, 12, 12)' }), 1);
});

test('Unsinn als Eingabe ändert nichts', () => {
  for (const murks of [null, undefined, 'text', 7]) {
    assert.strictEqual(F.ergaenze(murks), 0);
  }
});

test('Die Datei liegt im Datenordner und ist wieder lesbar', () => {
  assert.ok(F.DATEI.startsWith(process.env.DATA_DIR), F.DATEI);
  const roh = JSON.parse(fs.readFileSync(F.DATEI, 'utf8'));
  assert.strictEqual(roh['570'], '#3a2b1f');
});
