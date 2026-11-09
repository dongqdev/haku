'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// The setup banner is one plain line; plan and build print dog art, but only inside a code block (outside one the phone app collapses whitespace and drops backslashes).
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

const ART = [
  '                 ________________',
  '                |                |_____    __',
  '                |@@@@@@@@@@@@@@@@|     |__|  |_________',
  '                |________________|     |::|  |        /',
  '   /\\**/\\       |                \\.____|::|__|      <',
  '  ( o_o  )_     |                      \\::/  \\._______\\',
  '   (u--u   \\_)  |',
  '    (||___   )==\\',
  '  ,dP"/b/=( /P"/b\\',
  '  |8 || 8\\=== || 8',
  '  `b,  ,P  `b,  ,P',
  '    """`     """`',
];
const artFor = text => ART.map(l => l.replace('@@@@@@@@@@@@@@@@', text)).join('\n') + '\n';
const SENTENCE = 'inside the code block';
const skillText = name => fs.readFileSync(path.join(__dirname, '..', 'skills', name, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
const bannerProblems = (text, bubble) => {
  const problems = [];
  const sec = text.match(/## Banner\n([\s\S]*?)(?=\n## )/);
  if (!sec) return ['banner section missing'];
  const m = sec[1].match(/```text\n([\s\S]*?)```/);
  if (!m) return ['no text code block in the Banner section'];
  if (m[1] !== artFor(bubble)) problems.push('art differs from the template');
  if (m[1].split('\n').filter(Boolean).length !== 12) problems.push('not 12 lines');
  if (!sec[1].includes(SENTENCE)) problems.push('sentence about the code block missing');
  if (sec[1].includes('&lt;')) problems.push('&lt;');
  return problems;
};

test('plan and build print the 12-line dog art in a code block with the right bubble text', () => {
  for (const [name, bubble] of [['plan', '   START PLAN   '], ['build', '  BUILD START   ']]) {
    assert.strictEqual(bubble.length, 16);
    assert.deepStrictEqual(bannerProblems(skillText(name), bubble), [], name);
    const line = artFor(bubble).split('\n')[2];
    assert.strictEqual(line.slice(16).split('|')[1].length, 16);
  }
});

test('mutation: a plan skill without the code fence fails the banner check', () => {
  const text = skillText('plan');
  const broken = text.replace(/## Banner\n([\s\S]*?)```text\n/, '## Banner\n$1').replace(/(## Banner\n[\s\S]*?)```\n/, '$1');
  assert.notStrictEqual(broken, text);
  assert.ok(bannerProblems(broken, '   START PLAN   ').length > 0);
  assert.ok(bannerProblems(text.replace(SENTENCE, 'somewhere'), '   START PLAN   ').length > 0);
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
