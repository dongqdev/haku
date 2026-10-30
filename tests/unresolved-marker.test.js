'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { UNRESOLVED_MARKERS, validateDraft, publish } = require('../scripts/lib/publish');

const verifyT1 = { kind: 'T1', profile: 'unit' };
const KO = UNRESOLVED_MARKERS[0];
const EN = UNRESOLVED_MARKERS[1];

function draft() {
  return {
    assignee: 'dongq',
    story: { id: 'S', title: 'Login', body: 'why', verify: { ...verifyT1 } },
    milestones: [{
      id: 'M1', title: 'Backend', body: 'mb', verify: { ...verifyT1 },
      tasks: [
        { id: 'T1', title: 'Model', acceptance: ['a'], scope: ['src/model/**'], verify: { ...verifyT1 } },
        { id: 'T2', title: 'API', acceptance: ['a0', 'a1'], scope: ['src/a/**', 'src/b/**'], verify: { ...verifyT1 },
          workerMode: 'session', workerReason: 'needs a real browser tool' }
      ]
    }]
  };
}

function fakeHost() {
  const calls = [];
  return {
    calls,
    ensureLabels: () => calls.push('labels'),
    createIssue: () => { calls.push('create'); return 1; },
    updateIssueBody: () => calls.push('update')
  };
}

const t2 = d => d.milestones[0].tasks[1];
// Each place: how to put text there, and the exact place named in the message.
const PLACES = [
  ['story title', (d, x) => { d.story.title = x; }, 'story: title'],
  ['story body', (d, x) => { d.story.body = x; }, 'story: body'],
  ['story verify.profile', (d, x) => { d.story.verify.profile = x; }, 'story: verify.profile'],
  ['milestone title', (d, x) => { d.milestones[0].title = x; }, 'milestone M1: title'],
  ['milestone body', (d, x) => { d.milestones[0].body = x; }, 'milestone M1: body'],
  ['milestone verify.profile', (d, x) => { d.milestones[0].verify.profile = x; }, 'milestone M1: verify.profile'],
  ['task title', (d, x) => { t2(d).title = x; }, 'task T2: title'],
  ['task body', (d, x) => { t2(d).body = x; }, 'task T2: body'],
  ['task acceptance[1]', (d, x) => { t2(d).acceptance[1] = x; }, 'task T2: acceptance[1]'],
  ['task scope[1]', (d, x) => { t2(d).scope[1] = x; }, 'task T2: scope[1]'],
  ['task workerReason', (d, x) => { t2(d).workerReason = x; }, 'task T2: workerReason'],
  ['task verify.profile', (d, x) => { t2(d).verify.profile = x; }, 'task T2: verify.profile']
];

test('a clean draft still passes', () => {
  assert.deepStrictEqual(validateDraft(draft()), []);
});

for (const [name, put, place] of PLACES) {
  for (const marker of [KO, EN]) {
    test(`${name} with ${marker} is rejected naming the place`, () => {
      const d = draft();
      put(d, `before ${marker} after`);
      const errors = validateDraft(d);
      assert.ok(errors.includes(`${place} still has an unresolved marker ${marker}`), errors.join(' | '));
    });
  }
}

test('the English marker is found in lower and mixed case', () => {
  for (const text of ['[needs clarification]', '[Needs Clarification]', '[nEEDS cLARIFICATION]']) {
    const d = draft();
    d.story.body = `x ${text} y`;
    const errors = validateDraft(d);
    assert.strictEqual(errors.length, 1, text);
    assert.ok(errors[0].startsWith('story: body still has an unresolved marker'), errors[0]);
  }
});

test('a marker inside a code fence or backticks counts (no exception)', () => {
  const fence = '```\n' + KO + '\n```';
  const ticks = 'see `' + EN + '` here';
  for (const text of [fence, ticks, '`' + KO + '`']) {
    const d = draft();
    t2(d).acceptance[0] = text;
    const errors = validateDraft(d);
    assert.strictEqual(errors.length, 1, text);
    assert.ok(errors[0].startsWith('task T2: acceptance[0] still has an unresolved marker'), errors[0]);
  }
});

test('a half-written marker is not a marker (by design)', () => {
  const half = ['[확인 필요', '확인 필요', '[NEEDS CLARIFICATION', 'NEEDS CLARIFICATION]', '확인 필요]'];
  for (const text of half) {
    const d = draft();
    d.story.body = text;
    t2(d).acceptance[0] = text;
    assert.deepStrictEqual(validateDraft(d), [], text);
  }
});

test('several markers give several errors', () => {
  const d = draft();
  d.story.body = KO;
  t2(d).acceptance[0] = EN;
  t2(d).acceptance[1] = KO;
  t2(d).scope[0] = KO;
  const errors = validateDraft(d).filter(e => e.includes('unresolved marker'));
  assert.strictEqual(errors.length, 4);
});

test('dry-run publish reports the errors and creates nothing', () => {
  const d = draft();
  d.story.body = KO;
  t2(d).workerReason = EN;
  const host = fakeHost();
  const r = publish(host, d);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.filter(e => e.includes('unresolved marker')).length, 2);
  assert.deepStrictEqual(host.calls, []);
  const applied = publish(host, d, { apply: true });
  assert.strictEqual(applied.ok, false);
  assert.deepStrictEqual(host.calls, []);
});

test('a clean draft dry-runs fine', () => {
  const r = publish(fakeHost(), draft());
  assert.strictEqual(r.ok, true);
});

const read = f => fs.readFileSync(path.join(__dirname, '..', 'skills', f, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');

test('plan skill: write the marker, resolve by choice questions, gate only without markers', () => {
  const s = read('plan');
  assert.ok(s.includes('do not guess and do not leave it vague: write the marker `' + KO + '` right where it is unclear in the draft'));
  assert.ok(s.includes('Resolve every marker with the user through choice questions (one decision each, recommended option first'));
  assert.ok(s.includes('delete the marker with the answer written in'));
  assert.ok(s.includes('Only a draft without markers goes to the approval gate'));
  assert.ok(s.includes('`issues.js publish` refuses a draft that still has one'));
});

test('plan skill: a goal summary with an open marker is resolved before drafting', () => {
  const s = read('plan');
  assert.ok(s.includes("goal summary's 열린 질문 section still holds a `" + KO + '` marker'));
  assert.ok(s.includes('resolve those first with choice questions (one decision each, recommended option first) and write the answers into the summary file'));
  assert.ok(s.includes('Do not draft over an open marker.'));
  assert.ok(s.indexOf('Do not draft over an open marker.') < s.indexOf('## 2. Draft'));
});

test('sniff skill: open questions carry the marker and are still saved', () => {
  const s = read('sniff');
  assert.ok(s.includes("Every item in the summary's 열린 질문 list carries the marker `" + KO + '`'));
  assert.ok(s.includes('A summary with marked items is still saved'));
  assert.ok(s.includes('`plan` resolves them first'));
  assert.ok(s.includes('Items the user explicitly leaves open stay marked.'));
});
