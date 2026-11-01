'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// A code block does not wrap neatly: on a phone a wide line spills over and breaks the picture.
const MAX_COLUMNS = 40;
const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'setup', 'SKILL.md'), 'utf8');
const banner = skill.match(/## Banner[\s\S]*?```text\n([\s\S]*?)```/);

test('the setup banner is found and prints the name and the full tagline', () => {
  assert.ok(banner, 'banner block missing');
  const text = banner[1];
  assert.match(text, /\bhaku\b/);
  assert.match(text, /Harness Assistant\s*\n\s*Keeping Users in the loop/);
});

test(`every banner line fits ${MAX_COLUMNS} columns, so a phone does not wrap it`, () => {
  const lines = banner[1].replace(/\n$/, '').split('\n');
  assert.ok(lines.length >= 4);
  for (const line of lines) assert.ok(line.length <= MAX_COLUMNS, `${line.length} columns: "${line}"`);
});

test('the face is compact and the ears, face and mouth share one centre', () => {
  const [ears, face, mouth] = banner[1].split('\n');
  assert.match(face, /^\( o w o \)/);
  const centre = (line, mark) => line.indexOf(mark);
  assert.strictEqual(centre(face, 'w'), 4);
  assert.strictEqual(ears.indexOf('___') + 1, 4);
  assert.strictEqual(mouth.indexOf('vvv') + 1, 4);
});

test('plan and build print a one-line mini banner that fits the column limit', () => {
  for (const name of ['plan', 'build']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'skills', name, 'SKILL.md'), 'utf8');
    const m = text.match(/## Banner[\s\S]*?```text\n([\s\S]*?)```/);
    assert.ok(m, `${name}: banner block missing`);
    assert.strictEqual(m[1], `( o w o )  haku ${name}\n`);
  }
});

test('the worker prints a one-line PR banner', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'agents', 'worker.md'), 'utf8');
  assert.match(worker, /\( o w o \)  haku PR ready #N/);
});
