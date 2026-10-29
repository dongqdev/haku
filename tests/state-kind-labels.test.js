'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { baseLabelDefinitions, WORK_KINDS, STATE_LABELS } = require('../scripts/lib/model');
const { planLabelChange, ensureBaseLabels } = require('../scripts/lib/labels');
const { publish, validateDraft } = require('../scripts/lib/publish');
const { createGitHubHost } = require('../scripts/lib/github-host');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const issue = (...labels) => ({ labels: labels.map(name => ({ name })) });

test('the base labels cover haku, type, kind and state, each with its own colour and a description', () => {
  const defs = baseLabelDefinitions();
  const names = defs.map(d => d.name);
  for (const n of ['haku', 'type:story', 'type:milestone', 'type:task', ...WORK_KINDS.map(k => `kind:${k}`), ...STATE_LABELS]) {
    assert.ok(names.includes(n), `${n} missing`);
  }
  assert.strictEqual(new Set(defs.map(d => d.color)).size, defs.length, 'colours must be distinct');
  for (const d of defs) {
    assert.match(d.color, /^[0-9A-F]{6}$/);
    assert.ok(d.description.length > 0, d.name);
    // dark enough for GitHub to print white label text (perceived lightness below 0.453)
    const c = [0, 2, 4].map(i => parseInt(d.color.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    assert.ok(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 0.453, `${d.name} is too light`);
  }
});

test('labels --json prints parseable JSON of the definitions', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'issues.js'), 'labels', '--json'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), baseLabelDefinitions());
});

test('setup creates exactly the labels the code defines, with their colours and descriptions', () => {
  const created = [];
  const exec = (bin, args) => {
    if (args[0] === 'label' && args[1] === 'create') {
      created.push({ name: args[2], color: args[args.indexOf('--color') + 1], description: args[args.indexOf('--description') + 1] });
    }
    return '';
  };
  ensureBaseLabels(createGitHubHost({ repo: 'o/r', exec }));
  assert.deepStrictEqual(created, baseLabelDefinitions());
  assert.match(read('skills', 'setup', 'SKILL.md'), /Labels are created with `issues\.js labels --apply`/);
});

test('label change: only state and kind labels may be touched', () => {
  for (const bad of ['haku', 'type:task', 'sprint:2026-S10', 'owner:x', 'bug']) {
    assert.throws(() => planLabelChange(issue(), { add: bad }), /not one haku sets/, bad);
    assert.throws(() => planLabelChange(issue(bad), { remove: bad }), /not one haku sets/, bad);
  }
  assert.throws(() => planLabelChange(issue(), {}), /--add or --remove/);
  assert.throws(() => planLabelChange(issue(), { add: 'blocked', remove: 'blocked' }), /both added and removed/);
});

test('label change: names match without regard to letter case and repeats count once', () => {
  assert.deepStrictEqual(planLabelChange(issue('Blocked'), { remove: 'blocked' }), { add: [], remove: ['Blocked'] });
  assert.deepStrictEqual(planLabelChange(issue('Kind:Dev'), { add: 'kind:bug' }), { add: ['kind:bug'], remove: ['Kind:Dev'] });
  assert.deepStrictEqual(planLabelChange(issue(), { add: 'Blocked,blocked' }), { add: ['blocked'], remove: [] });
  assert.deepStrictEqual(planLabelChange(issue(), { add: 'kind:dev,KIND:dev' }), { add: ['kind:dev'], remove: [] });
});

test('label change: a closed issue gets no state label, but may lose one or change kind', () => {
  const closed = { state: 'closed', labels: [{ name: 'blocked' }] };
  assert.throws(() => planLabelChange(closed, { add: 'needs-user' }), /closed issue/);
  assert.deepStrictEqual(planLabelChange(closed, { remove: 'blocked', add: 'kind:docs' }), { add: ['kind:docs'], remove: ['blocked'] });
});

test('label change: adding a kind replaces the old one, and unchanged labels are left out', () => {
  assert.deepStrictEqual(planLabelChange(issue('haku', 'kind:dev'), { add: 'kind:bug' }), { add: ['kind:bug'], remove: ['kind:dev'] });
  assert.deepStrictEqual(planLabelChange(issue('kind:bug'), { add: 'kind:bug' }), { add: [], remove: [] });
  assert.deepStrictEqual(planLabelChange(issue('blocked'), { add: 'needs-user', remove: 'blocked' }), { add: ['needs-user'], remove: ['blocked'] });
  assert.deepStrictEqual(planLabelChange(issue(), { remove: 'deferred' }), { add: [], remove: [] });
  assert.throws(() => planLabelChange(issue(), { add: 'kind:bug,kind:dev' }), /one kind/);
});

test('host setLabels creates what it adds, then edits the issue once', () => {
  const calls = [];
  const exec = (bin, args) => { calls.push(args); return ''; };
  createGitHubHost({ repo: 'o/r', exec }).setLabels(5, { add: ['blocked'], remove: ['deferred'] });
  const edit = calls.find(a => a[0] === 'issue' && a[1] === 'edit');
  assert.deepStrictEqual(edit, ['issue', 'edit', '5', '-R', 'o/r', '--add-label', 'blocked', '--remove-label', 'deferred']);
  const made = calls.find(a => a[0] === 'label' && a[1] === 'create');
  assert.strictEqual(made[2], 'blocked');
  assert.ok(made.includes('9A1B1B'), 'created with haku\'s own colour');
  calls.length = 0;
  createGitHubHost({ repo: 'o/r', exec }).setLabels(5, {});
  assert.deepStrictEqual(calls, [], 'nothing to change, nothing sent');
});

const verify = { kind: 'T1', profile: 'unit' };
const draft = kinds => ({
  assignee: 'dongq',
  story: { id: 'S', title: 'Login', verify, ...(kinds ? { kind: kinds[0] } : {}) },
  milestones: [{ id: 'M1', title: 'Backend', verify, ...(kinds ? { kind: kinds[1] } : {}),
    tasks: [{ id: 'T1', title: 'Model', acceptance: ['a'], scope: ['src/**'], verify, ...(kinds ? { kind: kinds[2] } : {}) }] }]
});

test('publish adds one kind label to each issue that has a kind, and none to older drafts', () => {
  const made = [];
  const host = { ensureLabels: () => {}, createIssue: x => { made.push(x.labels); return made.length; }, updateIssueBody: () => {} };
  assert.ok(publish(host, draft(['design', 'dev', 'bug']), { apply: true }).ok);
  assert.deepStrictEqual(made.map(l => l.filter(n => n.startsWith('kind:'))), [['kind:design'], ['kind:dev'], ['kind:bug']]);
  made.length = 0;
  assert.ok(publish(host, draft(null), { apply: true }).ok);
  assert.deepStrictEqual(made.flat().filter(n => n.startsWith('kind:')), []);
});

test('the dry-run plan shows each kind', () => {
  const r = publish({}, draft(['design', 'dev', 'bug']));
  assert.deepStrictEqual(r.plan.map(p => p.kind), ['design', 'dev', 'bug']);
});

test('a draft with an unknown kind is rejected where it is', () => {
  assert.match(validateDraft(draft(['design', 'dev', 'feature'])).join('\n'), /task T1: kind must be one of/);
  assert.match(validateDraft(draft(['x', 'dev', 'dev'])).join('\n'), /story: kind must be one of/);
  assert.match(validateDraft(draft(['dev', 'x', 'dev'])).join('\n'), /milestone M1: kind must be one of/);
});

test('the skills tell the agent about kinds and state labels', () => {
  assert.match(read('skills', 'plan', 'SKILL.md'), /`kind`.*design.*dev.*bug.*docs.*research.*chore/s);
  assert.match(read('skills', 'setup', 'SKILL.md'), /issues\.js labels --apply/);
  assert.match(read('skills', 'triage', 'SKILL.md'), /label --issue N --add deferred/);
  const build = read('skills', 'build', 'SKILL.md');
  for (const l of ['needs-user', 'blocked', 'deferred']) assert.match(build, new RegExp(`\`${l}\``), l);
  assert.match(build, /never blocks a merge or a roll-up/);
  assert.match(build, /Skip a task labelled `deferred`/);
});
