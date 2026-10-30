'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const sniff = read('skills/sniff/SKILL.md');
const section = title => {
  // (?![\s\S]) is the end of the text; $ would end the capture at the first line because of the m flag
  const m = sniff.match(new RegExp(`^## ${title}\\n\\n([\\s\\S]*?)(?=\\n## |(?![\\s\\S]))`, 'm'));
  assert.ok(m, `missing "## ${title}"`);
  return m[1];
};

test('sniff keeps its two ways in: called by hand and called by plan and setup when the goal is vague', () => {
  const description = sniff.match(/^description: (.*)$/m)[1];
  assert.match(description, /Use on "\/haku:sniff"/);
  assert.match(description, /when the request is vague/);
  assert.match(description, /when plan or setup cannot state success criteria/);
  assert.match(description, /questioned thoroughly/);
  assert.match(read('skills/plan/SKILL.md'), /Hand over to `\/haku:sniff`/);
  assert.match(read('skills/setup/SKILL.md'), /\/haku:sniff/);
});

test('sniff interviews in rounds over a tree of decisions: the whole frontier at once, up to four questions', () => {
  const tree = section('2. Map the tree of decisions');
  assert.match(tree, /every decision opens the decisions that hang from it/);
  assert.match(tree, /The \*\*frontier\*\* is every decision whose parent is already settled/);
  for (const branch of ['Goal', 'Success criteria', 'Out of scope', 'Constraints', 'Existing work', 'Risks and unknowns']) {
    assert.match(tree, new RegExp(`\\*\\*${branch}\\*\\*`), branch);
  }
  const rounds = section('3. Ask in rounds');
  assert.match(rounds, /Ask the whole frontier in \*\*one round\*\*: one `AskUserQuestion` call with up to four questions/);
  assert.match(rounds, /A question whose answer depends on a question still open in this round belongs to a later round/);
  assert.match(rounds, /two to four options, mutually exclusive, the recommended one first/);
  assert.match(rounds, /never free text/);
  assert.match(rounds, /The interview is done when the frontier is empty/);
});

test('sniff finds facts itself: repository and issues first, a read-only search for more, the researcher for the web', () => {
  const facts = section('1. Find the facts yourself');
  assert.match(facts, /Facts are your job, never the user's/);
  assert.match(facts, /Never ask the user something the code or the issues already answer/);
  assert.match(facts, /read-only exploration subagent/);
  assert.match(facts, /`haku:researcher` agent one narrow question/);
  assert.match(facts, /nothing secret in them/);
  assert.match(facts, /only the questions that depend on its answer wait/);
});

test('a branch that touches real money, data, security or other people\'s systems is never settled by "추천대로"', () => {
  const rounds = section('3. Ask in rounds');
  assert.match(rounds, /A branch that touches real money, real data, security or other people's systems is never settled by "추천대로"/);
  assert.match(rounds, /keep it in the summary as an open question and not as an assumption/);
  assert.match(section('2. Map the tree of decisions'), /A trading program, for example/);
});

test('the user can always stop, and long interviews ask whether to go on', () => {
  const rounds = section('3. Ask in rounds');
  assert.match(rounds, /From the second round on, one question of the round also offers "충분합니다, 정리해 주세요"; stop at once when it is picked/);
  assert.match(rounds, /After every fifth round, ask with a choice question whether to go on or wrap up/);
});

test('the guarantees of the old sniff stay: nothing on GitHub, one local file, a confirmed Korean summary, two revisions, hand over to plan', () => {
  assert.match(sniff, /Nothing is created on GitHub and no repository is touched here/);
  assert.match(sniff, /the only file written is the confirmed goal summary under `\.haku\/drafts\/`/);
  const confirm = section('4. Confirm the summary');
  assert.match(confirm, /목적 \/ 성공 기준 \/ 범위 밖 \/ 제약 \/ 가정\(추천을 따른 것\) \/ 열린 질문/);
  assert.match(confirm, /맞아요 \/ 수정할게요 \/ 더 물어봐 주세요/);
  assert.match(confirm, /At most two revision rounds/);
  assert.match(confirm, /run one more round \(at most four questions\)/);
  assert.match(confirm, /\.haku\/drafts\/<slug>\.goal\.md/);
  const hand = section('5. Hand over');
  assert.match(hand, /`\/haku:setup` comes first and stop/);
  assert.match(hand, /continue directly with the `plan` skill, passing it the saved summary's path/);
});

test('sniff no longer carries the old limits (one question a turn, eight in total)', () => {
  assert.doesNotMatch(sniff, /One choice question per turn/);
  assert.doesNotMatch(sniff, /at most eight questions/i);
  assert.doesNotMatch(sniff, /eight-question total/);
});

test('sniff does not depend on an outside skill: haku works without grilling installed', () => {
  assert.doesNotMatch(sniff, /\bgrilling\b|\bgrill-me\b|grill-with-docs/i);
});
