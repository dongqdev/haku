---
name: retro
description: Turn what happened during the work into fixes for haku itself - gathers feedback from worker summaries, review comments and the user's remarks, sorts it into personal preference, immediate fix and rule candidate, proposes changes as diffs, and applies only what the user approves. Use on "/haku:retro", "회고", or at the end of a story.
---

# retro

Learn from the run. Answer the user in Korean. Changes go to the **haku source repository**, never to the installed copy under the plugin cache, and only through the normal flow (issue, branch, pull request, the user merges).

Helper: `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js"` (called `issues.js`).

## Decisions

Ask the user to decide only through a choice question (AskUserQuestion), never as a free-text question. Put the recommended option first and mark it "(Recommended)". Notices and reports are plain text. Write the question text as literal UTF-8; never use `\uXXXX` escapes, which can garble Korean. Only the orchestrator talks to the user; a worker that needs a decision sends it to the orchestrator. This covers small and procedural questions too (whether to go on, when to ask, A or B): any sentence that asks the user to answer or choose is a decision. Before ending a reply, read its last paragraph; if it asks in prose (a question mark, "shall I", "let me know"), turn it into a choice question. Never postpone a question to later, and never fall back to prose when the tool call is declined: ask again, shorter, one decision with a one-line explanation. A step the user already instructed needs no question.

## 1. Gather

Read, do not summarize from memory: the worker-summary comments and verification comments on the issues closed since the last retro (`gh issue view <n> --comments`), the review comments on the merged pull requests, and what the user said went wrong or was clumsy in this session. Quote the source (issue or PR number) for every item.

## 2. Sort

Put each item in exactly one bucket and say why:

- **Personal preference** of this user: not a haku change. Offer to save it to the user's own memory or notes, and ask where with a choice question.
- **Immediate fix**: only typos, dead links and wording that changes no behavior.
- **Rule candidate**: anything that changes behavior, a gate, a check or a skill's steps.

## 3. Propose

Show every change per file as a diff, with the item it comes from. Ask for approval with choice questions, a few items at a time. Apply only approved items:

- Immediate fixes: through a branch and a pull request in the haku repository, one pull request for the batch.
- Rule candidates: register one issue per candidate in the haku repository with acceptance criteria. Do not implement them in this skill.

## 4. Close the loop

For each applied item, leave a comment on its source (issue or PR): "반영됨 → #N". Report what was applied, what was only registered, and what the user declined.
