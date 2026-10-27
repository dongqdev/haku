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
  labels: [{ name: 'ecc-harness' }, { name: `type:${type}` }]
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
