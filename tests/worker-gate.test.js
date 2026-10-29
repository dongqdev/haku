'use strict';

// The deletion gate must never delete work that exists nowhere else. Each case uses real git
// repositories (a clone, a bare "remote", the worker's worktree).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { startWorker, removeWorker, listWorkers } = require('../scripts/lib/worker');
const { prState } = require('../scripts/lib/pr-state');
const { createGitHubHost } = require('../scripts/lib/github-host');

function sh(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function setup() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-gate-repo-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-gate-home-'));
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-gate-remote-'));
  sh(remote, 'init', '-q', '--bare', '-b', 'main');
  sh(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', 'init');
  sh(repo, 'remote', 'add', 'origin', remote);
  sh(repo, 'push', '-q', 'origin', 'main');
  const w = startWorker({ cwd: repo, issue: 7, title: 'Work', base: 'main', home });
  fs.writeFileSync(path.join(w.path, 'work.txt'), 'done');
  sh(w.path, 'add', '-A');
  sh(w.path, 'commit', '-q', '-m', 'the pull request');
  sh(w.path, 'push', '-q', 'origin', w.branch);
  const prHead = sh(repo, 'rev-parse', w.branch);
  return { repo, home, remote, w, prHead };
}

const intact = ({ repo, w }) => {
  assert.ok(fs.existsSync(w.path), 'worktree must still exist');
  assert.ok(sh(repo, 'branch', '--list', w.branch), 'local branch must still exist');
  assert.strictEqual(listWorkers(repo).length, 1, 'record must still exist');
  assert.ok(sh(repo, 'ls-remote', '--heads', 'origin', w.branch), 'remote branch must still exist');
};

test('a clean worker whose branch is exactly the merged head is deleted, remote branch included', () => {
  const ctx = setup();
  const r = removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead }, deleteRemote: true });
  assert.strictEqual(r.remoteBranchDeleted, true);
  assert.deepStrictEqual(r.discarded, { commits: 0, files: 0 });
  assert.ok(!fs.existsSync(ctx.w.path));
});

test('a commit made after the merge is refused and nothing at all is deleted (the lost-fix accident)', () => {
  const ctx = setup();
  fs.writeFileSync(path.join(ctx.w.path, 'late-fix.txt'), 'review fix');
  sh(ctx.w.path, 'add', '-A');
  sh(ctx.w.path, 'commit', '-q', '-m', 'review fix pushed after the merge');
  assert.throws(
    () => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead }, deleteRemote: true }),
    err => /1 commit\(s\) on task\/7-work came after the merged pull request/.test(err.message)
      && /review fix pushed after the merge/.test(err.message)
  );
  intact(ctx);
});

test('uncommitted and untracked files are refused, even with the gate passing', () => {
  const ctx = setup();
  fs.writeFileSync(path.join(ctx.w.path, 'a.txt'), 'edited');
  assert.throws(() => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead } }), /1 uncommitted file\(s\).*a\.txt/s);
  intact(ctx);
  fs.writeFileSync(path.join(ctx.w.path, 'scratch.txt'), 'new');
  assert.throws(() => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead } }), /2 uncommitted file\(s\)/);
  intact(ctx);
});

test('abandon does not skip the file check; --discard does and reports what was thrown away', () => {
  const ctx = setup();
  fs.writeFileSync(path.join(ctx.w.path, 'scratch.txt'), 'new');
  assert.throws(() => removeWorker({ cwd: ctx.repo, issue: 7, gate: null, abandon: true }), /uncommitted file\(s\)/);
  intact(ctx);
  const r = removeWorker({ cwd: ctx.repo, issue: 7, gate: null, abandon: true, discard: true });
  assert.deepStrictEqual(r.discarded, { commits: 1, files: 1 });
  assert.ok(!fs.existsSync(ctx.w.path));
});

test('without a merged head from the gate the worker is not deleted (fail closed)', () => {
  const ctx = setup();
  assert.throws(() => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true } }), /did not report the merged pull request's head commit/);
  intact(ctx);
});

test('a merged head this repository does not have is refused, not assumed fine', () => {
  const ctx = setup();
  assert.throws(
    () => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: '0123456789abcdef0123456789abcdef01234567' } }),
    /not in this repository/
  );
  intact(ctx);
});

test('commits that exist only on the remote branch after the merge are refused', () => {
  const ctx = setup();
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-gate-other-'));
  sh(other, 'clone', '-q', ctx.remote, '.');
  sh(other, 'checkout', '-q', ctx.w.branch);
  fs.writeFileSync(path.join(other, 'remote-only.txt'), 'x');
  sh(other, 'add', '-A');
  sh(other, 'commit', '-q', '-m', 'pushed from another machine');
  sh(other, 'push', '-q', 'origin', ctx.w.branch);
  sh(ctx.repo, 'fetch', '-q', 'origin');
  assert.throws(
    () => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead }, deleteRemote: true }),
    /1 commit\(s\) on origin\/task\/7-work came after the merged pull request/
  );
  intact(ctx);
});

test('when the remote cannot be read the worker is kept', () => {
  const ctx = setup();
  sh(ctx.repo, 'remote', 'set-url', 'origin', path.join(os.tmpdir(), 'haku-gate-does-not-exist'));
  assert.throws(
    () => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead }, deleteRemote: true }),
    /could not read the remote branch/
  );
  assert.ok(fs.existsSync(ctx.w.path));
  assert.strictEqual(listWorkers(ctx.repo).length, 1);
});

// ---- pr-state: may I still push to this branch?
const hostWith = prs => ({ prsForBranch: () => prs });

test('pr-state: an open pull request or none is safe to push to; merged or closed is not', () => {
  assert.strictEqual(prState(hostWith([]), 'task/1-x').state, 'none');
  assert.strictEqual(prState(hostWith([]), 'task/1-x').safeToPush, true);
  assert.strictEqual(prState(hostWith([{ number: 3, state: 'open', headRefOid: 'a' }]), 'b').safeToPush, true);
  const merged = prState(hostWith([{ number: 3, state: 'merged', headRefOid: 'aaa' }]), 'b', 'aaa');
  assert.deepStrictEqual([merged.state, merged.safeToPush, merged.matchesLocalTip], ['merged', false, true]);
  assert.strictEqual(prState(hostWith([{ number: 4, state: 'closed', headRefOid: 'a' }]), 'b').safeToPush, false);
});

test('pr-state: a merged pull request wins over an older closed one and flags unseen local commits', () => {
  const r = prState(hostWith([{ number: 2, state: 'closed', headRefOid: 'x' }, { number: 5, state: 'merged', headRefOid: 'm1' }]), 'b', 'm2');
  assert.deepStrictEqual([r.state, r.number, r.matchesLocalTip], ['merged', 5, false]);
});

test('the host asks for every state of a branch\'s pull requests and times every gh call out', () => {
  const calls = [];
  const exec = (bin, args, options) => { calls.push({ args, options }); return JSON.stringify([{ number: 1, state: 'MERGED', mergedAt: 'x', headRefOid: 'abc' }]); };
  const host = createGitHubHost({ repo: 'o/r', exec });
  const prs = host.prsForBranch('task/1-x');
  assert.strictEqual(prs[0].state, 'merged');
  const args = calls[0].args;
  assert.strictEqual(args[args.indexOf('--state') + 1], 'all');
  assert.strictEqual(args[args.indexOf('--head') + 1], 'task/1-x');
  assert.ok(calls[0].options.timeout > 0, 'a hung gh must time out');
});

test('the skills and the worker tell the model about the frozen pull request and the pr-state check', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
  const build = read('skills/build/SKILL.md');
  assert.match(build, /Ask only when every review fix is pushed and the checks pass; never while a review is still running/);
  assert.match(build, /the pull request is frozen: no more commits go onto it/);
  assert.match(build, /run `issues\.js pr-state --issue N`/);
  assert.match(build, /Exit 3 means it is already merged or closed: do not push/);
  assert.match(build, /holds commits that came after the merged pull request/);
  assert.match(build, /`--discard` throws uncommitted files away and is used only after asking the user with a choice question/);
  const worker = read('agents/worker.md');
  assert.match(worker, /run `issues\.js pr-state --issue N`/);
  assert.match(worker, /If it exits 3 the pull request is already merged or closed: do not push/);
});
