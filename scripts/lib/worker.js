'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { slugify, issueType } = require('./model');

const DEFAULT_MAX_WORKERS = 2;

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
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
  const branch = `task/${issue}-${slugify(title)}`;
  const dir = path.join(workerRoot(home), `${repoName}-${issue}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  git(cwd, ['worktree', 'add', '-b', branch, dir, base]);

  const record = { issue, branch, path: dir, base, startedAt: new Date().toISOString() };
  const rdir = recordDir(cwd);
  fs.mkdirSync(rdir, { recursive: true });
  fs.writeFileSync(path.join(rdir, `worker-${issue}.json`), JSON.stringify(record, null, 2));
  return record;
}

// gate is the result of done-gate.doneCheck. Without a passing gate nothing is deleted;
// the only other way out is an explicit abandon, which the caller must have recorded.
// With deleteRemote and a passing gate (merged PR), the remote task branch is deleted too; a branch the
// host already deleted is not an error. Abandoned work keeps its remote branch.
function removeWorker({ cwd, issue, gate, abandon = false, deleteRemote = false }) {
  const record = listWorkers(cwd).find(w => w.issue === issue);
  if (!record) throw new Error(`no worker for #${issue}`);
  if (!abandon && !(gate && gate.ok)) {
    const missing = gate && gate.missing ? gate.missing.join(', ') : 'gate result';
    throw new Error(`refusing to delete worker #${issue}; missing: ${missing}`);
  }
  git(cwd, ['worktree', 'remove', '--force', record.path]);
  // Squash/rebase merges leave the branch unmerged from git's point of view, hence -D.
  git(cwd, ['branch', '-D', record.branch]);
  fs.rmSync(path.join(recordDir(cwd), `worker-${issue}.json`), { force: true });
  let remoteBranchDeleted = false;
  if (deleteRemote && !abandon && /^task\//.test(record.branch)) {
    remoteBranchDeleted = spawnSync('git', ['push', 'origin', '--delete', record.branch], { cwd, encoding: 'utf8' }).status === 0;
  }
  return { ...record, remoteBranchDeleted };
}

module.exports = { startWorker, removeWorker, listWorkers, workerRoot, DEFAULT_MAX_WORKERS };
