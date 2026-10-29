'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { startWorker, removeWorker, listWorkers } = require('../scripts/lib/worker');

function sh(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function setup() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-worker-repo-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-worker-home-'));
  sh(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', 'init');
  return { repo, home };
}

test('start creates a worktree on task/<issue>-<slug> under the short root', () => {
  const { repo, home } = setup();
  const w = startWorker({ cwd: repo, issue: 7, title: 'Add Login', base: 'main', home });
  assert.strictEqual(w.branch, 'task/7-add-login');
  assert.ok(w.path.startsWith(path.join(home, 'w')));
  assert.ok(fs.existsSync(path.join(w.path, 'a.txt')));
  assert.deepStrictEqual(listWorkers(repo).map(x => x.issue), [7]);
});

test('worker limit is enforced', () => {
  const { repo, home } = setup();
  startWorker({ cwd: repo, issue: 1, title: 'a', base: 'main', home, maxWorkers: 2 });
  startWorker({ cwd: repo, issue: 2, title: 'b', base: 'main', home, maxWorkers: 2 });
  assert.throws(
    () => startWorker({ cwd: repo, issue: 3, title: 'c', base: 'main', home, maxWorkers: 2 }),
    /worker limit reached/
  );
});

test('duplicate worker for the same issue is refused', () => {
  const { repo, home } = setup();
  startWorker({ cwd: repo, issue: 1, title: 'a', base: 'main', home });
  assert.throws(() => startWorker({ cwd: repo, issue: 1, title: 'a', base: 'main', home }), /already exists/);
});

test('remove is refused without a passing gate and leaves everything intact', () => {
  const { repo, home } = setup();
  const w = startWorker({ cwd: repo, issue: 4, title: 'x', base: 'main', home });
  assert.throws(
    () => removeWorker({ cwd: repo, issue: 4, gate: { ok: false, missing: ['worker-summary'] } }),
    /missing: worker-summary/
  );
  assert.ok(fs.existsSync(w.path));
  assert.strictEqual(listWorkers(repo).length, 1);
});

test('remove with a passing gate deletes worktree, branch and record', () => {
  const { repo, home } = setup();
  const w = startWorker({ cwd: repo, issue: 5, title: 'y', base: 'main', home });
  removeWorker({ cwd: repo, issue: 5, gate: { ok: true, missing: [], prHead: sh(repo, 'rev-parse', w.branch) } });
  assert.ok(!fs.existsSync(w.path));
  assert.strictEqual(listWorkers(repo).length, 0);
  assert.ok(!sh(repo, 'branch', '--list', w.branch));
});

test('abandon deletes without a gate (caller must have recorded why)', () => {
  const { repo, home } = setup();
  const w = startWorker({ cwd: repo, issue: 6, title: 'z', base: 'main', home });
  removeWorker({ cwd: repo, issue: 6, gate: null, abandon: true });
  assert.ok(!fs.existsSync(w.path));
});

// Issues are read by number (a list lags right after creation); an unknown number is an error like gh's.
const fakeHost = issues => ({
  getIssue: n => { const i = issues.find(x => x.number === n); if (!i) throw new Error('Could not resolve to an issue\nwith more detail'); return i; }
});
const issue = (number, type, state = 'open') => ({ number, state, labels: [{ name: 'haku' }, { name: `type:${type}` }] });

test('start refuses issues that are not open tasks', () => {
  const { repo, home } = setup();
  const host = fakeHost([issue(1, 'story'), issue(2, 'milestone'), issue(3, 'task', 'closed'), issue(4, 'task')]);
  assert.throws(() => startWorker({ cwd: repo, issue: 1, title: 'x', base: 'main', home, host }), /not a task/);
  assert.throws(() => startWorker({ cwd: repo, issue: 2, title: 'x', base: 'main', home, host }), /not a task/);
  assert.throws(() => startWorker({ cwd: repo, issue: 3, title: 'x', base: 'main', home, host }), /not open/);
  assert.throws(() => startWorker({ cwd: repo, issue: 9, title: 'x', base: 'main', home, host }), /not found/);
  assert.strictEqual(startWorker({ cwd: repo, issue: 4, title: 'ok', base: 'main', home, host }).issue, 4);
  assert.strictEqual(listWorkers(repo).length, 1);
});

test('remove deletes the remote task branch only after a passing gate', () => {
  const { repo, home } = setup();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-worker-remote-'));
  sh(remote, 'init', '-q', '--bare', '-b', 'main');
  sh(repo, 'remote', 'add', 'origin', remote);
  sh(repo, 'push', '-q', 'origin', 'main');
  const w = startWorker({ cwd: repo, issue: 5, title: 'Push Me', base: 'main', home });
  sh(w.path, 'push', '-q', 'origin', w.branch);
  assert.ok(sh(repo, 'ls-remote', '--heads', 'origin', w.branch));
  const r = removeWorker({ cwd: repo, issue: 5, gate: { ok: true, prHead: sh(repo, 'rev-parse', w.branch) }, deleteRemote: true });
  assert.strictEqual(r.remoteBranchDeleted, true);
  assert.strictEqual(sh(repo, 'ls-remote', '--heads', 'origin', w.branch), '');
});

test('abandon keeps the remote branch', () => {
  const { repo, home } = setup();
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-worker-remote-'));
  sh(remote, 'init', '-q', '--bare', '-b', 'main');
  sh(repo, 'remote', 'add', 'origin', remote);
  sh(repo, 'push', '-q', 'origin', 'main');
  const w = startWorker({ cwd: repo, issue: 6, title: 'Keep Me', base: 'main', home });
  sh(w.path, 'push', '-q', 'origin', w.branch);
  const r = removeWorker({ cwd: repo, issue: 6, gate: null, abandon: true, deleteRemote: true });
  assert.strictEqual(r.remoteBranchDeleted, false);
  assert.ok(sh(repo, 'ls-remote', '--heads', 'origin', w.branch));
});

test('start finds an issue created a moment ago because it reads it by number, never through a list', () => {
  const { repo, home } = setup();
  let listCalls = 0;
  const host = {
    // a list that has not caught up with the new issue yet
    listIssues: () => { listCalls += 1; return []; },
    getIssue: n => ({ number: n, state: 'open', labels: [{ name: 'haku' }, { name: 'type:task' }] })
  };
  const w = startWorker({ cwd: repo, issue: 41, title: 'Brand new', base: 'main', home, host });
  assert.strictEqual(w.issue, 41);
  assert.strictEqual(listCalls, 0);
});

test('start refuses an unknown or unreadable issue and one that is not a haku issue, with a clear reason', () => {
  const { repo, home } = setup();
  const host = fakeHost([{ number: 9, state: 'open', labels: [{ name: 'bug' }] }]);
  assert.throws(() => startWorker({ cwd: repo, issue: 404, title: 'x', base: 'main', home, host }), /issue #404 not found or not readable: Could not resolve to an issue/);
  assert.throws(() => startWorker({ cwd: repo, issue: 9, title: 'x', base: 'main', home, host }), /issue #9 is not a task \(type: none\)/);
  assert.strictEqual(listWorkers(repo).length, 0);
});
