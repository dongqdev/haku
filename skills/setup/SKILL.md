---
name: setup
description: One-time setup of haku in the current Git repository - checks the toolchain, GitHub auth, default-branch protection and the verify profile file, then shows a plan and applies it only after approval. Use on "/haku:setup", "하네스 설치", or before the first plan in a repository.
---

# setup

Prepare the current repository for haku. Everything is **shown first and applied only after the user approves**. Answer the user in Korean.

Helper: `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js"` (called `issues.js` below).

## Decisions

Ask the user to decide only through a choice question (AskUserQuestion), never as a free-text question. Put the recommended option first and mark it "(Recommended)". Notices and reports are plain text. Write the question text as literal UTF-8; never use `\uXXXX` escapes, which can garble Korean. Only the orchestrator talks to the user; a worker that needs a decision sends it to the orchestrator.

## Banner

Start by printing this banner once, exactly as written, then continue:

```text
 /\__/\
( o  w o )  haku
 \_vv__/    Harness Assistant Keeping Users in the loop
```

## 1. Preflight (read-only, run all, report as a table)

| Check | How | If it fails |
|---|---|---|
| Node >= 18 | `node --version` | stop, ask the user to install |
| Git repo with `origin` | `git remote get-url origin` | stop |
| GitHub CLI logged in | `gh auth status` | tell the user to run `gh auth login` themselves; do not handle credentials |
| Default branch | `gh repo view --json defaultBranchRef` | stop |
| Default-branch protection | `gh api repos/{owner}/{repo}/branches/<base>/protection` (404 = none) | report; recommend "PR required, no direct push" - never change it silently |
| `.haku/verify.json` on the default branch | `git show <base>:.haku/verify.json` | propose a starter file (step 3) |
| Config scope | is `CLAUDE_CONFIG_DIR` set, and where does it point? | state which settings folder this install affects |

## 2. Assignee

The assignee is the host account that owns the work. Default to the `gh api user --jq .login` value; ask the user to confirm or change it with a choice question. Store it as `assignee` in `.haku/config.json` together with `maxWorkers` (default 2) and `mergeMode` (`approve-each`).

## 3. Plan, then apply

Print the exact list of files and remote objects that would be created:

- `.haku/config.json` (assignee, maxWorkers, mergeMode, titlePrefix)
- a starter `.haku/verify.json` with profiles detected from the repository (e.g. `package.json` test script -> profile `unit` with `countPattern` and `minTests: 1`)
- `.github/pull_request_template.md` with the Korean PR sections (요약, 이유, 변경 내용, 테스트, 위험과 영향); copy it from `${CLAUDE_PLUGIN_ROOT}/.github/pull_request_template.md` unless the repository already has one
- the base labels (`haku`, `type:story|milestone|task`; `owner:<name>` is created only when someone cannot be assigned)

Rules for the apply step:

- Ask for approval with a choice question. Nothing is written before the answer.
- **Never push to the default branch.** `verify.json` must reach the default branch through a normal PR, because verification reads it from there. Create it on a branch `chore/haku-setup`, open the PR, and tell the user it needs their merge.
- Labels are created with `gh label create <name> --force`.
- Do not edit global Claude settings, rules or hooks here. If the user wants hooks, show the plan and ask separately.

## 4. Finish

Report what was set up and what is still pending (for example "the setup PR must be merged before the first task can be verified"). Point to `/haku:plan` as the next step.
