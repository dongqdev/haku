'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Windows checkouts use CRLF; normalize so paragraph splitting behaves the same everywhere.
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

// The exact rule text. Comparing the whole paragraph means a deleted or reversed sentence fails.
const RULE = 'Ask the user to decide only through a choice question (AskUserQuestion), never in free text: recommended option first and marked "(Recommended)", question text as literal UTF-8 (no `\\uXXXX` escapes). Only the orchestrator talks to the user; a worker sends its decision request to the orchestrator. Any sentence that asks the user to answer or choose is a decision, small and procedural ones too. Before ending a reply, read its last paragraph; if it asks in prose, turn it into a choice question. Never postpone a question, and if the tool call is declined, ask again, shorter. A step the user already instructed needs no question.';

const WORKER_SECTION = 'You never talk to the user. If you need a decision (scope change, a failing approach, an unclear criterion), '
  + 'stop and put the decision request in your report to the orchestrator, with the options you see and your recommendation. '
  + 'The orchestrator asks the user through a choice question and relays the answer. '
  + 'Reports and summaries go to the orchestrator and into the file it names.';

// Every skill, so a new skill cannot skip the rule.
const SKILLS = fs.readdirSync(path.join(__dirname, '..', 'skills')).sort().map(n => `skills/${n}/SKILL.md`);

// Text of a "## <title>" section up to the next "## " heading.
function section(text, title) {
  const m = text.match(new RegExp(`^## ${title}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, 'm'));
  assert.ok(m, `missing "## ${title}" section`);
  return m[1].trim();
}

// The full rule lives in one skill; every other skill keeps a short reference that still carries its meaning.
const HOME = 'skills/sniff/SKILL.md';
const REF_PATH = '${CLAUDE_PLUGIN_ROOT}/skills/sniff/SKILL.md';
const OTHERS = SKILLS.filter(f => f !== HOME);

test('the full decision rule is in exactly one skill, unchanged', () => {
  assert.ok(SKILLS.includes(HOME));
  assert.ok(SKILLS.length >= 7, `expected the full skill set, found ${SKILLS.length}`);
  assert.strictEqual(section(read(HOME), 'Decisions'), RULE);
  for (const f of OTHERS) assert.ok(!read(f).includes(RULE), `${f}: carries a second copy of the rule`);
});

// Each added sentence on its own, so a test failure names the sentence that was deleted or reversed.
const ADDED = [
  'Any sentence that asks the user to answer or choose is a decision',
  'read its last paragraph; if it asks in prose',
  'turn it into a choice question',
  'Never postpone a question',
  'if the tool call is declined, ask again, shorter',
  'A step the user already instructed needs no question'
];

test('the home skill carries each sentence of the strengthened rule', () => {
  const rule = section(read(HOME), 'Decisions');
  for (const part of ADDED) assert.ok(rule.includes(part), `${HOME}: missing "${part}"`);
});

test('every other skill refers to the rule and keeps its meaning', () => {
  assert.ok(OTHERS.length >= 6);
  for (const f of OTHERS) {
    const ref = section(read(f), 'Decisions');
    assert.ok(ref.includes('choice question (AskUserQuestion)'), `${f}: choice question missing`);
    assert.match(ref, /risky branch is never settled by assuming/, f);
    assert.ok(ref.includes(REF_PATH), `${f}: no path to the full rule`);
    assert.ok(ref.includes('`## Decisions`'), `${f}: does not name the section`);
    assert.ok(ref.split(/\s+/).length < 60, `${f}: reference grew into a copy of the rule`);
  }
});

test('the decision rule comes before any procedure heading, so it is read before acting', () => {
  for (const f of SKILLS) {
    const headings = [...read(f).matchAll(/^## .*$/gm)].map(m => m[0]);
    assert.strictEqual(headings[0], '## Decisions', `${f}: first section is ${headings[0]}`);
  }
});

test('the worker never talks to the user and escalates through its report', () => {
  assert.strictEqual(section(read('agents/worker.md'), 'Talking to the user'), WORKER_SECTION);
});

test('the T3 verdict is asked as a choice question, not read from a comment', () => {
  const build = read('skills/build/SKILL.md');
  assert.match(build, /ask the verdict with a choice question \(통과 \/ 실패 \/ 추가 측정 필요\)/);
  assert.doesNotMatch(build, /코멘트로 남겨 주세요/);
});
