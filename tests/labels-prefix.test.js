'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { labelStyle, withPrefix, stripPrefix, BASE_LABEL, typeLabel, ownerLabel } = require('../scripts/lib/model');
const { publish } = require('../scripts/lib/publish');
const { buildTriage } = require('../scripts/lib/triage');
const { createGitHubHost } = require('../scripts/lib/github-host');

const verify = { kind: 'T1', profile: 'unit' };
const draft = () => ({
  assignee: 'dongq',
  sprint: '2026-S10',
  story: { id: 'S', title: 'Login', verify },
  milestones: [{ id: 'M1', title: 'Backend', verify, tasks: [{ id: 'T1', title: 'Model', acceptance: ['a'], scope: ['src/**'], verify }] }]
});

function fakeHost() {
  const issues = [];
  return {
    issues,
    ensureLabels: () => {},
    createIssue: ({ title, body, labels, assignee }) => {
      issues.push({ number: issues.length + 1, title, body, labels, assignee });
      return issues.length;
    },
    updateIssueBody: () => {}
  };
}

test('every haku label has its own colour and a description', () => {
  const names = [BASE_LABEL, typeLabel('story'), typeLabel('milestone'), typeLabel('task'), 'sprint:2026-S10', ownerLabel('x')];
  const colors = names.map(n => labelStyle(n).color);
  assert.strictEqual(new Set(colors).size, names.length, 'colours must be distinct');
  for (const n of names) {
    assert.match(labelStyle(n).color, /^[0-9A-F]{6}$/);
    assert.ok(labelStyle(n).description.length > 0, n);
  }
  assert.strictEqual(labelStyle('sprint:anything').color, labelStyle('sprint:2026-S01').color);
});

// GitHub shows white label text when the perceived lightness is below 0.453, black otherwise. A margin
// keeps every colour clearly on the white side.
test('every haku label is dark enough for white text on GitHub', () => {
  const lightness = hex => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const n of [BASE_LABEL, typeLabel('story'), typeLabel('milestone'), typeLabel('task'), 'sprint:2026-S10', ownerLabel('x')]) {
    assert.ok(lightness(labelStyle(n).color) < 0.44, `${n} ${labelStyle(n).color} is too light for white text`);
  }
});

test('an unknown label keeps the neutral grey', () => {
  assert.deepStrictEqual(labelStyle('bug'), { color: 'ededed', description: '' });
});

test('the kind prefix is added once and never doubled', () => {
  assert.strictEqual(withPrefix('story', 'Login'), '[Story] Login');
  assert.strictEqual(withPrefix('milestone', 'Backend'), '[Milestone] Backend');
  assert.strictEqual(withPrefix('task', 'Model'), '[Task] Model');
  assert.strictEqual(withPrefix('task', '[Task] Model'), '[Task] Model');
  assert.strictEqual(withPrefix('task', '[task]   Model'), '[Task] Model');
  assert.strictEqual(stripPrefix('[Milestone] Backend'), 'Backend');
  assert.strictEqual(stripPrefix('Backend'), 'Backend');
  assert.strictEqual(stripPrefix('[Other] kept'), '[Other] kept');
});

test('publish prefixes every title by default', () => {
  const host = fakeHost();
  publish(host, draft(), { apply: true });
  assert.deepStrictEqual(host.issues.map(i => i.title), ['[Story] Login', '[Milestone] Backend', '[Task] Model']);
});

test('publish leaves titles alone when the prefix is switched off', () => {
  const host = fakeHost();
  publish(host, draft(), { apply: true, titlePrefix: false });
  assert.deepStrictEqual(host.issues.map(i => i.title), ['Login', 'Backend', 'Model']);
});

test('a title that already has a prefix is not prefixed twice by publish', () => {
  const host = fakeHost();
  const d = draft();
  d.story.title = '[Story] Login';
  publish(host, d, { apply: true });
  assert.strictEqual(host.issues[0].title, '[Story] Login');
});

test('the host creates labels with the colour and description of their style', () => {
  const calls = [];
  const exec = (bin, args) => { calls.push(args); return ''; };
  const host = createGitHubHost({ repo: 'o/r', exec });
  host.ensureLabels([typeLabel('task'), 'bug']);
  const task = calls[0];
  assert.deepStrictEqual(task.slice(0, 3), ['label', 'create', 'type:task']);
  assert.strictEqual(task[task.indexOf('--color') + 1], 'C75B00');
  assert.strictEqual(task[task.indexOf('--description') + 1], 'Task: what one worker does');
  assert.ok(task.includes('--force'));
  const bug = calls[1];
  assert.strictEqual(bug[bug.indexOf('--color') + 1], 'ededed');
  assert.ok(!bug.includes('--description'), 'no empty description is sent');
});

test('triage finds a duplicate title even when only one copy carries the prefix', () => {
  const issue = (n, title) => ({ number: n, title, body: '', state: 'open', labels: [{ name: 'haku' }, { name: 'type:task' }] });
  const t = buildTriage([issue(1, '[Task] Add retries to the client'), issue(2, 'Add retries to the client')]);
  assert.deepStrictEqual(t.duplicates.map(d => d.issues), [[1, 2]]);
});
