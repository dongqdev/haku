<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/haku-lockup-white.svg">
    <img src="assets/haku-lockup.svg" alt="haku, 치와와" width="320">
  </picture>
</p>

<p align="center"><b>한국어</b> | <a href="README.en.md">English</a></p>

<h3 align="center"><b>H</b>arness <b>A</b>ssistant <b>K</b>eeping <b>U</b>sers in the loop</h3>

<p align="center">haku는 Claude Code용 개발 도구입니다. GitHub 이슈로 계획을 세우고, 워커가 개발하고, 검증하며, 병합은 사람이 결정합니다.</p>

<p align="center">
  <a href="https://github.com/dongqdev/haku/blob/main/.claude-plugin/plugin.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fdongqdev%2Fhaku%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&color=4A2E20&labelColor=F4ECE1" alt="버전"></a>
  <a href="https://github.com/dongqdev/haku/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/dongqdev/haku/test.yml?branch=main&label=CI&color=4A2E20&labelColor=F4ECE1" alt="CI 상태"></a>
  <a href="https://github.com/dongqdev/haku/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-4A2E20?labelColor=F4ECE1" alt="라이선스 MIT"></a>
  <a href="https://github.com/dongqdev/haku"><img src="https://img.shields.io/badge/node-18%2B-4A2E20?labelColor=F4ECE1" alt="Node 18 이상"></a>
  <a href="https://github.com/dongqdev/haku"><img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-4A2E20?labelColor=F4ECE1" alt="지원 플랫폼 Linux, macOS, Windows"></a>
</p>

## 설치

```
/plugin marketplace add https://github.com/dongqdev/haku.git
/plugin install haku@haku
```

HTTPS 주소를 쓰세요. `owner/repo` 줄임 표기는 SSH로 풀려서, SSH 키가 없으면 실패합니다.

## 사용법

그다음 작업할 저장소에서:

```
/haku:setup         # 저장소마다 한 번: 점검, 계획, 승인, 설정 PR
                    # 어떤 저장소 밖에서 실행하면 새 프로젝트를 시작합니다: 이름, 폴더, 저장소
/haku:plan          # 목표 -> 초안 -> 승인 -> 이슈 -> build
```

보통은 이 두 개만 입력하면 됩니다. `plan`은 목표가 흐리면 먼저 `sniff`로 넘기고, 계획을 승인하면 `build`로 이어 갑니다. `build`를 직접 입력하는 것은 세션을 잃은 뒤 스토리를 이어서 할 때뿐입니다. `/haku:sniff`는 접수 절차만이 아닙니다. 아이디어나 계획을 깊이 따져 보고 싶을 때 직접 부르세요. 결정 나무를 라운드로 파고들며(한 번에 최대 4개, 모두 선택지), 사실은 스스로 찾고, 실제 돈·실제 데이터·보안·다른 사람의 시스템에 닿는 가지는 가정으로 넘기지 않습니다. 언제든 쓸 수 있는 것: `status`(작업 현황, 읽기 전용), `triage`(스토리에 속하지 않은 열린 이슈 정리), `retro`(잘못된 점을 haku 수정으로 바꾸기). 스토리가 끝나면 그 스토리의 retro가 바로 시작되고, 아직 retro를 기다리는 끝난 스토리는 `issues.js retro-due`로 볼 수 있습니다.

## 흐름

1. `plan`이 스토리 / 마일스톤 / 작업을 로컬에서 초안으로 만들어 보여 주고, 승인한 뒤에만 이슈를 등록합니다.
2. `build`가 준비된 작업마다 워커를 하나씩 시작합니다(각자 워크트리와 `task/<N>-slug` 브랜치, 기본 최대 2개).
3. 작업은 등급별로 검증합니다. **T1** Linux 자동, **T2** Windows/macOS 자동, **T3** 사용자가 하는 측정 문서.
4. 병합은 PR마다 사용자의 승인이 필요합니다(화면에 닫힐 이슈가 나열됩니다). 자동 병합은 검증된 T1/T2 작업에 한해 스토리별로 명시적으로 켠 경우에만 있습니다.
5. 병합 뒤: 기본 브랜치에서 검증하고, `reconcile`이 병합됐지만 열려 있는 작업을 닫고 마일스톤과 스토리를 롤업한 다음, 워커를 삭제합니다. 요약과 통과한 검증이 기록된 경우에만 삭제합니다. `reconcile`은 병합된 PR 없이 닫힌 작업(손으로 닫음, 열려 있거나 병합되지 않은 PR만 있음, 확인할 수 없음)이 있으면 스토리나 마일스톤을 롤업하지 않습니다. 그 작업과 이유를 알려 주고, 사용자가 선택지로 결정합니다. `issues.js accept-close --issue N --reason <why>`는 의도적으로 닫은 작업을 기록해서 부모가 롤업되게 합니다.

## 더 알아보기

Claude Code를 위한 개인용 크로스 플랫폼 하네스입니다. 작업마다 워크트리 워커를 두는 방식, 이슈 기반 조율, 병합 관문의 아이디어는 [ECC](https://github.com/affaan-m/ECC)(MIT)에서 왔고, 코드는 처음부터 새로 썼으며 ECC의 코드를 담고 있지 않습니다.
작업은 Git 이슈로 관리하고, 계획을 세운 세션이 오케스트레이터가 되어 작업마다 워커 하나를 돌립니다.
상태: GitHub 우선입니다. GitLab은 아직 지원하지 않습니다. 테스트는 Linux, macOS, Windows의 CI에서 돌지만, 실제 사용은 Linux에서만 확인했습니다. 현재 버전은 위의 뱃지를 보세요.

<details>
<summary>줄바꿈</summary>

`.gitattributes`(`* text=auto eol=lf`, 바이너리 예외)와 `.editorconfig`가 모든 시스템에서 텍스트 파일을 LF로 유지해서, Windows 체크아웃이 CRLF로 바꾸지 않게 합니다. `node scripts/check-eol.js [--worktree]`는 커밋된 텍스트 파일에 CRLF나 섞인 줄바꿈이 있으면 실패하고, `--worktree`를 주면 체크아웃된 파일까지 봅니다. 워크플로가 Linux, Windows, macOS에서 이를 실행합니다. 대상 저장소에 `.gitattributes`가 없으면 `setup`이 설정 PR에서 이 두 파일을 제안합니다.

</details>

<details>
<summary>개인 경로</summary>

`node scripts/check-personal-paths.js`는 추적되는 파일이 사람의 컴퓨터를 가리키면 실패합니다. 루트 사용자의 홈, 또는 홈·`Users`·WSL 폴더 뒤에 사용자 이름이 붙은 경로가 대상이며(끝의 슬래시가 있든 없든, JSON 이스케이프나 URL 인코딩이 되어 있든) 같습니다. 심볼릭 링크는 가리키는 대상으로 검사하고, UTF-16 파일은 해독하며, 바이너리 파일은 건너뛰고 개수를 셉니다. 너무 커서 읽지 못한 텍스트 파일은 "검사하지 못함"으로 보고합니다. 자리 표시자(`<name>`, `$USER`, `%USERNAME%`)와 흔한 계정 이름(`runner`, `Public`, `your_name` 등)은 개인 경로로 보지 않습니다. 일부러 허용하려면 이 방법만 쓰세요. 그 줄에 `haku:allow-personal-path`를 적거나(줄 전체가 면제되고, 그런 줄의 수가 출력됩니다), `.haku/personal-paths-allow.txt`에 파일을 적습니다(한 줄에 경로나 글롭 하나, 루트 기준, `#` 주석 가능. `*.md`는 루트의 파일만, `**/*.md`는 모든 폴더, 폴더 이름만 쓰면 그 폴더 전체입니다). 허용 파일은 `.haku/` 아래에 있으므로, 이를 고치는 PR은 병합 승인 화면의 검사 약화 경고에 나타납니다. 워크플로는 이 검사를 Linux에서 실행합니다.

</details>

<details>
<summary>브랜치 보호와 병합 방식</summary>

`issues.js branch-protection`은 기본 브랜치가 보호되는지 아무것도 바꾸지 않고 읽습니다. `protected`, `unprotected`(저장소 설정에서 켤 수 있음), `unavailable`(요금제가 허용하지 않음, 예를 들어 무료 요금제의 비공개 저장소), `unknown`(확인할 수 없음) 중 하나입니다. `auto-when-verified`는 `protected`일 때만 허용됩니다. 그 밖의 모든 상태에서 병합 방식은 `approve-each`이고, 명령이 대신 믿을 안전장치(필수 검사 CI, 워커는 기본 브랜치에 푸시하지 않음, 병합 전마다 `pr-state`와 `pr-check --pr`)를 출력합니다. `setup`은 상태를 보고하고, `plan`은 허용될 때만 그 방식을 제안하며, `build`는 자동 병합 직전에 다시 확인합니다.

</details>

<details>
<summary>검사 약화 경고</summary>

`issues.js pr-config-changes --pr <number> --issue <N>`은 PR이 자기 검사를 더 쉽게 통과하게 만들 수 있는 파일을 나열합니다. 린트·포맷·타입 설정, 테스트 러너 설정, CI 워크플로, git 훅, `.haku/`입니다. `build`는 병합 승인 질문에 이 목록을 "검사 설정 변경"으로 보여 주며, 작업의 `Scope` 밖 파일을 앞에 두고 표시합니다. 경고일 뿐 막는 것은 아니지만, 목록에 파일이 하나라도 있는 PR은 `auto-when-verified`로 병합되지 않고 사용자에게 묻습니다. 쓰이는 Scope는 워커를 시작할 때 기록한 것이라, 워커가 나중에 이슈를 고쳐서 넓힐 수 없습니다. 삭제된 파일은 삭제됐다고 표시합니다. `package.json`은 바뀐 줄이 테스트·린트·포맷 설정을 건드릴 때만 나열합니다. 간접 변경(워크플로가 호출하는 스크립트, ESLint 설정이 확장하는 파일)은 보지 못하니 `watchFiles`에 추가하세요. 저장소는 `.haku/config.json`에 패턴을 더할 수 있습니다(`"watchFiles": ["build/**"]`). 내장 패턴은 여기서 끌 수 없습니다.

</details>

<details>
<summary>릴리스</summary>

Claude Code는 설치된 플러그인을 **버전**을 키로 하는 캐시에 보관하므로, 버전을 그대로 둔 채 병합된 변경은 설치된 사본에 닿지 않습니다(`plugin update`는 "이미 최신 버전"이라고 답합니다). 그러므로 `skills/`, `agents/`, `scripts/`, `.claude-plugin/`을 바꾸는 모든 PR은 `.claude-plugin/plugin.json`과 `.claude-plugin/marketplace.json` 양쪽의 버전을 올려야 하고, CI(`scripts/check-version.js`)가 이를 강제합니다. 수정은 패치, 새 동작은 마이너, 이름 변경은 버전이 1.0 미만인 동안 설명을 덧붙인 마이너로 올립니다.

실행 중인 세션에서 릴리스를 받으려면 `/plugin marketplace update haku`를 한 뒤 `/reload-plugins`를 실행하세요. 그래도 세션에 옛 스킬이 보이면 터미널에서 `claude plugin update haku@haku`를 실행하고 세션을 다시 시작하세요(세션 안에는 `/plugin update` 명령이 없습니다).

이전 이름에서 오셨나요? [docs/upgrading.md](docs/upgrading.md)를 보세요.

</details>

<details>
<summary>PR 본문</summary>

모든 작업 PR은 같은 구역으로 한글로 씁니다. 요약(무엇), 이유(왜), 변경 내용(바뀐 것), 테스트(실행한 명령, 결과, 실제 환경에서 확인한 것과 못 한 것), 위험과 영향(호환성, 되돌리기, 후속 작업), 그리고 `Closes #N` 줄입니다. `issues.js pr-body --issue N`이 뼈대를 출력하고, `issues.js pr-check`는 빠졌거나 빈 구역, 한글 서술이 없는 구역(코드와 인용은 세지 않음), 작업과 맞지 않는 닫기 줄(`owner/repo#N`과 URL 형태 포함)을 거부합니다. 각 구역에는 한글 서술이 5자 이상 있어야 하므로, 코드로 파일 이름만 나열한 구역에는 문장을 덧붙여야 합니다. `build`는 병합 승인을 묻기 전에 이 검사를 실행합니다. `--pr <number>`를 주면 PR이 실제로 어느 이슈를 닫는지 GitHub에도 물어서, 정확히 이 저장소의 그 작업이고 PR이 아직 열려 있을 때만 통과합니다(글만으로는 닫기 줄이 실제로 연결됐는지 알 수 없습니다).

</details>

<details>
<summary>워커</summary>

`build`는 준비된 작업마다 자기 git 워크트리에서 워커를 하나씩 돌립니다. 기본적으로 워커는 오케스트레이터의 **서브에이전트**입니다. `.haku/config.json`에 `"workerMode": "session"`을 두면 각 워커가 대신 자기만의 백그라운드 Claude Code 세션이 됩니다(`issues.js worker-launch`). Claude 앱에서 보이고, 자기 컨텍스트를 가지며, 오케스트레이터 세션이 끝나거나 압축돼도 계속 갑니다. 세션 워커는 사용자와 직접 말하지 않고, SendMessage로 오케스트레이터에게 보고하며, 오케스트레이터가 선택지로 사용자에게 묻습니다. 리뷰와 분석은 계속 서브에이전트입니다.

| `.haku/config.json` | 뜻 |
|---|---|
| `workerMode` | `"subagent"`(기본) 또는 `"session"` |
| `workerPermissionMode` | 세션 워커용으로 `manual`, `acceptEdits`, `plan`, `dontAsk` 중 하나. 비워 두면 사용자 자신의 설정을 따릅니다. 승인을 건너뛰는 방식(`auto`, `bypassPermissions`)은 PR이 이 파일을 바꿀 수 있으므로 여기서 설정할 수 없습니다. 정말 원하면 자신의 Claude 설정을 쓰세요 |
| `workerRemoteControl` | `false`면 세션 워커가 Claude 앱 사이드바에 나오지 않습니다(기본 `true`) |

세션 워커에는 `PATH`에 `claude` 명령이 있어야 하고(다른 것을 쓰려면 `HAKU_CLAUDE_BIN`을 설정, Windows에서는 `.cmd` 래퍼가 아니라 `claude.exe`), 대화형 `claude`에서 한 번 신뢰한 저장소여야 하며, 메시지가 전달되도록 오케스트레이터와 같은 Claude 계정이어야 합니다. `issues.js config`는 적용 중인 설정을 출력하고, `issues.js worker-list`는 각 세션 워커의 실시간 상태를 보여 줍니다. 상태가 `blocked`인 워커는 권한 승인을 기다리는 중이라 보고할 수 없습니다.

작업은 자기만의 워커 방식을 고를 수 있습니다. `plan`은 서브에이전트에 없는 도구(브라우저, MCP 서버, 실제 기기 시험)가 필요한 작업에만 `Worker-Mode: session`과 `Worker-Reason:`을 적고, 나머지 작업은 서브에이전트로 둡니다. `issues.js worker-mode --issue N`은 그 작업이 실행될 방식을 출력합니다. 작업의 줄이 `.haku/config.json`의 `workerMode`보다 우선합니다. 서브에이전트 워커에는 일부러 웹 도구(`WebSearch`, `WebFetch`, MCP)가 없습니다. 웹에서 가져온 글은 믿을 수 없는 데이터인데, 워커는 파일을 쓰고 명령도 실행할 수 있기 때문입니다. 다만 워커에게는 네트워크에 닿을 수 있는 `Bash`가 있어서, 위험을 줄일 뿐 없애지는 못합니다. 웹의 사실은 `WebSearch`와 `WebFetch`만 가지고 저장소를 읽을 수 없는 `researcher` 에이전트가 가져옵니다. `issues.js research-post`가 그 출처 있는 보고서를 데이터로 작업 이슈에 남기고(표식이 맨 앞, 토큰·키·비밀번호·개인 경로처럼 보이면 거부), `issues.js research-show`는 소유자·멤버·협업자가 쓴 보고서만 읽어 오며, 웹검색만을 위해 세션 워커를 열지 않습니다. 세션을 고른 작업은 시작할 때 사용자의 승인(`--user-approved`)이 필요합니다. 세션 워커는 모든 도구를 가지기 때문입니다.

코드를 바꾸는 풀 리퀘스트는 병합 승인을 묻기 전에, 읽기만 할 수 있는 `reviewer` 에이전트가 두 단계로 검토합니다. 먼저 명세를 지켰는지, 그다음 코드 품질과 안전을 봅니다. 확인된 심각한 지적이 있으면 승인 질문은 막힙니다.

</details>

<details>
<summary>라벨과 제목</summary>

haku는 고정된 색으로 라벨을 만듭니다. 색조는 Okabe-Ito 팔레트(색각 차이가 있어도 구별됨)에서 가져와 GitHub가 흰 글씨를 쓰도록 어둡게 했고, 기본 라벨에는 마스코트의 갈색을 씁니다. `haku` 갈색, `type:story` 파랑, `type:milestone` 초록, `type:task` 주황, `sprint:*` 보라, `owner:*` 슬레이트, `kind:*`(design, dev, bug, docs, research, chore: 어떤 종류의 일인지)와 상태 라벨 `deferred`, `blocked`, `needs-user`(이슈가 왜 멈춰 있는지)이며, `issues.js labels`와 `issues.js label`로 관리하고, 각각 짧은 설명이 붙습니다. (GitHub는 배경의 밝기로 글자색을 스스로 고르므로, 흰 글씨는 배경을 어둡게 해서 얻습니다.) 이슈 제목에는 `[Story]`, `[Milestone]`, `[Task]` 접두사가 붙어서 색 없이도 종류를 읽을 수 있습니다. 접두사를 끄려면 `.haku/config.json`에 `"titlePrefix": false`를 두세요. 이미 있는 라벨은 haku가 다음에 확인할 때 색이 갱신됩니다(`gh label create --force`).

</details>

<details>
<summary>소유자</summary>

스토리, 마일스톤, 작업의 소유자는 호스트의 **담당자**(assignee)입니다(`.haku/config.json`의 `assignee`). 예를 들어 협업자가 아니어서 호스트가 지정을 거부해도 이슈는 만들어지고, 대신 `owner:<name>` 라벨이 붙습니다.

</details>

<details>
<summary>안전 속성 (각각 테스트로 덮여 있음)</summary>

- 검증 명령은 워커 브랜치나 이슈 글이 아니라 **기본 브랜치**의 `.haku/verify.json`에서 읽습니다.
- 종료 코드 0은 필요조건이지 충분조건이 아닙니다. 충분한 수의 테스트가 실행되어야 하고, 테스트 파일이 삭제되거나 줄어서는 안 됩니다.
- PR은 스토리나 마일스톤을 직접 닫지 않습니다. 자식이 닫힌 뒤 롤업이 닫습니다.
- 코드 펜스나 인용 안의 닫기 키워드와 다른 저장소에 대한 참조는 무시합니다.
- `publish`와 `reconcile`은 `--apply`를 주지 않으면 미리보기입니다.

</details>

<details>
<summary>구성</summary>

```
.claude-plugin/   플러그인 + 마켓플레이스 매니페스트
skills/           setup, sniff, plan, build, status, triage, retro
agents/           worker
scripts/          issues.js (CLI)와 lib/ (model, publish, reconcile, verify, done-gate, worker, github-host)
tests/            node --test tests/*.test.js
```

</details>

<details>
<summary>검증 프로필</summary>

`.haku/verify.json`(기본 브랜치에 커밋하세요):

```json
{
  "profiles": {
    "unit": {
      "cmd": ["npm", "test"],
      "countPattern": "tests (\\d+)",
      "minTests": 1
    }
  }
}
```

`cmd`는 인자 배열입니다(셸을 쓰지 않음). `countPattern`에는 실행된 테스트 수를 읽는 캡처 그룹이 하나 있습니다.

</details>
