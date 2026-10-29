'use strict';

// The project was renamed to haku. Nothing shipped or tested may use the old names again.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// The old names, matched loosely (any case, separators, camelCase, the old short home folder) so a slight
// respelling cannot slip back in. Built from parts so this file does not contain the strings it forbids.
const OLD_NAME = new RegExp(['ecc', '[\\s_.-]?', 'harness'].join(''), 'i');
const OLD_HOME = new RegExp(['(^|[^\\w])\\.', 'eh', '(?![\\w])'].join(''), 'm');
const findOld = text => [OLD_NAME, OLD_HOME].filter(re => re.test(text)).map(re => re.source);

// Files allowed to name the old project: the licence credit and the upgrade guide.
const ALLOWED = new Set(['LICENSE', 'docs/upgrading.md']);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === '.git' || e.name === 'node_modules') return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

test('the detector catches every respelling of the old names', () => {
  const old = ['ecc', 'harness'];
  const spellings = [
    old.join('-'), old.join('_').toUpperCase(), old.join(' '), old.join(''), 'Ecc' + 'Harness', old.join('.'),
    "path.join(os.homedir(), '." + 'eh' + "')", 'C:\\Users\\x\\.' + 'eh' + '\\w', '~/.' + 'eh' + '/w', '.' + 'eh'
  ];
  for (const s of spellings) assert.ok(findOld(s).length > 0, `not detected: ${s}`);
  for (const ok of ['haku-harness', '.haku/w', 'the ECC project', 'some.method()', 'whenever']) {
    assert.deepStrictEqual(findOld(ok), [], `false positive: ${ok}`);
  }
});

test('no old project names remain outside the licence credit and the upgrade guide', () => {
  const hits = [];
  for (const f of files(root)) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    if (ALLOWED.has(rel) || /\.(png|jpg|ico)$/.test(rel)) continue;
    const found = findOld(fs.readFileSync(f, 'utf8'));
    if (found.length) hits.push(`${rel}: ${found.join(', ')}`);
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
