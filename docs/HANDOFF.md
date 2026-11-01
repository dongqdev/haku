# 인수인계 (2026-11-01)

다른 에이전트가 바로 이어받을 수 있도록 현재 상태를 적어 둡니다. 이어받은 뒤 이 파일은 지워도 됩니다.

## 프로젝트 원칙
- haku는 최신 트렌드 기반의 **가벼운 하네스**입니다. 핵심 목표는 **에이전트가 쉬지 않는 것**(감시 체계나 루프로 작업을 계속 이어감)입니다.
- 사용자 지시와 프로그램 방향에 항상 의문을 가지세요. 최신 트렌드에 맞지 않거나 더 좋은 길이 있으면 먼저 제안합니다.
- 답변은 한글, 사용자 결정·승인은 선택지로 받습니다.

## 작업 규칙
- 이슈 하나당 작은 PR 하나. 버전은 `node scripts/bump-version.js origin/main`으로 올립니다(공개 파일이 바뀐 PR마다 patch +1).
- 병합 전: Claude 코드리뷰(`/code-review`), CI(3개 OS·version·paths) 통과, 사용자 승인 후 squash 병합. 본인 PR이라 GitHub 승인은 불가합니다.
- 전체 테스트: `node --test tests/*.test.js`, 줄바꿈: `node scripts/check-eol.js --worktree`.

## 이번 세션 결과
| 이슈 | 상태 | PR |
|---|---|---|
| #117 워커 워크트리 의존성 준비 | 병합 (0.16.26, `linkFromMain`) | #128 |
| #91 retro-done --skip 문구 | 병합 (0.16.27) | #129 |
| #113 deferred 재개 제안 | 닫음(범위가 커서 가벼운 하네스 원칙에 안 맞음, 필요하면 status에 deferred 건수 표시 정도로 재제안) | - |
| #111 reconcile --apply --only/--except | PR 열림, 병합 대기 (0.16.28) | 이 PR |

## 남은 이슈 (우선순위 순)
1. **#111** 이 PR을 코드리뷰·CI 확인 후 사용자 승인 받아 병합.
2. **#119** plan 검증: Scope의 구체 파일 경로가 기본 브랜치에 있는지 경고. 힌트: `scripts/lib/publish.js`(검증 모드)와 `tests/publish-scope-warning.test.js`. 와일드카드는 건너뛰고, 확장자만 다른 파일을 제안하며, 새 파일 표시(`"new": true` 등)는 경고에서 뺍니다. plan 스킬 승인 화면에 한 줄 추가.
3. **#112** build 스킬(`skills/build/SKILL.md`)에 차단된 사이트의 사용자 제공 링크 처리 절차를 문서로 추가(코드 변경 없음, 인수 기준은 이슈 본문).
4. **#92** 미해결 표식 검사 빈틈(`scripts/lib/publish.js`, `tests/unresolved-marker.test.js`): 변형 표기, id 검사, CLI 종료 코드 시험, 우회 안내.

## 이 세션에서 알게 된 점
- `linkFromMain`은 심볼릭 링크 이름을 저장소 로컬 `info/exclude`에 추가합니다(제거하지 않음).
- 지정 브랜치 `claude/project-thread-g9b6id`를 병합 후 재사용할 때는 `git checkout -B <branch> origin/main` 뒤 `git merge -s ours origin/<branch>`로 강제 푸시 없이 올렸습니다.

## 추가 개선 후보 (사용자 확인 전 제안)
- 실제 세션에서 배너/ask 훅 동작 검증(자동 테스트는 있으나 실세션 확인 기록 없음).
- "쉬지 않는 에이전트" 목표 갭: 워커가 멈췄을 때 감시·재시작하는 루프(예: `/loop` 또는 `Stop` 훅 기반 자동 이어가기)가 문서에만 있고 기본 흐름에 묶여 있지 않음.
