'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { markRetroDone, retroDue, retroForStatus } = require('../scripts/lib/retro');
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
  return {
    posted,
    listIssues: () => issues,
    getIssue: n => issues.find(i => i.number === n),
    commentIssue: (n, b) => posted.push({ n, b }),
    listComments: n => comments[n] || []
  };
};

test('markRetroDone posts the marker as the first line, then the notice, then the text', () => {
  const host = fakeHost([issue(1, 'story', 'closed')]);
  const r = markRetroDone(host, 1, '반영 1건, 등록 2건');
  assert.deepStrictEqual(r, { posted: true, story: 1, chars: '반영 1건, 등록 2건'.length });
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
  assert.deepStrictEqual(retroDue(host).map(s => [s.number, s.title]), [[2, 'two'], [9, 't9']]);
});

test('retroDue omits a story with a trusted marker (owner, member, collaborator)', () => {
  for (const assoc of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    assert.deepStrictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker(assoc)] })), [], assoc);
  }
});

test('retroDue still lists the story when the marker is from a stranger or not the first line', () => {
  for (const assoc of ['NONE', 'FIRST_TIME_CONTRIBUTOR', 'CONTRIBUTOR', undefined]) {
    assert.strictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker(assoc)] })).length, 1, String(assoc));
  }
  assert.strictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker('OWNER', `note\n${RETRO_MARKER}\nx`)] })).length, 1);
  assert.strictEqual(retroDue(fakeHost([issue(1, 'story', 'closed')], { 1: [marker('OWNER', `${RETRO_MARKER} same line`)] })).length, 1);
});

test('retroDue ignores open stories, tasks and milestones', () => {
  const host = fakeHost([issue(1, 'story', 'open'), issue(2, 'task', 'closed'), issue(3, 'milestone', 'closed')]);
  assert.deepStrictEqual(retroDue(host), []);
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
  const waiting = renderStatus({ ...buildStatus(issues), retro: retroForStatus(fakeHost(issues)) });
  assert.match(waiting, /retro 대기 2개: #1, #4/);
  const zero = renderStatus({ ...buildStatus(issues), retro: retroForStatus(fakeHost(issues, { 1: [marker('OWNER')], 4: [marker('MEMBER')] })) });
  assert.doesNotMatch(zero, /retro 대기/);
  const broken = fakeHost(issues);
  broken.listComments = () => { throw new Error('boom'); };
  const failed = renderStatus({ ...buildStatus(issues), retro: retroForStatus(broken) });
  assert.match(failed, /retro 대기: 확인하지 못함/);
  assert.doesNotMatch(failed, /retro 대기 0개/);
  assert.doesNotMatch(renderStatus(buildStatus(issues)), /retro 대기/);
  assert.match(read('scripts/issues.js'), /s\.retro = retroForStatus\(h\)/);
});

test('the build and retro skills and both READMEs carry the retro trigger', () => {
  const build = read('skills/build/SKILL.md');
  assert.match(build, /has closed the story, start `\/haku:retro` for that story right away and say so in one sentence/);
  assert.match(build, /`issues\.js retro-due`[^\n]*"retro 대기"/);
  const retro = read('skills/retro/SKILL.md');
  assert.match(retro, /## 4\. Close the loop[\s\S]*issues\.js retro-done --story N --file <summary\.md>(?![\s\S]*\n## )/);
  assert.match(retro, /## 4\. Close the loop/);
  assert.match(read('README.md'), /스토리가 끝나면 그 스토리의 retro가 바로 시작되고[^\n]*`issues\.js retro-due`/);
  assert.match(read('README.en.md'), /A story's retro is started when the story ends, and `issues\.js retro-due` lists the finished stories still waiting/);
});
