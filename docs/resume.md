# Resuming `/haku:build` after the session ends

A running `/haku:build` lives in one session. If that session ends (closed laptop, timeout, crash), nothing moves
until something starts it again. The state is not lost: it is in the issues, the labels, the pull requests and the
worktrees. The way to continue is an event that starts a fresh session, which reads that state and carries on.

haku does not create any trigger for you, and no haku code does. You set it up by hand; this page is the recipe.
Sources: code.claude.com/docs/en/routines.md, github-actions.md, scheduled-tasks.md, goal.md.

## What the resumed run does and never does

- It reads the story's issue state (`issues.js status`, `worker-list`, `pr-state`) and continues the loop of
  `skills/build/SKILL.md` from there.
- It **never merges on its own**. Merge approval, decision questions, T3 verdicts and every `--user-approved` flag
  still need your answer in a session you can see. A resumed run that reaches a gate asks again and stops for that
  task; it does not answer for you.
- It is safe to run twice: starting a worker that already has a worktree and a branch is refused by `worker-start`.

## Constraints to know first

- Every event starts a **new session**. Nothing is remembered from the last one, so whatever must survive (what is
  waiting, which pull request, what failed) has to be written to the story issue or the pull request as a comment.
- Routines are a research preview: behavior and limits can change.
- There is an hourly limit on how many runs a routine gets; events beyond it are not run. Keep the prompt cheap and
  the trigger narrow (one repository, one label or branch prefix).
- Give the routine only the permissions of a normal build session. Do not add a merge permission.

## 1. Preferred: a cloud routine on a GitHub event

Create a routine in Claude Code on the web (or with your client's routine/trigger tool) on the repository, with a
`pull_request` event trigger (opened, synchronized, review comment, check result - pick the ones you need), or with
the routine's API trigger if another system should call it. A pull request event is the moment the loop has
something to do, so no polling is needed. Prompt:

```
Resume haku for story #<S> in this repository. Run /haku:build #<S>.
First read the state: issues.js status, issues.js worker-list, and issues.js pr-state for each open task.
Continue the loop from there. Do not merge any pull request and do not answer any decision, T3 or merge-approval
question yourself: if the next step needs the user, post what is waiting (the pull request's full address and its
check state) as a comment on the story issue and stop. If nothing is left to do, say so and stop.
```

Delete or disable the routine when the story is closed (the retro marker is the signal that it is finished).

## 2. Alternative: GitHub Actions

Run `anthropics/claude-code-action@v1` from a workflow on the `pull_request` / `issue_comment` events, with the same
prompt. Read the action's documentation for the secrets it needs; keep the workflow's permissions read-only plus
comment on issues and pull requests, never merge. The same constraints apply: one new run per event, state in the
issue and pull request.

## 3. Only while a session is open: `/loop`

`/loop` (and `ScheduleWakeup`) repeat a prompt on an interval, but only while the session stays open. It helps for
waiting inside one session (see "Keeping the loop moving" in `skills/build/SKILL.md`); it does not bring back a
session that has ended. For that, use 1 or 2.

### 요약 (한국어)

세션이 끊기면 `/haku:build`는 멈추지만 상태는 이슈·라벨·PR·워크트리에 남아 있습니다. 이벤트로 새 세션을 시작해 그 상태를
읽고 루프를 이어 가게 합니다. 우선은 클라우드 routine의 GitHub `pull_request` 이벤트(또는 API) 트리거, 대안은
GitHub Actions(`anthropics/claude-code-action@v1`)이고, `/loop`는 세션이 열려 있는 동안의 주기 실행에만 씁니다.
제약: 이벤트마다 새 세션이라 상태를 이슈·PR 댓글에 남겨야 하고, routine은 연구 미리보기이며 시간당 실행 한도가
있습니다. 재개된 실행은 병합하지 않으며 승인 게이트(병합 승인, 결정 질문, T3 판정, `--user-approved`)를 대신 답하지
않습니다. haku는 트리거를 만들어 주지 않고 문서만 제공합니다.
