# ecc-harness

Personal cross-platform harness for Claude Code, built on ideas from [ECC](https://github.com/affaan-m/ECC) (MIT).
Work is tracked as Git issues; a planning session becomes the orchestrator and runs one worker per task.
Status: **0.1.0, GitHub + Linux first.** GitLab and Windows/macOS verification are not done yet.

## Install (two lines, once)

```
/plugin marketplace add <owner>/ecc-harness
/plugin install ecc-harness@ecc-harness
```

Then in the repository you want to work on:

```
/ecc-harness:start-up      # checks, plan, approval, setup PR
/ecc-harness:plan-story    # goal -> draft -> approval -> issues -> develop
```

## Flow

1. `plan-story` drafts story / milestones / tasks locally, shows them, and registers issues only after approval.
2. `develop` starts one worker per ready task (own worktree + `task/<N>-slug` branch, max 2 by default).
3. Each task is verified by tier: **T1** Linux automatic, **T2** Windows/macOS automatic, **T3** measurement document done by the user.
4. Merging needs the user's approval per PR (the screen lists the issues that will close). Automatic merging exists only as an explicit per-story opt-in for verified T1/T2 work.
5. After the merge: verification on the default branch, `reconcile` closes merged-but-open tasks and rolls up milestones and stories, then the worker is deleted - only if its summary and passing verification are recorded.

## Safety properties (each covered by a test)

- Verify commands are read from `.ecc-harness/verify.json` on the **default branch**, never from the worker branch or issue text.
- Exit code 0 is necessary, not sufficient: enough tests must have run, and test files must not be deleted or shrunk.
- A PR never closes a story or milestone directly; roll-up does, after children close.
- Closing keywords inside code fences / quotes and references to other repositories are ignored.
- `publish` and `reconcile` are dry-run unless `--apply` is given.

## Layout

```
.claude-plugin/   plugin + marketplace manifests
skills/           start-up, plan-story, develop
agents/           worker
scripts/          issues.js (CLI) and lib/ (model, publish, reconcile, verify, done-gate, worker, github-host)
tests/            node --test tests/*.test.js
```

## Verify profiles

`.ecc-harness/verify.json` (commit it to the default branch):

```json
{
  "profiles": {
    "unit": {
      "cmd": ["npm", "test"],
      "countPattern": "tests (\\d+)",
      "minTests": 1
    }
  }
}
```

`cmd` is an argument array (no shell). `countPattern` has one capture group that reads the number of tests that ran.
