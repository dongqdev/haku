'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createGitHubHost } = require('../scripts/lib/github-host');

// A fake gh: records every call and answers by the first two arguments.
function fakeExec(handlers) {
  const calls = [];
  const exec = (bin, args) => {
    calls.push(args);
    const key = args.slice(0, 2).join(' ');
    const h = handlers[key];
    if (h === undefined) throw new Error(`unexpected gh call: ${key}`);
    return typeof h === 'function' ? h(args) : h;
  };
  return { exec, calls };
}

const created = 'https://github.com/o/r/issues/7\n';
const host = exec => createGitHubHost({ repo: 'o/r', exec });
const base = { title: 't', body: 'b', labels: ['haku'] };

test('an assignee that stuck needs no owner label', () => {
  const { exec, calls } = fakeExec({
    'issue create': created,
    'issue view': JSON.stringify({ assignees: [{ login: 'Dongq' }] })
  });
  assert.strictEqual(host(exec).createIssue({ ...base, assignee: 'dongq' }), 7);
  assert.ok(!calls.some(a => a[0] === 'label' || a[0] === 'issue' && a[1] === 'edit'));
});

test('a silently dropped assignee gets an owner label', () => {
  const { exec, calls } = fakeExec({
    'issue create': created,
    'issue view': JSON.stringify({ assignees: [] }),
    'label create': '',
    'issue edit': ''
  });
  assert.strictEqual(host(exec).createIssue({ ...base, assignee: 'stranger' }), 7);
  assert.ok(calls.some(a => a[0] === 'label' && a[2] === 'owner:stranger'));
  const edit = calls.find(a => a[0] === 'issue' && a[1] === 'edit');
  assert.deepStrictEqual(edit.slice(-2), ['--add-label', 'owner:stranger']);
});

test('a failure after creation still returns the issue number', () => {
  const { exec } = fakeExec({
    'issue create': created,
    'issue view': () => { throw new Error('network down'); }
  });
  assert.strictEqual(host(exec).createIssue({ ...base, assignee: 'dongq' }), 7);
});

test('@me is resolved to the real login before comparing', () => {
  const { exec, calls } = fakeExec({
    'api user': 'dongq\n',
    'issue create': created,
    'issue view': JSON.stringify({ assignees: [{ login: 'dongq' }] })
  });
  host(exec).createIssue({ ...base, assignee: '@me' });
  assert.ok(!calls.some(a => a[0] === 'label'));
  assert.ok(calls.find(a => a[1] === 'create').includes('dongq'));
});

test('without an assignee nothing extra is called', () => {
  const { exec, calls } = fakeExec({ 'issue create': created });
  assert.strictEqual(host(exec).createIssue(base), 7);
  assert.strictEqual(calls.length, 1);
});

// ---- closing audit (#25): what the host says about how an issue was closed -----------------------------------

const closersReply = (issue, errors) => JSON.stringify(errors ? { errors } : { data: { repository: { issue } } });
const graphqlHost = reply => createGitHubHost({ repo: 'o/r', exec: (bin, args) => {
  assert.deepStrictEqual(args.slice(0, 2), ['api', 'graphql']);
  return typeof reply === 'function' ? reply(args) : reply;
} });
const closedIssue = (event, nodes = [], hasNextPage = false) => ({
  state: 'CLOSED',
  closedByPullRequestsReferences: { pageInfo: { hasNextPage }, nodes },
  timelineItems: { nodes: event ? [event] : [] }
});

test('issueClosers reads the last close: a merged pull request, a commit, or nobody', () => {
  const pr = { createdAt: '2026-01-02T00:00:00Z', stateReason: 'COMPLETED', closer: { __typename: 'PullRequest', number: 5, merged: true, baseRefName: 'main' } };
  const byPr = graphqlHost(closersReply(closedIssue(pr, [{ number: 5, state: 'MERGED', merged: true, baseRefName: 'main' }]))).issueClosers(2);
  assert.deepStrictEqual(byPr, {
    state: 'closed', closedAt: '2026-01-02T00:00:00Z', stateReason: 'completed',
    closedBy: { type: 'pr', number: 5, merged: true, base: 'main' },
    prs: [{ number: 5, state: 'merged', merged: true, base: 'main' }]
  });
  const byCommit = graphqlHost(closersReply(closedIssue({ ...pr, closer: { __typename: 'Commit', oid: 'abc' } }))).issueClosers(2);
  assert.deepStrictEqual(byCommit.closedBy, { type: 'commit' });
  const byHand = graphqlHost(closersReply(closedIssue({ createdAt: '2026-01-02T00:00:00Z', stateReason: 'NOT_PLANNED', closer: null }))).issueClosers(2);
  assert.deepStrictEqual([byHand.closedBy, byHand.stateReason], [{ type: 'none' }, 'not_planned']);
  assert.strictEqual(graphqlHost(closersReply(closedIssue(null))).issueClosers(2).closedAt, null);
});

test('issueClosers refuses a partial list, a graphql error and a missing issue', () => {
  assert.throws(() => graphqlHost(closersReply(closedIssue(null, [], true))).issueClosers(2), /partial list/);
  assert.throws(() => graphqlHost(closersReply(null, [{ message: 'boom' }])).issueClosers(2), /boom/);
  assert.throws(() => graphqlHost(closersReply(null)).issueClosers(2), /not found/);
});

test('listComments keeps the author association and the time of each comment', () => {
  const exec = (bin, args) => JSON.stringify([{ id: 1, body: 'x', author_association: 'OWNER', created_at: '2026-01-01T00:00:00Z' }, { id: 2, body: 'y' }]);
  const rows = createGitHubHost({ repo: 'o/r', exec, perPage: 100 }).listComments(3);
  assert.deepStrictEqual(rows, [
    { body: 'x', authorAssociation: 'OWNER', createdAt: '2026-01-01T00:00:00Z' },
    { body: 'y', authorAssociation: 'NONE', createdAt: null }
  ]);
});
