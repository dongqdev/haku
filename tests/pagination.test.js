'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { readAllPages, readAllCursors } = require('../scripts/lib/paginate');
const { createGitHubHost } = require('../scripts/lib/github-host');

// A server holding `total` items, answering page by page; records how many requests were made.
function serverOf(total, perPage) {
  const items = Array.from({ length: total }, (_, i) => i + 1);
  const requests = [];
  return { requests, fetchPage: page => { requests.push(page); return items.slice((page - 1) * perPage, page * perPage); } };
}

test('offset paging reads every item at and around the page boundaries', () => {
  for (const total of [0, 1, 99, 100, 101, 199, 200, 201, 250]) {
    const s = serverOf(total, 100);
    const all = readAllPages(s.fetchPage, { perPage: 100 });
    assert.strictEqual(all.length, total, `total ${total}`);
    assert.deepStrictEqual(all, Array.from({ length: total }, (_, i) => i + 1));
  }
});

test('a full last page is followed by one more request that finds the end', () => {
  const s = serverOf(200, 100);
  readAllPages(s.fetchPage, { perPage: 100 });
  assert.deepStrictEqual(s.requests, [1, 2, 3]);
});

test('offset paging that never ends fails instead of returning part of the list', () => {
  assert.throws(() => readAllPages(() => new Array(100).fill(0), { perPage: 100, maxPages: 5, what: 'issue list' }), /still more pages after 5; refusing to decide on a partial list/);
});

test('a page that is not a list fails', () => {
  assert.throws(() => readAllPages(() => ({ message: 'rate limited' }), { perPage: 100 }), /was not a list/);
});

test('cursor paging follows the cursors to the end', () => {
  const pages = [{ nodes: [1, 2], pageInfo: { hasNextPage: true, endCursor: 'a' } }, { nodes: [3], pageInfo: { hasNextPage: true, endCursor: 'b' } }, { nodes: [4], pageInfo: { hasNextPage: false, endCursor: 'c' } }];
  const seenAfter = [];
  const all = readAllCursors(after => { seenAfter.push(after); return pages[seenAfter.length - 1]; });
  assert.deepStrictEqual(all, [1, 2, 3, 4]);
  assert.deepStrictEqual(seenAfter, [null, 'a', 'b']);
});

test('cursor paging fails on a repeating or empty cursor and on missing paging information', () => {
  assert.throws(() => readAllCursors(() => ({ nodes: [1], pageInfo: { hasNextPage: true, endCursor: 'same' } })), /cursor is empty or repeats/);
  assert.throws(() => readAllCursors(() => ({ nodes: [1], pageInfo: { hasNextPage: true, endCursor: null } })), /cursor is empty or repeats/);
  assert.throws(() => readAllCursors(() => ({ nodes: [1] })), /without paging information/);
  assert.throws(() => readAllCursors(() => ({ nodes: [1], pageInfo: { hasNextPage: 'yes' } })), /without paging information/);
  assert.throws(() => readAllCursors(() => null), /without paging information/);
});

// ---- the host, with a fake gh that serves REST pages and GraphQL cursors
function restHost(issues, perPage = 2) {
  const calls = [];
  const exec = (bin, args) => {
    calls.push(args);
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'o/r' });
    const m = args[1].match(/[?&]page=(\d+)/);
    const page = Number(m[1]);
    return JSON.stringify(issues.slice((page - 1) * perPage, page * perPage));
  };
  return { calls, host: createGitHubHost({ repo: 'o/r', exec, perPage }) };
}
const rest = (n, extra = {}) => ({ number: n, title: `t${n}`, body: `b${n}`, state: 'open', labels: [{ name: 'haku' }], assignees: [{ login: 'a' }], ...extra });

test('listIssues reads every page, drops pull requests only after all pages are read, and filters by label', () => {
  // the pull request sits on page 1; filtering before counting would make page 1 look short and stop early
  const all = [rest(1), rest(2, { pull_request: {} }), rest(3), rest(4), rest(5)];
  const { host, calls } = restHost(all);
  const issues = host.listIssues();
  assert.deepStrictEqual(issues.map(i => i.number), [1, 3, 4, 5]);
  assert.strictEqual(calls.filter(c => c[0] === 'api').length, 3, 'two full pages, then a short page ends the list');
  assert.match(calls[0][1], /labels=haku/);
  assert.match(calls[0][1], /state=all/);
  assert.deepStrictEqual(issues[0], { number: 1, title: 't1', body: 'b1', state: 'open', labels: [{ name: 'haku' }], assignees: [{ login: 'a' }] });
});

test('listBacklog reads every page of open issues of any label', () => {
  const { host, calls } = restHost([rest(1, { labels: [] }), rest(2, { labels: [] }), rest(3, { labels: [] })]);
  assert.strictEqual(host.listBacklog().length, 3);
  assert.ok(calls.every(c => !c[1] || !c[1].includes('labels=')));
});

test('listComments reads every page of comments', () => {
  const comments = [1, 2, 3, 4, 5].map(n => ({ body: `c${n}` }));
  const { host } = restHost(comments);
  assert.deepStrictEqual(host.listComments(7).map(c => c.body), ['c1', 'c2', 'c3', 'c4', 'c5']);
});

function graphqlHost(pagesOfNodes, perPage = 2) {
  const calls = [];
  const exec = (bin, args) => {
    calls.push(args);
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'o/r' });
    const after = (args.find(a => a.startsWith('after=')) || '').slice(6);
    const i = after ? Number(after) : 0;
    const hasNext = i + 1 < pagesOfNodes.length;
    return JSON.stringify({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: hasNext, endCursor: String(i + 1) }, nodes: pagesOfNodes[i] } } } });
  };
  return { calls, host: createGitHubHost({ repo: 'o/r', exec, perPage }) };
}
const pr = (number, extra = {}) => ({ number, body: '', headRefName: `task/${number}-x`, headRefOid: `sha${number}`, mergedAt: 'x', closingIssuesReferences: { pageInfo: { hasNextPage: false }, nodes: [{ number: number + 100 }] }, ...extra });

test('listMergedPrs reads every page and keeps head commits and closing issues', () => {
  const { host, calls } = graphqlHost([[pr(1), pr(2)], [pr(3), pr(4)], [pr(5)]]);
  const prs = host.listMergedPrs('main');
  assert.deepStrictEqual(prs.map(p => p.number), [1, 2, 3, 4, 5]);
  assert.strictEqual(prs[0].headRefOid, 'sha1');
  assert.deepStrictEqual(prs[2].closingIssues, [103]);
  assert.strictEqual(calls.filter(c => c[0] === 'api').length, 3);
  assert.ok(calls.some(c => c.includes('after=1')) && calls.some(c => c.includes('after=2')));
});

test('a merged pull request that closes more issues than one page holds makes the whole read fail', () => {
  const { host } = graphqlHost([[pr(1, { closingIssuesReferences: { pageInfo: { hasNextPage: true }, nodes: [] } })]]);
  assert.throws(() => host.listMergedPrs('main'), /closes more issues than one page holds/);
});

test('a GraphQL error is reported, not read as an empty list', () => {
  const exec = (bin, args) => (args[0] === 'repo' ? JSON.stringify({ nameWithOwner: 'o/r' }) : JSON.stringify({ errors: [{ message: 'rate limit' }] }));
  assert.throws(() => createGitHubHost({ repo: 'o/r', exec }).listMergedPrs('main'), /rate limit/);
});

test('the pull requests of a branch fail when the answer reaches the limit it asked for', () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, state: 'OPEN', mergedAt: null, headRefOid: 'x' }));
  const exec = () => JSON.stringify(many);
  assert.throws(() => createGitHubHost({ repo: 'o/r', exec }).prsForBranch('task/1-x'), /reach the limit of 100/);
  const few = () => JSON.stringify(many.slice(0, 3));
  assert.strictEqual(createGitHubHost({ repo: 'o/r', exec: few }).prsForBranch('task/1-x').length, 3);
});

test('status and triage tell the model that an incompletely read list is an error', () => {
  const fs = require('fs');
  const path = require('path');
  for (const name of ['status', 'triage']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'skills', name, 'SKILL.md'), 'utf8');
    assert.match(text, /refusing to decide on a partial list/, name);
  }
});
