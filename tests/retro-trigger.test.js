'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { markRetroDone, retroDue, retroForStatus, renderRetroDue } = require('../scripts/lib/retro');
const { createGitHubHost } = require('../scripts/lib/github-host');
const { parse } = require('../scripts/issues');
const { RETRO_MARKER } = require('../scripts/lib/model');
const { buildStatus, renderStatus } = require('../scripts/lib/status');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const run = args => spawnSync(process.execPath, [path.join(root, 'scripts', 'issues.js'), ...args], { encoding: 'utf8' });

const issue = (number, type, state, title = `t${number}`) => ({ number, title, state, labels: [{ name: 'haku' }, { name: `type:${type}` }], body: 'x' });
const marker = (assoc, body = `${RETRO_MARKER}\nsummary`) => ({ body, authorAssociation: assoc });
// issues: all haku issues; comments: number -> comment list
const fakeHost = (issues, comments = {}) => {
  const posted = [];
  const host = {
    posted,
    listIssues: () => { host.listCalls += 1; return issues; },
    getIssue: n => issues.find(i => i.number === n),
    // a posted comment is readable afterwards, written by `poster` (OWNER unless the test says otherwise)
    commentIssue: (n, b) => { posted.push({ n, b }); comments[n] = [...(comments[n] || []), { body: b, authorAssociation: host.poster }]; },
    listComments: n => comments[n] || [],
    poster: 'OWNER',
    listCalls: 0
  };
  return host;
};

test('markRetroDone posts the marker as the first line, then the notice, then the text', () => {
  const host = fakeHost([issue(1, 'story', 'closed')]);
  const r = markRetroDone(host, 1, '반영 1건, 등록 2건');
  assert.deepStrictEqual(r, { posted: true, counted: true, story: 1, skipped: false, chars: '반영 1건, 등록 2건'.length });
  assert.strictEqual(host.posted.length, 1);
  assert.ok(host.posted[0].b.startsWith(`${RETRO_MARKER}\n> `));
  assert.match(host.posted[0].b, /회고\(retro\)를 마쳤습니다/);
  assert.ok(host.posted[0].b.endsWith('\n\n반영 1건, 등록 2건'));
});

test('markRetroDone refuses a non-story, an open story, empty or long text, and flagged text', () => {
  const none = h => assert.strictEqual(h.posted.length, 0);
  let h = fakeHost([issue(2, 'task', 'closed')]);
  assert.throws(() => markRetroDone(h, 2, 'ok'), /not a story/); none(h);
  h = fakeHost([issue(3, 'milestone', 'closed')]);
  assert.throws(() => markRetroDone(h, 3, 'ok'), /not a story/); none(h);
  h = fakeHost([issue(4, 'story', 'open')]);
  assert.throws(() => markRetroDone(h, 4, 'ok'), /not closed/); none(h);
  h = fakeHost([issue(5, 'story', 'closed')]);
  assert.throws(() => markRetroDone(h, 5, '  \n '), /empty/);
  assert.throws(() => markRetroDone(h, 5, 'x'.repeat(20001)), /longer than 20000/);
  assert.throws(() => markRetroDone(h, 5, 'ok\ntoken ghp_' + 'a'.repeat(30)), /line 2: looks like a GitHub token/);
  assert.throws(() => markRetroDone(h, 5, 'see /home/' + 'alice/project/file'), /names a personal path/);
  none(h);
  assert.doesNotThrow(() => markRetroDone(h, 5, 'x'.repeat(20000)));
});

test('retroDue lists a closed story without a marker, ordered by number', () => {
  const host = fakeHost([issue(9, 'story', 'closed'), issue(2, 'story', 'closed', 'two')]);
  assert.deepStrictEqual(retroDue(host).due.map(s => [s.number, s.title]), [[2, 'two'], [9, 't9']]);
});

test('retroDue omits a story with a trusted marker (owner, member, collaborator)', () => {
  for (const assoc of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    assert.deepStrictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker(assoc)] })).due, [], assoc);
  }
});

test('retroDue still lists the story when the marker is from a stranger or not the first line', () => {
  for (const assoc of ['NONE', 'FIRST_TIME_CONTRIBUTOR', 'CONTRIBUTOR', undefined]) {
    assert.strictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker(assoc)] })).due.length, 1, String(assoc));
  }
  assert.strictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker('OWNER', `note\n${RETRO_MARKER}\nx`)] })).due.length, 1);
  assert.strictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker('OWNER', `${RETRO_MARKER} same line`)] })).due.length, 1);
});

test('retroDue ignores open stories, tasks and milestones', () => {
  const host = fakeHost([issue(1, 'story', 'open'), issue(2, 'task', 'closed'), issue(3, 'milestone', 'closed')]);
  assert.deepStrictEqual(retroDue(host).due, []);
});

test('the CLI help lists both commands, and retro-done without --story or --file fails', () => {
  const help = run(['--help']).stdout;
  assert.match(help, /issues\.js retro-done --story <N> --file <summary\.md>/);
  assert.match(help, /issues\.js retro-due \[--json\]/);
  assert.match(help, /^retro-done /m);
  assert.match(help, /^retro-due /m);
  const a = run(['retro-done']);
  assert.strictEqual(a.status, 1);
  assert.match(a.stderr, /--story <N> is required/);
  assert.match(run(['retro-done', '--story', 'abc', '--file', 'x']).stderr, /--story <N> is required/);
  for (const bad of ['0', '1.5', '1e2', '0x10']) assert.match(run(['retro-done', '--story', bad, '--file', 'x']).stderr, /--story <N> is required/, bad);
  assert.match(run(['retro-done', '--story', '5']).stderr, /--file <summary\.md> is required/);
});

test('status shows the number of stories waiting for a retro, nothing for zero, and "not checked" when the read fails', () => {
  const issues = [issue(1, 'story', 'closed'), issue(4, 'story', 'closed')];
  const waiting = renderStatus({ ...buildStatus(issues), retro: retroForStatus(fakeHost(issues), issues) });
  assert.match(waiting, /retro 대기 2개: #1, #4/);
  const zero = renderStatus({ ...buildStatus(issues), retro: retroForStatus(fakeHost(issues, { 1: [marker('OWNER')], 4: [marker('MEMBER')] }), issues) });
  assert.doesNotMatch(zero, /retro 대기/);
  const broken = fakeHost(issues);
  broken.listComments = () => { throw new Error('boom'); };
  const failed = renderStatus({ ...buildStatus(issues), retro: retroForStatus(broken, issues) });
  assert.match(failed, /확인하지 못함 #1 \(boom\), #4 \(boom\)/);
  assert.doesNotMatch(failed, /retro 대기 \d+개/);
  const listFail = fakeHost(issues);
  listFail.listIssues = () => { throw new Error('no list'); };
  assert.match(renderStatus({ ...buildStatus(issues), retro: retroForStatus(listFail) }), /retro 대기: 확인하지 못함 \(no list\)/);
  assert.doesNotMatch(failed, /retro 대기 0개/);
  assert.doesNotMatch(renderStatus(buildStatus(issues)), /retro 대기/);
  assert.match(read('scripts/issues.js'), /s\.retro = retroForStatus\(h, issues\)/);
});

test('the build and retro skills and both READMEs carry the retro trigger', () => {
  const build = read('skills/build/SKILL.md');
  assert.match(build, /has closed the story, start `\/haku:retro` for that story right away, passing the story number and the repository the story lives in/);
  assert.match(build, /and say so in one sentence/);
  assert.match(build, /`issues\.js retro-due`[^\n]*"retro 대기"/);
  assert.match(build, /"cannot run now" only when this session cannot reach the repository where haku's skills would be improved, or the user says not now; then say "retro 대기" and stop, do not guess/);
  assert.match(build, /Reopening a story after its retro does not make it wait again \(the marker stays\)/);
  assert.match(build, /a retro the user stops halfway leaves no marker \(the story stays due\)/);
  const retro = read('skills/retro/SKILL.md');
  assert.match(retro, /## 4\. Close the loop[\s\S]*issues\.js retro-done --story N --file <summary\.md> \[--repo <owner\/repo>\]/);
  assert.match(retro, /A retro is about ONE story\. `\/haku:retro` takes the story number N/);
  assert.match(retro, /Gather reads the closed children \(tasks and milestones\) of that story/);
  assert.match(retro, /which closed story from `issues\.js retro-due` it is for, with a last option "none: a general retro without a marker" \(then step 4 does not run `retro-done`\)/);
  assert.match(retro, /`--repo` must name the repository the story lives in whenever it is not the current checkout's repository/);
  assert.match(retro, /issues\.js retro-done --story N --skip --reason "<the user's reason>" --user-approved/);
  assert.match(retro, /A story closed as not planned never waits for a retro/);
  assert.match(read('README.md'), /스토리가 끝나면 그 스토리의 retro가 바로 시작되고[^\n]*`issues\.js retro-due`/);
  assert.match(read('README.en.md'), /A story's retro is started when the story ends, and `issues\.js retro-due` lists the finished stories still waiting/);
});

test('retroDue: a story whose comments cannot be read is unreadable, not due and not hidden; the others are still listed', () => {
  const issues = [issue(1, 'story', 'closed'), issue(2, 'story', 'closed'), issue(3, 'story', 'closed')];
  const host = fakeHost(issues, { 3: [marker('OWNER')] });
  const read2 = host.listComments;
  host.listComments = n => { if (n === 2) throw new Error('rate limited'); return read2(n); };
  const r = retroDue(host);
  assert.deepStrictEqual(r.due.map(x => x.number), [1]);
  assert.deepStrictEqual(r.unreadable, [{ number: 2, error: 'rate limited' }]);
});

test('retroDue skips a story closed as not planned and lists one closed as completed; it reuses a given issue list', () => {
  const issues = [{ ...issue(1, 'story', 'closed'), stateReason: 'not_planned' }, { ...issue(2, 'story', 'closed'), stateReason: 'completed', closedAt: '2026-01-02T00:00:00Z' }];
  const host = fakeHost([]);
  const r = retroDue(host, issues);
  assert.deepStrictEqual(r.due, [{ number: 2, title: 't2', closedAt: '2026-01-02T00:00:00Z' }]);
  assert.strictEqual(host.listCalls, 0);
});

test('a marker with a CRLF first line or a byte order mark in front does not count', () => {
  const bom = String.fromCharCode(0xFEFF);
  for (const body of [`${RETRO_MARKER}\r\nsummary`, `${bom}${RETRO_MARKER}\nsummary`]) {
    assert.strictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker('OWNER', body)] })).due.length, 1);
  }
});

test('retro-due output: due lines on stdout, unreadable lines on stderr, exit code 3 only when something was unreadable', () => {
  const ok = renderRetroDue({ due: [{ number: 4, title: 'four', closedAt: '2026-02-01' }, { number: 5, title: 'five', closedAt: null }], unreadable: [] }, false);
  assert.strictEqual(ok.stdout, '#4 four (closed 2026-02-01)\n#5 five\n');
  assert.strictEqual(ok.stderr, '');
  assert.strictEqual(ok.code, 0);
  assert.strictEqual(renderRetroDue({ due: [], unreadable: [] }, false).stdout, 'no stories wait for a retro\n');
  const bad = renderRetroDue({ due: [{ number: 4, title: 'four', closedAt: null }], unreadable: [{ number: 7, error: 'boom' }] }, false);
  assert.strictEqual(bad.stdout, '#4 four\n');
  assert.strictEqual(bad.stderr, '읽지 못함 #7: boom\n');
  assert.strictEqual(bad.code, 3);
  assert.notStrictEqual(renderRetroDue({ due: [], unreadable: [{ number: 7, error: 'boom' }] }, false).stdout, 'no stories wait for a retro\n');
  const j = renderRetroDue({ due: [], unreadable: [{ number: 7, error: 'boom' }] }, true);
  assert.deepStrictEqual(JSON.parse(j.stdout), { due: [], unreadable: [{ number: 7, error: 'boom' }] });
  assert.match(read('scripts/issues.js'), /renderRetroDue\(retroDue\(host\(\)\), opts\.json\)[\s\S]*return r\.code/);
});

test('markRetroDone refuses a second marker, and a stranger marker does not block it', () => {
  const host = fakeHost([issue(1, 'story', 'closed')]);
  markRetroDone(host, 1, 'first');
  assert.throws(() => markRetroDone(host, 1, 'second'), /already has a retro marker/);
  assert.strictEqual(host.posted.length, 1);
  const stranger = fakeHost([issue(2, 'story', 'closed')], { 2: [marker('NONE')] });
  assert.strictEqual(markRetroDone(stranger, 2, 'mine').posted, true);
});

test('a skipped retro needs a one-line reason, posts the marker with the reason, and the story leaves retro-due', () => {
  const host = fakeHost([issue(1, 'story', 'closed')]);
  assert.throws(() => markRetroDone(host, 1, '', { skipped: true }), /needs a reason/);
  assert.throws(() => markRetroDone(host, 1, '', { skipped: true, reason: '   ' }), /needs a reason/);
  assert.throws(() => markRetroDone(host, 1, '', { skipped: true, reason: 'a\nb' }), /one line/);
  assert.throws(() => markRetroDone(host, 1, '', { skipped: true, reason: 'token ghp_' + 'a'.repeat(30) }), /looks like a GitHub token/);
  assert.strictEqual(host.posted.length, 0);
  assert.strictEqual(retroDue(host).due.length, 1);
  const r = markRetroDone(host, 1, '', { skipped: true, reason: '기능 이전에 닫힘' });
  assert.strictEqual(r.skipped, true);
  assert.ok(host.posted[0].b.startsWith(`${RETRO_MARKER}\n> `));
  assert.ok(host.posted[0].b.endsWith('\n\nretro를 하지 않기로 했습니다: 기능 이전에 닫힘'));
  assert.deepStrictEqual(retroDue(host).due, []);
});

test('markRetroDone warns when the marker does not count because the posting account is not trusted', () => {
  const host = fakeHost([issue(1, 'story', 'closed')]);
  host.poster = 'NONE';
  const r = markRetroDone(host, 1, 'x');
  assert.strictEqual(r.counted, false);
  assert.match(r.warning, /does not count: the posting account is not an owner, member or collaborator/);
  assert.strictEqual(retroDue(host).due.length, 1);
  assert.strictEqual(markRetroDone(fakeHost([issue(2, 'story', 'closed')]), 2, 'x').warning, undefined);
});

test('retroForStatus lists the issues once, not again per story, and fails as { error } only when the issue list fails', () => {
  const issues = [issue(1, 'story', 'closed'), issue(2, 'story', 'closed')];
  const host = fakeHost(issues);
  const passed = retroForStatus(host, issues);
  assert.strictEqual(host.listCalls, 0, 'a given list is used as it is');
  assert.deepStrictEqual(passed, { due: [1, 2], unreadable: [] });
  retroForStatus(host);
  assert.strictEqual(host.listCalls, 1);
  const bad = fakeHost(issues);
  bad.listIssues = () => { throw new Error('down'); };
  assert.deepStrictEqual(retroForStatus(bad), { error: 'down' });
  assert.match(read('scripts/issues.js'), /const issues = h\.listIssues\(\);[\s\S]{0,300}retroForStatus\(h, issues\)/);
});

test('status output names an unreadable story with its error and never shows zero or nothing for it', () => {
  const text = renderStatus({ ...buildStatus([]), retro: { due: [3], unreadable: [{ number: 8, error: 'rate limited' }] } });
  assert.match(text, /retro 대기 1개: #3/);
  assert.match(text, /확인하지 못함 #8 \(rate limited\)/);
  const only = renderStatus({ ...buildStatus([]), retro: { due: [], unreadable: [{ number: 8, error: 'x' }] } });
  assert.match(only, /확인하지 못함 #8 \(x\)/);
  assert.doesNotMatch(only, /retro 대기 0개/);
});

test('parse keeps --story as before for other commands and retro-done validates a plain positive integer', () => {
  for (const raw of ['05', '+5', ' 5', 'abc', '1e2']) {
    const o = parse(['branch-protection', '--story', raw]);
    assert.ok(Object.is(o.story, Number(raw)), raw);
    assert.strictEqual(o.storyRaw, raw);
  }
  for (const raw of ['05', '+5', ' 5', '0', '1.5', 'abc']) {
    const r = run(['retro-done', '--story', raw, '--file', 'x']);
    assert.strictEqual(r.status, 1, raw);
    assert.match(r.stderr, /--story <N> is required \(a plain positive integer\)/, raw);
  }
});

test('retro-done --skip needs --reason and --user-approved, and --repo is in the help of both retro commands', () => {
  const a = run(['retro-done', '--story', '5', '--skip', '--user-approved']);
  assert.match(a.stderr, /--reason <text> is required with --skip/);
  const b = run(['retro-done', '--story', '5', '--skip', '--reason', 'old story']);
  assert.match(b.stderr, /--user-approved is required with --skip/);
  const help = run(['--help']).stdout;
  assert.match(help, /issues\.js retro-done --story <N> --file <summary\.md> \[--repo <owner\/repo>\]/);
  assert.match(help, /issues\.js retro-done --story <N> --skip --reason <text> --user-approved \[--repo <owner\/repo>\]/);
  assert.match(help, /issues\.js retro-due \[--json\] \[--repo <owner\/repo>\]/);
});

test('issueShape returns closedAt and stateReason from a REST-shaped issue', () => {
  const rest = { number: 1, title: 't', body: 'b', state: 'closed', closed_at: '2026-03-01T00:00:00Z', state_reason: 'NOT_PLANNED', labels: [], assignees: [] };
  const exec = (bin, args) => (args[0] === 'repo' ? JSON.stringify({ nameWithOwner: 'o/r' }) : JSON.stringify(args[1].includes('page=1') ? [rest, { ...rest, number: 2, closed_at: undefined, state_reason: null, state: 'open' }] : []));
  const [a, b] = createGitHubHost({ repo: 'o/r', exec, perPage: 100 }).listIssues();
  assert.strictEqual(a.closedAt, '2026-03-01T00:00:00Z');
  assert.strictEqual(a.stateReason, 'not_planned');
  assert.strictEqual(b.closedAt, null);
  assert.strictEqual(b.stateReason, null);
});
