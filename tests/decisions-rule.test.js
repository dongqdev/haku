'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Windows checkouts use CRLF; normalize so paragraph splitting behaves the same everywhere.
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

// The same decision rule must read identically in every skill, or the sessions drift apart.
const RULE_START = '## Decisions';
const ruleOf = text => {
  const i = text.indexOf(RULE_START);
  assert.notStrictEqual(i, -1, 'missing "## Decisions" section');
  return text.slice(i).split(/\n\n/)[1];
};

test('setup, plan and build carry the same decision rule', () => {
  const rules = ['skills/setup/SKILL.md', 'skills/plan/SKILL.md', 'skills/build/SKILL.md'].map(f => ruleOf(read(f)));
  assert.strictEqual(new Set(rules).size, 1);
  assert.match(rules[0], /only through a choice question \(AskUserQuestion\), never as a free-text question/);
  assert.match(rules[0], /literal UTF-8/);
  assert.match(rules[0], /Only the orchestrator talks to the user/);
});

test('the worker never talks to the user and escalates decisions to the orchestrator', () => {
  const worker = read('agents/worker.md');
  assert.match(worker, /You never talk to the user/);
  assert.match(worker, /send it to the orchestrator/);
});
