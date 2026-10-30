'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

// Text of one "## " section, up to the next "## " heading or the end of the file.
function section(text, title) {
  const start = text.indexOf('## ' + title + '\n');
  assert.ok(start >= 0, 'missing section: ' + title);
  const rest = text.slice(start + 3 + title.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

const BUILD = read('skills/build/SKILL.md');
const EVID = section(BUILD, 'Evidence for every claim of completion');

test('build: evidence section exists before Never', () => {
  const a = BUILD.indexOf('## Evidence for every claim of completion\n');
  const b = BUILD.indexOf('## Never\n');
  assert.ok(a >= 0 && b >= 0 && a < b);
});

test('build: evidence section is short', () => {
  assert.ok(EVID.trim().split('\n').length < 12);
});

test('build: a claim of completion names its evidence in the same message', () => {
  assert.match(EVID, /names its evidence in the same message/);
  assert.match(EVID, /the command that was run and its result/);
  assert.match(EVID, /check list and the verification record/);
  assert.match(EVID, /ready to merge, verified, CI passed/);
});

test('build: an impression is never evidence', () => {
  assert.match(EVID, /An impression is never evidence/);
});

test('build: missing evidence says the Korean fallback and does not claim completion', () => {
  assert.match(EVID, /missing or could not be read, the message says "확인하지 못함" and does not claim completion/);
});

test('build: the rule also applies when reporting to another session', () => {
  assert.match(EVID, /same applies when reporting to another session/);
});

test('worker: a passed-tests claim needs the real command and its output', () => {
  const w = read('agents/worker.md');
  assert.match(w, /statement that tests passed must come with the real command and its output in the report/);
  assert.match(w, /the last lines are enough/);
  assert.match(w, /"tests pass" alone is not accepted/);
  assert.match(w, /each acceptance criterion as met or unmet with evidence/);
});

const RETRO = read('skills/retro/SKILL.md');
const LESSON = section(RETRO, '2. Sort');

test('retro: lesson criteria sit in the Sort step and buckets stay', () => {
  assert.match(LESSON, /### Lesson criteria/);
  assert.match(LESSON, /\*\*Personal preference\*\*/);
  assert.match(LESSON, /\*\*Immediate fix\*\*/);
  assert.match(LESSON, /\*\*Rule candidate\*\*/);
});

test('retro: kept only if all four criteria hold', () => {
  assert.match(LESSON, /is kept only if all four hold/);
});

test('retro: criterion a, not obvious', () => {
  assert.match(LESSON, /- \(a\) Not obvious: it took something to learn/);
});

test('retro: criterion b, six months', () => {
  assert.match(LESSON, /- \(b\) It would help someone who hits the same problem in six months/);
});

test('retro: criterion c, about haku and not a personal preference', () => {
  assert.match(LESSON, /- \(c\) It is about haku itself, not a personal preference of the user/);
});

test('retro: criterion d, not already written', () => {
  assert.match(LESSON, /- \(d\) It is not already written in a skill, an agent file or the README/);
});

test('retro: each proposal says in one line why it passes the four', () => {
  assert.match(LESSON, /Each proposal states in one line why it passes the four/);
});

test('retro: failing items go to a dropped list shown with the proposals', () => {
  assert.match(LESSON, /An item that fails any of them is not proposed/);
  assert.match(LESSON, /separate short "dropped" list with the criterion it failed/);
  assert.match(LESSON, /Show the dropped list to the user together with the proposals/);
});
