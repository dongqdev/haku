'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Every skill runs scripts/banner.js and prints the output inside a code block (outside one the phone app collapses whitespace and drops backslashes).
const LABELS = { setup: 'SETUP', sniff: 'SNIFF', plan: 'START PLAN', build: 'BUILD START', retro: 'RETRO', status: 'STATUS', triage: 'TRIAGE' };
const SENTENCE = 'inside a ```text code block';
const TAGLINE = '`🐶 haku - Harness Assistant Keeping Users in the loop`';
const skillText = name => fs.readFileSync(path.join(__dirname, '..', 'skills', name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
const bannerProblems = (text, name) => {
  const problems = [];
  const sec = text.match(/^## Banner\n([\s\S]*?)(?=^## )/m);
  if (!sec) return ['banner section missing'];
  const call = 'node "${CLAUDE_PLUGIN_ROOT}/scripts/banner.js" "' + LABELS[name] + '"';
  if (!sec[1].includes(call)) problems.push('banner.js call with the right label missing');
  if (!sec[1].includes(SENTENCE)) problems.push('sentence about the code block missing');
  if (!sec[1].includes('`🐶 haku ' + name + '`')) problems.push('fallback line missing');
  if (name === 'setup' && !sec[1].includes(TAGLINE)) problems.push('tagline missing');
  return problems;
};

test('all seven skills have a Banner section that runs banner.js with the right label', () => {
  for (const name of Object.keys(LABELS)) assert.deepStrictEqual(bannerProblems(skillText(name), name), [], name);
});

test('the Banner section sits before the first numbered or procedure step', () => {
  for (const name of Object.keys(LABELS)) {
    const text = skillText(name);
    const first = text.search(/^## (\d|Procedure|Loop)/m);
    assert.ok(text.indexOf('## Banner') > 0 && text.indexOf('## Banner') < first, name);
  }
});

test('plan and build no longer carry pasted art', () => {
  for (const name of ['plan', 'build']) {
    const text = skillText(name);
    assert.doesNotMatch(text, /^ {16}\|/m, name);
    assert.ok(!text.includes('( o_o  )_'), name);
    assert.ok(!text.includes('## Verdict and merge art'), name);
  }
});

test('mutation: a plan skill without the code-block sentence fails the banner check', () => {
  const text = skillText('plan');
  const broken = text.replace(SENTENCE, 'somewhere');
  assert.notStrictEqual(broken, text);
  assert.ok(bannerProblems(broken, 'plan').length > 0);
  assert.ok(bannerProblems(text.replace('"START PLAN"', '"PLAN"'), 'plan').length > 0);
});

test('the worker prints a one-line PR banner', () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'agents', 'worker.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(worker.includes('`🐶 haku PR ready #N`'));
  assert.ok(!worker.includes('( o w o )'));
});

test('no ASCII face is left in any skill or the worker', () => {
  for (const f of [...Object.keys(LABELS).map(n => 'skills/' + n + '/SKILL.md'), 'agents/worker.md']) {
    assert.ok(!fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('( o w o )'), f);
  }
});

test('the reviewer keeps its one-line dog form', () => {
  const reviewer = fs.readFileSync(path.join(__dirname, '..', 'agents', 'reviewer.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(reviewer.includes('🐶 LGTM') && reviewer.includes('🐶 NACK'));
});
