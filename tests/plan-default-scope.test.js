'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const plan = fs.readFileSync(path.join(root, 'skills', 'plan', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

// The default scope rule of plan: shipped-behaviour tasks list the docs and the plugin manifest, and those shared
// entries never count for the overlap check. Each phrase below is one half of that rule.
const PHRASES = [
  '**Default scope entries:**',
  '`README.md`, `README.en.md` and `.claude-plugin/**`',
  'do not count when you decide whether two scopes overlap',
  'A docs-only or tests-only task leaves them out'
];

test('plan SKILL.md carries the default scope rule', () => {
  for (const p of PHRASES) assert.ok(plan.includes(p), `missing: ${p}`);
});

test('mutation: dropping or flipping any part of the rule is caught', () => {
  for (const p of PHRASES) {
    const broken = plan.replace(p, '');
    assert.ok(!PHRASES.every(q => broken.includes(q)), `deleting "${p}" was not caught`);
  }
  const flipped = plan.replace('do not count when', 'do count when');
  assert.ok(!PHRASES.every(q => flipped.includes(q)));
});
