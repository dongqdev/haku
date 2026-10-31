# haku hooks

Design background: [docs/design/hooks-and-capture.md](design/hooks-and-capture.md).

## Scope check (`hooks/scope-check.js`) - record-only, opt-in

Just before Claude edits or writes a file, this hook compares the file with the `Scope:` line of `.haku-issue.md`
in the work folder. A file outside the scope is **recorded**; nothing is ever blocked. The hook always exits 0
(also on broken input, an oversized input over 1 MB, a folder that is not a haku repository, or a missing scope
file), so it cannot stop your work.

The plugin does not switch it on. It ships no `hooks/hooks.json` and registers nothing in `plugin.json`. You opt in
per repository, by hand.

### Turn it on (one repository)

Put this in the repository's `.claude/settings.local.json` (a local file that is not committed; adjust the path to
where the haku plugin is installed, `${CLAUDE_PLUGIN_ROOT}` is only set for plugin-registered hooks):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "node", "args": ["/path/to/haku/hooks/scope-check.js"] }
        ]
      }
    ]
  }
}
```

Records are written only when the environment variable `CLAUDE_PLUGIN_DATA` names a folder. Without it the hook
records nothing. **`CLAUDE_PLUGIN_DATA` is probably not set for a hook you register by hand** in
`settings.local.json`; only hooks registered by a plugin are expected to get it (unverified). So give it explicitly,
for example in the `env` block of the same settings file (`"env": { "CLAUDE_PLUGIN_DATA": "/home/you/.haku-data" }`)
or as a prefix in the command. This is untested in a live session. A folder equal to the repository root or inside
it (also through a symlink) is refused, so a record cannot end up in a commit. The file lives outside the
repository, and records of all repositories that use the same folder share one `scope-violations.jsonl`.

### What is recorded

One JSON line per violation in `$CLAUDE_PLUGIN_DATA/scope-violations.jsonl`:
`{"time": "...", "file": "src/y.js", "scope": ["docs/**"]}`. Only the path relative to the repository root and the
scope globs are stored: no prompt text, no file content, no absolute path. The file stays on your machine.
`.haku-issue.md` and `.claude/` are always counted as outside the scope.

### How it matches

`**` crosses folders, `*` stays in one name, a plain path matches that file (or folder). Backslashes and a drive
letter in any case are normalized, and `..` is resolved. The repository root is the nearest folder upward from the
working directory that holds `.haku/config.json`.

### Turn it off

Remove the entry from `.claude/settings.local.json`. To drop the data, delete `scope-violations.jsonl`.

### 요약 (한국어)

작업 범위(`Scope:`) 밖 파일을 쓰려 하면 경로만 기록하고 절대 막지 않습니다(항상 종료 코드 0). 기본으로 켜지지
않으며, 저장소의 `.claude/settings.local.json`에 위 예시를 직접 넣어야 켜집니다. 끄려면 그 항목을 지우세요.
`CLAUDE_PLUGIN_DATA`가 없으면 아무것도 기록하지 않습니다.

## Worker stop check (`hooks/worker-stop.js`) - blocks once, opt-in

A `SubagentStop` hook for the `worker` agent. When a worker ends its report with no pull request (address, "PR",
"pull request"), no summary, no question and no "blocked" notice, the hook exits 2 with a reason on stderr, which
makes the worker keep going once. This is the first haku hook that can block. Guards, in this order:

- `stop_hook_active` true (the worker is already continuing because of a stop hook): pass.
- The official hooks docs do not say whether `SubagentStop` input carries `stop_hook_active`, so the hook does not
  rely on it. It also keeps its own marker file (in the temp folder, one per `agent_id`, falling back to the agent's
  transcript path or the session id) and never blocks the same agent twice. With none of those ids in the input it
  does not block at all. If the marker cannot be written, it passes. So it blocks at most once per agent whether or
  not the field is there.
- Claude Code itself ignores stop-hook blocks after 8 in a row, so this is a help, not a guarantee. The orchestrator
  still checks the report, the pull request and the checks itself; the hook never replaces that.
- The agent is not `worker` (or `haku:worker`), the input is broken or over 1 MB, or there is no text to judge: pass.
- Any error in the script: pass (exit 0).

The plugin does not switch it on (no `hooks/hooks.json`); the default stays off. To opt in, in the repository's
`.claude/settings.local.json` (adjust the path):

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "hooks": [
          { "type": "command", "command": "node", "args": ["/path/to/haku/hooks/worker-stop.js"] }
        ]
      }
    ]
  }
}
```

Turn it off by removing the entry. The check is a rough text match, so a worker whose report mentions a pull request
only in passing passes; it is a safety net for an empty "done." report, not a quality gate.

### 요약 (한국어)

`worker` 에이전트가 PR도 요약도 질문도 막힘 알림도 없이 끝내면 한 번만 계속하게 막는 SubagentStop 훅입니다(종료 코드 2).
`stop_hook_active`를 가장 먼저 확인해 재진입 시 통과하고(SubagentStop 입력에 이 값이 있는지 공식 문서에 없어 자체 마커 파일로 에이전트당 한 번만 막음), 워커가 아니거나 판정할 수 없거나 오류가 나면 통과합니다.
연속 8회 차단 뒤에는 무시되므로 보증이 아니라 보조이며 최종 검증은 오케스트레이터가 합니다. 기본은 꺼짐이며 위 예시를 `settings.local.json`에 직접 넣어야 켜집니다.

## Collecting correction sentences (`issues.js corrections`)

A hand-made, local list of short sentences that correct the agent, for the next retro. Nothing is captured
automatically.

```
issues.js corrections add --text "<sentence>"
issues.js corrections list
issues.js corrections clear
```

- A sentence is at most 300 characters; a longer one is rejected, never cut.
- A sentence that looks like a token, key or password, or names a personal path, is not saved at all (never masked);
  the command names the reason class and does not print the sentence.
- One file, `$CLAUDE_PLUGIN_DATA/corrections.jsonl` (without it: `~/.haku/corrections.jsonl`), one `{time, text}` JSON
  line each. A folder inside the current repository is refused (symlinks resolved).
- Lines older than 30 days are removed on every write and ignored by `list`. `clear` deletes the file.

Cautions:

- The sentence is passed on the command line, so it can show up in the process list, the shell history and the
  session transcript. Do not type secrets into it; the filter is a safety net, not a promise.
- The filter is deliberately wide: a long hex or base64-like string (32+ characters), such as a long identifier, is
  rejected too.
- `CLAUDE_PLUGIN_DATA` may differ between contexts; when the variable is absent, `list` reads `~/.haku/corrections.jsonl`,
  which may be a different file than the one a hook-run `add` wrote.
- The file is written aside and renamed over the old one (no half-written file); two writers at the same moment may
  lose one entry.

### 요약 (한국어)

교정 문장을 손으로 모으는 목록입니다(자동 수집 없음). 한 문장은 300자까지이며, 넘으면 거절합니다. 토큰·키·비밀번호
모양이나 개인 경로가 있으면 가리지 않고 통째로 저장하지 않고, 이유 종류만 알립니다. 저장소 안쪽 폴더는 거절합니다.
30일이 지난 줄은 쓸 때마다 지워지고 `list`에도 안 나옵니다. `clear`는 파일을 지웁니다.

명령줄로 넘기므로 문장이 프로세스 목록·셸 기록·세션 기록에 남을 수 있으니 비밀을 쓰지 마세요. 긴 식별자도 길이 때문에 거절될 수 있고, `CLAUDE_PLUGIN_DATA`가 없는 곳에서는 `~/.haku`를 읽습니다.
