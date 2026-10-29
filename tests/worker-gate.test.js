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
  assert.match(build, /Push only on exit 0/);
  assert.match(build, /Any other exit code \(for example 1: the state could not be checked\) also means do not push/);
  assert.match(build, /a count of `null` means it could not be determined/);
  assert.match(build, /`ignoredFilesDeleted`/);
  assert.strictEqual((build.match(/^8\. /gm) || []).length, 1, 'step numbers must not repeat');
  assert.match(build, /holds commits that came after the merged pull request/);
  assert.match(build, /`--discard` throws uncommitted files away and is used only after asking the user with a choice question/);
  const worker = read('agents/worker.md');
  assert.match(worker, /run `issues\.js pr-state --issue N`/);
  assert.match(worker, /Push only if it exits 0/);
});

// ---- holes found in review: HEAD off the branch, half-done operations, ref matching, races, ignored files
const { deleteRemoteBranch, remoteBranchTip } = require('../scripts/lib/worker');

test('a commit made on a detached HEAD in the worktree is refused (no branch would hold it)', () => {
  const ctx = setup();
  sh(ctx.w.path, 'checkout', '-q', '--detach');
  fs.writeFileSync(path.join(ctx.w.path, 'only-here.txt'), 'x');
  sh(ctx.w.path, 'add', '-A');
  sh(ctx.w.path, 'commit', '-q', '-m', 'commit on a detached head');
  assert.throws(
    () => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead } }),
    err => /HEAD is detached and holds 1 commit\(s\) that no branch contains/.test(err.message) && /commit on a detached head/.test(err.message)
  );
  assert.ok(fs.existsSync(ctx.w.path));
});

test('a detached HEAD that holds nothing new is fine to delete', () => {
  const ctx = setup();
  sh(ctx.w.path, 'checkout', '-q', '--detach');
  removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead } });
  assert.ok(!fs.existsSync(ctx.w.path));
});

test('a rebase or merge in progress is refused even though status looks clean', () => {
  const ctx = setup();
  const marker = spawnSync('git', ['rev-parse', '--git-path', 'MERGE_HEAD'], { cwd: ctx.w.path, encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.resolve(ctx.w.path, marker), `${ctx.prHead}\n`);
  assert.throws(() => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead } }), /MERGE_HEAD operation is in progress/);
  assert.ok(fs.existsSync(ctx.w.path));
});

test('a worktree whose status cannot be read is kept', () => {
  const ctx = setup();
  // Windows marks this file read-only, so it is replaced rather than overwritten.
  const gitFile = path.join(ctx.w.path, '.git');
  fs.chmodSync(gitFile, 0o666);
  fs.rmSync(gitFile, { force: true });
  fs.writeFileSync(gitFile, 'gitdir: /nonexistent/place\n');
  assert.throws(() => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead } }), /could not read the worktree status/);
  assert.ok(fs.existsSync(ctx.w.path));
});

test('ls-remote suffix matches do not fool the check: only refs/heads/<branch> itself counts', () => {
  const ctx = setup();
  // the real remote branch gets a commit after the merge; a look-alike branch points at the merged head
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-gate-other-'));
  sh(other, 'clone', '-q', ctx.remote, '.');
  sh(other, 'checkout', '-q', ctx.w.branch);
  fs.writeFileSync(path.join(other, 'late.txt'), 'x');
  sh(other, 'add', '-A');
  sh(other, 'commit', '-q', '-m', 'late commit on the real branch');
  sh(other, 'push', '-q', 'origin', ctx.w.branch);
  sh(other, 'push', '-q', 'origin', `${ctx.prHead}:refs/heads/a/${ctx.w.branch}`);
  sh(ctx.repo, 'fetch', '-q', 'origin');
  const tip = remoteBranchTip(ctx.repo, ctx.w.branch);
  assert.strictEqual(tip.tip, sh(other, 'rev-parse', 'HEAD'), 'the exact branch, not the look-alike');
  assert.throws(
    () => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead }, deleteRemote: true }),
    /1 commit\(s\) on origin\/task\/7-work came after the merged pull request/
  );
  assert.ok(sh(ctx.repo, 'ls-remote', '--heads', 'origin', `refs/heads/${ctx.w.branch}`));
});

test('the remote branch is deleted only if it still points at the commit that was checked', () => {
  const ctx = setup();
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-gate-other-'));
  sh(other, 'clone', '-q', ctx.remote, '.');
  sh(other, 'checkout', '-q', ctx.w.branch);
  fs.writeFileSync(path.join(other, 'raced.txt'), 'x');
  sh(other, 'add', '-A');
  sh(other, 'commit', '-q', '-m', 'pushed between the check and the delete');
  sh(other, 'push', '-q', 'origin', ctx.w.branch);
  const stale = deleteRemoteBranch(ctx.repo, ctx.w.branch, ctx.prHead);
  assert.strictEqual(stale.deleted, false);
  assert.ok(sh(ctx.repo, 'ls-remote', '--heads', 'origin', `refs/heads/${ctx.w.branch}`), 'the branch with the new commit must survive');
  const fresh = deleteRemoteBranch(ctx.repo, ctx.w.branch, sh(other, 'rev-parse', 'HEAD'));
  assert.strictEqual(fresh.deleted, true);
});

test('ignored files are deleted with the worktree but reported, not silently dropped', () => {
  const ctx = setup();
  fs.writeFileSync(path.join(ctx.repo, '.gitignore'), '.env\n');
  sh(ctx.repo, 'add', '-A');
  sh(ctx.repo, 'commit', '-q', '-m', 'ignore env');
  const w2 = startWorker({ cwd: ctx.repo, issue: 8, title: 'Env', base: 'main', home: ctx.home });
  fs.writeFileSync(path.join(w2.path, '.env'), 'SECRET=1');
  sh(w2.path, 'push', '-q', 'origin', w2.branch);
  const r = removeWorker({ cwd: ctx.repo, issue: 8, gate: { ok: true, prHead: sh(ctx.repo, 'rev-parse', w2.branch) } });
  assert.deepStrictEqual(r.ignoredFilesDeleted, ['.env']);
  assert.deepStrictEqual(r.discarded, { commits: 0, files: 0 });
});

test('an abandon whose commits cannot be counted reports unknown (null), never zero', () => {
  const ctx = setup();
  const common = path.resolve(ctx.repo, spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: ctx.repo, encoding: 'utf8' }).stdout.trim());
  const recFile = path.join(common, 'haku', 'worker-7.json');
  const rec = JSON.parse(fs.readFileSync(recFile, 'utf8'));
  rec.base = 'no-such-base';
  fs.writeFileSync(recFile, JSON.stringify(rec));
  const r = removeWorker({ cwd: ctx.repo, issue: 7, gate: null, abandon: true });
  assert.strictEqual(r.discarded.commits, null);
});

test('abandon counts commits on a detached HEAD too', () => {
  const ctx = setup();
  sh(ctx.w.path, 'checkout', '-q', '--detach');
  fs.writeFileSync(path.join(ctx.w.path, 'd.txt'), 'x');
  sh(ctx.w.path, 'add', '-A');
  sh(ctx.w.path, 'commit', '-q', '-m', 'detached work');
  const r = removeWorker({ cwd: ctx.repo, issue: 7, gate: null, abandon: true });
  assert.strictEqual(r.discarded.commits, 2, 'the branch commit and the detached commit');
});

test('pr-state: the newest pull request of a reused branch name decides', () => {
  assert.strictEqual(prState(hostWith([{ number: 5, state: 'merged', headRefOid: 'a' }, { number: 8, state: 'open', headRefOid: 'b' }]), 'b').safeToPush, true);
  assert.strictEqual(prState(hostWith([{ number: 3, state: 'open', headRefOid: 'a' }, { number: 9, state: 'merged', headRefOid: 'b' }]), 'b').safeToPush, false);
  assert.strictEqual(prState(hostWith([{ number: 3, state: 'merged', headRefOid: 'a' }, { number: 9, state: 'closed', headRefOid: 'b' }]), 'b').state, 'closed');
});

test('commits made on another branch inside the worktree are not lost by the removal, so it proceeds', () => {
  const ctx = setup();
  sh(ctx.w.path, 'checkout', '-q', '-b', 'side-work');
  fs.writeFileSync(path.join(ctx.w.path, 'side.txt'), 'x');
  sh(ctx.w.path, 'add', '-A');
  sh(ctx.w.path, 'commit', '-q', '-m', 'work kept on its own branch');
  removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead } });
  assert.ok(!fs.existsSync(ctx.w.path));
  assert.match(sh(ctx.repo, 'log', '--format=%s', '-1', 'side-work'), /work kept on its own branch/);
});

test('every kind of operation in progress is refused', () => {
  for (const name of ['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG']) {
    const ctx = setup();
    const marker = path.resolve(ctx.w.path, spawnSync('git', ['rev-parse', '--git-path', name], { cwd: ctx.w.path, encoding: 'utf8' }).stdout.trim());
    if (name.startsWith('rebase')) fs.mkdirSync(marker, { recursive: true });
    else fs.writeFileSync(marker, `${ctx.prHead}\n`);
    assert.throws(() => removeWorker({ cwd: ctx.repo, issue: 7, gate: { ok: true, prHead: ctx.prHead } }), new RegExp(`${name} operation is in progress`), name);
    assert.ok(fs.existsSync(ctx.w.path), name);
  }
});
