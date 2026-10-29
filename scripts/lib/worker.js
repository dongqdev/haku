'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { slugify, stripPrefix, issueType } = require('./model');

const DEFAULT_MAX_WORKERS = 2;

const GIT_TIMEOUT_MS = 60000;

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

// Worktrees live under a short root (default ~/.haku/w) so Windows' 260-char path limit
// is not hit by deep repo paths; override with HAKU_HOME.
function workerRoot(home) {
  return path.join(home || process.env.HAKU_HOME || path.join(os.homedir(), '.haku'), 'w');
}

function recordDir(cwd) {
  const common = path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir']));
  return path.join(common, 'haku');
}

function listWorkers(cwd) {
  const dir = recordDir(cwd);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^worker-\d+\.json$/.test(f))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => a.issue - b.issue);
}

// With a host, the issue must exist, be open and be a task: workers never own stories or milestones.
function assertTaskIssue(host, issue) {
  const found = host.listIssues().find(i => i.number === issue);
  if (!found) throw new Error(`issue #${issue} not found among haku issues`);
  if (issueType(found) !== 'task') throw new Error(`issue #${issue} is not a task (type: ${issueType(found) || 'none'})`);
  if (found.state !== 'open') throw new Error(`issue #${issue} is not open`);
}

function startWorker({ cwd, issue, title, base, home, host, maxWorkers = DEFAULT_MAX_WORKERS }) {
  if (host) assertTaskIssue(host, issue);
  const existing = listWorkers(cwd);
  if (existing.some(w => w.issue === issue)) throw new Error(`worker for #${issue} already exists`);
  if (existing.length >= maxWorkers) {
    throw new Error(`worker limit reached (${existing.length}/${maxWorkers}); finish or remove one first`);
  }
  const repoName = path.basename(git(cwd, ['rev-parse', '--show-toplevel'])).slice(0, 12);
  const branch = `task/${issue}-${slugify(stripPrefix(title))}`;
  const dir = path.join(workerRoot(home), `${repoName}-${issue}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(cwd, ['worktree', 'add', '-b', branch, dir, base]);

  const record = { issue, branch, path: dir, base, startedAt: new Date().toISOString() };
  const rdir = recordDir(cwd);
  fs.mkdirSync(rdir, { recursive: true });
  fs.writeFileSync(path.join(rdir, `worker-${issue}.json`), JSON.stringify(record, null, 2));
  return record;
}

const gitTry = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};

const list = (lines, max = 10) => {
  const shown = lines.slice(0, max).map(l => `    ${l}`).join('\n');
  return lines.length > max ? `${shown}\n    ... and ${lines.length - max} more` : shown;
};

// Commits of `tip` that the merged head does not contain, as "sha subject" lines. Anything that cannot
// be checked is a refusal, never a pass: an unknown commit might be work that would be lost.
function commitsBeyond(cwd, prHead, tip, what) {
  if (tip === prHead) return [];
  if (!gitTry(cwd, ['cat-file', '-e', `${tip}^{commit}`]).ok || !gitTry(cwd, ['cat-file', '-e', `${prHead}^{commit}`]).ok) {
    throw new Error(`the ${what} (${tip.slice(0, 7)}) or the merged head (${prHead.slice(0, 7)}) is not in this repository; fetch and retry`);
  }
  const r = gitTry(cwd, ['log', '--format=%h %s', `${prHead}..${tip}`]);
  if (!r.ok) throw new Error(`could not compare the ${what} with the merged head: ${r.err}`);
  return r.out ? r.out.split('\n') : [];
}

// What a git operation in progress means for the worktree: a half-done rebase or merge holds work that
// `status` can show as clean (an amended commit during `rebase -i`, for instance).
const IN_PROGRESS = ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG'];

function operationInProgress(worktree) {
  for (const name of IN_PROGRESS) {
    const r = gitTry(worktree, ['rev-parse', '--git-path', name]);
    if (r.ok && fs.existsSync(path.resolve(worktree, r.out))) return name;
  }
  return null;
}

// "sha refname" lines of `git ls-remote` for exactly refs/heads/<branch>. ls-remote matches by name
// suffix, so `a/task/7-x` would also answer a query for `task/7-x`; only the exact ref counts.
function remoteBranchTip(cwd, branch) {
  const r = gitTry(cwd, ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
  if (!r.ok) return { ok: false, err: r.err };
  const hit = r.out.split('\n').map(l => l.split(/\s+/)).find(([, ref]) => ref === `refs/heads/${branch}`);
  return { ok: true, tip: hit ? hit[0] : null };
}

// Deletes the remote branch only if it still points at the commit that was just checked. Someone pushing in
// between (the accident this gate exists for) makes the lease fail and the branch stays.
function deleteRemoteBranch(cwd, branch, expectedTip) {
  const r = gitTry(cwd, ['push', 'origin', `--force-with-lease=refs/heads/${branch}:${expectedTip}`, '--delete', branch]);
  return { deleted: r.ok, error: r.ok ? null : r.err };
}

// gate is the result of done-gate.doneCheck. Nothing is deleted without a passing gate, and even with one
// not while the worktree holds uncommitted files, a rebase or merge is half done, HEAD is not on the task
// branch (or holds commits beyond the merged head), or the branch holds commits the merged pull request did
// not contain. Every check runs before the first deletion, so a refusal leaves everything in place.
// abandon skips the gate; discard is the explicit "throw the uncommitted files away".
// With deleteRemote and a passing gate the remote task branch is deleted too (a branch the host already
// deleted is not an error); abandoned work keeps its remote branch.
function removeWorker({ cwd, issue, gate, abandon = false, discard = false, deleteRemote = false }) {
  const record = listWorkers(cwd).find(w => w.issue === issue);
  if (!record) throw new Error(`no worker for #${issue}`);
  if (!abandon && !(gate && gate.ok)) {
    const missing = gate && gate.missing ? gate.missing.join(', ') : 'gate result';
    throw new Error(`refusing to delete worker #${issue}; missing: ${missing}`);
  }

  const present = fs.existsSync(record.path);
  const status = present ? gitTry(record.path, ['status', '--porcelain', '--ignored']) : { ok: true, out: '' };
  if (!status.ok) throw new Error(`refusing to delete worker #${issue}; could not read the worktree status: ${status.err}`);
  const lines = status.out ? status.out.split('\n') : [];
  const dirty = lines.filter(l => !l.startsWith('!! '));
  // Ignored files (for example a local .env) are deleted with the worktree; they are reported, not refused,
  // because build output such as node_modules would otherwise block every cleanup.
  const ignored = lines.filter(l => l.startsWith('!! ')).map(l => l.slice(3));
  if (dirty.length && !discard) {
    throw new Error(`refusing to delete worker #${issue}; ${dirty.length} uncommitted file(s) would be lost:\n${list(dirty, 20)}\n`
      + '    commit them, or pass --discard to throw them away');
  }
  const ongoing = present ? operationInProgress(record.path) : null;
  if (ongoing && !discard) {
    throw new Error(`refusing to delete worker #${issue}; a ${ongoing} operation is in progress in the worktree and may hold work that is not committed yet`);
  }

  let discarded = { commits: 0, files: dirty.length };
  if (!abandon) {
    if (!gate.prHead) throw new Error(`refusing to delete worker #${issue}; the gate did not report the merged pull request's head commit`);
    const tip = git(cwd, ['rev-parse', record.branch]);
    const extra = commitsBeyond(cwd, gate.prHead, tip, 'local branch');
    if (extra.length) {
      throw new Error(`refusing to delete worker #${issue}; ${extra.length} commit(s) on ${record.branch} came after the merged pull request and would be lost:\n${list(extra)}\n`
        + '    put them in a follow-up pull request first');
    }
    // The worktree's own HEAD. Checked out on another branch, its commits live on that branch, which
    // the removal does not touch. Detached, they belong to no branch and would be lost.
    if (present) {
      const onBranch = gitTry(record.path, ['symbolic-ref', '-q', 'HEAD']);
      if (!onBranch.ok) {
        const head = gitTry(record.path, ['rev-parse', 'HEAD']);
        if (!head.ok) throw new Error(`refusing to delete worker #${issue}; could not read the worktree's HEAD: ${head.err}`);
        const lost = commitsBeyond(cwd, gate.prHead, head.out, "worktree's HEAD");
        if (lost.length) {
          throw new Error(`refusing to delete worker #${issue}; the worktree's HEAD is detached and holds ${lost.length} commit(s) that no branch contains:\n${list(lost)}`);
        }
      }
    }
  } else {
    // Commits reachable from the branch or from the worktree's HEAD that the base does not have. null means
    // "could not be counted", which is reported as unknown rather than as zero.
    const count = gitTry(present ? record.path : cwd, ['rev-list', '--count', record.branch, ...(present ? ['HEAD'] : []), `^${record.base}`]);
    discarded.commits = count.ok ? Number(count.out) : null;
  }

  let remoteTip = null;
  if (!abandon && deleteRemote && /^task\//.test(record.branch)) {
    const remote = remoteBranchTip(cwd, record.branch);
    if (!remote.ok) throw new Error(`refusing to delete worker #${issue}; could not read the remote branch: ${remote.err}`);
    remoteTip = remote.tip;
    if (remoteTip) {
      const beyond = commitsBeyond(cwd, gate.prHead, remoteTip, 'remote branch');
      if (beyond.length) {
        throw new Error(`refusing to delete worker #${issue}; ${beyond.length} commit(s) on origin/${record.branch} came after the merged pull request:\n${list(beyond)}`);
      }
    }
  }

  if (present) git(cwd, ['worktree', 'remove', '--force', record.path]);
  else git(cwd, ['worktree', 'prune']);
  // Squash/rebase merges leave the branch unmerged from git's point of view, hence -D.
  git(cwd, ['branch', '-D', record.branch]);
  fs.rmSync(path.join(recordDir(cwd), `worker-${issue}.json`), { force: true });
  let remoteBranchDeleted = false;
  let remoteBranchKept = null;
  if (remoteTip) {
    const r = deleteRemoteBranch(cwd, record.branch, remoteTip);
    remoteBranchDeleted = r.deleted;
    if (!r.deleted) remoteBranchKept = r.error;
  }
  return { ...record, remoteBranchDeleted, remoteBranchKept, discarded, ignoredFilesDeleted: ignored.slice(0, 20) };
}

module.exports = { startWorker, removeWorker, listWorkers, workerRoot, deleteRemoteBranch, remoteBranchTip, DEFAULT_MAX_WORKERS };
