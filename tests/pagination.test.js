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
  assert.strictEqual(calls.filter(c => c[0] === 'api').length, 6, 'three pages per read, and the list is read twice to confirm it is stable');
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
  const comments = [1, 2, 3, 4, 5].map(n => ({ id: 1000 + n, body: `c${n}` }));
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
  assert.strictEqual(calls.filter(c => c[0] === 'api').length, 6, 'three pages per read, read twice');
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

// ---- a list that changes while it is being read (the reviewer's reproduction)
const { readStable } = require('../scripts/lib/paginate');
const { doneCheck } = require('../scripts/lib/done-gate');

test('a read that saw one item twice and missed another is repeated until two reads agree', () => {
  const reads = [
    [{ number: 1 }, { number: 2 }, { number: 2 }],            // 2 twice, 3 missed (the list shifted mid-read)
    [{ number: 1 }, { number: 2 }, { number: 3 }],
    [{ number: 1 }, { number: 2 }, { number: 3 }]
  ];
  let i = 0;
  const result = readStable(() => reads[i++]);
  assert.deepStrictEqual(result.map(x => x.number), [1, 2, 3]);
  assert.strictEqual(i, 3);
});

test('two reads that already agree are enough, and duplicates inside a read are dropped', () => {
  let reads = 0;
  const result = readStable(() => { reads += 1; return [{ number: 5 }, { number: 5 }, { number: 6 }]; });
  assert.deepStrictEqual(result.map(x => x.number), [5, 6]);
  assert.strictEqual(reads, 2);
});

test('reads that never agree fail instead of returning one of them', () => {
  let n = 0;
  assert.throws(() => readStable(() => [{ number: ++n }], { what: 'open issue list' }), /open issue list: the list kept changing while it was read \(4 reads\)/);
});

test('triage cannot propose an issue as the duplicate of itself after a shifted read', () => {
  // without the stable read this list holds #51 twice, and "same title" would pair it with itself
  const { buildTriage } = require('../scripts/lib/triage');
  const reads = [
    [{ number: 50, title: 'a', body: '', state: 'open', labels: [] }, { number: 51, title: 'same title', body: '', state: 'open', labels: [] }, { number: 51, title: 'same title', body: '', state: 'open', labels: [] }],
    [{ number: 50, title: 'a', body: '', state: 'open', labels: [] }, { number: 51, title: 'same title', body: '', state: 'open', labels: [] }, { number: 52, title: 'b', body: '', state: 'open', labels: [] }],
    [{ number: 50, title: 'a', body: '', state: 'open', labels: [] }, { number: 51, title: 'same title', body: '', state: 'open', labels: [] }, { number: 52, title: 'b', body: '', state: 'open', labels: [] }]
  ];
  let i = 0;
  const t = buildTriage(readStable(() => reads[i++]));
  assert.deepStrictEqual(t.duplicates, []);
  assert.deepStrictEqual(t.backlog.map(b => b.number), [50, 51, 52]);
});

// ---- what is actually asked of GitHub
function recordingHost(options = {}) {
  const calls = [];
  const exec = (bin, args) => {
    calls.push(args);
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'o/r' });
    if (args.includes('graphql')) return JSON.stringify({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } });
    return '[]';
  };
  return { calls, host: createGitHubHost({ repo: 'o/r', exec, ...options }) };
}

test('issue lists ask for oldest-first order and comments use the comments route', () => {
  const { host, calls } = recordingHost();
  host.listIssues();
  host.listBacklog();
  host.listComments(7);
  const paths = calls.filter(c => c[0] === 'api').map(c => c[1]);
  assert.ok(paths.every(p => p.startsWith('repos/o/r/')), paths.join(' '));
  assert.match(paths[0], /^repos\/o\/r\/issues\?state=all&sort=created&direction=asc&labels=haku&per_page=100&page=1$/);
  assert.ok(paths.some(p => /^repos\/o\/r\/issues\?state=open&sort=created&direction=asc&per_page=100&page=1$/.test(p)));
  assert.ok(paths.some(p => /^repos\/o\/r\/issues\/7\/comments\?per_page=100&page=1$/.test(p)));
});

test('the merged pull request query asks for merged pull requests of the base branch in a stable order', () => {
  const { host, calls } = recordingHost();
  host.listMergedPrs('main');
  const args = calls.find(c => c.includes('graphql'));
  const query = args.find(a => a.startsWith('query='));
  assert.match(query, /states:MERGED/);
  assert.match(query, /baseRefName:\$base/);
  assert.match(query, /orderBy:\{field:CREATED_AT,direction:ASC\}/);
  assert.ok(args.includes('base=main'));
  assert.ok(args.includes('first=100'));
});

test('a page size above GitHub\'s maximum is clamped so a full page is never mistaken for the last one', () => {
  const { host, calls } = recordingHost({ perPage: 150 });
  host.listBacklog();
  assert.match(calls.find(c => c[0] === 'api')[1], /per_page=100&/);
  const small = recordingHost({ perPage: 0 });
  small.host.listBacklog();
  assert.match(small.calls.find(c => c[0] === 'api')[1], /per_page=100&/);
});

test('HOST/OWNER/REPO is split for gh api, and a malformed repo is rejected', () => {
  const { host, calls } = (() => { const r = recordingHost(); return { calls: r.calls, host: createGitHubHost({ repo: 'github.example.com/o/r', exec: (b, a) => { r.calls.push(a); return a.includes('graphql') ? JSON.stringify({ data: { repository: { pullRequests: { pageInfo: { hasNextPage: false }, nodes: [] } } } }) : '[]'; } }) }; })();
  host.listBacklog();
  host.listMergedPrs('main');
  const apiCalls = calls.filter(c => c[0] === 'api');
  assert.ok(apiCalls.every(c => c[1] === '--hostname' && c[2] === 'github.example.com'));
  assert.match(apiCalls[0][3], /^repos\/o\/r\/issues/);
  assert.ok(apiCalls.at(-1).includes('owner=o') && apiCalls.at(-1).includes('name=r'));
  for (const bad of ['justname', 'a/b/c/d', 'a//b', '/a/b']) assert.throws(() => createGitHubHost({ repo: bad, exec: () => '[]' }), /repo must be OWNER\/REPO or HOST\/OWNER\/REPO/, bad);
});

// ---- the gate follows the newest merged pull request of an issue
test('with several merged pull requests for one issue the newest decides, whatever order the list came in', () => {
  const prs = [
    { number: 40, body: 'Closes #5', headRefName: 'task/5-b', headRefOid: 'newer', closingIssues: [5] },
    { number: 12, body: 'Closes #5', headRefName: 'task/5-a', headRefOid: 'older', closingIssues: [5] }
  ];
  const comments = [{ body: '<!-- haku:worker-summary -->' }, { body: '<!-- haku:verified kind=T1 status=pass sha=abc -->' }];
  for (const order of [prs, [...prs].reverse()]) {
    const host = { defaultBranch: () => 'main', listIssues: () => [{ number: 5, state: 'closed', labels: [] }], listMergedPrs: () => order, listComments: () => comments };
    const r = doneCheck(host, 5);
    assert.deepStrictEqual([r.pr, r.prHead], [40, 'newer']);
  }
});
