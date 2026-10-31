---
name: status
description: Read-only view of where the work stands - tasks open and closed per story, what can start now, what is blocked, which workers are running, and parents that stayed open although every child is closed. Use on "/haku:status", "현황", or before reconcile or planning to see the state.
---

# status

Show the state of the work. Answer the user in Korean. **Read-only**: this skill never writes to GitHub or to files.

Helper: `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js"` (called `issues.js`).

## Decisions

Every choice you put to the user goes through a choice question (AskUserQuestion), and a risky branch is never settled by assuming. The full rule is the `## Decisions` section of `${CLAUDE_PLUGIN_ROOT}/skills/sniff/SKILL.md`.

## Procedure

1. Run `issues.js status` and show its output as is. It prints five fixed sections, always in this order: 스토리 진행, 지금 시작할 수 있음, 막힘, 진행 중(워커), 마감 미완. An empty section says "(없음)", so a missing section means the output was cut off, not that nothing is there.
2. If the command fails, stop and report the error. That includes "refusing to decide on a partial list": lists are read to the last page, and one that cannot be read completely is an error, not a result. Never show partial results as if they were complete.
3. Under the tables, add at most three sentences in Korean: what the user can do next. For "마감 미완" say that `issues.js reconcile` (dry-run first) rolls those parents up, and that the user decides whether to apply it. Do not run it here.
