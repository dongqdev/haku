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
