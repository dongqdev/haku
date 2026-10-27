---
name: start-up
description: One-time setup of ecc-harness in the current Git repository - checks the toolchain, GitHub auth, default-branch protection and the verify profile file, then shows a plan and applies it only after approval. Use on "/ecc-harness:start-up", "하네스 설치", or before the first plan-story in a repository.
---

# start-up

Prepare the current repository for ecc-harness. Everything is **shown first and applied only after the user approves**. Answer the user in Korean.

Helper: `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js"` (called `issues.js` below).

## 1. Preflight (read-only, run all, report as a table)

| Check | How | If it fails |
|---|---|---|
| Node >= 18 | `node --version` | stop, ask the user to install |
| Git repo with `origin` | `git remote get-url origin` | stop |
| GitHub CLI logged in | `gh auth status` | tell the user to run `gh auth login` themselves; do not handle credentials |
| Default branch | `gh repo view --json defaultBranchRef` | stop |
| Default-branch protection | `gh api repos/{owner}/{repo}/branches/<base>/protection` (404 = none) | report; recommend "PR required, no direct push" - never change it silently |
| `.ecc-harness/verify.json` on the default branch | `git show <base>:.ecc-harness/verify.json` | propose a starter file (step 3) |
| Config scope | is `CLAUDE_CONFIG_DIR` set, and where does it point? | state which settings folder this install affects |

## 2. Rail

The rail says whose work this is. Default to the `gh api user --jq .login` value; ask the user to confirm or change it with a choice question. Store it as `rail` in `.ecc-harness/config.json` together with `maxWorkers` (default 2) and `mergeMode` (`approve-each`).

## 3. Plan, then apply

Print the exact list of files and remote objects that would be created:

- `.ecc-harness/config.json` (rail, maxWorkers, mergeMode)
- a starter `.ecc-harness/verify.json` with profiles detected from the repository (e.g. `package.json` test script -> profile `unit` with `countPattern` and `minTests: 1`)
- the base labels (`ecc-harness`, `type:story|milestone|task`, `rail:<name>`)

Rules for the apply step:

- Ask for approval with a choice question. Nothing is written before the answer.
- **Never push to the default branch.** `verify.json` must reach the default branch through a normal PR, because verification reads it from there. Create it on a branch `chore/ecc-harness-setup`, open the PR, and tell the user it needs their merge.
- Labels are created with `gh label create <name> --force`.
- Do not edit global Claude settings, rules or hooks here. If the user wants hooks, show the plan and ask separately.

## 4. Finish

Report what was set up and what is still pending (for example "the setup PR must be merged before the first task can be verified"). Point to `/ecc-harness:plan-story` as the next step.
