'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { dependsOn } = require('../scripts/lib/model');
const { buildStatus, renderStatus } = require('../scripts/lib/status');
const { buildTriage, renderTriage, firstSentence, closeBlocker, closeForTriage } = require('../scripts/lib/triage');
const { parse } = require('../scripts/issues');
const { createGitHubHost } = require('../scripts/lib/github-host');

const issue = (number, type, state, body = '', title = `t${number}`) => ({
  number, title, state, body, labels: [{ name: 'haku' }, { name: `type:${type}` }]
});

test('dependsOn reads the Depends-On line and ignores quoted or fenced text', () => {
  assert.deepStrictEqual(dependsOn({ body: 'x\n\nDepends-On: #3, #4\n' }), [3, 4]);
  assert.deepStrictEqual(dependsOn({ body: '```\nDepends-On: #9\n```\n' }), []);
  assert.deepStrictEqual(dependsOn({ body: 'nothing' }), []);
  // only bare #N of this repository, and remarks in parentheses are not dependencies
  assert.deepStrictEqual(dependsOn({ body: 'Depends-On: other/repo#3' }), []);
  assert.deepStrictEqual(dependsOn({ body: 'Depends-On: #3 (see #12)' }), [3]);
});

function sample() {
  return [
    issue(1, 'story', 'open'),
    issue(2, 'milestone', 'open', 'Parent: #1'),
    issue(3, 'task', 'closed', 'Parent: #2'),
    issue(4, 'task', 'open', 'Parent: #2\nDepends-On: #3'),
    issue(5, 'task', 'open', 'Parent: #2\nDepends-On: #4'),
    // a story whose only child is closed but which stayed open
    issue(10, 'story', 'open'),
    issue(11, 'milestone', 'closed', 'Parent: #10'),
    issue(12, 'task', 'closed', 'Parent: #11'),
    issue(20, 'task', 'open', 'no parent')
  ];
}

test('status counts tasks per story and separates ready from blocked', () => {
  const s = buildStatus(sample());
  assert.deepStrictEqual(s.stories.map(x => [x.number, x.open, x.closed]), [[1, 2, 1], [10, 0, 1]]);
  assert.deepStrictEqual(s.ready.map(x => x.number), [4]);
  assert.deepStrictEqual(s.blocked.map(x => [x.number, x.waitingFor]), [[5, [4]]]);
  assert.deepStrictEqual(s.unattached, [20]);
});

test('a task with a running worker is in progress and is not offered as ready', () => {
  const s = buildStatus(sample(), [{ issue: 4, branch: 'task/4-x', startedAt: 'now' }]);
  assert.deepStrictEqual(s.inProgress.map(x => x.number), [4]);
  assert.deepStrictEqual(s.ready.map(x => x.number), []);
  // its dependent task still waits for it
  assert.deepStrictEqual(s.blocked.map(x => x.number), [5]);
});

test('open tasks under a closed story are reported apart, and closed unattached tasks are ignored', () => {
  const s = buildStatus([
    issue(1, 'story', 'closed'),
    issue(2, 'task', 'open', 'Parent: #1'),
    issue(3, 'task', 'closed', 'no parent'),
    issue(4, 'task', 'open', 'no parent')
  ]);
  assert.deepStrictEqual(s.underClosedStory, [2]);
  assert.deepStrictEqual(s.ready, []);
  assert.deepStrictEqual(s.unattached, [4]);
  assert.match(renderStatus(s), /닫힌 스토리 아래의 열린 태스크: #2/);
});

test('status reports parents left open although every child is closed', () => {
  const s = buildStatus(sample());
  assert.deepStrictEqual(s.incompleteClose.map(x => [x.number, x.type]), [[10, 'story']]);
});

test('a dependency on an unknown issue blocks instead of being ignored', () => {
  const s = buildStatus([issue(1, 'story', 'open'), issue(2, 'task', 'open', 'Parent: #1\nDepends-On: #99')]);
  assert.deepStrictEqual(s.blocked[0].waitingFor, [99]);
});

test('the rendered status always prints all five sections, empty ones as (없음)', () => {
  const text = renderStatus(buildStatus([]));
  const headings = ['스토리 진행', '지금 시작할 수 있음', '막힘', '진행 중(워커)', '마감 미완'];
  for (const h of headings) assert.ok(text.includes('### ' + h), h);
  assert.strictEqual((text.match(/\(없음\)/g) || []).length, 5);
});

test('triage lists the backlog (including unlabelled issues) and only exact duplicates', () => {
  const issues = [
    issue(1, 'story', 'open'),
    issue(2, 'task', 'open', 'Parent: #1', 'in a story'),
    issue(3, 'task', 'open', '## 배경\n이슈 목록이 상한에서 조용히 잘린다. 둘째 문장.', '목록 잘림 감지'),
    issue(4, 'task', 'open', '## 배경\n이슈 목록이 상한에서 조용히 잘린다. 다른 설명.', '다른 제목'),
    issue(5, 'task', 'open', '', '목록 잘림 감지'),
    issue(6, 'task', 'closed', '', 'closed one'),
    { number: 7, title: 'someone filed this by hand', body: '', state: 'open', labels: [] }
  ];
  const t = buildTriage(issues);
  assert.deepStrictEqual(t.backlog.map(b => b.number), [3, 4, 5, 7]);
  const reasons = Object.fromEntries(t.duplicates.map(d => [d.reason, d.issues]));
  assert.deepStrictEqual(reasons['같은 제목'], [3, 5]);
  assert.deepStrictEqual(reasons['본문의 첫 문장이 같음'], [3, 4]);
  assert.match(renderTriage(t), /중복 후보/);
});

test('planned tasks of different stories are never duplicates of each other (the reported false positive)', () => {
  const issues = [];
  let n = 1;
  for (const story of [1, 2]) {
    const s = n++;
    const m = n++;
    issues.push(issue(s, 'story', 'open'), issue(m, 'milestone', 'open', `Parent: #${s}`));
    for (const title of ['Add tests', 'Implement it']) {
      issues.push(issue(n++, 'task', 'open', `## Acceptance\n- [ ] npm test passes\n\n## Harness\nParent: #${m}`, title));
    }
  }
  const t = buildTriage(issues);
  assert.deepStrictEqual(t.backlog, []);
  assert.deepStrictEqual(t.duplicates, []);
});

test('the opening sentence skips comments, code, quotes, bold template labels and short lines', () => {
  assert.strictEqual(firstSentence('<!--\nPlease describe\n-->\n로그인이 두 번째 시도에서만 실패합니다. 이어서.'), '로그인이 두 번째 시도에서만 실패합니다.');
  assert.strictEqual(firstSentence('```\ncode here and more\n```\n> a quoted line that is long\nThe real sentence is here. More.'), 'the real sentence is here.');
  assert.strictEqual(firstSentence('**Describe the bug**\nThe button does nothing when clicked.'), 'the button does nothing when clicked.');
  assert.strictEqual(firstSentence('**Describe the bug**'), '');
  assert.strictEqual(firstSentence('Too short.'), '');
  assert.strictEqual(firstSentence('## h\n\nFirst one is long enough. Second.'), 'first one is long enough.');
});

test('two issues from the same template do not become duplicates through the template line', () => {
  const body = n => `**Describe the bug**\n\nSomething different happened in case ${n}. Details.`;
  const t = buildTriage([
    { number: 1, title: 'a', body: body(1), state: 'open', labels: [] },
    { number: 2, title: 'b', body: body(2), state: 'open', labels: [] }
  ]);
  assert.deepStrictEqual(t.duplicates, []);
});

test('similar but different titles are not duplicates', () => {
  const t = buildTriage([issue(1, 'task', 'open', 'a', 'Fix login bug'), issue(2, 'task', 'open', 'b', 'Fix logout bug')]);
  assert.deepStrictEqual(t.duplicates, []);
});

test('a milestone without a Parent line is still not backlog', () => {
  const t = buildTriage([issue(1, 'milestone', 'open'), issue(2, 'story', 'open'), issue(3, 'task', 'open')]);
  assert.deepStrictEqual(t.backlog.map(b => b.number), [3]);
});

test('triage never offers stories, milestones or planned tasks for closing', () => {
  assert.match(closeBlocker(issue(1, 'story', 'open')), /story/);
  assert.match(closeBlocker(issue(2, 'milestone', 'open', 'Parent: #1')), /milestone/);
  assert.match(closeBlocker(issue(3, 'task', 'open', 'Parent: #2')), /belongs to #2/);
  assert.match(closeBlocker(issue(4, 'task', 'closed')), /already closed/);
  assert.strictEqual(closeBlocker(issue(5, 'task', 'open', 'standalone')), null);
  assert.strictEqual(closeBlocker({ number: 6, title: 'x', body: '', state: 'open', labels: [] }), null);
});

test('issue-close requires a reason', () => {
  const cli = path.join(__dirname, '..', 'scripts', 'issues.js');
  const r = spawnSync(process.execPath, [cli, 'issue-close', '--issue', '5'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--reason/);
});

test('the new skills describe their safety rules', () => {
  const read = n => fs.readFileSync(path.join(__dirname, '..', 'skills', n, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(read('status'), /Read-only/);
  assert.match(read('triage'), /nothing is closed without the user's confirmation/);
  assert.match(read('triage'), /--reason/);
  assert.match(read('sniff'), /Nothing is created on GitHub and no repository is touched here/);
  assert.match(read('sniff'), /Ask at most eight questions \*\*in total, counting any asked after the summary\*\*/);
  assert.match(read('sniff'), /At most two revision rounds/);
  assert.match(read('sniff'), /never beyond the eight-question total/);
  assert.match(read('plan'), /\.haku\/drafts\/\*\.goal\.md/);
  assert.match(read('plan'), /use exactly that file/);
  assert.match(read('plan'), /never assume the newest is current/);
  assert.match(read('plan'), /\.haku\/drafts\/done\//);
  assert.match(read('retro'), /never to the installed copy/);
  assert.match(read('plan'), /Hand over to `\/haku:sniff`/);
});

test('a value flag without a value is rejected instead of swallowing the next flag', () => {
  assert.throws(() => parse(['issue-close', '--issue', '7', '--reason', '--repo', 'o/r']), /--reason needs a value/);
  assert.throws(() => parse(['issue-close', '--issue', '7', '--reason']), /--reason needs a value/);
  assert.strictEqual(parse(['issue-close', '--issue', '7', '--reason', 'dup']).reason, 'dup');
});

function fakeExec(handlers) {
  const calls = [];
  const exec = (bin, args) => {
    calls.push(args);
    const key = args.slice(0, 2).join(' ');
    if (handlers[key] === undefined) throw new Error('unexpected gh call: ' + key);
    return handlers[key];
  };
  return { exec, calls };
}

test('the host closes triage issues as "not planned" and merged work as "completed"', () => {
  const { exec, calls } = fakeExec({ 'issue comment': '', 'issue close': '' });
  const host = createGitHubHost({ repo: 'o/r', exec });
  host.closeIssue(5, 'c', 'not planned');
  host.closeIssue(6, 'c');
  const reasons = calls.filter(a => a[1] === 'close').map(a => a[a.indexOf('--reason') + 1]);
  assert.deepStrictEqual(reasons, ['not planned', 'completed']);
});

test('the host reads the whole open backlog (no label filter) and one issue by number', () => {
  const calls = [];
  const exec = (bin, args) => {
    calls.push(args);
    if (args[0] === 'api') return JSON.stringify([{ number: 1, title: 't', body: null, state: 'open', labels: [], assignees: [] }]);
    return JSON.stringify({ number: 2, title: 't', body: '', state: 'CLOSED', labels: [] });
  };
  const host = createGitHubHost({ repo: 'o/r', exec });
  const backlog = host.listBacklog();
  assert.strictEqual(backlog[0].state, 'open');
  assert.strictEqual(backlog[0].body, '');
  assert.ok(!calls[0].join(' ').includes('labels='), 'the backlog must not be limited to labelled issues');
  assert.strictEqual(host.getIssue(2).state, 'closed');
});

function fakeIssueHost(issues) {
  const closed = [];
  return {
    closed,
    getIssue: n => { const i = issues.find(x => x.number === n); if (!i) throw new Error('not found'); return i; },
    closeIssue: (n, comment, reason) => closed.push({ n, comment, reason })
  };
}

test('closeForTriage closes a backlog issue as not planned with the reason written on it', () => {
  const host = fakeIssueHost([issue(5, 'task', 'open', 'standalone')]);
  closeForTriage(host, 5, ' duplicate of #3 ');
  assert.deepStrictEqual(host.closed, [{ n: 5, comment: 'Closed by haku triage: duplicate of #3', reason: 'not planned' }]);
});

test('closeForTriage closes nothing it must not: unknown, closed, planned, story, or without a reason', () => {
  const host = fakeIssueHost([
    issue(1, 'story', 'open'), issue(2, 'task', 'open', 'Parent: #1'), issue(3, 'task', 'closed'), issue(4, 'task', 'open')
  ]);
  assert.throws(() => closeForTriage(host, 99, 'x'), /not found/);
  assert.throws(() => closeForTriage(host, 3, 'x'), /already closed/);
  assert.throws(() => closeForTriage(host, 2, 'x'), /belongs to #1/);
  assert.throws(() => closeForTriage(host, 1, 'x'), /story/);
  assert.throws(() => closeForTriage(host, 4, '   '), /reason is required/);
  assert.deepStrictEqual(host.closed, []);
});

test('getIssue asks for the url (the real gh answers only the fields it is asked for), lowercases the state and keeps label objects', () => {
  const everything = { number: 9, title: 't', body: null, state: 'OPEN', url: 'https://github.com/o/r/issues/9', labels: [{ name: 'haku', color: 'x' }], assignees: [] };
  // like gh: only the requested --json fields come back
  const exec = (bin, args) => {
    const wanted = args[args.indexOf('--json') + 1].split(',');
    return JSON.stringify(Object.fromEntries(wanted.map(k => [k, everything[k]])));
  };
  const i = createGitHubHost({ repo: 'o/r', exec }).getIssue(9);
  assert.strictEqual(i.state, 'open');
  assert.strictEqual(i.url, 'https://github.com/o/r/issues/9');
  assert.strictEqual(i.labels[0].name, 'haku');
});

test('the build skill explains the reconcile warnings that hold a parent back', () => {
  const fs = require('fs');
  const path = require('path');
  const build = fs.readFileSync(path.join(__dirname, '..', 'skills', 'build', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(build, /`child-not-listed` or `child-not-done`/);
  assert.match(build, /never close such a parent by hand/);
});
