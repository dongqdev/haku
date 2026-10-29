'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { dependsOn } = require('../scripts/lib/model');
const { buildStatus, renderStatus } = require('../scripts/lib/status');
const { buildTriage, renderTriage, firstSentence } = require('../scripts/lib/triage');

const issue = (number, type, state, body = '', title = `t${number}`) => ({
  number, title, state, body, labels: [{ name: 'haku' }, { name: `type:${type}` }]
});

test('dependsOn reads the Depends-On line and ignores quoted or fenced text', () => {
  assert.deepStrictEqual(dependsOn({ body: 'x\n\nDepends-On: #3, #4\n' }), [3, 4]);
  assert.deepStrictEqual(dependsOn({ body: '```\nDepends-On: #9\n```\n' }), []);
  assert.deepStrictEqual(dependsOn({ body: 'nothing' }), []);
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
  const s = buildStatus(sample(), [{ issue: 4, branch: 'task/4-x', startedAt: 'now' }]);
  assert.deepStrictEqual(s.stories.map(x => [x.number, x.open, x.closed]), [[1, 2, 1], [10, 0, 1]]);
  assert.deepStrictEqual(s.ready.map(x => x.number), [4]);
  assert.deepStrictEqual(s.blocked.map(x => [x.number, x.waitingFor]), [[5, [4]]]);
  assert.deepStrictEqual(s.inProgress.map(x => x.number), [4]);
  assert.deepStrictEqual(s.unattached, [20]);
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

test('triage lists backlog issues and only exact duplicates', () => {
  const issues = [
    issue(1, 'story', 'open'),
    issue(2, 'task', 'open', 'Parent: #1', 'in a story'),
    issue(3, 'task', 'open', '## 배경\n목록이 잘린다. 둘째 문장.', '목록 잘림 감지'),
    issue(4, 'task', 'open', '## 배경\n목록이 잘린다. 다른 설명.', '다른 제목'),
    issue(5, 'task', 'open', '', '목록 잘림 감지'),
    issue(6, 'task', 'closed', '', 'closed one')
  ];
  const t = buildTriage(issues);
  assert.deepStrictEqual(t.backlog.map(b => b.number), [3, 4, 5]);
  const reasons = Object.fromEntries(t.duplicates.map(d => [d.reason, d.issues]));
  assert.deepStrictEqual(reasons['같은 제목'], [3, 5]);
  assert.deepStrictEqual(reasons['본문의 첫 문장이 같음'], [3, 4]);
  assert.match(renderTriage(t), /중복 후보/);
  assert.strictEqual(firstSentence('## h\n\nFirst one. Second.'), 'first one.');
});

test('triage proposes nothing fuzzy: similar but different titles are not duplicates', () => {
  const t = buildTriage([issue(1, 'task', 'open', 'a', 'Fix login bug'), issue(2, 'task', 'open', 'b', 'Fix logout bug')]);
  assert.deepStrictEqual(t.duplicates, []);
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
  assert.match(read('sniff'), /Nothing is created, written or registered here/);
  assert.match(read('sniff'), /Ask at most eight questions/);
  assert.match(read('retro'), /never to the installed copy/);
  assert.match(read('plan'), /Hand over to `\/haku:sniff`/);
});
