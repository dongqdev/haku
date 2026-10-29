#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { createGitHubHost } = require('./lib/github-host');
const { reconcile } = require('./lib/reconcile');
const { publish } = require('./lib/publish');
const { verify } = require('./lib/verify');
const { doneCheck } = require('./lib/done-gate');
const { startWorker, removeWorker, listWorkers } = require('./lib/worker');
const { slugify, SUMMARY_MARKER, verifiedMarker } = require('./lib/model');

const HELP = `ecc-harness issues

Usage:
  issues.js publish <draft.json> [--apply] [--orchestrator <id>] [--repo <owner/repo>]
  issues.js reconcile [--apply] [--json] [--repo <owner/repo>]
  issues.js verify --profile <name> --base <ref> [--cwd <dir>] [--json]
  issues.js verify-record --issue <N> --kind <T1|T2|T3> --status <pass|fail> [--sha <sha>]
  issues.js summary --issue <N> --file <summary.md>
  issues.js done-check --issue <N> [--json]
  issues.js worker-start --issue <N> --title <text> --base <branch> [--cwd <dir>]
  issues.js worker-list [--cwd <dir>]
  issues.js worker-rm --issue <N> [--cwd <dir>] [--abandon]
  issues.js pr-body --issue <N>
  issues.js branch --issue <N> --title <text>

publish       Dry-run by default; --apply creates the story/milestone/task issues.
              Progress is kept in <draft>.map.json so an interrupted run resumes.
reconcile     Dry-run by default; --apply closes merged-but-open tasks and rolls up.
verify        Exit 0 = pass, 1 = fail, 2 = review needed (see reasons).
done-check    Exit 0 only when a worker may be deleted.
`;

const VALUE = new Set(['--repo', '--issue', '--title', '--profile', '--base', '--cwd', '--kind',
  '--status', '--sha', '--file', '--orchestrator']);

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--trust-working-copy') opts.trust = true;
    else if (arg === '--abandon') opts.abandon = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (VALUE.has(arg)) opts[arg.slice(2)] = argv[++i];
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
      const mapFile = `${arg1}.map.json`;
      const state = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : { numbers: {} };
      let result;
      try {
        result = publish(opts.apply ? host() : null, JSON.parse(fs.readFileSync(arg1, 'utf8')), {
          apply: Boolean(opts.apply),
          state,
          orchestrator: opts.orchestrator || null
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
        out(removeWorker({ cwd, issue: opts.issue, gate: null, abandon: true }));
        return 0;
      }
      out(removeWorker({ cwd, issue: opts.issue, gate: doneCheck(host(), opts.issue), deleteRemote: true }));
      return 0;
    }
    case 'pr-body':
      needIssue(opts);
      console.log(`Closes #${opts.issue}`);
      return 0;
    case 'branch':
      needIssue(opts);
      console.log(`task/${opts.issue}-${slugify(opts.title)}`);
      return 0;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(`[ecc-harness] ${err.message}`);
    process.exit(1);
  }
}

module.exports = { main, parse };
