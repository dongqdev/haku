'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { defaultScopeWarnings, publish } = require('../scripts/lib/publish');

const draft = scopes => ({
  assignee: 'a',
  story: { id: 's', title: 'S', verify: { kind: 'T3' } },
  milestones: [{ id: 'm', title: 'M', verify: { kind: 'T3' }, tasks: scopes.map((scope, i) => ({
    id: `t${i}`, title: `T${i}`, acceptance: ['x'], scope, verify: { kind: 'T3' }
  })) }]
});

test('shipped-behaviour task without README and manifest entries gets a warning', () => {
  const w = defaultScopeWarnings(draft([['skills/plan/SKILL.md']]));
  assert.strictEqual(w.length, 1);
  assert.match(w[0], /task t0/);
  assert.match(w[0], /README\.md, README\.en\.md, \.claude-plugin\/plugin\.json/);
});

test('no warning with the shared entries, wildcards that cover them, or for docs/tests-only tasks', () => {
  assert.deepStrictEqual(defaultScopeWarnings(draft([['scripts/**', 'README.md', 'README.en.md', '.claude-plugin/**']])), []);
  assert.deepStrictEqual(defaultScopeWarnings(draft([['docs/**'], ['tests/a.test.js']])), []);
  assert.strictEqual(defaultScopeWarnings(draft([['agents/worker.md', 'README.md']]))[0].includes('README.md,'), false);
});

test('publish returns the warnings without failing the dry run', () => {
  const r = publish(null, draft([['scripts/x.js']]));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.warnings.length, 1);
});
