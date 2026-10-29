#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createGitHubHost } = require('./lib/github-host');
const { reconcile, describeWarning, acceptClosedTask } = require('./lib/reconcile');
const { publish } = require('./lib/publish');
const { verify } = require('./lib/verify');
const { doneCheck } = require('./lib/done-gate');
const { startWorker, removeWorker, listWorkers } = require('./lib/worker');
const { prState } = require('./lib/pr-state');
const { slugify, stripPrefix, SUMMARY_MARKER, verifiedMarker } = require('./lib/model');
const { readConfig, titlePrefixOn, workerSettings } = require('./lib/config');
const { launchWorker, stopOnly, removeSession, withSessionStates } = require('./lib/session');
const { skeleton, checkBody, checkClosingLink } = require('./lib/pr-body');
const { buildStatus, renderStatus } = require('./lib/status');
const { buildTriage, renderTriage, closeForTriage } = require('./lib/triage');
const { renderChanges } = require('./lib/weaken');
const { prConfigChanges } = require('./lib/pr-config');
const { checkProtection, renderProtection } = require('./lib/protection');
const { listRepoNames, repoExists, checkNames, readUserConfig, planProject, createProject } = require('./lib/newproject');

const HELP = `haku issues

Usage:
  issues.js publish <draft.json> [--apply] [--orchestrator <id>] [--repo <owner/repo>]
  issues.js reconcile [--apply] [--json] [--repo <owner/repo>]
  issues.js verify --profile <name> --base <ref> [--cwd <dir>] [--json]
  issues.js verify-record --issue <N> --kind <T1|T2|T3> --status <pass|fail> [--sha <sha>]
  issues.js summary --issue <N> --file <summary.md>
  issues.js done-check --issue <N> [--json]
  issues.js worker-start --issue <N> --title <text> --base <branch> [--cwd <dir>]
  issues.js worker-launch --issue <N> --orchestrator <session name> [--base <branch>] [--cwd <dir>]
  issues.js worker-list [--cwd <dir>]
  issues.js config [--cwd <dir>]
  issues.js worker-rm --issue <N> [--cwd <dir>] [--abandon] [--discard]
  issues.js pr-state --issue <N> [--branch <name>] [--cwd <dir>]
  issues.js status [--json] [--repo <owner/repo>]
  issues.js triage [--json] [--repo <owner/repo>]
  issues.js issue-close --issue <N> --reason <text> [--repo <owner/repo>]
  issues.js accept-close --issue <N> --reason <text> --user-approved [--repo <owner/repo>]
  issues.js pr-body --issue <N>
  issues.js branch-protection [--mode <approve-each|auto-when-verified> | --story <N>] [--json] [--repo <owner/repo>]
  issues.js pr-config-changes --pr <number> [--issue <N>] [--json] [--repo <owner/repo>]
  issues.js pr-check --issue <N> [--file <body.md>] [--pr <number>] [--repo <owner/repo>]
  issues.js branch --issue <N> --title <text>
  issues.js project-names --names <a,b,c> [--owner <account>]
  issues.js project-new --name <repo> --dir <parent folder> [--owner <account>] [--visibility private|public] [--apply]

publish       Dry-run by default; --apply creates the story/milestone/task issues.
              Progress is kept in <draft>.map.json so an interrupted run resumes.
reconcile     Dry-run by default; --apply closes merged-but-open tasks and rolls up. A parent whose closed task has no
              merged pull request (open PR only, closed PR only, closed by hand, or not checkable) is held back.
accept-close  Records that the user closed a task on purpose without a merged PR, so its parent may roll up.
verify        Exit 0 = pass, 1 = fail, 2 = review needed (see reasons).
done-check    Exit 0 only when a worker may be deleted.
project-names Checks candidate repository names against the account's existing repositories (read-only).
branch-protection  Reports whether the default branch is protected (protected, unprotected, unavailable = plan limit, unknown)
              and which merge modes are allowed: without protection only approve-each. Read-only.
pr-config-changes  Lists the files of a pull request that could weaken its own checks (lint, CI, test runner, .haku); a warning for the
              merge-approval screen, never a block. Out-of-scope files (not in the task's Scope) come first.
project-new   Dry-run by default; --apply creates the folder, the first commit and the remote repository.
`;

const VALUE = new Set(['--repo', '--issue', '--title', '--profile', '--base', '--cwd', '--kind',
  '--status', '--sha', '--file', '--orchestrator', '--reason', '--branch', '--names', '--name', '--dir', '--owner', '--visibility', '--pr', '--mode', '--story']);

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--trust-working-copy') opts.trust = true;
    else if (arg === '--abandon') opts.abandon = true;
    else if (arg === '--discard') opts.discard = true;
    else if (arg === '--user-approved') opts.userApproved = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (VALUE.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      opts[arg.slice(2)] = value;
      i += 1;
    }
    else opts._.push(arg);
  }
  if (opts.issue !== undefined) opts.issue = Number(opts.issue);
  if (opts.story !== undefined) opts.story = Number(opts.story);
  if (opts.pr !== undefined) opts.pr = /^[1-9]\d*$/.test(opts.pr) ? Number(opts.pr) : NaN;
  return opts;
}

// How a worker's session is ended: stopped first (the conversation is kept), deleted once the worktree is gone.
const SESSIONS = { stop: id => stopOnly({ id }), remove: id => removeSession({ id }) };

const out = obj => process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);

function needIssue(opts) {
  if (!Number.isInteger(opts.issue)) throw new Error('--issue <N> is required');
}

function main(argv) {
  const opts = parse(argv);
  const [command, arg1] = opts._;
  if (opts.help || !command) {
    process.stdout.write(HELP);
    return 0;
  }
  const host = () => createGitHubHost({ repo: opts.repo });

  switch (command) {
    case 'publish': {
      if (!arg1) throw new Error('publish needs a draft file');
      const cfg = readConfig();
      for (const w of cfg.warnings) console.error(`[haku] warning: ${w}`);
      const mapFile = `${arg1}.map.json`;
      const state = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : { numbers: {} };
      let result;
      try {
        result = publish(opts.apply ? host() : null, JSON.parse(fs.readFileSync(arg1, 'utf8')), {
          apply: Boolean(opts.apply),
          state,
          orchestrator: opts.orchestrator || null,
        titlePrefix: titlePrefixOn(cfg.config)
        });
      } finally {
        // Save progress even when publish throws midway, so a retry resumes instead of duplicating.
        if (opts.apply && Object.keys(state.numbers).length) fs.writeFileSync(mapFile, JSON.stringify(state, null, 2));
      }
      out(result);
      return result.ok ? 0 : 1;
    }
    case 'reconcile': {
      const result = reconcile(host(), { apply: Boolean(opts.apply) });
      if (opts.json) out(result);
      else {
        console.log(`reconcile against ${result.base}: ${result.dryRun ? 'dry-run (nothing closed)' : 'applied'}`);
        for (const p of result.plan) console.log(`  close #${p.issue}  [${p.kind}] ${p.reason}`);
        for (const w of result.warnings) console.log(`  warn  ${describeWarning(w)}`);
        if (!result.plan.length && !result.warnings.length) console.log('  nothing to do');
      }
      return 0;
    }
    case 'verify': {
      if (!opts.profile || !opts.base) throw new Error('--profile and --base are required');
      const result = verify({
        profile: opts.profile,
        base: opts.base,
        cwd: opts.cwd || process.cwd(),
        trustWorkingCopy: Boolean(opts.trust)
      });
      out(result);
      return result.status === 'pass' ? 0 : result.status === 'review' ? 2 : 1;
    }
    case 'verify-record': {
      needIssue(opts);
      host().commentIssue(opts.issue, `${verifiedMarker({ kind: opts.kind, status: opts.status, sha: opts.sha })}\nVerification ${opts.status} (${opts.kind}).`);
      return 0;
    }
    case 'summary': {
      needIssue(opts);
      if (!opts.file) throw new Error('--file <summary.md> is required');
      host().commentIssue(opts.issue, `${SUMMARY_MARKER}\n${fs.readFileSync(opts.file, 'utf8')}`);
      return 0;
    }
    case 'done-check': {
      needIssue(opts);
      const result = doneCheck(host(), opts.issue);
      if (opts.json) out(result);
      else console.log(result.ok ? `#${opts.issue}: worker may be deleted` : `#${opts.issue}: NOT done, missing: ${result.missing.join(', ')}`);
      return result.ok ? 0 : 1;
    }
    case 'worker-start': {
      needIssue(opts);
      if (!opts.title || !opts.base) throw new Error('--title and --base are required');
      out(startWorker({ cwd: opts.cwd || process.cwd(), issue: opts.issue, title: opts.title, base: opts.base, host: host() }));
      return 0;
    }
    case 'worker-launch': {
      needIssue(opts);
      const cwd = opts.cwd || process.cwd();
      const cfg = readConfig(cwd);
      for (const w of cfg.warnings) console.error(`[haku] warning: ${w}`);
      const h = host();
      out(launchWorker({
        host: h,
        cwd,
        issue: opts.issue,
        orchestrator: opts.orchestrator,
        repo: opts.repo || null,
        base: opts.base || h.defaultBranch(),
        settings: workerSettings(cfg.config),
        pluginRoot: path.resolve(__dirname, '..')
      }));
      return 0;
    }
    case 'config': {
      const cfg = readConfig(opts.cwd || process.cwd());
      for (const w of cfg.warnings) console.error(`[haku] warning: ${w}`);
      out({ file: cfg.file, config: cfg.config, titlePrefix: titlePrefixOn(cfg.config), worker: workerSettings(cfg.config) });
      return 0;
    }
    case 'worker-list':
      out(withSessionStates(listWorkers(opts.cwd || process.cwd())));
      return 0;
    case 'worker-rm': {
      needIssue(opts);
      const cwd = opts.cwd || process.cwd();
      if (opts.abandon) {
        out(removeWorker({ cwd, issue: opts.issue, gate: null, abandon: true, discard: Boolean(opts.discard), sessions: SESSIONS }));
        return 0;
      }
      out(removeWorker({ cwd, issue: opts.issue, gate: doneCheck(host(), opts.issue), discard: Boolean(opts.discard), deleteRemote: true, sessions: SESSIONS }));
      return 0;
    }
    case 'pr-state': {
      needIssue(opts);
      const cwd = opts.cwd || process.cwd();
      const record = listWorkers(cwd).find(w => w.issue === opts.issue);
      const branch = opts.branch || (record && record.branch);
      if (!branch) throw new Error(`no worker record for #${opts.issue}; pass --branch <name>`);
      const tip = spawnSync('git', ['rev-parse', '--verify', '-q', branch], { cwd, encoding: 'utf8' });
      const result = prState(host(), branch, tip.status === 0 ? tip.stdout.trim() : null);
      out(result);
      // 3 = merged or closed: do not push to this branch
      return result.safeToPush ? 0 : 3;
    }
    case 'status': {
      const s = buildStatus(host().listIssues(), listWorkers(opts.cwd || process.cwd()));
      if (opts.json) out(s); else process.stdout.write(renderStatus(s));
      return 0;
    }
    case 'triage': {
      const t = buildTriage(host().listBacklog());
      if (opts.json) out(t); else process.stdout.write(renderTriage(t));
      return 0;
    }
    case 'accept-close': {
      needIssue(opts);
      if (!opts.userApproved) throw new Error('--user-approved is required: run accept-close only after the user chose "closed on purpose" for this task');
      acceptClosedTask(host(), opts.issue, opts.reason);
      console.log(`#${opts.issue}: recorded as closed on purpose; reconcile may now roll its parent up`);
      return 0;
    }
    case 'issue-close': {
      needIssue(opts);
      if (!opts.reason || !opts.reason.trim()) throw new Error('--reason <text> is required: say why the issue is closed');
      closeForTriage(host(), opts.issue, opts.reason);
      console.log(`#${opts.issue} closed as not planned`);
      return 0;
    }
    case 'pr-body':
      needIssue(opts);
      process.stdout.write(skeleton(opts.issue));
      return 0;
    case 'branch-protection': {
      const cfg = readConfig(opts.cwd || process.cwd());
      for (const w of cfg.warnings) console.error(`[haku] warning: ${w}`);
      // Exit 0: the requested merge mode may be used. Exit 3: it may not (asking is the answer).
      const { report, exitCode } = checkProtection({
        host: { getIssue: n => host().getIssue(n), branchProtection: b => host().branchProtection(b), defaultBranch: () => host().defaultBranch() },
        mode: opts.mode, story: opts.story, repoGiven: Boolean(opts.repo), configMode: cfg.config.mergeMode,
        warn: m => console.error(`[haku] warning: ${m}`)
      });
      if (opts.json) out(report); else process.stdout.write(renderProtection(report));
      return exitCode;
    }
    case 'pr-config-changes': {
      if (opts.pr === undefined || !(Number.isInteger(opts.pr) && opts.pr > 0)) throw new Error('--pr <number> is required');
      if (opts.issue !== undefined && !(Number.isInteger(opts.issue) && opts.issue > 0)) throw new Error('--issue needs an issue number');
      const found = prConfigChanges({ host: host(), cwd: opts.cwd || process.cwd(), pr: opts.pr, issue: opts.issue, warn: m => console.error(`[haku] warning: ${m}`) });
      if (opts.json) out({ pr: opts.pr, changes: found });
      else process.stdout.write(renderChanges(found));
      // a warning, not a block: exit 0 whether or not something was found
      return 0;
    }
    case 'pr-check': {
      needIssue(opts);
      if (!opts.file && opts.pr === undefined) throw new Error('--file <body.md> or --pr <number> is required');
      if (opts.pr !== undefined && !(Number.isInteger(opts.pr) && opts.pr > 0)) throw new Error('--pr needs a pull request number');
      const problems = [];
      if (opts.file) problems.push(...checkBody(fs.readFileSync(opts.file, 'utf8'), opts.issue).problems);
      if (opts.pr !== undefined) problems.push(...checkClosingLink(host(), opts.pr, opts.issue).problems);
      const result = { ok: problems.length === 0, problems };
      if (opts.json) out(result);
      else if (result.ok) console.log(`#${opts.issue}: PR 점검 통과`);
      else {
        console.log(`#${opts.issue}: PR 점검 실패`);
        for (const p of result.problems) console.log(`  - ${p}`);
      }
      return result.ok ? 0 : 1;
    }
    case 'project-names': {
      if (!opts.names) throw new Error('--names <a,b,c> is required');
      const user = readUserConfig();
      for (const w of user.warnings) console.error(`[haku] warning: ${w}`);
      const owner = opts.owner || null;
      out({
        owner,
        prefix: user.repoPrefix,
        defaults: { projectsDir: user.projectsDir, visibility: user.visibility },
        candidates: checkNames(opts.names.split(',').filter(n => n.trim()), { owner, prefix: user.repoPrefix, existing: listRepoNames(owner) })
      });
      return 0;
    }
    case 'project-new': {
      if (!opts.name || !opts.dir) throw new Error('--name and --dir are required');
      if (!path.isAbsolute(opts.dir)) throw new Error('--dir must be an absolute path');
      const plan = planProject({ name: opts.name, parentDir: opts.dir, owner: opts.owner || null, visibility: opts.visibility || 'private' });
      if (!opts.apply) {
        out({ dryRun: true, ...plan });
        return 0;
      }
      // The name is checked again right before the remote write; a clash found now stops everything.
      if (repoExists(plan.owner, plan.name)) throw new Error(`a repository named ${plan.name} already exists`);
      out(createProject(plan));
      return 0;
    }
    case 'branch':
      needIssue(opts);
      console.log(`task/${opts.issue}-${slugify(stripPrefix(opts.title))}`);
      return 0;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(`[haku] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { main, parse };
