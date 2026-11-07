'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// The banner is one plain line (no ASCII art, which breaks in the phone app: whitespace collapses and backslashes vanish).
// A plain line may wrap on a phone without harm, but keep it short. Emoji count as 2 columns.
const MAX_COLUMNS = 56;
const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'setup', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
const banner = skill.match(/## Banner[\s\S]*?```text\n([\s\S]*?)```/);
const columns = line => [...line].reduce((n, ch) => n + (ch.codePointAt(0) > 0xFFFF ? 2 : 1), 0);

test('the setup banner is one dog line with the name and the full tagline', () => {
  assert.ok(banner, 'banner block missing');
  const lines = banner[1].replace(/\n$/, '').split('\n');
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /^🐶 haku\b/);
  assert.ok(lines[0].includes('Harness Assistant Keeping Users in the loop'));
});

test(`the banner line fits ${MAX_COLUMNS} columns (emoji count 2)`, () => {
  for (const line of banner[1].replace(/\n$/, '').split('\n')) assert.ok(columns(line) <= MAX_COLUMNS, `${columns(line)} columns: "${line}"`);
});

test('no ASCII-art face remains in the banner', () => {
  const text = banner[1];
  assert.ok(!text.includes('( o w o )'));
  assert.doesNotMatch(text, /[\\\/_]{2,}|vvv|\( o/);
});

test('plan and build print a one-line mini banner that fits the column limit', () => {
  for (const name of ['plan', 'build']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'skills', name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
    const m = text.match(/## Banner[\s\S]*?```text\n([\s\S]*?)```/);
    assert.ok(m, `${name}: banner block missing`);
    assert.strictEqual(m[1], `🐶 haku ${name}\n`);
  }
});

test('the worker prints a one-line PR banner', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'agents', 'worker.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(worker.includes('`🐶 haku PR ready #N`'));
  assert.ok(!worker.includes('( o w o )'));
});

test('no ASCII face is left in plan, build, setup or the worker', () => {
  for (const f of ['skills/plan/SKILL.md', 'skills/build/SKILL.md', 'skills/setup/SKILL.md', 'agents/worker.md']) {
    assert.ok(!fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('( o w o )'), f);
  }
});
