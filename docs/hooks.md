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

### 요약 (한국어)

교정 문장을 손으로 모으는 목록입니다(자동 수집 없음). 한 문장은 300자까지이며, 넘으면 거절합니다. 토큰·키·비밀번호
모양이나 개인 경로가 있으면 가리지 않고 통째로 저장하지 않고, 이유 종류만 알립니다. 저장소 안쪽 폴더는 거절합니다.
30일이 지난 줄은 쓸 때마다 지워지고 `list`에도 안 나옵니다. `clear`는 파일을 지웁니다.
