'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { reconcile } = require('../scripts/lib/reconcile');

function fakeHost({ issues, prs, base = 'main' }) {
  const closed = [];
  return {
    closed,
    defaultBranch: () => base,
    listIssues: () => issues,
    listMergedPrs: b => {
      assert.strictEqual(b, base, 'merged PRs must be queried against the default branch');
      return prs;
    },
    closeIssue: (n, comment) => closed.push({ n, comment })
  };
}

const issue = (number, type, state = 'open', body = '') => ({
  number,
  state,
  body,
  title: `${type} ${number}`,
  labels: [{ name: 'haku' }, { name: `type:${type}` }]
});

test('merged PR (branch convention) closes its open task; dry-run closes nothing', () => {
  const host = fakeHost({
    issues: [issue(3, 'task')],
    prs: [{ number: 10, body: 'no keyword here', headRefName: 'task/3-login', closingIssues: [] }]
  });
  const result = reconcile(host);
  assert.deepStrictEqual(result.plan.map(p => p.issue), [3]);
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(host.closed.length, 0);
});

test('--apply closes the planned issues with an explanatory comment', () => {
  const host = fakeHost({
    issues: [issue(3, 'task')],
    prs: [{ number: 10, body: 'Closes #3', headRefName: 'feature/x', closingIssues: [] }]
  });
  const result = reconcile(host, { apply: true });
  assert.deepStrictEqual(result.applied, [3]);
  assert.strictEqual(host.closed[0].n, 3);
  assert.match(host.closed[0].comment, /PR #10 merged into main/);
});

test('host closingIssues links are honoured', () => {
  const host = fakeHost({
    issues: [issue(4, 'task')],
    prs: [{ number: 11, body: '', headRefName: 'x', closingIssues: [4] }]
  });
  assert.deepStrictEqual(reconcile(host).plan.map(p => p.issue), [4]);
});

test('keywords inside code fences and quotes are not claims', () => {
  const body = '```\nCloses #5\n```\n> Fixes #5\n';
  const host = fakeHost({
    issues: [issue(5, 'task')],
    prs: [{ number: 12, body, headRefName: 'x', closingIssues: [] }]
  });
  const result = reconcile(host);
  assert.strictEqual(result.plan.length, 0);
  assert.deepStrictEqual(result.warnings, [{ kind: 'pr-without-issue', pr: 12 }]);
});

test('a reference to another repository is never matched', () => {
  const host = fakeHost({
    issues: [issue(6, 'task')],
    prs: [{ number: 13, body: 'Closes other/repo#6', headRefName: 'x', closingIssues: [] }]
  });
  assert.strictEqual(reconcile(host).plan.length, 0);
});

test('already closed task is untouched', () => {
  const host = fakeHost({
    issues: [issue(7, 'task', 'closed')],
    prs: [{ number: 14, body: 'Closes #7', headRefName: 'task/7-a', closingIssues: [] }]
  });
  assert.strictEqual(reconcile(host).plan.length, 0);
});

test('a PR never closes a story or milestone directly', () => {
  const host = fakeHost({
    issues: [issue(1, 'story'), issue(2, 'milestone', 'open', 'Parent: #1')],
    prs: [{ number: 15, body: 'Closes #1\nCloses #2', headRefName: 'x', closingIssues: [1, 2] }]
  });
  assert.strictEqual(reconcile(host).plan.length, 0);
});

test('roll-up: tasks -> milestone -> story, in order', () => {
  const host = fakeHost({
    issues: [
      issue(1, 'story'),
      issue(2, 'milestone', 'open', 'Parent: #1'),
      issue(3, 'task', 'open', 'Parent: #2'),
      issue(4, 'task', 'closed', 'Parent: #2')
    ],
    prs: [{ number: 20, body: '', headRefName: 'task/3-a', closingIssues: [] }]
  });
  assert.deepStrictEqual(reconcile(host).plan.map(p => p.issue), [3, 2, 1]);
});

test('roll-up waits while any child is still open', () => {
  const host = fakeHost({
    issues: [
      issue(2, 'milestone', 'open', 'Parent: #1'),
      issue(3, 'task', 'open', 'Parent: #2'),
      issue(4, 'task', 'open', 'Parent: #2')
    ],
    prs: [{ number: 21, body: '', headRefName: 'task/3-a', closingIssues: [] }]
  });
  assert.deepStrictEqual(reconcile(host).plan.map(p => p.issue), [3]);
});

test('closed task with no merged PR is reported as advisory only', () => {
  const host = fakeHost({ issues: [issue(8, 'task', 'closed')], prs: [] });
  const result = reconcile(host, { apply: true });
  assert.deepStrictEqual(result.warnings, [{ kind: 'closed-without-merged-pr', issue: 8 }]);
  assert.strictEqual(host.closed.length, 0);
});

test('default branch other than main is respected', () => {
  const host = fakeHost({ issues: [], prs: [], base: 'master' });
  assert.strictEqual(reconcile(host).base, 'master');
});

// ---- a parent is not rolled up while a child it names is missing from the list
const { checklistNumbers } = require('../scripts/lib/model');

test('the Children checklist of a parent is read as issue numbers', () => {
  assert.deepStrictEqual(checklistNumbers({ body: '## Children\n- [ ] #4 First\n- [x] #5 Second\n  - [X] #6 Nested\nnot a child #9\n' }), [4, 5, 6]);
  assert.deepStrictEqual(checklistNumbers({ body: '```\n- [ ] #8 in a fence\n```\n' }), []);
  assert.deepStrictEqual(checklistNumbers({ body: '' }), []);
});

test('a milestone is not rolled up when its checklist names a child the list does not show yet', () => {
  const issue = (number, type, state, body = '') => ({ number, state, body, title: `t${number}`, labels: [{ name: 'haku' }, { name: `type:${type}` }] });
  const issues = [
    issue(1, 'story', 'open', '## Children\n- [ ] #2 M'),
    issue(2, 'milestone', 'open', '## Children\n- [ ] #3 done\n- [ ] #4 created a moment ago\n\nParent: #1'),
    issue(3, 'task', 'closed', 'Parent: #2')
    // #4 exists on GitHub but the list has not caught up
  ];
  const host = { defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => [], closeIssue: () => assert.fail('must not close') };
  const r = reconcile(host, { apply: true });
  assert.deepStrictEqual(r.plan, []);
  assert.deepStrictEqual(r.warnings.filter(w => w.kind === 'child-not-listed'), [{ kind: 'child-not-listed', issue: 2, children: [4] }]);
});

test('once the list shows every child named by the checklist the roll-up goes ahead', () => {
  const issue = (number, type, state, body = '') => ({ number, state, body, title: `t${number}`, labels: [{ name: 'haku' }, { name: `type:${type}` }] });
  const issues = [
    issue(2, 'milestone', 'open', '## Children\n- [ ] #3 done\n- [ ] #4 now listed'),
    issue(3, 'task', 'closed', 'Parent: #2'),
    issue(4, 'task', 'closed', 'Parent: #2')
  ];
  const host = { defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => [], closeIssue: () => {} };
  assert.deepStrictEqual(reconcile(host, {}).plan.map(p => [p.kind, p.issue]), [['rollup', 2]]);
});

// ---- findings of the review: only the Children section counts, and open named children hold the parent back
test('a task list outside the Children section names no child and does not hold a parent back', () => {
  const issue = (number, type, state, body = '') => ({ number, state, body, title: `t${number}`, labels: [{ name: 'haku' }, { name: `type:${type}` }] });
  const issues = [
    issue(1, 'story', 'open', 'Track:\n- [ ] #99 upstream bug in another project\n\n## Children\n- [ ] #2 M'),
    issue(2, 'milestone', 'closed', 'Parent: #1')
  ];
  const host = { defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => [], closeIssue: () => {} };
  const r = reconcile(host, {});
  assert.deepStrictEqual(r.plan.map(p => [p.kind, p.issue]), [['rollup', 1]]);
  assert.deepStrictEqual(r.warnings.filter(w => w.kind.startsWith('child-')), []);
});

test('the Children section is read in its own boundaries and forms', () => {
  assert.deepStrictEqual(checklistNumbers({ body: 'intro\r\n## Children\r\n- [ ] #4 a\r\n* [x] #5 b\r\n+ [ ] #6 c\r\n\t- [ ] #7 nested\r\n## Notes\r\n- [ ] #8 not a child\r\n' }), [4, 5, 6, 7]);
  assert.deepStrictEqual(checklistNumbers({ body: '## Children\n<!--\n- [ ] #4 hidden\n-->\n~~~\n- [ ] #5 fenced\n~~~\n- [ ] #6 real\n' }), [6]);
  assert.deepStrictEqual(checklistNumbers({ body: '- [ ] #4 no section at all' }), []);
  assert.deepStrictEqual(checklistNumbers({ body: '### Children\n- [ ] #4 third level heading\n' }), [4]);
});

test('a visible, still open child named by the checklist holds the parent back even without a Parent line', () => {
  const issue = (number, type, state, body = '') => ({ number, state, body, title: `t${number}`, labels: [{ name: 'haku' }, { name: `type:${type}` }] });
  const issues = [
    issue(2, 'milestone', 'open', '## Children\n- [ ] #3 closed child\n- [ ] #4 open child added by hand'),
    issue(3, 'task', 'closed', 'Parent: #2'),
    issue(4, 'task', 'open', 'no Parent line here')
  ];
  const host = { defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => [], closeIssue: () => assert.fail('must not close') };
  const r = reconcile(host, { apply: true });
  assert.deepStrictEqual(r.plan, []);
  assert.deepStrictEqual(r.warnings.filter(w => w.kind === 'child-not-done'), [{ kind: 'child-not-done', issue: 2, children: [4] }]);
});

test('the text report names the children that hold a parent back', () => {
  const { describeWarning } = require('../scripts/lib/reconcile');
  assert.strictEqual(describeWarning({ kind: 'child-not-listed', issue: 2, children: [4, 7] }), 'child-not-listed #2 (children: #4, #7)');
  assert.strictEqual(describeWarning({ kind: 'pr-without-issue', pr: 9 }), 'pr-without-issue PR #9');
  assert.strictEqual(describeWarning({ kind: 'closed-without-merged-pr', issue: 5 }), 'closed-without-merged-pr #5');
});
