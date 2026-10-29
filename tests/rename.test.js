'use strict';

// The project was renamed to haku. Nothing shipped or tested may use the old names again.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// Built from parts so this file does not contain the strings it forbids.
const OLD = [['ecc', 'harness'].join('-'), ['ECC', 'HARNESS'].join('_'), ['.', 'eh', '/'].join('')];

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === '.git' || e.name === 'node_modules') return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

test('no old project names remain outside the license attribution', () => {
  const hits = [];
  for (const f of files(root)) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    if (rel === 'LICENSE' || /\.(png|jpg|ico)$/.test(rel)) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const old of OLD) if (text.toLowerCase().includes(old.toLowerCase())) hits.push(`${rel}: ${old}`);
  }
  assert.deepStrictEqual(hits, []);
});

test('plugin and marketplace use the new name and agree on it', () => {
  const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const plugin = read('.claude-plugin/plugin.json');
  const market = read('.claude-plugin/marketplace.json');
  assert.strictEqual(plugin.name, 'haku');
  assert.strictEqual(market.name, 'haku');
  assert.strictEqual(market.plugins[0].name, 'haku');
});
