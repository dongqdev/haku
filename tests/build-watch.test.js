'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'build', 'SKILL.md'), 'utf8');
const rule = skill.match(/\n10\. \*\*Waiting on state that sends no notification\.\*\*([^\n]*)/);

test('build skill tells the orchestrator to watch external state instead of only asking the user to wait', () => {
  assert.ok(rule, 'step 10 (waiting on state that sends no notification) missing');
  const text = rule[1];
  assert.match(text, /background watcher/);
  assert.match(text, /before you tell the user to wait/i);
  assert.match(text, /subscribe_pr_activity/);
  assert.match(text, /Monitor tool/);
  assert.match(text, /only when neither exists/);
  assert.match(text, /gh pr checks/);
  assert.match(text, /run_in_background/);
  assert.match(text, /never with a leading `sleep`/);
  assert.match(text, /carry on by yourself/);
});

test('the watcher rule does not contradict the worker-report rule (no polling for messages)', () => {
  assert.match(rule[1], /do not watch for that \(step 3\)/);
  assert.match(skill, /do not poll, and end your turn while you wait/);
});

test('the build skill keeps the loop moving: scheduled checks, no idling on a question, gates stay closed', () => {
  const sec = skill.split('\n## Keeping the loop moving')[1].split('\n## ')[0];
  assert.match(sec, /ScheduleWakeup/);
  assert.match(sec, /\/loop/);
  assert.match(sec, /double the interval/);
  assert.match(sec, /holds back only the task it is about/);
  assert.match(sec, /Gates stay closed/);
  assert.doesNotMatch(sec, /gh pr merge/);
});
