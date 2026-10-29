'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { reconcile, describeWarning, acceptClosedTask } = require('../scripts/lib/reconcile');

// Hosts written inline below: every closed task was closed by a merged pull request.
const closedByMerge = { issueClosers: () => ({ state: 'closed', prs: [{ number: 1, state: 'merged', merged: true, base: 'main' }] }), listComments: () => [] };

// `closers` answers "which pull requests closed this issue" per issue number; an issue it does not name was closed
// by a merged pull request. A function value throws or returns what the test needs; `comments` per issue.
function fakeHost({ issues, prs, base = 'main', closers = {}, comments = {} }) {
  const closed = [];
  return {
    closed,
    issueClosers: n => {
      const c = closers[n];
      if (typeof c === 'function') return c();
      return { state: 'closed', prs: c || [{ number: 900 + n, state: 'merged', merged: true, base }] };
    },
    listComments: n => comments[n] || [],
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
  const host = { ...closedByMerge, defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => [], closeIssue: () => assert.fail('must not close') };
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
  const host = { ...closedByMerge, defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => [], closeIssue: () => {} };
  assert.deepStrictEqual(reconcile(host, {}).plan.map(p => [p.kind, p.issue]), [['rollup', 2]]);
});

// ---- findings of the review: only the Children section counts, and open named children hold the parent back
test('a task list outside the Children section names no child and does not hold a parent back', () => {
  const issue = (number, type, state, body = '') => ({ number, state, body, title: `t${number}`, labels: [{ name: 'haku' }, { name: `type:${type}` }] });
  const issues = [
    issue(1, 'story', 'open', 'Track:\n- [ ] #99 upstream bug in another project\n\n## Children\n- [ ] #2 M'),
    issue(2, 'milestone', 'closed', 'Parent: #1')
  ];
  const host = { ...closedByMerge, defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => [], closeIssue: () => {} };
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
  const host = { ...closedByMerge, defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => [], closeIssue: () => assert.fail('must not close') };
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

// ---- the report must agree with the plan, and say each hold once
const mk = (number, type, state, body = '') => ({ number, state, body, title: `t${number}`, labels: [{ name: 'haku' }, { name: `type:${type}` }] });
const hostOf = (issues, prs = []) => ({ ...closedByMerge, defaultBranch: () => 'main', listIssues: () => issues, listMergedPrs: () => prs, closeIssue: () => {} });

test('a parent held back in one pass but rolled up in a later pass is not reported as held back', () => {
  // story 1 names milestone 2 and 3; milestone 2 has no Parent line and is rolled up in the same run
  const issues = [
    mk(1, 'story', 'open', '## Children\n- [ ] #2 M2\n- [ ] #3 M3'),
    mk(3, 'milestone', 'closed', 'Parent: #1'),
    mk(2, 'milestone', 'open', '## Children\n- [ ] #4 t'),
    mk(4, 'task', 'closed', 'Parent: #2')
  ];
  const r = reconcile(hostOf(issues), {});
  assert.deepStrictEqual(r.plan.map(p => [p.kind, p.issue]), [['rollup', 2], ['rollup', 1]]);
  assert.deepStrictEqual(r.warnings.filter(w => w.kind.startsWith('child-')), [], 'no hold for a parent that is closed by this very plan');
});

test('a parent that stays held back is reported exactly once, however many passes the roll-up needs', () => {
  const issues = [
    mk(1, 'story', 'open', '## Children\n- [ ] #2 done\n- [ ] #77 not listed yet'),
    mk(2, 'milestone', 'closed', 'Parent: #1'),
    mk(10, 'story', 'open', '## Children\n- [ ] #11 m'),
    mk(11, 'milestone', 'open', '## Children\n- [ ] #12 t\n\nParent: #10'),
    mk(12, 'task', 'closed', 'Parent: #11')
  ];
  const r = reconcile(hostOf(issues), {});
  assert.deepStrictEqual(r.plan.map(p => p.issue), [11, 10], 'the two-level roll-up needs a second pass');
  assert.deepStrictEqual(r.warnings.filter(w => w.kind === 'child-not-listed'), [{ kind: 'child-not-listed', issue: 1, children: [77] }]);
});

test('a child that this run is about to close counts as done for the checklist guard', () => {
  const issues = [
    mk(2, 'milestone', 'open', '## Children\n- [ ] #3 closed child\n- [ ] #4 merged but still open'),
    mk(3, 'task', 'closed', 'Parent: #2'),
    mk(4, 'task', 'open', 'no Parent line')
  ];
  const prs = [{ number: 9, body: 'Closes #4', headRefName: 'task/4-x', closingIssues: [4] }];
  const r = reconcile(hostOf(issues, prs), {});
  assert.deepStrictEqual(r.plan.map(p => [p.kind, p.issue]), [['merged-not-closed', 4], ['rollup', 2]]);
  assert.deepStrictEqual(r.warnings.filter(w => w.kind.startsWith('child-')), []);
});

test('the Children heading is found in any letter case', () => {
  assert.deepStrictEqual(checklistNumbers({ body: '## children\n- [ ] #4 a\n' }), [4]);
  assert.deepStrictEqual(checklistNumbers({ body: '## CHILDREN\n- [ ] #5 a\n' }), [5]);
});

// ---- closure audit (#25): a story is not finished by tasks nobody built --------------------------------------

const withParent = (number, type, parent, state = 'closed') => issue(number, type, state, `Parent: #${parent}`);
const rollupHolds = result => result.warnings.filter(w => w.kind === 'child-closed-without-merge' || w.kind === 'audit-incomplete');

function treeWith(closers, comments) {
  return fakeHost({
    issues: [issue(1, 'story', 'open'), withParent(2, 'task', 1)],
    prs: [],
    closers,
    comments
  });
}

test('a task closed by a merged pull request lets its story roll up', () => {
  const result = reconcile(treeWith({}));
  assert.deepStrictEqual(result.plan.map(p => [p.kind, p.issue]), [['rollup', 1]]);
});

test('open pull request only: the story is held back and the state is named', () => {
  const result = reconcile(treeWith({ 2: [{ number: 5, state: 'open', merged: false, base: 'main' }] }));
  assert.deepStrictEqual(result.plan, []);
  assert.deepStrictEqual(rollupHolds(result).map(w => [w.kind, w.issue, w.children, w.states]), [['child-closed-without-merge', 1, [2], { 2: 'open-pr' }]]);
});

test('closed-without-merging pull request only, or merged into another branch: held back', () => {
  for (const prs of [[{ number: 5, state: 'closed', merged: false, base: 'main' }], [{ number: 6, state: 'merged', merged: true, base: 'dev' }]]) {
    const result = reconcile(treeWith({ 2: prs }));
    assert.deepStrictEqual(result.plan, []);
    assert.strictEqual(rollupHolds(result)[0].states[2], 'closed-pr');
  }
});

test('nothing linked (closed by hand): held back, and the text report names the task and why', () => {
  const result = reconcile(treeWith({ 2: [] }));
  assert.deepStrictEqual(result.plan, []);
  assert.strictEqual(rollupHolds(result)[0].states[2], 'none');
  assert.match(describeWarning(rollupHolds(result)[0]), /child-closed-without-merge #1 \(children: #2 none\)/);
});

test('the host cannot be asked: the audit is incomplete and nothing rolls up', () => {
  const result = reconcile(treeWith({ 2: () => { throw new Error('network'); } }));
  assert.deepStrictEqual(result.plan, []);
  assert.deepStrictEqual(rollupHolds(result).map(w => [w.kind, w.states[2]]), [['audit-incomplete', 'unknown']]);
});

test('a task closed on purpose is allowed when a repository writer recorded it, not when anyone else did', () => {
  const marker = '<!-- haku:accepted-close -->\nAlready fixed in another change.';
  const trusted = reconcile(treeWith({ 2: [] }, { 2: [{ body: marker, authorAssociation: 'OWNER' }] }));
  assert.deepStrictEqual(trusted.plan.map(p => p.issue), [1]);
  for (const who of ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR']) {
    const stranger = reconcile(treeWith({ 2: [] }, { 2: [{ body: marker, authorAssociation: who }] }));
    assert.deepStrictEqual(stranger.plan, [], who);
  }
});

test('one unverified task among verified ones holds the whole story; a merged PR from this run counts as merged', () => {
  const host = fakeHost({
    issues: [issue(1, 'story', 'open'), withParent(2, 'task', 1), withParent(3, 'task', 1, 'open')],
    prs: [{ number: 10, body: 'Closes #3', headRefName: 'x', closingIssues: [] }],
    closers: { 2: [] }
  });
  const result = reconcile(host);
  assert.deepStrictEqual(result.plan.map(p => p.issue), [3]);
  assert.deepStrictEqual(rollupHolds(result).map(w => w.children), [[2]]);
});

test('applying never closes a held-back story', () => {
  const host = treeWith({ 2: [] });
  const result = reconcile(host, { apply: true });
  assert.deepStrictEqual(result.applied, []);
  assert.deepStrictEqual(host.closed, []);
});

test('accept-close writes the marker for a closed task with a reason, and refuses everything else', () => {
  const posted = [];
  const host = issues => ({ getIssue: n => issues.find(i => i.number === n), commentIssue: (n, body) => posted.push({ n, body }) });
  acceptClosedTask(host([issue(2, 'task', 'closed')]), 2, ' already fixed by #7 ');
  assert.strictEqual(posted[0].n, 2);
  assert.ok(posted[0].body.startsWith('<!-- haku:accepted-close -->\n'));
  assert.match(posted[0].body, /already fixed by #7$/);
  assert.throws(() => acceptClosedTask(host([issue(2, 'task', 'closed')]), 2, '  '), /reason is required/);
  assert.throws(() => acceptClosedTask(host([issue(2, 'task', 'open')]), 2, 'x'), /still open/);
  assert.throws(() => acceptClosedTask(host([issue(2, 'story', 'closed')]), 2, 'x'), /not a task/);
  assert.strictEqual(posted.length, 1, 'nothing is written for a refused request');
});

test('an accepted close is read back by reconcile through the same marker', () => {
  const posted = [];
  const tree = [issue(1, 'story', 'open'), withParent(2, 'task', 1)];
  acceptClosedTask({ getIssue: () => tree[1], commentIssue: (n, body) => posted.push(body) }, 2, 'not needed');
  const result = reconcile(fakeHost({ issues: tree, prs: [], closers: { 2: [] }, comments: { 2: [{ body: posted[0], authorAssociation: 'COLLABORATOR' }] } }));
  assert.deepStrictEqual(result.plan.map(p => p.issue), [1]);
});

test('a task with a merged pull request in this run is never looked up again, even when lookups fail', () => {
  const host = fakeHost({
    issues: [issue(1, 'story', 'open'), withParent(2, 'task', 1)],
    prs: [{ number: 10, body: 'Closes #2', headRefName: 'x', closingIssues: [] }],
    closers: { 2: () => { throw new Error('network'); } }
  });
  assert.deepStrictEqual(reconcile(host).plan.map(p => p.issue), [1]);
});

test('only tasks are audited: a closed milestone with nothing linked does not hold its story back', () => {
  const host = fakeHost({
    issues: [issue(1, 'story', 'open'), withParent(2, 'milestone', 1)],
    prs: [],
    closers: { 2: [] }
  });
  assert.deepStrictEqual(reconcile(host).plan.map(p => p.issue), [1]);
});
