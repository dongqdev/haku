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
  removeWorker({ cwd: repo, issue: 5, gate: { ok: true, missing: [] } });
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
