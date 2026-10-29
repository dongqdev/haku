---
name: setup
description: One-time setup of haku in the current Git repository (or a brand-new project when there is none yet) - checks the toolchain, GitHub auth, default-branch protection and the verify profile file, then shows a plan and applies it only after approval. Use on "/haku:setup", "하네스 설치", or before the first plan in a repository.
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

## 0. No repository yet? Start a new project

If the current folder is not inside a Git repository with an `origin` (`git rev-parse --show-toplevel`, `git remote get-url origin`), or the user says they want to make a new program or project, do not stop at the preflight. Run this flow, then continue with step 1 inside the new folder (run every later command with that folder as the working directory).

1. **Align the goal.** If the goal is vague (purpose, scope, success criteria), run `/haku:sniff` first and keep its summary file; the repository is named from that summary.
2. **Propose names.** Think of three short English kebab-case names from the goal and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js" project-names --names a,b,c [--owner <account>]`. It is read-only: it prints the user's defaults (`projectsDir`, `repoPrefix`, `visibility`; they come from `HAKU_PROJECTS_DIR` or `~/.haku/config.json`, never from a repository), applies the prefix, and checks each name against the account's existing repositories with `gh repo list`. Offer only candidates with `ok: true`, as a choice question, recommended first, and **use the `name` field exactly as printed (prefix included)** from here on. If the check fails, say so and do not claim the names are free.
3. **Decide the rest with choice questions.** Parent folder (if `projectsDir` is empty, ask; never create a project in a place the user did not pick; it must be an absolute path outside any Git repository), owner (the personal account first; organizations only from `gh api user/orgs --jq '.[].login'`, never guessed), visibility (private is recommended and the default).
4. **Show the plan and ask for approval.** `project-new --name <repo> --dir <absolute parent> [--owner <account>] --visibility <private|public>` is a dry run that prints the folder, the steps and the notice. Show the user the exact folder, the owner/name, the visibility, that **a remote repository will be created**, and the notice that the first commit goes straight to `main` (the one exception to "never push to the default branch"). Nothing is created before the approval choice.
5. **Apply once.** Run the same command with `--apply`. It creates the folder, `git init -b main`, a README and the first commit, creates the remote repository, then pushes. If a step fails it says what was done and deletes nothing (after a failed remote or push the repository may exist on the host: check with `gh repo view`). Report that and ask how to go on with a choice question.
6. **Continue with step 1 below** in the new folder. Mention that later `plan`/`build` commands must run with that folder as the working directory; if this session cannot work there, tell the user to open a session in it.

## 1. Preflight (read-only, run all, report as a table)

| Check | How | If it fails |
|---|---|---|
| Node >= 18 | `node --version` | stop, ask the user to install |
| Git repo with `origin` | `git remote get-url origin` | stop |
| GitHub CLI logged in | `gh auth status` | tell the user to run `gh auth login` themselves; do not handle credentials |
| Default branch | `gh repo view --json defaultBranchRef` | stop |
| Default-branch protection | `issues.js branch-protection` (read-only) | report its state in plain words: `protected` / `unprotected` (can be turned on in the repository settings) / `unavailable` (the plan does not allow it: private repository on a free plan) / `unknown` (could not be checked). Never change the setting silently |
| `.haku/verify.json` on the default branch | `git show <base>:.haku/verify.json` | propose a starter file (step 3) |
| Config scope | is `CLAUDE_CONFIG_DIR` set, and where does it point? | state which settings folder this install affects |

## 2. Assignee

The assignee is the host account that owns the work. Default to the `gh api user --jq .login` value; ask the user to confirm or change it with a choice question. Store it as `assignee` in `.haku/config.json` together with `maxWorkers` (default 2) and `mergeMode` (`approve-each`).

`mergeMode` is `approve-each` unless the preflight says the default branch is `protected`. When the state is `unprotected`, `unavailable` or `unknown`, do not offer `auto-when-verified` at all, say in one sentence why (the `reason` that `issues.js branch-protection` prints), and show the substitute safeguards it lists (required check CI, workers never push to the default branch, the checks before every merge). Tell the user that if protection becomes possible later (a public repository, a paid plan, or turning it on in the settings), `auto-when-verified` can be enabled then.

## 3. Plan, then apply

Print the exact list of files and remote objects that would be created:

- `.haku/config.json` (assignee, maxWorkers, mergeMode, titlePrefix)
- a starter `.haku/verify.json` with profiles detected from the repository (e.g. `package.json` test script -> profile `unit` with `countPattern` and `minTests: 1`)
- `.github/pull_request_template.md` with the Korean PR sections (요약, 이유, 변경 내용, 테스트, 위험과 영향); copy it from `${CLAUDE_PLUGIN_ROOT}/.github/pull_request_template.md` unless the repository already has one
- the base labels (`haku`, `type:story|milestone|task`; `owner:<name>` is created only when someone cannot be assigned)

Rules for the apply step:

- Ask for approval with a choice question. Nothing is written before the answer.
- **Never push to the default branch** (the first commit of a brand-new empty repository in step 0 is the only exception). `verify.json` must reach the default branch through a normal PR, because verification reads it from there. Create it on a branch `chore/haku-setup`, open the PR, and tell the user it needs their merge.
- Labels are created with `gh label create <name> --force`.
- Do not edit global Claude settings, rules or hooks here. If the user wants hooks, show the plan and ask separately.

## 4. Finish

Report what was set up and what is still pending (for example "the setup PR must be merged before the first task can be verified"). Point to `/haku:plan` as the next step.
