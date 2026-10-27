'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { validateDraft, publish, flatten } = require('../scripts/lib/publish');
const { issueType, issueRail, parentOf } = require('../scripts/lib/model');

const verifyT1 = { kind: 'T1', profile: 'unit' };

function draft(overrides = {}) {
  return {
    rail: 'dongq',
    sprint: '2026-S10',
    story: { id: 'S', title: 'Login', verify: verifyT1 },
    milestones: [{
      id: 'M1',
      title: 'Backend',
      verify: verifyT1,
      tasks: [
        { id: 'T1', title: 'Model', acceptance: ['a'], scope: ['src/model/**'], verify: verifyT1 },
        { id: 'T2', title: 'API', acceptance: ['b'], scope: ['src/api/**'], verify: verifyT1, dependsOn: ['T1'] }
      ]
    }],
    ...overrides
  };
}

function fakeHost() {
  const issues = [];
  const labels = [];
  return {
    issues,
    labels,
    ensureLabels: n => labels.push(...n),
    createIssue: ({ title, body, labels: l }) => {
      issues.push({ number: issues.length + 1, title, body, labels: l.map(name => ({ name })), state: 'open' });
      return issues.length;
    },
    updateIssueBody: (n, body) => { issues[n - 1].body = body; }
  };
}

test('valid draft passes validation', () => {
  assert.deepStrictEqual(validateDraft(draft()), []);
});

test('rail, acceptance, scope and verify profile are mandatory', () => {
  const d = draft({ rail: '' });
  d.milestones[0].tasks[0].acceptance = [];
  d.milestones[0].tasks[0].scope = [];
  d.milestones[0].tasks[1].verify = { kind: 'T1' };
  const errors = validateDraft(d).join('\n');
  assert.match(errors, /rail is required/);
});

test('missing acceptance/scope/profile are each reported', () => {
  const d = draft();
  d.milestones[0].tasks[0].acceptance = [];
  d.milestones[0].tasks[0].scope = [];
  d.milestones[0].tasks[1].verify = { kind: 'T1' };
  const errors = validateDraft(d).join('\n');
  assert.match(errors, /task T1: acceptance criteria are required/);
  assert.match(errors, /task T1: scope/);
  assert.match(errors, /task T2: verify.profile is required for T1/);
});

test('T3 needs no profile; unknown kind is rejected', () => {
  const d = draft();
  d.milestones[0].tasks[0].verify = { kind: 'T3' };
  assert.deepStrictEqual(validateDraft(d), []);
  d.milestones[0].tasks[0].verify = { kind: 'T9' };
  assert.match(validateDraft(d).join('\n'), /verify.kind must be one of/);
});

test('dependsOn must reference a task in the draft; cycles are rejected', () => {
  const d = draft();
  d.milestones[0].tasks[1].dependsOn = ['NOPE'];
  assert.match(validateDraft(d).join('\n'), /dependsOn NOPE/);
  const c = draft();
  c.milestones[0].tasks[0].dependsOn = ['T2'];
  assert.throws(() => flatten(c), /cycle/);
});

test('dry-run creates nothing', () => {
  const host = fakeHost();
  const result = publish(host, draft());
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(host.issues.length, 0);
  assert.strictEqual(result.plan.length, 4);
});

test('apply creates parents first, links children, labels with rail/sprint', () => {
  const host = fakeHost();
  const result = publish(host, draft(), { apply: true, orchestrator: 'session-abc' });
  assert.strictEqual(result.ok, true);
  const [story, milestone, t1, t2] = host.issues;
  assert.strictEqual(issueType(story), 'story');
  assert.strictEqual(issueType(milestone), 'milestone');
  assert.strictEqual(issueRail(t1), 'dongq');
  assert.strictEqual(parentOf(milestone), story.number);
  assert.strictEqual(parentOf(t1), milestone.number);
  assert.match(t2.body, /Depends-On: #3/);
  assert.match(t1.body, /Verify-Profile: unit/);
  assert.match(t1.body, /Scope: src\/model\/\*\*/);
  assert.match(story.body, /Orchestrator: session-abc/);
  assert.match(story.body, /- \[ \] #2 Backend/);
  assert.match(milestone.body, /- \[ \] #3 Model/);
  assert.match(milestone.body, /- \[ \] #4 API/);
  assert.ok(host.labels.includes('sprint:2026-S10'));
});

test('resuming with saved state creates no duplicates', () => {
  const host = fakeHost();
  const state = { numbers: {} };
  publish(host, draft(), { apply: true, state });
  const before = host.issues.length;
  publish(host, draft(), { apply: true, state });
  assert.strictEqual(host.issues.length, before);
});

test('invalid draft is never published', () => {
  const host = fakeHost();
  const result = publish(host, draft({ rail: '' }), { apply: true });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(host.issues.length, 0);
});
