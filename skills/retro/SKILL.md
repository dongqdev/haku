---
name: retro
description: Turn what happened during the work into fixes for haku itself - gathers feedback from worker summaries, review comments and the user's remarks, sorts it into personal preference, immediate fix and rule candidate, proposes changes as diffs, and applies only what the user approves. Use on "/haku:retro", "회고", or at the end of a story.
---

# retro

Learn from the run. Answer the user in Korean. Changes go to the **haku source repository**, never to the installed copy under the plugin cache, and only through the normal flow (issue, branch, pull request, the user merges).

Helper: `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js"` (called `issues.js`).

## Decisions

Every choice you put to the user goes through a choice question (AskUserQuestion), never free text, and a risky branch is never settled by assuming. Read the full rule in the `## Decisions` section of `${CLAUDE_PLUGIN_ROOT}/skills/sniff/SKILL.md` before the first question; it applies here unchanged.

## 1. Gather

A retro is about ONE story. `/haku:retro` takes the story number N (and the repository the story lives in); Gather reads the closed children (tasks and milestones) of that story. When it is started by hand without a number, ask with a choice question which closed story from `issues.js retro-due` it is for, with a last option "none: a general retro without a marker" (then step 4 does not run `retro-done`).

Read, do not summarize from memory: the worker-summary comments and verification comments on the issues closed since the last retro (`gh issue view <n> --comments`), the review comments on the merged pull requests, and what the user said went wrong or was clumsy in this session. Quote the source (issue or PR number) for every item.

Also read `issues.js corrections list` (correction sentences the user saved by hand during earlier sessions). Show each saved sentence to the user one line at a time with a choice question, the recommended option first, written as literal UTF-8 Korean: "교훈으로 쓴다 (Recommended)" or "버린다". Only the sentences chosen go through the sort below; the others are not used.

## 2. Sort

Put each item in exactly one bucket and say why:

- **Personal preference** of this user: not a haku change. Offer to save it to the user's own memory or notes, and ask where with a choice question.
- **Immediate fix**: only typos, dead links and wording that changes no behavior.
- **Rule candidate**: anything that changes behavior, a gate, a check or a skill's steps.

### Lesson criteria

A proposed improvement (rule candidate or fix) is kept only if all four hold:

- (a) Not obvious: it took something to learn.
- (b) It would help someone who hits the same problem in six months.
- (c) It is about haku itself, not a personal preference of the user (those go to the user's own notes, as above).
- (d) It is not already written in a skill, an agent file or the README.

Each proposal states in one line why it passes the four. An item that fails any of them is not proposed; it goes to a separate short "dropped" list with the criterion it failed (a, b, c or d). Show the dropped list to the user together with the proposals, so nothing disappears silently.

## 3. Propose

Show every change per file as a diff, with the item it comes from. Ask for approval with choice questions, a few items at a time. Apply only approved items:

- Immediate fixes: through a branch and a pull request in the haku repository, one pull request for the batch.
- Rule candidates: register one issue per candidate in the haku repository with acceptance criteria. Do not implement them in this skill.

## 4. Close the loop

For each applied item, leave a comment on its source (issue or PR): "반영됨 → #N". Report what was applied, what was only registered, and what the user declined. Last, write that report as a short Korean summary (only what was applied, registered or declined) to a file and run `issues.js retro-done --story N --file <summary.md> [--repo <owner/repo>]`; this leaves the marker that takes the story off the `issues.js retro-due` list. `--repo` must name the repository the story lives in whenever it is not the current checkout's repository (the retro often runs in the haku clone while the story belongs to a project repository; without `--repo` the marker would land on a different issue with the same number).

Saved correction sentences stay in their file until removed. As the last question of the retro, ask ONE choice question (never prose): "저장된 교정 문장을 지금 모두 지울까요" with the options "모두 지운다 (Recommended)" (runs `issues.js corrections clear`) or "남겨 둔다". Entries also drop out by themselves after 30 days.

A story that will not get a retro (closed before this feature existed, or the user declines) is dismissed with `issues.js retro-done --story N --skip --reason "<the user's reason>" --user-approved [--repo <owner/repo>]`, only after the user chose that with a choice question, as with `accept-close`. A story closed as not planned never waits for a retro.
