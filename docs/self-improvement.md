# 자가개선 순환 점검 / Self-improvement check

## 한국어

**질문**: haku는 쓰면서 스스로 나아지는가? 이 문서는 저장소의 파일과 GitHub 기록(2026-10-30에 `gh`로 읽음)에서 확인한 것만 적습니다. 제 추측은 "추론"이라고 표시합니다.

### 1. 순환의 고리

| 고리 | 지금 있는 것 | 위치 |
|---|---|---|
| 수집 | `retro` 스킬의 1단계. 닫힌 이슈의 워커 요약과 검증 댓글, 병합된 PR의 리뷰 댓글, 세션에서 사용자가 지적한 것을 직접 읽고 출처 번호를 단다. 스킬을 부르는 것은 사람이다. | `skills/retro/SKILL.md` (`## 1. Gather`) |
| 분류 | `retro` 2단계. 항목마다 개인 취향, 즉시 수정(오타·죽은 링크·동작이 안 바뀌는 문구), 규칙 후보 중 하나에 넣고 이유를 말한다. | `skills/retro/SKILL.md` (`## 2. Sort`) |
| 제안 | `retro` 3단계. 파일별 diff로 보여 주고 선택지로 승인받은 것만 적용한다. | `skills/retro/SKILL.md` (`## 3. Propose`) |
| 이슈 등록 | 규칙 후보는 항목마다 haku 저장소에 이슈 하나(인수 조건 포함)로 등록하는 것까지가 `retro`의 일이다. 등록 도구는 스킬이 `gh`로 하며, 이슈를 만드는 일반 경로는 `plan`과 `issues.js publish`이다. 백로그 정리는 `triage`. | `skills/retro/SKILL.md`, `skills/plan/SKILL.md`, `skills/triage/SKILL.md`, `scripts/issues.js` (`publish`, `triage`) |
| 반영 | 즉시 수정은 `retro`가 브랜치와 PR 하나로 묶어 낸다. 규칙 후보는 이슈가 된 뒤 `build`가 작업별 워커, 브랜치 `task/N-slug`, PR, 검증(`issues.js verify`), 사용자 병합으로 처리한다. | `skills/build/SKILL.md` (`## Loop` 2~6), `scripts/issues.js` (`worker-start`, `pr-body`, `pr-check`, `verify`) |
| 반영 뒤 원본에 알리기 | `retro` 4단계: 반영된 항목마다 원본 이슈나 PR에 "반영됨 → #N" 댓글을 남긴다. 이를 도와 주는 `issues.js` 명령은 없다(명령 목록에서 댓글을 쓰는 것은 `summary`, `verify-record`, `research-post`, 그리고 이유를 적는 `issue-close`, `accept-close`로, 어느 것도 이 용도가 아니다). 스킬 문장이고 사람과 모델이 따른다. | `skills/retro/SKILL.md` (`## 4. Close the loop`), `scripts/issues.js` 사용법 |

확인한 방법: 위 파일들을 읽었고, `scripts/issues.js`의 `switch (command)` 분기에서 명령 목록을 확인했습니다.

### 2. 실제로 돈 사례

| 사례 | 근거 | 무엇이 시작했나 |
|---|---|---|
| 결정 질문 규칙 강화 | 이슈 https://github.com/dongqdev/haku/issues/53, PR https://github.com/dongqdev/haku/pull/54 | 사용자 지시와 세션의 원인 분석. 이슈 "배경"에 "사용자 지시: 원인 분석하고 규칙을 강화합니다"라고 있고, 규칙이 개발 중 반복해서 누락된 경험이 원인이다. retro 스킬이 아니다. |
| 워커 도구 문제 | 이슈 https://github.com/dongqdev/haku/issues/61, PR https://github.com/dongqdev/haku/pull/62 | 도구 제약을 겪은 개발 세션의 판단과 사용자 선택. "사용자가 '작업별 세션 지정'과 '읽기 전용 조사 에이전트' 둘 다 하기로 선택했다"고 적혀 있다. retro 흔적 없음. PR 62는 Opus 리뷰 12건을 같은 PR 안에서 반영했다(리뷰 지적이 같은 PR을 고친 경우이며, 별도 이슈로 돌아온 것이 아니다). |
| 외부 제보 준비 | 이슈 https://github.com/dongqdev/haku/issues/55, PR https://github.com/dongqdev/haku/pull/56 | 저장소를 공개했다는 상황에 대한 세션의 판단과 사용자 선택("사용자가 4가지를 모두 하기로 선택했다"). retro 흔적 없음. |
| setup 배너 깨짐 | 이슈 https://github.com/dongqdev/haku/issues/41, PR https://github.com/dongqdev/haku/pull/42 | 사용자의 말. 이슈 "배경"에 "사용자가 휴대폰 앱에서 setup을 실행했더니 배너가 깨져 보였다"고 있다. retro 흔적 없음. |
| retro 스킬 자체 | 이슈 https://github.com/dongqdev/haku/issues/22 | 사용자가 말한 순환("테스트 세션이 개선안을 보내고, 개선 후 갱신")을 스킬로 만든 것. 순환의 틀은 만들어졌다. |

모두 이슈, 브랜치, PR, 검증, 사용자 병합을 거쳤으므로 **haku로 haku를 개발하는 흐름**은 실제로 돈다. 그러나 위 네 개 중 retro로 시작된 것은 없다.

retro가 실제로 돌았는지: 이슈 전체 41개(`gh issue list --state all --limit 500`)의 본문과 댓글, 모든 PR의 본문과 댓글에서 "반영됨 → #N" 형태의 댓글을 찾았고 0건이었다. 이슈 본문·댓글 중 이 형태는 #22의 인수 조건 문장 하나뿐이다. "retro"가 들어간 곳은 #18, #22, #70, #72, PR #19, #39, #54이며 모두 스킬을 만들었거나 언급한 글이다(#54는 retro 스킬의 `## Decisions` 규칙 문구 변경). 커밋 제목에서 retro를 말하는 것은 스킬 추가 커밋(#19) 하나다. 이 증거로 보면 retro를 실제로 돌린 흔적은 없다.

확인하지 못한 것: GitHub에 남지 않는 로컬 대화에서 retro를 불렀지만 아무것도 승인하지 않아 흔적이 없을 가능성. 사용자의 말이 어느 세션에서 나왔는지는 이슈 글을 믿는 수밖에 없다. 이 PR이 속한 이야기 #70은 점검을 위해 사람이 부탁한 것이다.

### 3. 빠진 고리

- **retro를 돌리는 계기가 없다.** 설명문은 "at the end of a story"라고 하지만, `skills/build/SKILL.md`에는 retro를 부르는 단계가 없다(`grep retro skills/*/SKILL.md`에서 스킬 자신 밖에는 없음). 훅 디렉터리가 없고(`hooks/` 없음, `.claude-plugin/plugin.json`에는 `skills`만 있음), 일정 장치도 없다. `.github/workflows/test.yml`은 테스트·줄바꿈·개인 경로·버전 검사만 한다. README는 retro를 "언제든 쓸 수 있는 것"으로 소개한다. 즉 사람이 기억해서 불러야 한다.
- **현장 문제를 haku 저장소로 자동으로 보내는 장치가 없다.** 원격 전송, 사용 기록, 제보 명령을 찾아 봤으나(`grep -rniE "telemetry|report-issue|feedback"`) 해당 코드가 없었다. 있는 경로는 사람이 쓰는 이슈 양식(`.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`)과 `SECURITY.md`이며, 양식은 `haku` 라벨을 붙이지 않아 워커가 처리하지 않는다. 이 양식은 #55로 2026-10-30에 막 생겼고, 외부 사용자의 실제 제보가 들어왔는지는 확인하지 못했다(이슈 41개 중 작성자가 소유자가 아닌 것을 따로 세지 않음).
- **스킬이 잘 지켜지는지, 고친 뒤에도 여전히 작동하는지 재는 평가가 없다.** `tests/`의 스킬 관련 시험(`decisions-rule`, `banner`, `community-files`, `sniff-rounds` 등)은 스킬 문장에 특정 문구가 있는지를 문자열로 확인한다. 모델이 그 문구대로 행동하는지 돌려 보는 시험은 없다(`claude` 실행을 부르는 시험이 `tests/`에 없음). #54의 PR 본문도 "문구가 실제 세션에서 누락을 줄이는지는 쓰면서 확인해야 합니다"라고 적었다. 그래서 규칙 강화 뒤에 줄었는지는 측정된 바 없다.
- **원본에 알리는 고리를 돕는 명령이 없다.** 위 1절 표 참조(추론: 그래서 retro가 돌아도 이 단계가 빠지기 쉽다).

### 4. 판정

**판정: 부분적이다**

근거는 이렇다. 규칙 변경 사례 네 건이 모두 이슈, PR, 검증, 사용자 병합을 거쳐 반영되었으므로 haku를 haku로 고치는 일은 돈다. 하지만 그 변경은 사용자 지시, 세션의 판단, 사용자의 말에서 시작되었고, 피드백을 모아 수정안으로 바꾸는 retro가 시작한 사례는 하나도 확인되지 않았다(반영 댓글 0건). retro를 부르는 계기, 현장 문제가 저장소로 오는 자동 경로, 규칙이 지켜지는지 재는 평가가 없다. 이 셋이 있고 retro를 거친 사례가 기록으로 남으면 분명히 "된다"가 될 것이다.

## English

**Question**: does haku improve itself as it is used? This document states only what was checked in the repository files and in the GitHub records (read with `gh` on 2026-10-30). What is my own guess is marked "inference".

### 1. The loop, link by link

| Link | What exists today | Where |
|---|---|---|
| Collect | Step 1 of the `retro` skill. It reads worker summaries and verification comments of closed issues, review comments of merged pull requests, and what the user said went wrong in the session, and quotes the issue or PR number. A person starts the skill. | `skills/retro/SKILL.md` (`## 1. Gather`) |
| Sort | Step 2 of `retro`. Each item goes into one bucket (personal preference, immediate fix for typos, dead links and wording that changes no behavior, rule candidate) with a reason. | `skills/retro/SKILL.md` (`## 2. Sort`) |
| Propose | Step 3 of `retro`. Changes are shown as a diff per file and only what the user approves through a choice question is applied. | `skills/retro/SKILL.md` (`## 3. Propose`) |
| Register issues | Each rule candidate is registered as one issue in the haku repository with acceptance criteria; that is where `retro` stops. The skill itself does this with `gh`; the general routes to create issues are `plan` and `issues.js publish`. Backlog tidying is `triage`. | `skills/retro/SKILL.md`, `skills/plan/SKILL.md`, `skills/triage/SKILL.md`, `scripts/issues.js` (`publish`, `triage`) |
| Apply | Immediate fixes: `retro` makes one branch and one pull request. Rule candidates: once an issue exists, `build` handles it with a worker per task, a `task/N-slug` branch, a pull request, verification (`issues.js verify`) and a merge by the user. | `skills/build/SKILL.md` (`## Loop` 2 to 6), `scripts/issues.js` (`worker-start`, `pr-body`, `pr-check`, `verify`) |
| Notify the source | Step 4 of `retro`: for each applied item, leave a comment "반영됨 → #N" on the source issue or PR. No `issues.js` command helps with it (the commands that write comments are `summary`, `verify-record`, `research-post`, and `issue-close` and `accept-close` with a reason, none meant for this). It is a sentence in a skill that a person and the model follow. | `skills/retro/SKILL.md` (`## 4. Close the loop`), usage text of `scripts/issues.js` |

How this was checked: I read the files above and read the command list from the `switch (command)` branches of `scripts/issues.js`.

### 2. Cases that really ran

| Case | Evidence | What started it |
|---|---|---|
| Decision-question rule strengthened | issue https://github.com/dongqdev/haku/issues/53, pull request https://github.com/dongqdev/haku/pull/54 | A user instruction plus the session's own cause analysis. The issue background quotes "사용자 지시: 원인 분석하고 규칙을 강화합니다" (user instruction: analyse the cause and strengthen the rule), and the cause is the rule being missed repeatedly during development. Not the retro skill. |
| Worker tools problem | issue https://github.com/dongqdev/haku/issues/61, pull request https://github.com/dongqdev/haku/pull/62 | The judgement of a development session that met the tool limits, and a user choice: the issue says the user chose to do both per-task sessions and a read-only research agent. No sign of retro. Pull request 62 applied 12 Opus review findings inside the same pull request (a review finding that fixed the same PR, not one that came back as a new issue). |
| Preparing for outside reports | issue https://github.com/dongqdev/haku/issues/55, pull request https://github.com/dongqdev/haku/pull/56 | The session's judgement about the repository having been made public, and a user choice (the issue says the user chose all four items). No sign of retro. |
| Setup banner broke | issue https://github.com/dongqdev/haku/issues/41, pull request https://github.com/dongqdev/haku/pull/42 | A user remark. The issue background says the user ran setup in the phone app and the banner looked broken. No sign of retro. |
| The retro skill itself | issue https://github.com/dongqdev/haku/issues/22 | The user described the loop ("a test session sends improvements, then it updates") and it was turned into a skill. The frame of the loop was built. |

All of these went through issue, branch, pull request, verification and a merge by the user, so **developing haku with haku** does run. But none of the first four was started by retro.

Whether retro ever ran: in the bodies and comments of all 41 issues (`gh issue list --state all --limit 500`) and in all pull request bodies and comments I looked for a comment of the form "반영됨 → #N" and found none. The only issue text with that form is one acceptance sentence in #22. "retro" appears in #18, #22, #70, #72 and pull requests #19, #39, #54, and all of those create or mention the skill (#54 changed the skill's `## Decisions` wording). Among commit titles, retro appears in one, the commit that added the skill (#19). By this evidence there is no trace of retro having been run.

What I could not check: whether retro was called in a local conversation that left no GitHub trace because nothing was approved. Where a user remark was made, I can only trust the issue text. Story #70, to which this report belongs, was requested by a person for this check.

### 3. Missing links

- **Nothing triggers retro.** The skill description says "at the end of a story", but `skills/build/SKILL.md` has no step that calls retro (`grep retro skills/*/SKILL.md` finds it only in the skill itself). There is no hooks directory (`hooks/` does not exist; `.claude-plugin/plugin.json` lists only `skills`) and no schedule. `.github/workflows/test.yml` only runs tests, line-ending, personal-path and version checks. The README lists retro under "usable any time". So a person has to remember to call it.
- **No automatic way for field problems to reach the haku repository.** I searched for telemetry, usage logging and a reporting command (`grep -rniE "telemetry|report-issue|feedback"`) and found no such code. The paths that exist are the issue forms people fill in (`.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`) and `SECURITY.md`; the forms do not add the `haku` label, so workers do not pick those up. The forms were added by #55 on 2026-10-30, and I could not check whether any real outside report has come in (I did not count issues not written by the owner).
- **No measurement of whether skills are followed or still work after a change.** The skill-related tests in `tests/` (`decisions-rule`, `banner`, `community-files`, `sniff-rounds` and others) check by string matching that a phrase is present in the skill text. No test runs a model against the skill (no test in `tests/` launches `claude`). The pull request body of #54 says itself that whether the wording reduces misses in real sessions has to be seen in use. So whether the strengthening helped has not been measured.
- **No command helps notify the source.** See the table in section 1 (inference: this is why that step is easy to drop even when retro is run).

### 4. Verdict

**Verdict: Partly**

The reasons: four rule-changing cases all went through issue, pull request, verification and a merge by the user, so fixing haku with haku works. But those changes started from a user instruction, a session's judgement and a user remark, and not one case started by retro, the step that gathers feedback and turns it into fixes, could be found (zero "반영됨 → #N" comments). There is no trigger for retro, no automatic route from the field to the repository, and no evaluation of whether rules are followed. With those three in place and recorded cases that went through retro, the answer would be a clear Yes.
