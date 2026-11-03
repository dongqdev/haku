'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('plan treats an unsourced negative claim about an outside service as unchecked', () => {
  const t = read('skills/plan/SKILL.md');
  assert.match(t, /negative claim about an outside service or API is not a fact until it is checked/);
  assert.match(t, /could not check/);
  assert.match(t, /premise of any choice question/);
});

test('build checks the outside-fact premise before a choice question', () => {
  assert.match(read('skills/build/SKILL.md'), /Before a choice question rests on an outside fact/);
});

test('researcher reports how much it read and never says "none" after a partial read', () => {
  const t = read('agents/researcher.md');
  assert.match(t, /Say how much you read/);
  assert.match(t, /읽은 범위/);
  assert.match(t, /확인 못 함/);
});
