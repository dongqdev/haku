---
name: triage
description: Sort the open issues that belong to no story - lists the backlog and obvious duplicates, proposes what to keep or close, and applies only the rows the user confirms, then re-reads the list. Use on "/haku:triage", "백로그 정리", or before planning when open issues have piled up.
---

# triage

Tidy the backlog. Answer the user in Korean. Closing an issue writes to GitHub, so **nothing is closed without the user's confirmation of that exact row**.

Helper: `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js"` (called `issues.js`).

## Decisions

Ask the user to decide only through a choice question (AskUserQuestion), never as a free-text question. Put the recommended option first and mark it "(Recommended)". Notices and reports are plain text. Write the question text as literal UTF-8; never use `\uXXXX` escapes, which can garble Korean. Only the orchestrator talks to the user; a worker that needs a decision sends it to the orchestrator.

## Procedure

1. Run `issues.js triage` and show its two sections: open issues that belong to no story, and duplicate candidates. Duplicates are only issues with the same title or the same opening sentence; nothing fuzzier is proposed.
2. For each candidate, read the issues before judging. Propose one action per row with a one-line reason: keep, close as duplicate of #N, or close as obsolete (and what made it obsolete).
3. Ask for confirmation with choice questions, at most four rows per question, every row showing the issue number, title and proposed action. Nothing is applied from a "looks fine" or silence.
4. Apply only confirmed rows: `issues.js issue-close --issue N --reason "<why>"`. The reason is required and is written on the issue.
5. Run `issues.js triage` again and show the result so the user sees what changed. If the command reports that a list could not be read completely ("refusing to decide on a partial list"), stop and say so.

Closing an issue by hand leaves it without a merged pull request. Say this once in the report: later roll-ups can flag such an issue as closed without evidence, which is expected for triage closes.
