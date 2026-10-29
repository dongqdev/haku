<p align="center"><img src="assets/haku.svg" alt="haku, a chihuahua" width="128"></p>

# haku

**HAKU** = **H**arness **A**ssistant **K**eeping **U**sers in the loop. A small, loud guard dog for your Claude Code work: the user decides and merges, the assistant keeps issues, workers and checks in line.

Personal cross-platform harness for Claude Code. The ideas of per-task worktree workers, issue-based coordination and a merge gate come from [ECC](https://github.com/affaan-m/ECC) (MIT); the code is written from scratch and contains none of ECC's.
Work is tracked as Git issues; a planning session becomes the orchestrator and runs one worker per task.
Status: **0.1.0, GitHub + Linux first.** GitLab and Windows/macOS verification are not done yet.

## Install (two lines, once)

```
/plugin marketplace add https://github.com/<owner>/haku-harness.git
/plugin install haku@haku
```

Use the HTTPS URL: the `owner/repo` shorthand resolves to SSH, which fails for private repositories without an SSH key.

Then in the repository you want to work on:

```
/haku:setup         # once per repository: checks, plan, approval, setup PR
/haku:plan          # goal -> draft -> approval -> issues -> build
```

You normally type only these two. `plan` hands a vague goal to `sniff` first and continues into `build` after you approve the plan; type `build` yourself only to resume a story after losing the session. Anytime: `status` (read-only view of the work), `triage` (sort open issues that belong to no story), `retro` (turn what went wrong into fixes for haku).

## Flow

1. `plan` drafts story / milestones / tasks locally, shows them, and registers issues only after approval.
2. `build` starts one worker per ready task (own worktree + `task/<N>-slug` branch, max 2 by default).
3. Each task is verified by tier: **T1** Linux automatic, **T2** Windows/macOS automatic, **T3** measurement document done by the user.
4. Merging needs the user's approval per PR (the screen lists the issues that will close). Automatic merging exists only as an explicit per-story opt-in for verified T1/T2 work.
5. After the merge: verification on the default branch, `reconcile` closes merged-but-open tasks and rolls up milestones and stories, then the worker is deleted - only if its summary and passing verification are recorded.

## Releases

Claude Code keeps an installed plugin in a cache keyed by its **version**, so a merged change that keeps the version never reaches an installed copy (`plugin update` answers "already at the latest version"). Every PR that changes `skills/`, `agents/`, `scripts/` or `.claude-plugin/` must therefore raise the version in both `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`; CI (`scripts/check-version.js`) enforces this. Use a patch bump for fixes, a minor bump for new behavior, and a minor bump with a note for renames while the version is below 1.0.

To pick up a release in a running session, run `/plugin marketplace update haku` and then `/reload-plugins`. If the session still shows the old skills, run `claude plugin update haku@haku` in a terminal and restart the session (there is no `/plugin update` command inside a session).

Coming from the earlier name? See [docs/upgrading.md](docs/upgrading.md).

## Pull request bodies

Every task PR is written in Korean with the same sections: 요약 (what), 이유 (why), 변경 내용 (changes), 테스트 (commands run, results, what was confirmed in a real environment and what was not), 위험과 영향 (compatibility, rollback, follow-ups), and the `Closes #N` line. `issues.js pr-body --issue N` prints the skeleton and `issues.js pr-check` rejects missing or empty sections, sections without Korean prose (code and quotes do not count), and closing lines that do not match the task, including `owner/repo#N` and URL forms. Each section needs at least 5 Korean characters of prose, so a section that only lists file names in code must add a sentence. `build` runs the check before asking for merge approval.

## Ownership

The owner of a story, milestone or task is the host's **assignee** (`assignee` in `.haku/config.json`). If the host refuses the assignment, for example because the person is not a collaborator, the issue is still created and gets an `owner:<name>` label instead.

## Safety properties (each covered by a test)

- Verify commands are read from `.haku/verify.json` on the **default branch**, never from the worker branch or issue text.
- Exit code 0 is necessary, not sufficient: enough tests must have run, and test files must not be deleted or shrunk.
- A PR never closes a story or milestone directly; roll-up does, after children close.
- Closing keywords inside code fences / quotes and references to other repositories are ignored.
- `publish` and `reconcile` are dry-run unless `--apply` is given.

## Layout

```
.claude-plugin/   plugin + marketplace manifests
skills/           setup, sniff, plan, build, status, triage, retro
agents/           worker
scripts/          issues.js (CLI) and lib/ (model, publish, reconcile, verify, done-gate, worker, github-host)
tests/            node --test tests/*.test.js
```

## Verify profiles

`.haku/verify.json` (commit it to the default branch):

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
