'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Windows checkouts use CRLF; normalize so paragraph splitting behaves the same everywhere.
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

// The exact rule text. Comparing the whole paragraph means a deleted or reversed sentence fails.
const RULE = 'Ask the user to decide only through a choice question (AskUserQuestion), never as a free-text question. '
  + 'Put the recommended option first and mark it "(Recommended)". Notices and reports are plain text. '
  + 'Write the question text as literal UTF-8; never use `\\uXXXX` escapes, which can garble Korean. '
  + 'Only the orchestrator talks to the user; a worker that needs a decision sends it to the orchestrator. '
  + 'This covers small and procedural questions too (whether to go on, when to ask, A or B): any sentence that asks the user to answer or choose is a decision. '
  + 'Before ending a reply, read its last paragraph; if it asks in prose (a question mark, "shall I", "let me know"), turn it into a choice question. '
  + 'Never postpone a question to later, and never fall back to prose when the tool call is declined: ask again, shorter, one decision with a one-line explanation. '
  + 'A step the user already instructed needs no question.';

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

test('every skill carries exactly the decision rule', () => {
  assert.ok(SKILLS.length >= 7, `expected the full skill set, found ${SKILLS.length}`);
  for (const f of SKILLS) assert.strictEqual(section(read(f), 'Decisions'), RULE, f);
});

// Each added sentence on its own, so a test failure names the sentence that was deleted or reversed.
const ADDED = [
  'any sentence that asks the user to answer or choose is a decision',
  'read its last paragraph; if it asks in prose',
  'turn it into a choice question',
  'Never postpone a question to later',
  'never fall back to prose when the tool call is declined',
  'ask again, shorter, one decision with a one-line explanation',
  'A step the user already instructed needs no question'
];

test('every skill carries each sentence of the strengthened rule', () => {
  for (const f of SKILLS) {
    const rule = section(read(f), 'Decisions');
    for (const part of ADDED) assert.ok(rule.includes(part), `${f}: missing "${part}"`);
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
