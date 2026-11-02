# 인수인계 (2026-11-02)

다른 세션이 이 파일만 보고 이어받을 수 있게 적었습니다. 이어받은 뒤 이 파일은 지워도 됩니다(지우는 것이 기본).

## 원칙
- haku는 최신 트렌드 기반의 **가벼운 하네스**, 핵심 목표는 **에이전트가 쉬지 않는 것**입니다.
- 사용자 지시와 방향에 항상 의문을 갖고, 더 나은 길이 있으면 먼저 제안합니다.
- 답변은 한글, 사용자 결정·승인은 선택지로 받습니다. 병합은 사용자 승인 후에만 합니다.
- 이슈 하나당 작은 PR 하나. 공개 파일이 바뀌면 `node scripts/bump-version.js origin/main`(커밋 후 실행)으로 patch +1.
- 검증: `node --test tests/*.test.js`, `node scripts/check-eol.js --worktree`.

## 현재 상태
- main은 0.16.31. PR #134(브랜치 `claude/project-thread-mawt75`, 0.16.32)가 열려 있고 CI는 통과했으며 사용자 승인 후 squash 병합 대기입니다.
  - 내용: `hooks/worker-stop.js`의 `claimBlock`에서 `session_id` 폴백 제거(같은 세션의 다른 워커가 검사 없이 통과하던 문제), 테스트 추가, 이전 HANDOFF 정리.
- 열린 이슈 없음. 실세션 배너/ask 훅 검증은 사용자가 보류했습니다.

## 결정 대기 (사용자 선택 필요)
"쉬지 않는 에이전트" 갭을 어떻게 메울지:
1. **문서+종료조건만 (권장)**: `skills/build/SKILL.md` 종료 조건을 `/goal` 형식(측정 가능한 종료 상태, 확인 방법, 턴 상한 문구)으로 쓰고, `docs/resume.md`를 공식 비교표로 갱신. 새 코드 없음.
2. 위 + 진전 없는 반복 감지 Stop 훅(같은 상태 반복 시 멈춤).
3. 자체 자동 재시작 루프 구현(가장 무겁고 공식 기능과 겹침).
4. 보류.
사용자가 아직 고르지 않았습니다. 답이 없으면 먼저 사용자에게 다시 묻습니다.

## 트렌드 조사 요약 (2026-11-02, 웹 조사; 일부는 2차 자료)
- 방향 적합: 얇은 하네스, 상태를 이슈/PR/라벨/워크트리에 두기(Ralph loop의 git 호스팅 변형), 서로 대화하지 않는 격리 워커, 훅 게이트는 업계 수렴 방향과 일치. agent teams는 아직 실험 단계라 도입 불필요.
- 공식 기능: `/goal`(Stop 훅 기반, 평가자는 대화 증거만 봄, 세션 재개 시 복원), `/loop`(세션 범위, 7일 만료, 재개 시 self-paced 미복원), 클라우드 scheduled tasks(구 routines: 스케줄/API/GitHub 이벤트 트리거, 최소 1시간, 이벤트마다 새 세션).
- 갭: (1) 쉬지 않기가 기본 흐름에 없고 `docs/resume.md` 수동 설정뿐, (2) build 종료 조건이 `/goal` 형식이 아님, (3) resume.md가 낡았을 수 있음, (4) 무인 실행 안전장치(턴/예산 상한, 진전 없음 감지) 부족.
- 출처: code.claude.com/docs/en/goal, /scheduled-tasks, /routines, /agent-teams, /hooks-guide; anthropic.com/engineering/effective-harnesses-for-long-running-agents; addyosmani.com/blog/long-running-agents; arxiv.org/pdf/2609.00006

## 다음 순서
1. 사용자에게 PR #134 병합 승인과 위 결정을 받는다.
2. 선택에 따라 새 이슈/PR 하나로 진행(브랜치는 병합 후 `git checkout -B <branch> origin/main`).
3. 인계 완료 후 이 파일 삭제.
