# 훅 안전망과 교정 자동 감지 설계 / Design: hook safety net and correction capture

## 한국어

**상태**: 설계 초안입니다(결정 1~5와 7은 확정, 6과 8은 열림). 구현이 아닙니다. 사용자가 이 문서를 승인한 뒤에 구현을 새 계획으로 세웁니다. 출처는 `docs/ideas-from-others.md`의 후보 1(훅 안전망)과 후보 13(교정 자동 감지)입니다. Claude Code 훅의 동작은 2026-10-30에 읽은 공식 문서 기준입니다(요약기를 거쳤으므로 원문과 글자까지 같다고 보증하지 못합니다). 확인하지 못한 것은 "미확인"으로 적었습니다.

### 한눈에 보기

**훅이 무엇인가요?** Claude Code가 어떤 동작 바로 앞이나 뒤에 자동으로 돌리는 작은 검사 프로그램입니다. 건물 출입구에 서 있는 경비와 같습니다. 사람이 부르지 않아도 문을 지날 때마다 확인합니다. 예: 워커가 파일을 쓰기 직전에 "이 파일이 맡은 일의 범위 안인가?"를 봅니다.

**haku는 왜 원하나요?** 지금은 작업 범위를 병합할 때 검사합니다. 시험이 다 끝난 뒤 영수증을 확인하는 것과 같아서, 범위 밖 파일을 이미 고친 뒤에야 압니다. 훅은 쓰는 순간에 알려 줍니다.

**웹훅, `.husky`와 무엇이 다른가요?** 이름이 비슷해서 헷갈리기 쉽습니다. 이 문서의 훅은 Claude가 파일을 쓰거나 명령을 실행하는 행동의 직전이나 직후에 매번 자동으로 도는 작은 프로그램입니다.

| 이름 | 누가 언제 부르나 | 예 |
|---|---|---|
| 웹훅 | 외부 서비스가 신호를 보냅니다 | GitHub가 "이슈가 열렸다"고 서버에 알림 |
| `.husky` | 사람이 `git commit`을 할 때 한 번 돕니다 | 커밋 직전에 코드 모양 검사 |
| Claude Code 훅(이 문서) | Claude의 행동 직전이나 직후마다 자동으로 돕니다 | 파일을 쓰기 직전에 범위 검사 |

**누가 이미 쓰고 있나요?** haku에는 훅이 아직 없습니다. 다른 곳에는 이미 있습니다. ECC는 `src/hooks/hooks.json`에 약 25개를 두고 Bash 실행 전, 파일 쓰기 전, 프롬프트 제출, 응답 종료, 세션 시작과 끝에 겁니다. harness 스킬 모음은 훅 6개(세션 시작, 도구 사용 전, 워크트리 진입 뒤, 응답 종료, 서브에이전트 시작과 종료)를 씁니다. 사용자 설정에는 12개 종류가 있습니다. 이번 설계는 그 방식을 haku에 맞게 작게 가져오는 것입니다. 다만 ECC와 harness 훅의 구현 세부는 읽지 않았으므로 개수와 이벤트 이름만 적었고 구현 세부는 **미확인**입니다.

**훅 네 가지, 각각 예 하나씩**

- 훅 A, 범위 검사: 워커가 맡은 일은 `docs/` 수정인데 `scripts/`의 파일을 쓰려 하면 알립니다(처음에는 기록만).
- 훅 B, 푸시 차단: 워커가 기본 브랜치로 코드를 올리려 하면 막습니다.
- 훅 C, 약화 감지: 워커가 시험을 통과시키려고 검사 설정을 느슨하게 고치면 경고합니다.
- 훅 D, 교정 수집: 세션이 끝날 때 사용자가 "아니, 한국어로 써 줘"라고 고쳐 말한 문장을 모읍니다.

**왜 작게 시작하나요?** 훅은 도구를 부를 때마다 돕니다. 파일 하나를 쓸 때도, 명령 하나를 칠 때도 돕니다. 잘못 만들면 정상 작업까지 멈춥니다. 그래서 허락한 저장소 한 곳에서, 막지 않고 기록만 하는 모드로 먼저 시작합니다.

**정정 문장이란?** 사용자가 Claude의 결과를 보고 고쳐 말한 문장입니다. 예: "아니, 한국어로 써 줘", "그게 아니라 테스트도 같이 고쳐". 같은 정정이 반복되면 Claude가 같은 실수를 계속한다는 신호입니다. 이 문장을 모아 두면 `retro`가 "이 규칙을 haku에 넣자"는 후보를 찾을 때 근거가 됩니다. 지금은 사람이 retro를 불러야만 돌고, 정정은 자동으로 모이지 않습니다.

**fail open과 fail closed란?** 경비가 갑자기 아파서 판단을 못 할 때 문을 어떻게 할지입니다. fail open은 문을 열어 둡니다. 안전은 줄지만 일은 계속됩니다. fail closed는 문을 잠급니다. 안전하지만 일이 멈춥니다. 예: 범위 검사 훅이 고장 나면 열어 둡니다(잘못 막으면 일이 멈추므로). 푸시 차단 훅은 워커 세션임을 확인한 뒤에만 잠급니다(되돌릴 수 없는 행동이므로).

**전에 미확인이던 세 가지, 확인한 결과**

2026-10-30에 읽은 공식 문서 기준입니다. 세 가지를 확인했고, 확인하지 못한 나머지는 아래에 "미확인"으로 남겼습니다.

- (가) Stop 훅의 무한 반복 막는 법(확인함): Stop 훅은 Claude가 끝내려 할 때 도는 훅입니다. 입력의 `stop_hook_active`가 true이면 "이미 Stop 훅 때문에 계속 일하는 중"이라는 뜻입니다. 공식 방지책은 이 값이 true일 때 일찍 종료 코드 0으로 끝내는 것입니다. 또 연속 8번 막으면 Claude Code가 다음 차단을 무시하고 턴을 끝냅니다(도구를 한 번 부르면 횟수가 0으로 돌아갑니다). 그러니 Stop 훅은 영원히 돌지는 않습니다. 그래도 훅 D는 Stop을 쓰지 않습니다. 8번의 헛수고는 낭비이고, 이 일에는 Stop이 필요하지 않기 때문입니다.
- (나) 플러그인 훅을 처음 켤 때 사용자에게 묻는지(대부분 미확인): 플러그인 훅 전용 "이 훅을 돌려도 되나요?" 첫 실행 승인 대화상자는 어느 페이지에도 서술이 없습니다. "서술이 없다"는 뜻이지 "없다"는 뜻이 아닙니다(**미확인**). 확인한 것은 이만큼입니다. 플러그인을 설치하면 바로 켜집니다(매니페스트나 마켓플레이스 항목이 `defaultEnabled: false`가 아닌 한). 설치 화면은 훅이 들어 있다고 보여 주고 검토를 권합니다. 그 안내가 전부이고, 피할 수 없습니다. 설정 파일의 훅은 대화형 세션에서 폴더 신뢰 대화상자를 수락하기 전까지 보류됩니다. `-p`와 SDK 세션은 대화상자 없이 폴더를 신뢰로 칩니다. 마켓플레이스에서 설치한 일반 플러그인의 훅이 이 신뢰 대화상자 전에 도는지는 서술이 없습니다(**미확인**).
- (다) 플러그인의 훅을 끄는 정확한 명령(확인함, 일부 미확인): 플러그인 전체는 `claude plugin disable <이름>@<마켓플레이스>`, `/plugin` 메뉴, `enabledPlugins` 설정으로 끕니다. 모든 훅은 `disableAllHooks: true`로 끕니다. 플러그인의 훅만 따로 끄는 방법은 없습니다. 플러그인 전체나 훅 전부만 됩니다. 미확인: `claude plugin disable` 직후 같은 세션에서 훅이 바로 멈추는지는 확인하지 못했습니다(`/reload-plugins`가 필요하다는 서술만 있습니다).

확인 결과가 설계에 미친 영향은 1절, 2절, 3절, 6절에 적었습니다. 이 확인을 먼저 하자는 것이 결정 7이었고, 끝났습니다.

### 1. 전제와 현재 상태

- haku에는 훅이 없습니다. `hooks/` 디렉터리가 없고 `.claude-plugin/plugin.json`에는 `skills`만 있습니다.
- 검사 설정 약화는 사후 경고로만 잡습니다(`scripts/lib/weaken.js`, `skills/build/SKILL.md` 5단계). 막지 않는 것이 의도입니다.
- 작업 범위(`Scope:`)는 병합 단계에서 검사합니다. 쓰는 순간에는 막지 않습니다.
- `retro`는 사람이 불러야 돕니다. 사용자의 정정은 자동으로 모이지 않습니다.
- `skills/setup/SKILL.md`는 전역 훅을 건드리지 말고 따로 물으라고 합니다. 이 설계는 그 규칙을 지킵니다.
- 이 설계가 쓰는 Claude Code 사실(2026-10-30 문서):
  - 종료 코드 2만 막습니다. 1을 포함한 다른 0이 아닌 코드는 "비차단 오류"이고 동작은 그대로 진행됩니다. 즉 기본이 fail open입니다.
  - fail closed로 바꾸려면 훅 설정에 `"onFailure": "block"`(v2.1.295 이상)을 쓰거나, 스크립트가 스스로 2로 끝나야 합니다. `onFailure`는 Stop 등 일부 이벤트에는 효과가 없습니다.
  - 플러그인 훅(`hooks/hooks.json`)은 플러그인이 켜진 모든 세션과 프로젝트에서 돕니다. 스킬을 쓰기를 기다리지 않습니다.
  - 플러그인을 설치하면 훅도 바로 켜집니다. 설치 화면의 안내 말고 따로 묻는 단계는 서술이 없습니다. 이것은 피할 수 없습니다. 그래서 haku 훅을 선택 설치로, 저장소 로컬로 두는 쪽(결정 1)이 맞습니다.
  - Stop 훅은 `stop_hook_active`가 true이면 일찍 0으로 끝내는 것이 공식 방지책이고, 연속 8번 막으면 Claude Code가 다음 차단을 무시합니다.
  - `-p`와 SDK 세션은 폴더 신뢰 대화상자를 보이지 않고 신뢰로 칩니다. 자동 실행에서는 사람이 확인하는 단계가 없습니다.
  - 입력은 표준입력의 JSON입니다(`session_id`, `transcript_path`, `cwd`, `hook_event_name`, 도구 이벤트는 `tool_name`, `tool_input`). 환경변수 `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`가 있습니다.
  - 훅은 "비밀을 디스크에서 지키는 수단"이 아닙니다. 막힌 프롬프트도 로컬에 저장됩니다. 강한 허용·거부는 권한 설정이 맡고, 훅은 보조입니다.

### 2. 훅의 종류와 목적

모든 훅은 먼저 "haku가 관리하는 저장소인가"를 봅니다. 현재 디렉터리부터 위로 올라가며 `.haku/config.json`을 찾고, 없으면 아무것도 하지 않고 0으로 끝납니다(no-op). 이 판별은 훅마다 같은 공용 함수를 씁니다.

| 훅 | 이벤트·매처 | 읽는 것 | 막거나 남기는 것 | 실패하면 |
|---|---|---|---|---|
| A. 작업 파일 범위 검사 | PreToolUse, Edit 또는 Write | `tool_input.file_path`(절대 경로), 작업 폴더의 `.haku-issue.md`에 적힌 `Scope:` | 1단계: 범위 밖 파일 쓰기를 기록만 합니다(종료 코드 0). 2단계: 사용자에게 확인을 묻습니다(`ask`). 막지 않습니다. | 열림(fail open), 확정된 위반만 기록하거나 묻음 |
| B. 푸시 차단 | PreToolUse, Bash | `tool_input.command` | 워커 세션의 원격 반영과 기본 브랜치로 가는 푸시를 막습니다. | 워커 세션이 확인된 경우에만 닫힘(fail closed) |
| C. 검사 약화 감지 | PreToolUse, Edit 또는 Write | 대상 경로, `weaken.js`의 패턴 목록 | 막지 않습니다. 경고만 내서(`ask` 또는 시스템 메시지) 사용자가 보게 합니다. | 열림(fail open) |
| D. 세션 종료 교정 수집 | SessionEnd | `transcript_path`의 사용자 메시지 | 정정 문장 후보를 로컬 파일에 한 줄씩 남깁니다. 막지 않습니다. | 열림(fail open), 항상 |

이유를 하나씩 적습니다.

- **A는 확정된 위반만 기록하거나 묻고, 읽지 못하면 통과시킵니다.** 범위 파일이 없거나 형식을 못 읽으면 다룰 근거가 없습니다. 잘못 막으면 일이 멈추므로 막지 않습니다(재생 측정에서 막았다면 정상 작업이 절반쯤 걸렸을 것입니다). 최종 방어선은 지금처럼 병합 단계의 범위 검사입니다. 훅은 "빨리 알리는" 층입니다. 범위는 워커가 시작할 때 선언한 값을 써야 합니다(`worker.js`가 같은 이유로 시작 시점의 값을 씁니다). 이슈를 나중에 고쳐 범위를 넓히는 길을 훅이 열어 주면 안 됩니다.
- **B는 되돌릴 수 없는 행동이라 닫힘이 맞습니다.** 다만 Bash 매처는 모든 명령에 붙습니다. `onFailure: block`을 설정에 걸면 훅이 죽을 때 모든 Bash가 막힙니다. 그래서 설정에는 걸지 않고, 스크립트가 (1) haku 워커 세션인지 판별하고 (2) 판별 단계의 오류는 통과시키고 (3) 워커 세션이 확인된 뒤 명령을 못 읽으면 스스로 2로 끝납니다. 이 "판별 후에만 닫힘" 규칙이 핵심입니다.
- **C는 막지 않습니다.** `weaken.js`가 이미 "경고 목록이지 차단이 아니다. 차단이 고장 나면 사람이 갇힌다"는 원칙을 씁니다. 같은 원칙을 지킵니다. 패턴 목록은 `weaken.js`를 그대로 가져다 씁니다(복사하지 않음).
- **D는 항상 열립니다.** SessionEnd의 예산은 약 1.5초라 오래 걸리면 어차피 끊깁니다. 수집이 세션 종료를 막거나 늦추면 안 됩니다. Stop 이벤트는 쓰지 않습니다. 종료 코드 2가 Claude를 계속 일하게 만들기 때문입니다. 방지책은 확인했습니다(2026-10-30에 읽은 공식 문서 기준): `stop_hook_active`가 true면 일찍 0으로 끝내고, 연속 8번 막으면 Claude Code가 다음 차단을 무시합니다. 이 상한 덕분에 Stop 훅을 써도 영원히 멈추지 않는 일은 없습니다. 그래도 쓰지 않습니다. 8번의 헛수고를 겪을 수 있고, 세션 종료 수집에는 SessionEnd로 충분하기 때문입니다.

훅은 보안 경계가 아닙니다. 복합 명령, 설정 덮어쓰기 옵션, 별칭, 다른 도구로 돌아가는 길이 있습니다. 진짜 차단은 브랜치 보호와 권한 설정이 맡고(`issues.js branch-protection`), 훅은 실수를 줄이는 층입니다. 문서와 안내에서도 그렇게 말합니다.

### 3. 훅을 어디에 둘 것인가

| | 플러그인 `hooks/hooks.json` | 저장소 로컬 설정 | 사용자가 켜는 선택 설치 |
|---|---|---|---|
| 위치 | 플러그인 루트 | 저장소의 `.claude/settings.local.json`(커밋 안 함) 또는 `.claude/settings.json`(공유) | `/haku:setup`이 사용자 동의 후 위 로컬 설정에 훅 항목을 씀 |
| 영향 범위 | haku가 전역 설치돼 있으므로 이 컴퓨터의 모든 세션, 모든 프로젝트. 매 도구 호출마다 Node 프로세스가 뜹니다. | 그 저장소만. 공유 파일이면 팀 전원. | 동의한 저장소만 |
| 끄는 방법 | 플러그인 전체를 끕니다: `claude plugin disable <이름>@<마켓플레이스>`, `/plugin` 메뉴(Installed 탭), 설정의 `enabledPlugins`. 훅 전부를 끄려면 설정의 `disableAllHooks: true`. 훅 하나만 끄는 방법은 없습니다. 같은 세션에서 바로 멈추는지는 미확인입니다(`/reload-plugins`가 필요하다는 서술만 있음). | 항목을 지우거나 `disableAllHooks`. 로컬 파일은 지우면 끝. | 같음. `setup`이 끄는 절차도 보여 줌 |
| 업데이트 | 플러그인 업데이트로 자동 반영 | 수동 | 수동. `setup`을 다시 돌림 |
| 위험 | haku를 쓰지 않는 프로젝트에도 닿습니다. no-op 판별이 틀리면 남의 작업을 막습니다. | 파일이 어긋나면 훅이 낡은 상태로 남습니다. | 켜지 않은 사람은 보호가 없습니다. |

- 플러그인 훅 전용 승인 절차(처음 켤 때 사용자에게 묻는지)는 2026-10-30에 읽은 공식 문서 어디에도 서술이 없습니다(**미확인**). "서술이 없다"는 뜻이지 "없다"는 뜻이 아닙니다. 확인된 것은 설치하면 바로 켜지고 설치 화면이 훅 존재를 알리는 것뿐입니다. 폴더 신뢰 대화상자 전까지 훅이 보류된다는 서술은 설정 파일의 훅에 대한 것입니다. 일반 마켓플레이스 플러그인의 훅이 신뢰 전에 도는지는 서술이 없습니다(미확인).
- 선택 설치(저장소 로컬)에서도 `-p`와 SDK 세션은 폴더를 신뢰로 치므로 대화상자가 없습니다. 훅이 켜진 저장소에서 자동 실행을 돌리면 사람의 확인 없이 훅이 돕니다.
- 훅 전부를 한 번만 끄려면 `--settings`로 `disableAllHooks`를 주고, `-p`에서 훅과 플러그인을 아예 읽지 않으려면 `--bare`를 씁니다.
- **확정(결정 1)**: 처음에는 선택 설치(저장소 로컬 `settings.local.json`)만 씁니다. 범위가 가장 작고, 끄기가 쉽고, `setup`의 "전역은 따로 묻는다" 규칙과 맞습니다. 플러그인 `hooks.json`은 시범에서 오탐이 없다고 확인된 뒤 다시 결정합니다.
- 어느 쪽이든 훅 스크립트는 `${CLAUDE_PLUGIN_ROOT}`에서 실행하되 상태는 그곳에 쓰지 않습니다(업데이트 때 경로가 바뀝니다). 상태는 `${CLAUDE_PLUGIN_DATA}`에 둡니다.
- `.claude/` 설정을 고치는 일은 워커 범위 밖입니다. 설치는 오케스트레이터가 사용자 동의를 받아 합니다.

### 4. 교정 자동 감지의 개인정보 규칙

**원칙**: 꺼진 것이 기본입니다. 켜면 로컬에만 남습니다. 비밀값은 저장하지 않습니다. 명령 하나로 지울 수 있습니다.

비교 조사(2026-10-30, 요약기를 거침):

- claude-smart는 매 사용자 턴, 도구 호출, 어시스턴트 응답을 기록합니다. 가림 처리와 보존 기간은 찾지 못했고, 전체 삭제 명령(`/claude-smart:clear-all`)은 있습니다. 제거해도 데이터가 남습니다.
- claude-mem은 도구 사용 요약을 저장하고 클라우드 동기화 선택지가 있습니다. 비밀 통제는 `<private>` 태그뿐이고 삭제 절차는 찾지 못했습니다.
- TracineHQ/guard는 결정 로그를 JSONL로 남기고 쓸 때 비밀 모양을 가립니다. 보존은 "사용자가 알아서"이고, 경로와 명령 일부에 개인 경로가 담길 수 있다고 조사자가 추론했습니다.
- haku는 이들보다 좁게 합니다. 대화 전체를 모으지 않습니다.

저장 규칙:

| 구분 | 내용 |
|---|---|
| 저장하는 것 | 사용자가 정정한 문장 하나(최대 300자), 시각, 저장소를 가리키는 해시, 세션 ID 앞 8자리. |
| 절대 저장하지 않는 것 | 비밀값(토큰, 키, 비밀번호 모양), 개인 경로(`scripts/lib/personal-paths.js`의 규칙을 그대로 사용), 대화 전체, 어시스턴트의 말, 도구 출력, 파일 내용. |
| 걸러내기 | 문장에 비밀 모양이나 개인 경로가 있으면 가리지 않고 **그 문장을 통째로 버립니다**. 가린 흔적이 남는 것보다 낫습니다. 걸러내기 규칙은 시험으로 고정합니다. |
| 어디에 | 로컬 파일 하나: `${CLAUDE_PLUGIN_DATA}/corrections/<저장소 해시>.jsonl`. 저장소 안(`.haku/`)에는 쓰지 않습니다. 커밋될 수 있기 때문입니다. GitHub 이슈에는 자동으로 올리지 않습니다. |
| 보존 | 30일(권장안, 결정 6에서 확정 전). 쓸 때마다 오래된 줄을 지웁니다. |
| 지우기 | 한 명령: `node scripts/issues.js corrections clear`(구현 때 만듦). 파일을 직접 지워도 됩니다. 훅을 끄면 새로 쌓이지 않습니다. 제거해도 데이터가 남는 일이 없도록 `setup`의 끄기 절차에 삭제를 포함합니다. |
| 켜기 | `.haku/config.json`의 설정과 `setup`의 동의, 둘 다 있어야 합니다. 켠 사실을 첫 수집 때 한 번 알립니다. |

정정 감지는 간단한 규칙 목록으로 합니다(예: "아니", "그게 아니라", "하지 마", "no,", "don't", "instead"). 오탐과 누락이 있습니다. 실제 정확도는 측정하지 못했습니다(**미확인**). 그래서 자동 수집과 함께 수동 표시 방법도 둡니다.

개선 후보의 흐름:

1. 훅 D가 정정 문장 후보를 로컬 파일에 남깁니다(이 단계에서는 후보일 뿐 학습이 아닙니다).
2. `retro`의 1단계(수집)가 그 파일을 읽어 사용자에게 한 줄씩 보여 줍니다. 사용자가 선택지로 "교훈으로 쓴다/버린다"를 고릅니다.
3. 고른 것만 `retro`의 분류(개인 취향, 즉시 수정, 규칙 후보)를 지나갑니다. 개인 취향은 haku에 들어오지 않습니다.
4. 규칙 후보는 지금처럼 haku 저장소에 이슈 하나로 등록합니다. 이슈에 쓰기 전에 개인 경로 검사를 한 번 더 돌립니다.
5. 이후는 기존 `triage`와 `build`가 처리합니다. 같은 정정이 여러 번 나오면 `retro`가 합쳐서 한 후보로 올립니다. 신뢰도 점수는 두지 않습니다(조사에서 효과를 확인하지 못했습니다).

### 5. 만드는 법과 시험

- **언어와 실행**: 의존성 0개의 Node 스크립트(`hooks/*.js`)입니다. 표준입력을 다 읽어 JSON으로 파싱하고, 종료 코드와 표준 출력(JSON)으로 답합니다. 공용 함수(haku 저장소 판별, 경로 정규화, 범위 해석)는 `scripts/lib/`에 둡니다. 시험 가능한 순수 함수와 얇은 입출력 껍데기로 나눕니다.
- **등록**: `{"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/scope-check.js"]}` 같은 인수 배열 형식을 씁니다. 따옴표 문제가 없고, Git Bash가 없어 PowerShell로 도는 Windows에서도 같습니다. `.cmd` 껍데기가 아닌 실제 실행 파일(`node`)을 부릅니다.
- **세 운영체제**: Windows 경로는 역슬래시로 오므로 슬래시로 바꿔 비교합니다. Windows와 macOS는 대소문자를 구분하지 않으므로 비교 때 소문자로 맞춥니다. 줄바꿈은 LF로 씁니다(`check-eol.js`가 이미 검사). 기존 CI는 이미 ubuntu(Linux), windows, macos 세 곳에서 시험을 돌립니다.
- **시험**: `node:test`로 훅 스크립트를 자식 프로세스로 띄우고 표준입력에 JSON을 넣어 종료 코드와 출력을 확인합니다. 경우는 (1) haku 저장소 아님 → 0, 출력 없음 (2) 범위 안/밖 (3) 깨진 JSON (4) 범위 파일 없음 (5) 푸시 명령 변형 (6) 비밀·개인 경로가 든 정정 문장이 저장되지 않음 (7) 삭제 명령 (8) 시간 제한 근처의 큰 입력입니다. Windows 경로는 문자열로 만든 입력으로 모든 운영체제에서 시험합니다.
- **실환경 확인**: 단위 시험만으로는 Claude Code가 실제로 훅을 어떻게 부르는지 모릅니다. 구현 단계마다 임시 저장소에 설치해 실제 세션에서 한 번씩 돌려 확인하고, 확인 못 한 것은 PR에 적습니다.

### 6. 위험: 훅이 구멍이 되는 경우

1. **전부 막는 훅**: 판별 전에 죽는데 `onFailure: block`이 걸려 있으면 모든 Bash나 모든 쓰기가 막힙니다. 대응: 설정에 걸지 않고 스크립트 안에서 판별 후에만 닫습니다.
2. **남의 프로젝트를 막는 훅**: 전역 설치라 haku 아닌 저장소에서도 돕니다. 대응: `.haku/config.json`이 없으면 즉시 0.
3. **거짓 안심**: 푸시 차단이 우회되는데 "막았다"고 믿는 경우. 대응: 훅은 보조라고 문서에 쓰고 브랜치 보호를 유지합니다.
4. **훅 코드가 공격면**: 표준입력의 명령 문자열을 셸에 넘기면 주입이 됩니다. 대응: 문자열은 파싱만 하고 어떤 셸에도 넘기지 않습니다. 경로는 정규화한 뒤 비교합니다.
5. **범위 파일을 고쳐 우회**: 워커가 `.haku-issue.md`나 훅 설정을 고쳐 막힘을 풉니다. 대응: 훅 A가 그 파일과 `.claude/` 쓰기도 범위 밖으로 보고, 범위는 시작 시점 값을 씁니다.
6. **수집이 비밀을 모음**: 걸러내기 규칙에 빈틈이 있으면 비밀이 디스크에 남습니다. 대응: 통째 버리기, 300자 제한, 30일 보존, 한 명령 삭제, 꺼진 기본값.
7. **오탐으로 잘못된 규칙이 쌓임**: 사용자 확인 없이 학습되지 않게 합니다(4절 2~3).
8. **느려짐**: 모든 도구 호출마다 Node가 뜹니다. 대응: 매처를 좁히고, 판별을 맨 앞에서 하고, 시간 제한을 짧게 둡니다.
9. **Stop 반복**: Stop 훅을 쓰면 계속 일하게 만들 수 있습니다. 방지책(`stop_hook_active` 확인)과 연속 8번 상한은 확인했습니다. 그래도 훅 D는 Stop을 쓰지 않습니다. 이후 Stop 훅이 필요해지면 `stop_hook_active`를 먼저 확인하도록 만들고 새 설계로 다시 검토합니다.
10. **업데이트 중 경로 변경**: `CLAUDE_PLUGIN_ROOT`가 바뀝니다. 상태를 거기에 쓰지 않습니다.
11. **자동 실행에는 확인 단계가 없음**: `-p`와 SDK 세션은 폴더 신뢰 대화상자 없이 신뢰로 칩니다. 훅이 켜진 저장소에서 자동 실행을 돌리면 사람이 보지 않는 채로 훅이 돕니다. 대응: 훅은 기록 위주로 두고, 막는 훅은 판별 후에만 닫으며, 끄는 스위치(`disableAllHooks`, `--bare`)를 문서에 적습니다.
12. **설치만 해도 켜짐**: 플러그인을 설치하면 훅도 바로 켜지고 설치 화면의 안내가 전부입니다. 대응: 플러그인 `hooks.json`을 보내지 않고 선택 설치와 저장소 로컬을 유지합니다(결정 1). 보내게 되면 7단계에서 이 점을 다시 따집니다.

### 7. 단계별 도입 순서

각 단계는 별도 이슈와 PR이며, 앞 단계의 결과를 보고 다음으로 갑니다.

1. **0단계**: 이 문서를 사용자가 승인합니다. 미확인 세 가지(Stop 반복 방지, 플러그인 훅 승인 절차, 플러그인 끄기 명령)는 2026-10-30에 읽은 공식 문서로 확인을 마쳤습니다. 남은 미확인은 플러그인 훅 전용 첫 실행 승인의 유무, 일반 플러그인 훅과 폴더 신뢰의 순서, `claude plugin disable`의 같은 세션 즉시 효과입니다. 1단계의 실환경 확인에서 이 셋을 실제로 시험합니다.
2. **1단계**: 공용 함수(haku 저장소 판별, 경로 정규화)와 훅 A를 "기록만 하는 모드"로 시범 설치합니다. 선택 설치 한 저장소에서 오탐 수를 봅니다.
3. **2단계**: 훅 A를 확인 모드로 올립니다. 범위 밖 쓰기마다 사용자에게 허용 여부를 묻고(PreToolUse의 `permissionDecision`을 `ask`로 돌려줌), 어떤 오류에서도 열림(fail open)입니다. 막는 모드는 이후 측정에서 오탐이 없다고 확인될 때만 다시 검토합니다. 훅 출력의 정확한 필드 이름과 동작은 이 문서에서 확인한 적이 없으므로 **미확인**이고, 구현 전에 공식 문서와 실환경에서 확인합니다.
   - **측정 결과(2026-10-31)**: 병합된 PR 42개를 기록 모드로 재생했습니다(쓰기 391건). 범위 밖 쓰기는 13개 PR에서 33건이었고, 범위 기본 항목(README, `.claude-plugin/**`)을 더하니 11개 PR에서 22건이 남았습니다. 이 22건 중 11건은 범위 줄이 좁았던 정상 작업(막으면 오탐), 11건은 실제로 범위를 넘은 것이었습니다. 그래서 막는 모드가 아니라 확인 모드로 갑니다. 이 재생은 범위 줄의 정확도를 잰 것이고, 훅이 실제 세션에서 도는 동작은 재지 못했습니다.
4. **3단계**: 훅 C(약화 경고). 위험이 가장 낮습니다.
5. **4단계**: 훅 B(푸시 차단). 우회 시험을 먼저 씁니다.
6. **5단계**: 수동 표시 명령과 `retro`의 읽기, 삭제 명령. 자동 수집 없이 먼저 흐름만 확인합니다.
7. **6단계**: 훅 D(자동 수집). 켜기는 선택이고 기본은 꺼짐.
8. **7단계**: 플러그인 `hooks.json` 배포 여부를 다시 결정합니다.
9. **결정 변경(0.16.19)**: 워커가 PR이나 요약 없이 끝나는 것을 막으려고 막는 훅 E(`hooks/worker-stop.js`, SubagentStop)를 도입합니다. 위 "Stop 이벤트는 쓰지 않는다" 결정은 SubagentStop의 이 한 훅에 한해 바뀝니다. 지킨 조건: `stop_hook_active`를 먼저 확인해 재진입은 통과(입력에 없어도 자체 마커 파일로 에이전트당 한 번만), 워커 에이전트가 아니거나 판정 불가이면 통과, 어떤 오류에서도 열림(fail open), 한 번만 막음. 기본은 꺼짐(옵트인, `settings.local.json`)이며 7단계의 `hooks.json` 배포 결정은 그대로 미룹니다.

### 8. 사용자가 고를 결정 목록

결정 1~5와 7은 **확정된 결정**입니다. 다시 묻지 않습니다. 결정 7은 확인을 마쳐서 확정으로 바꿨습니다. 결정 6과 8만 **열린 결정**입니다. 열린 결정은 선택지 질문으로 그대로 쓸 수 있게 적었고, 권장안이 첫 번째입니다.

#### 결정 1. 훅을 어디에 둘까

- 상태: **확정된 결정**
- 쉬운 설명: 경비를 모든 건물에 세울지, 허락한 건물에만 세울지 정하는 일입니다.
- 예: 플러그인에 넣으면 haku를 안 쓰는 프로젝트에서도 훅이 돕니다. 저장소 로컬 선택 설치는 사용자가 "여기는 켜 달라"고 한 저장소에서만 돕니다.
- 질문: 훅을 어디에 설치할까요?
- 선택지: (a) 저장소 로컬 선택 설치만 (확정), (b) 플러그인 `hooks/hooks.json` 전역, (c) 공유 `.claude/settings.json`
- 달라지는 것: (a)는 동의한 저장소에만 닿고 끄기 쉽습니다. (b)는 모든 프로젝트에 닿습니다. (c)는 팀 전원에게 닿습니다.
- 확정된 답: (a) 저장소 로컬 선택 설치만. 영향 범위가 가장 작고 `setup` 규칙과 맞습니다.

#### 결정 2. 처음에 만들 훅

- 상태: **확정된 결정**
- 쉬운 설명: 여러 경비 중 어느 하나를 가장 먼저 세워 보는지 정하는 일입니다.
- 예: 훅 A는 워커가 범위 밖 파일을 쓰려 할 때 알립니다. 처음에는 막지 않고 기록만 해서, 잘못 알리는 횟수를 먼저 셉니다.
- 질문: 첫 시범으로 어떤 훅을 만들까요?
- 선택지: (a) 작업 파일 범위 검사, 기록만 하는 모드 (확정), (b) 검사 약화 경고, (c) 푸시 차단
- 달라지는 것: (a)는 가치와 오탐을 가장 먼저 알 수 있습니다. (b)는 가장 안전하지만 이미 사후 경고가 있습니다. (c)는 효과가 크나 우회 위험이 큽니다.
- 확정된 답: (a) 작업 파일 범위 검사를 기록만 하는 모드로. 후보 1의 추천(작은 시범 하나)과 같습니다.

#### 결정 3. 푸시 차단이 고장 났을 때

- 상태: **확정된 결정**
- 쉬운 설명: 경비가 아파서 판단을 못 할 때 문을 잠글지 열어 둘지 정하는 일입니다(fail closed와 fail open).
- 예: 훅이 죽었을 때 모든 Bash를 막으면 정상 작업도 다 멈춥니다. 워커 세션이 확인된 때만 잠그면, 그 밖의 세션은 영향이 없습니다.
- 질문: 푸시 차단 훅이 오류로 판단하지 못하면 어떻게 할까요?
- 선택지: (a) 워커 세션이 확인된 경우에만 막고 그 밖은 통과 (확정), (b) 항상 막음(`onFailure: block`), (c) 항상 통과
- 달라지는 것: (b)는 훅이 죽으면 모든 Bash가 멈춥니다. (c)는 훅이 있어도 없는 것과 같을 수 있습니다.
- 확정된 답: (a) 워커 세션이 확인된 경우에만 막고 나머지는 통과. 막는 쪽은 판별이 끝난 뒤에만 닫습니다.

#### 결정 4. 교정 자동 수집을 할까

- 상태: **확정된 결정**
- 쉬운 설명: 사용자의 정정 문장을 기계가 알아서 모을지, 사람이 표시한 것만 읽을지 정하는 일입니다.
- 예: 자동은 세션이 끝날 때 "아니, 한국어로 써 줘" 같은 문장을 알아서 줍습니다. 수동은 사용자가 "이건 기억해 줘"라고 표시한 문장만 `retro`가 읽습니다.
- 질문: 사용자의 정정을 자동으로 모을까요?
- 선택지: (a) 먼저 수동 표시와 `retro` 읽기만 만들고 자동 수집은 나중에 (확정), (b) 처음부터 자동 수집(꺼진 기본값), (c) 하지 않음
- 달라지는 것: (a)는 개인정보 위험 없이 흐름을 먼저 확인합니다. (b)는 빠르지만 걸러내기 규칙을 먼저 완성해야 합니다. (c)는 후보 13을 버립니다.
- 확정된 답: (a) 수동 표시와 `retro` 읽기 먼저, 자동은 나중에. 후보 13의 "보류" 추천과 맞습니다.

#### 결정 5. 정정 문장을 어디에 저장할까

- 상태: **확정된 결정**
- 쉬운 설명: 모은 문장을 내 컴퓨터의 서랍에 둘지, 저장소나 GitHub에 올릴지 정하는 일입니다.
- 예: 저장소 안 파일은 실수로 커밋돼 남들이 볼 수 있습니다. 저장소 밖 로컬 파일은 내 컴퓨터를 벗어나지 않습니다.
- 질문: 수집한 문장은 어디에 둘까요?
- 선택지: (a) 로컬 파일만, 저장소 밖 (확정), (b) 저장소 안 `.haku/` 파일, (c) GitHub 이슈
- 달라지는 것: (a)는 내 컴퓨터를 벗어나지 않습니다. (b)는 커밋될 수 있습니다. (c)는 공개 저장소면 누구나 읽습니다.
- 확정된 답: (a) 로컬 파일만, 저장소 밖. 이슈로 가는 것은 `retro`에서 사용자가 승인한 항목뿐입니다.

#### 결정 6. 보존 기간

- 상태: **열린 결정**
- 쉬운 설명: 모은 문장을 서랍에 며칠 두었다가 버릴지 정하는 일입니다.
- 예: 7일이면 일주일 뒤에 `retro`를 돌릴 때 후보가 이미 사라져 있을 수 있습니다. 30일이면 한 달은 남습니다.
- 질문: 로컬 파일은 며칠 보관할까요?
- 선택지: (a) 30일 (Recommended), (b) 7일, (c) 지울 때까지
- 달라지는 것: 짧을수록 남는 위험이 작고, `retro`를 늦게 돌리면 후보가 사라집니다.
- 권장: (a). 한 번의 스토리 주기보다 길고 무기한은 아닙니다.

#### 결정 7. 미확인 항목을 먼저 확인할까

- 상태: **확정된 결정** (확인 완료)
- 쉬운 설명: 한눈에 보기의 "미확인 세 가지"를 짓기 전에 작은 일로 먼저 확인할지, 해당 훅을 만들 때 확인할지 정하는 일이었습니다.
- 예: Stop 훅의 무한 반복을 막는 법을 모른 채 Stop 훅을 만들면 Claude가 멈추지 않을 수 있습니다. 먼저 원문에서 읽어 두면 그런 일을 피합니다.
- 질문: Stop 반복 방지, 플러그인 훅 승인 절차, 플러그인 끄기 명령을 구현 전에 원문에서 확인할까요?
- 선택지: (a) 0단계에서 먼저 확인 (확정, 완료), (b) 해당 훅을 만들 때 확인
- 달라지는 것: (a)는 설계가 바뀔 가능성을 앞에서 줄입니다. (b)는 시작이 빠릅니다.
- 확정된 답: (a). 2026-10-30에 읽은 공식 문서로 세 가지를 확인했습니다. 남은 미확인: 플러그인 훅 전용 첫 실행 승인이 있는지(서술 없음), 일반 마켓플레이스 플러그인의 훅이 폴더 신뢰 대화상자 전에 도는지(서술 없음), `claude plugin disable` 직후 같은 세션에서 훅이 바로 멈추는지, 플러그인의 훅 하나만 끄는 방법(없음, 플러그인 전체나 훅 전부만 가능). 이 항목은 1단계의 실환경 확인에서 시험합니다.

#### 결정 8. 이 설계를 승인하고 구현 계획을 세울까

- 상태: **열린 결정**
- 쉬운 설명: 이 문서의 내용대로 실제 만들기를 시작해도 좋은지 정하는 일입니다.
- 예: 승인하면 7절 1단계(공용 함수와 범위 검사 기록 모드)의 이슈와 계획이 만들어집니다. 보류하면 코드가 바뀌는 것은 없습니다.
- 질문: 이 문서를 승인하고 7절의 순서로 구현 계획을 세울까요?
- 선택지: (a) 승인, 1단계부터 계획 (Recommended), (b) 수정 후 다시 검토, (c) 보류
- 달라지는 것: (a)는 새 계획과 이슈가 만들어집니다. (b)(c)는 코드 변경이 없습니다.
- 권장: (a). 단 결정 6을 먼저 고른 뒤.

## English

**Status**: a design draft (decisions 1 to 5 and 7 decided, 6 and 8 open), not an implementation. After the user approves this document, the implementation is planned as a new plan. The sources are candidate 1 (hook safety net) and candidate 13 (automatic correction capture) in `docs/ideas-from-others.md`. Claude Code hook behavior is per the docs read on 2026-10-30 (the text passed a summarizer, so it cannot be guaranteed to match the original word for word). Whatever could not be confirmed is marked "unverified".

### At a glance

**What is a hook?** A small check that Claude Code runs automatically just before or after an action. It is like a guard standing at a building entrance: nobody has to call it, it checks every time someone passes. Example: just before a worker writes a file, the hook asks "is this file inside the scope of the assigned task?".

**Why does haku want one?** Today the task scope is checked at merge time. That is like checking the receipt after the shopping is over: haku learns about a file outside the scope only after it was changed. A hook tells at the moment of writing.

**How is it different from a webhook or `.husky`?** The names are easy to mix up. The hook in this document is a small program that runs automatically, every time, just before or just after Claude writes a file or runs a command.

| Name | Who calls it, and when | Example |
|---|---|---|
| Webhook | An outside service sends a signal | GitHub tells a server "an issue was opened" |
| `.husky` | Runs once when a person does `git commit` | Code-style check just before the commit |
| Claude Code hook (this document) | Runs automatically before or after each action of Claude | Scope check just before a file is written |

**Who already uses hooks?** haku has no hooks yet. Other places do. ECC has about 25 in `src/hooks/hooks.json`, attached before Bash runs, before file writes, at prompt submit, at the end of a response, and at session start and end. The harness skill set uses 6 hooks (session start, before tool use, after entering a worktree, end of a response, subagent start and stop). The user settings have 12 kinds. This design takes that approach into haku in a small, fitted form. The implementation details of the ECC and harness hooks were not read, so only counts and event names are given, and the implementation details are **unverified**.

**The four hooks, one example each**

- Hook A, scope check: the worker's task is editing `docs/`, but it tries to write a file under `scripts/`. The hook notices (at first it only records).
- Hook B, push block: the worker tries to push code to the default branch. The hook blocks it.
- Hook C, weakening detection: the worker loosens a check setting just to make the tests pass. The hook warns.
- Hook D, correction capture: at the end of a session it collects a sentence where the user corrected Claude, such as "no, write it in Korean".

**Why start small?** Hooks run on every tool call: every file write and every command. A badly made hook stops normal work too. So the first step is one repository that agreed, in a mode that only records and does not block.

**What is a correction sentence?** A sentence in which the user corrects Claude after seeing its result. Examples: "no, write it in Korean", "not that, fix the tests as well". If the same correction repeats, it is a sign that Claude keeps making the same mistake. Saved sentences give `retro` evidence when it looks for a candidate such as "let us put this rule into haku". Today `retro` runs only when a person calls it, and corrections are not collected automatically.

**What are fail open and fail closed?** They say what the door does when the guard suddenly falls ill and cannot decide. Fail open leaves the door open: less safe, but work goes on. Fail closed locks the door: safe, but work stops. Example: if the scope-check hook breaks, the door stays open (a wrong block would stop the work). The push-block hook locks the door only after it has confirmed this is a worker session (because a push cannot be undone).

**The three things that were unverified, and what the check found**

This is per the docs read on 2026-10-30. The three were checked. What could not be confirmed stays marked "unverified" below.

- (a) How to stop a Stop hook from looping forever (checked): a Stop hook runs when Claude is about to finish. In its input, `stop_hook_active` set to true means "Claude is already continuing because of a stop hook". The official prevention is to exit early with code 0 when it is true. Also, after 8 blocks in a row Claude Code ignores the next block and ends the turn (the count resets when Claude calls a tool). So a Stop hook would not loop forever. Even so, hook D does not use Stop: eight wasted rounds are a cost, and this job does not need Stop.
- (b) Whether the user is asked once before a plugin's hook is allowed to run (mostly unverified): no page describes a first-run "may this hook run?" dialog for plugin hooks. That means "not described", not "does not exist" (**unverified**). What is confirmed: installing a plugin enables it at once (unless the manifest or marketplace entry sets `defaultEnabled: false`). The install screen shows that hooks are included and advises a review. That notice is all there is, and it cannot be avoided. Hooks in settings files are held in an interactive session until the folder trust dialog is accepted. `-p` and SDK sessions treat the folder as trusted without a dialog. Whether the hooks of a normal marketplace plugin run before that trust dialog is not described (**unverified**).
- (c) The exact command to turn a plugin's hooks off (checked, partly unverified): turn off the whole plugin with `claude plugin disable <name>@<marketplace>`, the `/plugin` menu, or the `enabledPlugins` setting. Turn off all hooks with `disableAllHooks: true`. There is no way to turn off only a plugin's hooks: it is the whole plugin or all hooks. Unverified: whether hooks stop at once in the same session right after `claude plugin disable` (the only statement is that `/reload-plugins` is needed).

The effects of these findings on the design are written in sections 1, 2, 3 and 6. Decision 7 asked to do this check first, and it is done.

### 1. Premises and current state

- haku has no hooks. There is no `hooks/` directory and `.claude-plugin/plugin.json` lists only `skills`.
- Weakened check settings are caught only as an after-the-fact warning (`scripts/lib/weaken.js`, step 5 of `skills/build/SKILL.md`). Not blocking is intended.
- The task `Scope:` is checked at merge time. Writes are not blocked as they happen.
- `retro` runs only when a person calls it. The user's corrections are not collected automatically.
- `skills/setup/SKILL.md` says not to touch global hooks and to ask separately. This design keeps that rule.
- Claude Code facts used here (docs of 2026-10-30):
  - Only exit code 2 blocks. Any other non-zero code, 1 included, is a "non-blocking error" and the action goes ahead. The default is fail open.
  - To fail closed, set `"onFailure": "block"` (v2.1.295 or later) in the hook config, or have the script exit 2 itself. `onFailure` has no effect for some events such as Stop.
  - Plugin hooks (`hooks/hooks.json`) run in every session and project where the plugin is enabled. They do not wait for a skill to be used.
  - Installing a plugin enables its hooks at once. No separate asking step is described beyond the install-screen notice. This cannot be avoided, which is why keeping haku hooks opt-in and repository-local (decision 1) is right.
  - For a Stop hook, exiting early with 0 when `stop_hook_active` is true is the official prevention, and after 8 blocks in a row Claude Code ignores the next block.
  - `-p` and SDK sessions treat the folder as trusted without showing the trust dialog. In automated runs no person confirms anything.
  - Input is JSON on standard input (`session_id`, `transcript_path`, `cwd`, `hook_event_name`; tool events add `tool_name`, `tool_input`). The environment has `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`.
  - A hook is not a way to keep a secret off disk: a blocked prompt is still stored locally. Hard allow and deny belong to the permission settings; hooks are a supplement.

### 2. Hook kinds and purposes

Every hook first asks "is this a haku-managed repository?". It walks up from the current directory looking for `.haku/config.json`. If there is none, it does nothing and exits 0 (no-op). All hooks share one function for this check.

| Hook | Event and matcher | Reads | Blocks or records | On failure |
|---|---|---|---|---|
| A. Task file-scope check | PreToolUse, Edit or Write | `tool_input.file_path` (absolute), the `Scope:` line in `.haku-issue.md` in the work folder | Stage 1: only records writes to files outside the scope (exit 0). Stage 2: asks the user to confirm (`ask`). Never blocks. | Open (fail open); only a confirmed violation is recorded or asked about |
| B. Push block | PreToolUse, Bash | `tool_input.command` | Blocks remote publishing in worker sessions and any push to the default branch. | Closed (fail closed), only when a worker session is confirmed |
| C. Weakened-check detection | PreToolUse, Edit or Write | target path, the pattern list of `weaken.js` | Does not block. It warns (`ask` or a system message) so the user sees it. | Open (fail open) |
| D. Session-end correction capture | SessionEnd | the user messages in `transcript_path` | Appends candidate correcting sentences to a local file, one per line. Does not block. | Open (fail open), always |

The reasons, one by one.

- **A records or asks only about a confirmed violation and lets everything else through.** With no scope file, or one that cannot be read, there is no ground to act on, and a wrong block stops the work, so it never blocks (in the replay, blocking would have stopped about half of the flagged normal work). The last line of defense stays the merge-time scope check. The hook is the layer that tells early. It must use the scope declared when the worker started (`worker.js` uses the start-time value for the same reason). The hook must not open a path where editing the issue later widens the scope.
- **B is irreversible, so closed is right.** But the Bash matcher attaches to every command. With `onFailure: block` in the config, a crashing hook would block all Bash. So the config does not set it, and the script (1) decides whether this is a haku worker session, (2) lets errors in that step pass, and (3) once a worker session is confirmed, exits 2 itself if it cannot read the command. "Closed only after detection" is the key rule.
- **C does not block.** `weaken.js` already states the principle: it is a warning list, never a block, because a broken block locks people out. This design keeps it. The patterns are imported from `weaken.js`, not copied.
- **D is always open.** The SessionEnd budget is about 1.5 seconds, so a slow hook is cut off anyway. Capture must never block or delay the end of a session. The Stop event is not used: exit 2 there makes Claude keep working. The prevention is confirmed (per the docs read on 2026-10-30): exit early with 0 when `stop_hook_active` is true, and after 8 blocks in a row Claude Code ignores the next block. That cap means a Stop hook would not stop Claude from ever finishing. It is still not used: it could cost eight wasted rounds, and SessionEnd is enough for session-end capture.

Hooks are not a security boundary. Compound commands, config-override options, aliases and other tools all give ways around them. Real blocking belongs to branch protection and permission settings (`issues.js branch-protection`); hooks reduce mistakes. The documentation says so too.

### 3. Where hooks should live

| | Plugin `hooks/hooks.json` | Repository-local settings | Opt-in install by the user |
|---|---|---|---|
| Location | plugin root | `.claude/settings.local.json` in the repository (not committed) or `.claude/settings.json` (shared) | `/haku:setup` writes hook entries into the local settings after the user agrees |
| Blast radius | haku is installed globally, so every session and every project on this computer. A Node process starts at each tool call. | That repository only. If the file is shared, the whole team. | Only the repositories that agreed |
| How to turn off | Turn off the whole plugin: `claude plugin disable <name>@<marketplace>`, the `/plugin` menu (Installed tab), or `enabledPlugins` in settings. To turn off all hooks, `disableAllHooks: true` in settings. There is no way to turn off one hook alone. Whether it stops at once in the same session is unverified (the only statement is that `/reload-plugins` is needed). | Delete the entry or use `disableAllHooks`. A local file is removed by deleting it. | Same. `setup` also shows the turn-off steps |
| Updates | follow plugin updates | manual | manual; run `setup` again |
| Risk | reaches projects that do not use haku. A wrong no-op check blocks someone else's work. | the file can drift and leave stale hooks | people who do not opt in have no protection |

- A plugin-hook-specific approval step when first enabled is not described anywhere in the docs read on 2026-10-30 (**unverified**). That means "not described", not "does not exist". What is confirmed is only that installing enables the plugin at once and the install screen announces the hooks. The statement that hooks are held until the folder trust dialog is accepted is about hooks in settings files. Whether a normal marketplace plugin's hooks run before trust is not described (unverified).
- With the opt-in repository-local install, `-p` and SDK sessions still treat the folder as trusted and show no dialog. If automation runs in a repository with hooks on, the hooks run without a person confirming.
- To turn off all hooks for one run, pass `disableAllHooks` with `--settings`; to make `-p` read no hooks and plugins at all, use `--bare`.
- **Decided (decision 1)**: start with the opt-in install only (repository-local `settings.local.json`). It has the smallest reach, is easy to turn off, and matches the `setup` rule "ask about global changes separately". Decide on the plugin `hooks.json` again after the pilot shows no false positives.
- In either case the scripts run from `${CLAUDE_PLUGIN_ROOT}` but write no state there (the path changes on update). State goes to `${CLAUDE_PLUGIN_DATA}`.
- Editing `.claude/` settings is outside a worker's scope. The orchestrator installs after the user agrees.

### 4. Privacy rules for correction capture

**Principle**: off by default. When on, it stays local. Secret values are never stored. One command deletes it.

Comparison of public projects (2026-10-30, through a summarizer):

- claude-smart records every user turn, tool call and assistant response. No redaction and no retention period were found; it has a delete-all command (`/claude-smart:clear-all`). Uninstalling leaves the data behind.
- claude-mem stores summaries of tool use and has a cloud sync option. Its only secret control is a `<private>` tag, and no deletion procedure was found.
- TracineHQ/guard writes a JSONL decision log and redacts secret shapes at write time. Retention is "the consumer's job", and the researcher inferred that paths and command excerpts may hold personal paths.
- haku does it narrower. It does not collect whole conversations.

Storage rules:

| Item | Rule |
|---|---|
| Stored | One correcting sentence by the user (at most 300 characters), a timestamp, a hash that identifies the repository, the first 8 characters of the session ID. |
| Never stored | Secret values (token, key, password shapes), personal paths (use the rules of `scripts/lib/personal-paths.js` as they are), the whole conversation, assistant text, tool output, file contents. |
| Filtering | If a sentence has a secret shape or a personal path, **drop the whole sentence**; do not mask it. A mask leaves a trace and is worse than dropping. The filter rules are pinned by tests. |
| Where | One local file: `${CLAUDE_PLUGIN_DATA}/corrections/<repository hash>.jsonl`. Nothing is written inside the repository (`.haku/`), because it could be committed. Nothing is posted to a GitHub issue automatically. |
| Retention | 30 days (recommended, not yet decided in decision 6). Every write removes older lines. |
| Deleting | One command: `node scripts/issues.js corrections clear` (to be built at implementation). Deleting the file by hand also works. Turning the hook off stops new lines. So that uninstalling does not leave data behind, the turn-off steps of `setup` include the deletion. |
| Turning on | Both a setting in `.haku/config.json` and the agreement in `setup` are needed. The first capture says once that it is on. |

Correction detection is a simple rule list (for example "아니", "그게 아니라", "하지 마", "no,", "don't", "instead"). There are false positives and misses. The real accuracy was not measured (**unverified**). That is why a manual mark is offered alongside automatic capture.

Flow of improvement candidates:

1. Hook D appends candidate correcting sentences to the local file. At this point they are candidates, not lessons.
2. Step 1 (Gather) of `retro` reads that file and shows the user one line at a time. The user picks "use as a lesson" or "discard" with a choice question.
3. Only the picked ones go through the `retro` sort (personal preference, immediate fix, rule candidate). Personal preference does not enter haku.
4. A rule candidate is registered as one issue in the haku repository, as today. The personal-path check runs once more before anything is written to the issue.
5. After that, the existing `triage` and `build` handle it. If the same correction shows up several times, `retro` merges them into one candidate. There is no confidence score (the research found no evidence of its effect).

### 5. How to build and test

- **Language and run**: zero-dependency Node scripts (`hooks/*.js`). Read all of standard input, parse the JSON, answer with the exit code and standard output (JSON). Shared functions (haku repository detection, path normalization, scope parsing) live in `scripts/lib/`. Split into testable pure functions and a thin input/output shell.
- **Registration**: use the args-array form, such as `{"command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/scope-check.js"]}`. It has no quoting problems and behaves the same on Windows when PowerShell runs hooks because Git Bash is missing. It calls a real executable (`node`), not an npm `.cmd` shim.
- **Three operating systems**: Windows paths arrive with backslashes, so convert them to slashes before comparing. Windows and macOS are case-insensitive, so compare in lower case. Write LF line endings (`check-eol.js` already checks). The existing CI already runs the tests on ubuntu (Linux), windows and macos.
- **Tests**: with `node:test`, start the hook script as a child process, feed JSON on standard input and check the exit code and output. Cases: (1) not a haku repository gives 0 and no output; (2) inside and outside the scope; (3) broken JSON; (4) no scope file; (5) push command variants; (6) a correcting sentence holding a secret or a personal path is not stored; (7) the delete command; (8) a large input near the time limit. Windows paths are tested on every OS with strings built in the test.
- **Real-environment check**: unit tests cannot tell how Claude Code really calls the hook. At each implementation step, install into a temporary repository and run once in a real session; whatever could not be confirmed goes into the PR.

### 6. Risks: when a hook becomes a hole

1. **A hook that blocks everything**: if it dies before detection while `onFailure: block` is set, all Bash or all writes are blocked. Response: do not set it in the config; close inside the script only after detection.
2. **A hook that blocks someone else's project**: installed globally, it also runs in repositories that do not use haku. Response: exit 0 at once without `.haku/config.json`.
3. **False comfort**: the push block can be bypassed while people believe it holds. Response: say in the docs that hooks are a supplement, and keep branch protection.
4. **Hook code as attack surface**: passing the command string from standard input to a shell allows injection. Response: only parse the string, never hand it to any shell. Normalize paths before comparing.
5. **Editing the scope file to get around it**: a worker edits `.haku-issue.md` or the hook settings to lift the block. Response: hook A treats writes to that file and to `.claude/` as out of scope, and uses the start-time scope.
6. **Capture collects secrets**: a gap in the filter leaves a secret on disk. Response: drop whole sentences, 300-character limit, 30-day retention, one-command deletion, off by default.
7. **False positives pile up wrong rules**: nothing is learned without the user's confirmation (section 4, steps 2 and 3).
8. **Slowness**: Node starts at every tool call. Response: narrow matchers, detect first, short time limits.
9. **Stop loops**: a Stop hook can keep Claude working. The prevention (checking `stop_hook_active`) and the cap of 8 blocks in a row are confirmed. Hook D still does not use Stop. If a Stop hook is needed later, build it to check `stop_hook_active` first and review it in a new design.
10. **Path change during an update**: `CLAUDE_PLUGIN_ROOT` changes. No state is written there.
11. **No confirmation step in automated runs**: `-p` and SDK sessions treat the folder as trusted without a dialog. If automation runs in a repository with hooks on, the hooks run with nobody watching. Response: keep hooks record-first, close a blocking hook only after detection, and document the off switches (`disableAllHooks`, `--bare`).
12. **Installing is enough to turn them on**: installing a plugin enables its hooks at once, and the install-screen notice is all there is. Response: do not ship a plugin `hooks.json`; keep the opt-in, repository-local install (decision 1). If it is ever shipped, stage 7 weighs this again.

### 7. Staged rollout order

Each stage is its own issue and PR, and the next starts after the result of the previous one is seen.

1. **Stage 0**: the user approves this document. The three formerly unverified items (Stop loop prevention, the plugin hook approval step, the command to disable a plugin) were checked against the docs read on 2026-10-30. What remains unverified: whether a plugin-hook-specific first-run approval exists, the order of normal plugin hooks and folder trust, and whether `claude plugin disable` takes effect at once in the same session. The real-environment check of stage 1 tests these three.
2. **Stage 1**: the shared functions (haku repository detection, path normalization) and hook A in "record only" mode, as a pilot in one opted-in repository. Count the false positives.
3. **Stage 2**: raise hook A to ask mode. For each write outside the scope the user is asked to allow or refuse it (PreToolUse returns `permissionDecision` `ask`), and any error fails open. Blocking mode is reconsidered only if a later measurement shows no false positives. The exact field name and behaviour of the hook output have not been checked in this document (**unverified**); verify them against the official docs and a live session before building.
   - **Measured result (2026-10-31)**: the 42 merged PRs were replayed in record-only mode (391 writes). There were 33 writes outside the scope in 13 PRs; after adding the default scope entries (README, `.claude-plugin/**`), 22 writes in 11 PRs remained. Of these 22, 11 were normal work whose scope line was too narrow (false positives if blocked) and 11 were genuine overreach. That is why the next step is ask mode, not blocking. The replay measures how accurate the scope lines are, not how the hook behaves in a live session.
4. **Stage 3**: hook C (weakening warning). The lowest risk.
5. **Stage 4**: hook B (push block). Write the bypass tests first.
6. **Stage 5**: the manual mark command, the `retro` reading and the delete command. Check the flow first without automatic capture.
7. **Stage 6**: hook D (automatic capture). Turning it on is optional; the default is off.
8. **Stage 7**: decide again whether to ship the plugin `hooks.json`.
9. **Decision change (0.16.19)**: to stop a worker from ending without a PR or summary, a blocking hook E (`hooks/worker-stop.js`, SubagentStop) is introduced. The earlier "the Stop event is not used" decision changes for this one SubagentStop hook only. Conditions kept: `stop_hook_active` is checked first and a re-entry passes (and an own marker file limits it to once per agent even if the field is absent), a non-worker agent or an undecidable input passes, any error fails open, and it blocks once. It is off by default (opt-in, `settings.local.json`); the stage 7 decision on shipping `hooks.json` stays deferred.

### 8. Decision list for the user

Decisions 1 to 5 and 7 are **Decided**: they are not asked again. Decision 7 was changed to decided because the check is done. Only decisions 6 and 8 are **Open**. The open ones are written so they can be used as choice questions as they are, and the recommendation is the first option.

#### Decision 1. Where should the hooks live

- Status: **Decided**
- Plain version: choose whether guards stand at every building or only at buildings that agreed.
- Example: a plugin hook also runs in projects that do not use haku. A repository-local opt-in install runs only in the repositories where the user said "turn it on here".
- Question: where should the hooks be installed?
- Options: (a) repository-local opt-in install only (chosen), (b) plugin `hooks/hooks.json`, global, (c) shared `.claude/settings.json`
- What changes: (a) reaches only the repositories that agreed and is easy to turn off. (b) reaches every project. (c) reaches the whole team.
- Decided answer: (a) repository-local opt-in install only. It has the smallest reach and matches the `setup` rule.

#### Decision 2. Which hook first

- Status: **Decided**
- Plain version: choose which one guard to try standing up first.
- Example: hook A notices when a worker writes a file outside its scope. At first it does not block, it only records, so the false alarms can be counted first.
- Question: which hook should the first pilot build?
- Options: (a) task file-scope check, in record-only mode (chosen), (b) weakening warning, (c) push block
- What changes: (a) shows the value and the false positives soonest. (b) is the safest, but a warning after the fact already exists. (c) has a big effect but a big bypass risk.
- Decided answer: (a) the task file-scope check in record-only mode. It matches the advice for candidate 1 (one small pilot).

#### Decision 3. When the push block breaks

- Status: **Decided**
- Plain version: choose whether the door is locked or left open when the guard falls ill (fail closed or fail open).
- Example: if a dead hook blocks all Bash, even normal work stops. If it locks only when a worker session is confirmed, other sessions are untouched.
- Question: what should the push-block hook do when it errors and cannot decide?
- Options: (a) block only when a worker session is confirmed, otherwise pass (chosen), (b) always block (`onFailure: block`), (c) always pass
- What changes: with (b) a dead hook stops all Bash. With (c) the hook may be no better than no hook.
- Decided answer: (a) block only when a worker session is confirmed and pass otherwise. It closes only after detection has finished.

#### Decision 4. Should corrections be collected automatically

- Status: **Decided**
- Plain version: choose whether a machine collects the user's correcting sentences by itself, or only the ones a person marked are read.
- Example: automatic picks up a sentence like "no, write it in Korean" at the end of a session. Manual means `retro` reads only the sentences the user marked with "remember this".
- Question: should the user's corrections be collected automatically?
- Options: (a) build the manual mark and the `retro` reading first, automatic capture later (chosen), (b) automatic capture from the start (off by default), (c) do not do it
- What changes: (a) checks the flow without privacy risk. (b) is faster but the filter must be finished first. (c) drops candidate 13.
- Decided answer: (a) manual mark and `retro` reading first, automatic later. It matches the "hold" advice for candidate 13.

#### Decision 5. Where to store correcting sentences

- Status: **Decided**
- Plain version: choose whether collected sentences stay in a drawer on this computer, or go to the repository or GitHub.
- Example: a file inside the repository can be committed by mistake and seen by others. A local file outside the repository never leaves this computer.
- Question: where should the collected sentences go?
- Options: (a) a local file only, outside the repository (chosen), (b) a file under `.haku/` in the repository, (c) a GitHub issue
- What changes: (a) never leaves this computer. (b) may be committed. (c) is readable by anyone if the repository is public.
- Decided answer: (a) a local file only, outside the repository. Only items the user approved in `retro` go to an issue.

#### Decision 6. Retention period

- Status: **Open**
- Plain version: choose how many days the collected sentences stay in the drawer before they are thrown away.
- Example: with 7 days, a `retro` run a week later may find the candidates already gone. With 30 days they last a month.
- Question: how many days should the local file be kept?
- Options: (a) 30 days (Recommended), (b) 7 days, (c) until deleted
- What changes: shorter means less left behind, but candidates vanish if `retro` is run late.
- Recommendation: (a). Longer than one story cycle, and not unlimited.

#### Decision 7. Check the unverified items first

- Status: **Decided** (check done)
- Plain version: choose whether to check the "three unverified items" of the at-a-glance section as a small job before building, or only when the relevant hook is built.
- Example: if a Stop hook is built without knowing how to stop its endless loop, Claude may never stop working. Reading the original page first avoids that.
- Question: should Stop loop prevention, the plugin hook approval step and the plugin disable command be checked against the original pages before implementation?
- Options: (a) check first, in stage 0 (chosen, done), (b) check when the relevant hook is built
- What changes: (a) lowers the chance that the design changes later. (b) starts sooner.
- Decided answer: (a). The three were checked against the docs read on 2026-10-30. Still unverified: whether a plugin-hook-specific first-run approval exists (not described), whether a normal marketplace plugin's hooks run before the folder trust dialog (not described), whether hooks stop at once in the same session after `claude plugin disable`, and disabling only a plugin's hooks (not possible: only the whole plugin or all hooks). These are tested in the real-environment check of stage 1.

#### Decision 8. Approve this design and plan the implementation

- Status: **Open**
- Plain version: choose whether building may start as this document describes.
- Example: if approved, an issue and a plan for stage 1 of section 7 (shared functions and the scope check in record-only mode) are created. If held, no code changes.
- Question: approve this document and plan the implementation in the order of section 7?
- Options: (a) approve, plan from stage 1 (Recommended), (b) revise and review again, (c) hold
- What changes: (a) creates a new plan and issues. (b) and (c) change no code.
- Recommendation: (a), after decision 6 is chosen.
