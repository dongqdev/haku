#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const { createGitHubHost } = require('./lib/github-host');
const { reconcile } = require('./lib/reconcile');
const { publish } = require('./lib/publish');
const { verify } = require('./lib/verify');
const { doneCheck } = require('./lib/done-gate');
const { startWorker, removeWorker, listWorkers } = require('./lib/worker');
const { prState } = require('./lib/pr-state');
const { slugify, stripPrefix, SUMMARY_MARKER, verifiedMarker } = require('./lib/model');
const { readConfig, titlePrefixOn } = require('./lib/config');
const { skeleton, checkBody } = require('./lib/pr-body');
const { buildStatus, renderStatus } = require('./lib/status');
const { buildTriage, renderTriage, closeForTriage } = require('./lib/triage');

const HELP = `haku issues

Usage:
  issues.js publish <draft.json> [--apply] [--orchestrator <id>] [--repo <owner/repo>]
  issues.js reconcile [--apply] [--json] [--repo <owner/repo>]
  issues.js verify --profile <name> --base <ref> [--cwd <dir>] [--json]
  issues.js verify-record --issue <N> --kind <T1|T2|T3> --status <pass|fail> [--sha <sha>]
  issues.js summary --issue <N> --file <summary.md>
  issues.js done-check --issue <N> [--json]
  issues.js worker-start --issue <N> --title <text> --base <branch> [--cwd <dir>]
  issues.js worker-list [--cwd <dir>]
  issues.js worker-rm --issue <N> [--cwd <dir>] [--abandon] [--discard]
  issues.js pr-state --issue <N> [--branch <name>] [--cwd <dir>]
  issues.js status [--json] [--repo <owner/repo>]
  issues.js triage [--json] [--repo <owner/repo>]
  issues.js issue-close --issue <N> --reason <text> [--repo <owner/repo>]
  issues.js pr-body --issue <N>
  issues.js pr-check --issue <N> --file <body.md>
  issues.js branch --issue <N> --title <text>

publish       Dry-run by default; --apply creates the story/milestone/task issues.
              Progress is kept in <draft>.map.json so an interrupted run resumes.
reconcile     Dry-run by default; --apply closes merged-but-open tasks and rolls up.
verify        Exit 0 = pass, 1 = fail, 2 = review needed (see reasons).
done-check    Exit 0 only when a worker may be deleted.
`;

const VALUE = new Set(['--repo', '--issue', '--title', '--profile', '--base', '--cwd', '--kind',
  '--status', '--sha', '--file', '--orchestrator', '--reason', '--branch']);

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--trust-working-copy') opts.trust = true;
    else if (arg === '--abandon') opts.abandon = true;
    else if (arg === '--discard') opts.discard = true;
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
  return opts;
}

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
        for (const w of result.warnings) console.log(`  warn  ${w.kind} ${w.issue ? `#${w.issue}` : `PR #${w.pr}`}`);
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
    case 'worker-list':
      out(listWorkers(opts.cwd || process.cwd()));
      return 0;
    case 'worker-rm': {
      needIssue(opts);
      const cwd = opts.cwd || process.cwd();
      if (opts.abandon) {
        out(removeWorker({ cwd, issue: opts.issue, gate: null, abandon: true, discard: Boolean(opts.discard) }));
        return 0;
      }
      out(removeWorker({ cwd, issue: opts.issue, gate: doneCheck(host(), opts.issue), discard: Boolean(opts.discard), deleteRemote: true }));
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
    case 'pr-check': {
      needIssue(opts);
      if (!opts.file) throw new Error('--file <body.md> is required');
      const result = checkBody(fs.readFileSync(opts.file, 'utf8'), opts.issue);
      if (opts.json) out(result);
      else if (result.ok) console.log(`#${opts.issue}: PR 본문 점검 통과`);
      else {
        console.log(`#${opts.issue}: PR 본문 점검 실패`);
        for (const p of result.problems) console.log(`  - ${p}`);
      }
      return result.ok ? 0 : 1;
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
