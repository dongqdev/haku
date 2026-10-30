# 다른 프로젝트에서 가져올 만한 아이디어 / Ideas from other projects

## 한국어

**고르는 법**: 아래 후보 번호로 답해 주세요(예: "6, 9, 14번 넣어 주세요"). 후보는 다른 공개 프로젝트에서 읽은 기능이나 규칙이고, 같은 아이디어를 내놓은 여러 프로젝트는 한 후보로 합쳤습니다. 한 후보는 하나의 기능이나 규칙이며 프로젝트 전체가 아닙니다. "이미 있는가"는 보고서의 추정이 아니라 이 저장소를 직접 읽어 확인한 것입니다.

**목차 (번호, 이름, 추천)**
1. 훅으로 결정적 안전망 만들기 - 보류
2. 안전 설정 점수와 준비도 채점 - 보류
3. 가드 결정 로그와 소음 순위 - 버리기
4. 스킬 평가: 결정적 채점기와 시행 횟수 - 보류
5. 스킬 발동 시험, 제거 비교, 대화 기록 채점 - 보류
6. 완료 선언에 증거 요구 - 넣기
7. 테스트 먼저 관문 - 보류
8. 2단계 리뷰: 명세 준수, 그다음 코드 품질 - 보류
9. 미해결 표식 의무 - 넣기
10. 프로젝트 원칙, 단계 관문, 예외 기록 - 보류
11. 명세 체크리스트와 산출물 일관성 점검 - 보류
12. 작업 크기에 맞춘 가벼운 경로 - 보류
13. 교정 자동 감지와 본능 학습 - 보류
14. retro를 부르는 계기 만들기 - 넣기
15. 교훈 추출 기준 - 넣기
16. 세션 간 기억 저장소 - 버리기
17. 보안 스캔 - 보류

### 후보 1. 훅으로 결정적 안전망 만들기

- **주제**: 안전망과 훅
- **무엇인지**: 도구 사용 이벤트에 훅을 걸어, 프롬프트 밖에서 결정적으로 검사하고 권한 밖 행동은 막으며 복합 명령은 구간마다 따로 검사하고 지정한 파일은 보호합니다.
- **출처**:
  - https://github.com/affaan-m/everything-claude-code (읽은 날짜 2026-10-30): "Hooks fire on tool events." / "enforce deterministic checks outside the prompt"
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (읽은 날짜 2026-10-30): "Actions above your permission level are refused"
  - https://github.com/Bande-a-Bonnot/Boucle-framework (읽은 날짜 2026-10-30): "Evaluates each segment of compound commands." / "Define protected files in `.file-guard` (one pattern per line)."
- **이미 있는가**: 일부. 훅은 없고(`hooks/` 디렉터리 없음, `docs/self-improvement.md`가 같은 확인을 적음) 검사 설정 약화는 사후 경고로만 잡습니다(`scripts/lib/weaken.js`, `skills/build/SKILL.md` 5단계). `skills/setup/SKILL.md`는 전역 훅을 건드리지 말고 따로 물으라고 합니다.
- **비용**: 중간. 훅 스크립트, 설정 등록, 세 운영체제 시험이 모두 새로 필요합니다.
- **위험**: 보안: 훅은 사용자 설정 안에서 도는 코드라 잘못 만들면 오히려 구멍이 됩니다. 이식성: 셸 훅은 Windows에서 다르게 돕니다. 의존성 0 규칙은 Node 스크립트로 지킬 수 있지만, 조사에서는 훅 종류와 동작 세부, 라이선스, Windows 지원이 확인되지 않았습니다(not found).
- **추천**: 보류. 효과는 크지만 사용자 설정 변경이라 먼저 작은 시범(파일 범위 검사 하나)으로 가치를 확인해야 합니다.

### 후보 2. 안전 설정 점수와 준비도 채점

- **주제**: 안전망과 훅
- **무엇인지**: 안전 설정을 A부터 F까지 채점하고 부족한 곳마다 고치는 한 줄을 보여 줍니다. haku의 `setup`과 `status`에 붙일 수 있습니다.
- **출처**:
  - https://github.com/Bande-a-Bonnot/Boucle-framework (읽은 날짜 2026-10-30): "Scores your Claude Code safety configuration from A to F and shows one-liner fixes for each gap."
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (읽은 날짜 2026-10-30): "Grade readiness (1-100)"
- **이미 있는가**: 일부. `skills/setup/SKILL.md`가 도구, GitHub 인증, 기본 브랜치 보호, 검사 파일을 점검하고 `skills/status/SKILL.md`가 진행 현황을 읽기 전용으로 보여 주지만, 점수는 없습니다.
- **비용**: 작음. 이미 점검하는 항목에 점수 규칙을 더하는 정도입니다.
- **위험**: 복잡도: 점수 기준을 정하면 그 기준이 곧 정책이 됩니다. 조사에서는 Ruflo의 채점이 같은 기능인지 확인하지 못했습니다.
- **추천**: 보류. 지금도 setup과 status가 필요한 것을 보여 주고, 점수 기준은 후보 1의 안전망이 정해진 뒤에야 의미가 있습니다.

### 후보 3. 가드 결정 로그와 소음 순위

- **주제**: 안전망과 훅
- **무엇인지**: 가드의 모든 허용과 차단 결정을 파일에 한 줄씩 남기고, 많이 걸리는 규칙을 순위로 봅니다. 가드가 틀리게 막은 경우를 회고할 때 씁니다.
- **출처**:
  - https://github.com/TracineHQ/guard (읽은 날짜 2026-10-30): "Every decision is appended to a decisions log file" / "`guard noisy --since 24h` ranks rules by hit count."
- **이미 있는가**: 없음. 결정을 남길 가드 자체가 없습니다(`hooks/` 없음, `scripts/lib/weaken.js`는 경고를 내놓을 뿐 기록하지 않습니다).
- **비용**: 작음. 가드가 생긴 다음이라면 기록 한 줄을 더하는 정도입니다.
- **위험**: 복잡도: 훅 후보 1이 먼저 있어야 의미가 있습니다. 근거가 별 0개의 작은 프로젝트라 성숙도가 낮고 아이디어 참고용으로만 봐야 합니다.
- **추천**: 버리기. 훅이 없는 지금은 쓸 곳이 없습니다. 후보 1을 넣게 되면 다시 꺼내 볼 만합니다.

### 후보 4. 스킬 평가: 결정적 채점기와 시행 횟수

- **주제**: 평가와 시험
- **무엇인지**: 명령을 실행해 stdout의 JSON에서 0.0~1.0 점수를 받고, 빠른 점검 5회, 회귀 감지 30회처럼 신뢰 수준별 반복 횟수를 정합니다. 스킬이 아직 동작하는지 재는 데 씁니다.
- **출처**:
  - https://github.com/mgechev/skillgrade (읽은 날짜 2026-10-30): "Runs a command and parses JSON from stdout." / ""--regression" = "High-confidence regression detection" (30 trials)"
  - https://github.com/affaan-m/everything-claude-code (읽은 날짜 2026-10-30): "Checkpoint vs continuous evals, grader types, pass@k metrics."
- **이미 있는가**: 없음. `.github/workflows/test.yml`은 줄바꿈, 개인 경로, 버전, 단위 시험만 돌리고 스킬 동작 평가는 없습니다. `tests/`는 스킬 문구의 규칙(예: `tests/decisions-rule.test.js`)만 봅니다.
- **비용**: 큼. 스킬을 실제로 돌리는 모델 호출이 필요해 비용과 비결정성을 다뤄야 합니다.
- **위험**: 복잡도와 비용: 반복 실행은 돈이 듭니다. 의존성 0 규칙: 외부 평가 도구를 쓰면 어기게 되므로 직접 만들어야 합니다. ECC의 채점기 종류와 신뢰도 계산 세부는 확인하지 못했습니다(not found). skillgrade는 별 732개, 마지막 갱신 날짜는 확인하지 못했습니다.
- **추천**: 보류. 가치는 크지만 큰 일이라 먼저 별도 설계 이슈로 범위를 정한 뒤에 정할 일입니다.

### 후보 5. 스킬 발동 시험, 제거 비교, 대화 기록 채점

- **주제**: 평가와 시험
- **무엇인지**: 맞는 스킬이 켜지는지를 켜진 뒤의 품질과 따로 시험하고, 스킬 하나를 뺀 채 다시 돌려 실제로 도움이 되는지 보며, LLM 심사가 세션 기록을 정성 기준으로 평가합니다.
- **출처**:
  - https://github.com/zytedata/agent-exam (읽은 날짜 2026-10-30): "whether the right skill fires for a given prompt" / "re-runs a suite with one skill removed"
  - https://github.com/mgechev/skillgrade (읽은 날짜 2026-10-30): "Evaluate the agent's session transcript against qualitative criteria"
- **이미 있는가**: 없음. 스킬 설명문(`description`)이 서로 겹치는지 확인하는 장치도, 발동을 시험하는 장치도 `tests/`와 `scripts/`에 없습니다.
- **비용**: 큼. 후보 4와 같은 실행 기반이 먼저 있어야 하고 그 위에 시험을 더 쌓아야 합니다.
- **위험**: 복잡도: LLM 심사는 비결정적이라 시험이 흔들릴 수 있습니다. agent-exam은 별 2개의 매우 작은 프로젝트라 성숙도가 낮습니다.
- **추천**: 보류. 후보 4를 먼저 정하지 않으면 시작할 수 없습니다.

### 후보 6. 완료 선언에 증거 요구

- **주제**: 리뷰와 검증
- **무엇인지**: 끝났다고 말하기 전에 실제로 확인한 증거를 대도록 하는 규칙입니다.
- **출처**:
  - https://github.com/obra/superpowers (읽은 날짜 2026-10-30): "Evidence over claims - Verify before declaring success"
- **이미 있는가**: 일부. 워커 지침이 기준마다 충족 여부를 증거(명령 출력, 파일, 화면)와 함께 적게 하고(`skills/build/SKILL.md` 워커 규칙, `agents/worker.md` 7번), 오케스트레이터가 `scripts/lib/verify.js`로 직접 검증합니다. 없는 것은 워커가 아닌 모든 완료 선언(예: 오케스트레이터의 "병합 가능" 보고)에 같은 규칙을 거는 일반 규칙입니다. 보고서가 "맥락에 없음"이라 한 것은 워커 보고에 대해서는 맞지 않습니다.
- **비용**: 작음. 문구 한두 곳을 고치는 정도이고 시험은 문구 검사 하나면 됩니다.
- **위험**: 복잡도: 거의 없습니다. 규칙이 지나치면 보고가 길어질 수 있습니다. 근거는 README 수준의 한 줄 인용이며 SKILL.md는 읽지 않았습니다.
- **추천**: 넣기. 값이 싸고 이미 방향이 같아서 빈틈만 메우면 됩니다.

### 후보 7. 테스트 먼저 관문

- **주제**: 리뷰와 검증
- **무엇인지**: 실패하는 테스트를 먼저 쓰고 실패를 확인한 뒤 구현하는 순서를 증거와 함께 관문으로 강제하거나, 프로젝트 원칙의 한 조항으로 둡니다.
- **출처**:
  - https://github.com/obra/superpowers (읽은 날짜 2026-10-30): "RED-GREEN-REFACTOR: write failing test, watch it fail"
  - https://github.com/affaan-m/everything-claude-code (읽은 날짜 2026-10-30): "TDD becomes a gated RED -> GREEN -> REFACTOR workflow with evidence."
  - https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md (읽은 날짜 2026-10-30): "All implementation MUST follow strict Test-Driven Development."
- **이미 있는가**: 일부. `agents/worker.md` 3번이 "test-first where practical"을 요구하고 `scripts/lib/weaken.js`와 `scripts/lib/verify.js`가 시험 약화를 막지만, 실패를 먼저 확인했다는 증거를 요구하는 관문은 없습니다.
- **비용**: 중간. 실패 증거를 어떻게 남기고 누가 확인할지 정해야 하고, 문서 작업 같은 시험이 어울리지 않는 일은 예외로 둬야 합니다.
- **위험**: 복잡도: 강제하면 시험이 어색한 작업(문서, 설정)에서 형식만 채우는 일이 생깁니다. 근거는 모두 README 수준입니다.
- **추천**: 보류. 지금 문구("가능한 곳에서")를 증거 요구로 올릴지는 사용자가 위험을 보고 정할 일입니다.

### 후보 8. 2단계 리뷰: 명세 준수, 그다음 코드 품질

- **주제**: 리뷰와 검증
- **무엇인지**: 작업마다 새 하위 에이전트가 먼저 명세 준수를 보고, 그다음 코드 품질(품질, 보안, 유지보수성)을 보며, 심각한 문제는 진행을 막습니다.
- **출처**:
  - https://github.com/obra/superpowers (읽은 날짜 2026-10-30): "Fast iteration with two-stage review (spec compliance, then code quality)" / "Critical issues block progress."
  - https://github.com/affaan-m/everything-claude-code (읽은 날짜 2026-10-30): "Reviews code for quality, security, and maintainability."
- **이미 있는가**: 일부. `agents/`에는 `worker.md`와 `researcher.md`뿐이라 리뷰 에이전트는 없지만, `skills/build/SKILL.md` 5단계가 리뷰 수정과 검사 통과 뒤에만 병합을 묻도록 정하고 `scripts/lib/verify.js`가 기계 검증을 합니다.
- **비용**: 중간. 리뷰 에이전트 지침 하나와 `build`의 단계 하나가 필요하고 모델 호출이 늘어납니다.
- **위험**: 복잡도와 보안: 리뷰 에이전트도 읽기 전용이어야 하며 `researcher.md`처럼 도구를 좁혀야 합니다. 근거는 README 수준입니다.
- **추천**: 보류. 리뷰가 사람 병합 직전의 마지막 방어선이라 가치는 있으나 비용 증가를 사용자가 받아들일지 먼저 물어야 합니다.

### 후보 9. 미해결 표식 의무

- **주제**: 계획과 요구 명료화
- **무엇인지**: 명세와 계획이 모호한 곳을 추측하지 않고 `[NEEDS CLARIFICATION]` 같은 표식으로 남기게 하고, 표식이 남아 있으면 계획이 통과되지 않게 합니다.
- **출처**:
  - https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md (읽은 날짜 2026-10-30): "Both templates mandate the use of `[NEEDS CLARIFICATION]` markers."
- **이미 있는가**: 일부. `skills/sniff/SKILL.md`가 결정 나무 인터뷰를 하고 돈, 데이터, 보안에 닿는 가지는 요약에 열린 질문으로 남기며, `skills/plan/SKILL.md`는 목표가 모호하면 `sniff`로 넘깁니다. 계획 문서에 표식을 남기고 통과 조건으로 쓰는 장치는 없습니다.
- **비용**: 작음. `plan` 검증에 표식 검사 하나를 더하는 정도입니다.
- **위험**: 복잡도: 거의 없습니다. 표식이 형식적으로 지워질 위험이 있습니다. 근거는 한 문서의 한 문장입니다.
- **추천**: 넣기. 싸고 `sniff`와 `plan` 사이의 빈틈을 정확히 메웁니다.

### 후보 10. 프로젝트 원칙, 단계 관문, 예외 기록

- **주제**: 계획과 요구 명료화
- **무엇인지**: 프로젝트 원칙(헌법)을 한 번 정하고, 계획 단계에서 관문을 통과하거나 정당화된 예외를 문서로 남겨야 다음으로 가게 합니다.
- **출처**:
  - https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md (읽은 날짜 2026-10-30): "The LLM cannot proceed without either passing the gates or documenting justified exceptions"
  - https://raw.githubusercontent.com/github/spec-kit/main/README.md (읽은 날짜 2026-10-30): "Create a constitution once per project..."
- **이미 있는가**: 일부. 기본 브랜치의 검증 파일(`verify.json`), 시험 약화 가드(`scripts/lib/weaken.js`), 작업별 파일 범위 선언(`skills/plan/SKILL.md`)이 있지만, 예외를 문서로 남기는 관문과 프로젝트 원칙 문서는 없습니다.
- **비용**: 중간. 원칙 문서 형식과 관문 점검 단계를 `plan`에 새로 정해야 합니다.
- **위험**: 복잡도: 관문이 많아지면 작은 일도 무거워집니다(후보 12와 함께 봐야 합니다). 근거는 두 문서의 문장뿐입니다.
- **추천**: 보류. 지금 haku의 가드로 대부분 덮여 있어 실제로 아픈 사례가 나오면 다시 봅니다.

### 후보 11. 명세 체크리스트와 산출물 일관성 점검

- **주제**: 계획과 요구 명료화
- **무엇인지**: 명세에 단위 시험 역할을 하는 체크리스트를 넣어 요구의 품질을 확인하고, 별도 명령이 원칙과 산출물 사이의 일치를 검사합니다.
- **출처**:
  - https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md (읽은 날짜 2026-10-30): "The templates include comprehensive checklists that act as "unit tests" for the specification." / "The `/speckit.analyze` command evaluates the concrete constitution in the project."
- **이미 있는가**: 일부. `skills/plan/SKILL.md`가 작업마다 명령이나 사람이 확인할 수 있는 인수 기준과 범위를 요구하고 겹치는 범위를 `dependsOn`으로 정렬하게 하지만, 스토리, 마일스톤, 작업 사이의 일관성을 따로 점검하는 단계는 없습니다.
- **비용**: 중간. 점검 규칙을 코드로 쓰거나 `plan`에 읽기 단계를 더해야 합니다.
- **위험**: 복잡도: 점검이 틀리게 막으면 계획이 지연됩니다. 조사에서는 spec-kit의 `/speckit.clarify`와 `/speckit.checklist` 동작을 확인하지 못했습니다(not found).
- **추천**: 보류. `plan`의 기존 검증과 겹치는 부분이 커서 얼마나 새로운지 더 살펴본 뒤 정하는 것이 낫습니다.

### 후보 12. 작업 크기에 맞춘 가벼운 경로

- **주제**: 계획과 요구 명료화
- **무엇인지**: 작은 수정은 계획 없이 바로 구현하고, 큰 작업은 더 일찍 더 깊게 같은 과정을 돌게 합니다.
- **출처**:
  - https://docs.bmad-method.org/ (읽은 날짜 2026-10-30): "a small fix can go straight to building with no planning at all."
  - https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md (읽은 날짜 2026-10-30): "Go directly to implementation for clear changes or add deeper planning for larger initiatives."
- **이미 있는가**: 없음. `skills/plan/SKILL.md`는 항상 스토리, 마일스톤, 작업으로 나누는 한 경로뿐이고 작은 일을 위한 생략 경로는 없습니다. 보고서가 "부분적"이라 한 것은 맥락만으로 한 추정이어서 저장소에서 확인되지 않았습니다.
- **비용**: 중간. 경로를 나누려면 어떤 일이 작은지 기준과 생략해도 되는 검사의 목록이 필요합니다.
- **위험**: 안전: 생략 경로가 사람 병합이라는 원칙을 우회하면 안 됩니다. 복잡도: 기준이 모호하면 모든 일이 작다고 불리게 됩니다. BMAD 7은 알파라고 밝혀 이름이 바뀔 수 있습니다.
- **추천**: 보류. 쓸모는 있으나 안전 경계를 먼저 그려야 해서 후보 8, 10과 같이 봅니다.

### 후보 13. 교정 자동 감지와 본능 학습

- **주제**: 자가개선 고리
- **무엇인지**: 훅으로 매 턴을 수집해 사용자의 정정을 알아채고 스킬이나 규칙 후보로 만들며, 같은 정정이 반복되면 합치고 신뢰도 점수를 붙입니다. 수동 표시 명령도 둡니다.
- **출처**:
  - https://github.com/ReflexioAI/claude-smart (읽은 날짜 2026-10-30): "Every user turn, tool call, and assistant response is captured via lifecycle hooks." / "correct the same thing twice and they merge"
  - https://github.com/affaan-m/everything-claude-code (읽은 날짜 2026-10-30): "Instinct-based learning with confidence scoring"
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (읽은 날짜 2026-10-30): "Results depend on the configured memory, learning components and quality of feedback."
- **이미 있는가**: 일부. `skills/retro/SKILL.md`가 워커 요약, 리뷰 댓글, 사용자 말을 읽고 개인 취향, 즉시 수정, 규칙 후보로 나눠 제안하지만 사람이 불러야만 돌고 자동 수집은 없습니다(`docs/self-improvement.md`가 같은 점을 적습니다).
- **비용**: 큼. 수집 훅, 저장 형식, 병합 규칙, 신뢰도 계산이 모두 새로 필요합니다.
- **위험**: 보안: 모든 대화를 저장하므로 비밀값과 개인정보가 담길 수 있습니다. 복잡도: 잘못 배운 규칙이 쌓이는 위험. 조사에서는 신뢰도 계산법과 실제 효과를 확인하지 못했습니다(not found). claude-smart는 별 789개입니다.
- **추천**: 보류. 큰 변화이고 개인정보 위험이 있어, 먼저 후보 14(retro 호출 계기)와 후보 15(추출 기준)로 얻는 효과를 본 뒤에 정합니다.

### 후보 14. retro를 부르는 계기 만들기

- **주제**: 자가개선 고리
- **무엇인지**: 에픽(마일스톤) 하나를 만들고 검증한 뒤 자동으로 회고까지 도는 모듈처럼, 일의 끝에 회고를 부르는 계기를 둡니다.
- **출처**:
  - https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md (읽은 날짜 2026-10-30): "Builds, verifies, and retros a whole epic unattended."
- **이미 있는가**: 일부. `skills/retro/SKILL.md`는 있지만 `skills/build/SKILL.md`에는 retro를 부르는 단계가 없습니다(`docs/self-improvement.md`가 같은 점을 적습니다). 보고서는 사람 없이 도는 방식이 사람이 모든 PR을 병합하는 haku 원칙과 충돌할 수 있다고 적었는데(조사자의 추론), 호출 계기만 두고 실행 여부는 사용자에게 선택 질문으로 묻는 방식은 충돌하지 않습니다.
- **비용**: 작음. `build`의 스토리 종료 단계에 선택 질문 한 줄을 더하는 정도입니다.
- **위험**: 복잡도: 거의 없습니다. 자동으로 돌리는 방식은 권한 문제가 있어 이 후보에는 넣지 않았습니다. 근거는 홍보 문구 수준의 한 줄이고 BMAD V7은 알파입니다.
- **추천**: 넣기. 자가개선 고리에서 가장 싼 빈틈이고 조사 근거와 저장소 확인이 모두 맞습니다.

### 후보 15. 교훈 추출 기준

- **주제**: 기억과 교훈
- **무엇인지**: 비자명한 해결을 마친 뒤에만, 육 개월 뒤에도 도움이 되는지를 기준으로 교훈을 걸러 저장소가 쓰레기로 차지 않게 합니다.
- **출처**:
  - https://github.com/blader/Claudeception (읽은 날짜 2026-10-30): "Would this actually help someone who hits this problem in six months?"
- **이미 있는가**: 일부. `skills/retro/SKILL.md`가 개인 취향, 즉시 수정, 규칙 후보로 분류하는 기준을 가지고 있지만, 무엇을 규칙으로 남길 만한가를 거르는 시간 기준은 없습니다. 교훈 저장소 자체는 없습니다.
- **비용**: 작음. `retro` 분류 단계에 질문 하나를 더하는 정도입니다.
- **위험**: 복잡도: 거의 없습니다. 근거 페이지는 포크로 표시됐고 별 2.4k는 그 페이지의 값이며 마지막 갱신 날짜와 라이선스는 확인하지 못했습니다.
- **추천**: 넣기. 규칙 후보를 거르는 싼 질문이라 후보 14와 함께 넣기 좋습니다.

### 후보 16. 세션 간 기억 저장소

- **주제**: 기억과 교훈
- **무엇인지**: 세션 시작과 종료 훅으로 맥락을 자동 저장하고 불러오며, 기억을 층으로 나눠 토큰 비용을 보며 꺼내고, 비공개 태그로 저장에서 제외하고, 제품과 기술 결정을 이어 가는 맥락 문서를 둡니다.
- **출처**:
  - https://github.com/affaan-m/everything-claude-code (읽은 날짜 2026-10-30): "Hooks that save/load context across sessions automatically."
  - https://github.com/thedotmack/claude-mem (읽은 날짜 2026-10-30): "Layered memory retrieval with token cost visibility."
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (읽은 날짜 2026-10-30): "Save and restore agent memory across sessions"
  - https://docs.bmad-method.org/ (읽은 날짜 2026-10-30): "Carry product and technical decisions forward instead of re-explaining them in every chat."
- **이미 있는가**: 없음. `skills/build/SKILL.md` 첫 단락이 영어 원문 "The Git issues are the single source of truth - never rely on this session's memory"(Git 이슈가 유일한 진실의 원천이고 세션 기억에 기대지 않는다는 뜻)로 정해 두었고 별도 기억 저장소는 없습니다. 세션을 넘는 결정 기록은 이슈 댓글에 있습니다.
- **비용**: 큼. 저장 형식, 훅, 불러오기 규칙, 비공개 처리가 모두 새로 필요합니다.
- **위험**: 보안: 기억에 비밀값과 개인정보가 남을 수 있습니다. 복잡도: 이슈와 기억이 어긋나면 진실의 원천이 둘이 됩니다. claude-mem은 별 105k이지만 최근 갱신은 확인하지 못했습니다. Ruflo는 홍보 문구 수준이라 구현을 확인하지 못했습니다.
- **추천**: 버리기. 이슈가 진실의 원천이라는 haku의 핵심 원칙과 부딪히므로 지금은 버리고, 필요가 분명해지면 다시 제안합니다.

### 후보 17. 보안 스캔

- **주제**: 안전망과 훅
- **무엇인지**: 프롬프트, 훅, MCP 설정, 권한, 비밀값, 에이전트 파일을 점검하고 취약점과 프롬프트 주입, 개인정보를 탐지합니다.
- **출처**:
  - https://github.com/affaan-m/everything-claude-code (읽은 날짜 2026-10-30): "Scanning for prompts, hooks, MCP config, permissions, secrets, and agent files"
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (읽은 날짜 2026-10-30): "Scan for vulnerabilities and CVEs" / "Block prompt injection, detect PII, safety scanning"
- **이미 있는가**: 일부. `scripts/check-personal-paths.js`가 추적 파일의 개인 경로를, `scripts/lib/pr-config.js`와 `scripts/lib/weaken.js`가 검사 설정 변경을 잡지만, 비밀값이나 권한, 주입 점검은 없습니다.
- **비용**: 큼. 탐지 규칙을 직접 만들고 유지해야 하며 오탐 처리도 필요합니다.
- **위험**: 의존성 0 규칙: 외부 스캐너는 쓸 수 없어 규칙을 직접 만들어야 합니다. 보안: 놓친 것을 안전하다고 오해하게 만들 수 있습니다. 조사에서는 AgentShield와 Ruflo 쪽의 실제 효과와 라이선스를 확인하지 못했습니다.
- **추천**: 보류. 범위가 너무 넓어 가장 값이 큰 한 가지(예: 비밀값 검사)만 골라 따로 설계한 뒤에 정합니다.

### 한계

- 조사한 곳은 각 저장소의 README 첫 페이지 수준입니다. 개별 SKILL.md와 하위 문서는 읽지 않아서 동작 세부(훅 종류, 신뢰도 계산법, 스킬 시험 방식)는 not found입니다. ECC README는 139,157자 중 앞 100,000자만 읽었습니다.
- 인용은 요약기를 거친 문구라 글자 단위로 원문과 같다고 보증하지 못합니다.
- 라이선스, Windows 지원, 의존성 여부는 확인하지 않았습니다. haku는 의존성 0, Node이므로 어느 후보든 도입 전에 별도 확인이 필요합니다.
- 별 수는 큰 편차가 있고(0개부터 105k까지) 모든 페이지에서 마지막 갱신 날짜를 확인하지 못했습니다(not found). 활발히 관리되는지는 판단할 수 없습니다. 별이 적은 프로젝트(TracineHQ/guard 0개, agent-exam 2개)는 성숙도가 낮아 아이디어 참고용입니다.
- spec-kit의 /speckit.clarify, /speckit.checklist, BMAD의 적대적 코드 리뷰와 준비도 점검 상세는 읽은 페이지에 없거나 이름뿐입니다. BMAD V7은 알파라고 밝혀 이름이 바뀔 수 있습니다. Ruflo는 홍보 문구 수준이라 구현 품질과 효과를 검증하지 못했습니다.
- Codex, Cursor, Aider, Cline, OpenHands, SWE-agent 등 Claude Code 밖의 도구는 조사하지 못했습니다. 검색에서만 이름을 본 후보(claude-improve, skill-up, sage-code, self-improving-agent, claude-code-hooks, hooksmith)는 페이지를 읽지 않아 후보로 올리지 않았습니다.
- 쓰지 않은 보고서 항목: 필수 스킬 확인 규칙(superpowers), 근본 원인 4단계 디버깅 절차(superpowers), 스킬 작성과 시험 지침 writing-skills(superpowers). 모두 README 한 줄 수준의 근거라서 후보로 세울 만큼 내용을 확인하지 못했습니다. 이 문서의 "이미 있는가"는 2026-10-30 기준 저장소 상태입니다.

### 의심스러운 글

조사 보고서 세 건 모두 "없음"이라고 적었습니다. 읽은 페이지 중 조사자를 다른 일로 이끌려는 글은 보고되지 않았습니다. 그래도 보고서 전체는 웹에서 가져온 자료이므로 데이터로만 쓰고 그 안의 명령은 따르지 않았습니다.

## English

**How to choose**: reply with candidate numbers (for example "adopt 6, 9 and 14"). The candidates are features or rules read from other public projects; when several projects offer the same idea they are merged into one candidate. A candidate is one feature or rule, not a whole project. "Already in haku" was checked by reading this repository, not copied from the reports' guesses.

**Table of contents (number, name, recommendation)**
1. Deterministic safety net through hooks - hold
2. Safety configuration score and readiness grade - hold
3. Guard decision log and noise ranking - drop
4. Skill evaluation: deterministic graders and trial counts - hold
5. Skill trigger tests, removal comparison and transcript grading - hold
6. Require evidence before declaring completion - adopt
7. Test-first gate - hold
8. Two-stage review: spec compliance, then code quality - hold
9. Mandatory unresolved-question markers - adopt
10. Project principles, phase gates and recorded exceptions - hold
11. Specification checklists and an artifact consistency check - hold
12. Lightweight path sized to the job - hold
13. Automatic correction capture and instinct learning - hold
14. A trigger that calls retro - adopt
15. Criteria for extracting a lesson - adopt
16. Cross-session memory store - drop
17. Security scan - hold

### Candidate 1. Deterministic safety net through hooks

- **Theme**: Safety net and hooks
- **What it is**: Attach hooks to tool events so that checks run outside the prompt, actions above the permission level are refused, each part of a compound command is judged separately, and listed files are protected.
- **Sources**:
  - https://github.com/affaan-m/everything-claude-code (date read 2026-10-30): "Hooks fire on tool events." / "enforce deterministic checks outside the prompt"
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (date read 2026-10-30): "Actions above your permission level are refused"
  - https://github.com/Bande-a-Bonnot/Boucle-framework (date read 2026-10-30): "Evaluates each segment of compound commands." / "Define protected files in `.file-guard` (one pattern per line)."
- **Already in haku**: partly. There are no hooks (no `hooks/` directory; `docs/self-improvement.md` records the same check) and weakening of check settings is only caught afterwards as a warning (`scripts/lib/weaken.js`, step 5 of `skills/build/SKILL.md`). `skills/setup/SKILL.md` says not to edit global hooks and to ask separately.
- **Cost**: medium. Hook scripts, their registration and tests on three operating systems are all new work.
- **Risk**: Security: a hook is code that runs inside the user's settings, so a flaw becomes a hole. Cross-platform: shell hooks behave differently on Windows. The zero-dependency rule can be kept with Node scripts, but the research could not confirm hook kinds and behaviour, licences or Windows support (not found).
- **Recommendation**: hold. The value is large but it changes user settings, so first prove it with one small pilot (a file-scope check).

### Candidate 2. Safety configuration score and readiness grade

- **Theme**: Safety net and hooks
- **What it is**: Grade the safety configuration from A to F and show a one-line fix for every gap. It could be attached to haku `setup` and `status`.
- **Sources**:
  - https://github.com/Bande-a-Bonnot/Boucle-framework (date read 2026-10-30): "Scores your Claude Code safety configuration from A to F and shows one-liner fixes for each gap."
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (date read 2026-10-30): "Grade readiness (1-100)"
- **Already in haku**: partly. `skills/setup/SKILL.md` checks tools, GitHub auth, default-branch protection and the verify file, and `skills/status/SKILL.md` shows the state read-only, but there is no score.
- **Cost**: small. It only adds a scoring rule on top of checks that already exist.
- **Risk**: Complexity: once the scoring criteria exist they become policy. The research could not confirm that Ruflo's grading is the same feature.
- **Recommendation**: hold. Setup and status already show what is needed, and a score only means something once the safety net of candidate 1 is settled.

### Candidate 3. Guard decision log and noise ranking

- **Theme**: Safety net and hooks
- **What it is**: Append every allow and block decision of a guard to a log file and rank the rules that fire most. It serves the review of wrongly blocking guards.
- **Sources**:
  - https://github.com/TracineHQ/guard (date read 2026-10-30): "Every decision is appended to a decisions log file" / "`guard noisy --since 24h` ranks rules by hit count."
- **Already in haku**: no. There is no guard whose decisions could be logged (no `hooks/`; `scripts/lib/weaken.js` prints a warning and records nothing).
- **Cost**: small. Once a guard exists it is one more log line.
- **Risk**: Complexity: it only makes sense after candidate 1. The only source is a project with 0 stars, so maturity is low and it is an idea reference only.
- **Recommendation**: drop. There is nothing to log without hooks. Revisit if candidate 1 is adopted.

### Candidate 4. Skill evaluation: deterministic graders and trial counts

- **Theme**: Evaluation and testing
- **What it is**: Run a command and read a 0.0 to 1.0 score from the JSON on stdout, with trial counts per confidence level (5 for a smoke check, 30 for regression detection). It measures whether a skill still works.
- **Sources**:
  - https://github.com/mgechev/skillgrade (date read 2026-10-30): "Runs a command and parses JSON from stdout." / ""--regression" = "High-confidence regression detection" (30 trials)"
  - https://github.com/affaan-m/everything-claude-code (date read 2026-10-30): "Checkpoint vs continuous evals, grader types, pass@k metrics."
- **Already in haku**: no. `.github/workflows/test.yml` runs only line-ending, personal-path, version and unit checks, with no evaluation of skill behaviour. `tests/` only checks wording rules of skills (for example `tests/decisions-rule.test.js`).
- **Cost**: large. It needs real model runs of the skills, so cost and nondeterminism must be handled.
- **Risk**: Complexity and cost: repeated runs cost money. Zero-dependency rule: an external evaluation tool would break it, so it would have to be written in-house. The grader kinds and calculation in ECC were not confirmed (not found). skillgrade shows 732 stars; its last update date was not found.
- **Recommendation**: hold. The value is large but so is the work; scope it in a separate design issue before deciding.

### Candidate 5. Skill trigger tests, removal comparison and transcript grading

- **Theme**: Evaluation and testing
- **What it is**: Test whether the right skill fires separately from how well it works afterwards, rerun with one skill removed to see whether it helps, and let an LLM judge grade the session transcript against qualitative criteria.
- **Sources**:
  - https://github.com/zytedata/agent-exam (date read 2026-10-30): "whether the right skill fires for a given prompt" / "re-runs a suite with one skill removed"
  - https://github.com/mgechev/skillgrade (date read 2026-10-30): "Evaluate the agent's session transcript against qualitative criteria"
- **Already in haku**: no. Neither a check that skill `description` texts overlap nor a trigger test exists in `tests/` or `scripts/`.
- **Cost**: large. It needs the run infrastructure of candidate 4 first and more tests on top.
- **Risk**: Complexity: an LLM judge is nondeterministic, so tests may flake. agent-exam has 2 stars, so its maturity is low.
- **Recommendation**: hold. It cannot start before candidate 4 is decided.

### Candidate 6. Require evidence before declaring completion

- **Theme**: Review and verification
- **What it is**: A rule that asks for evidence of an actual check before anything is declared done.
- **Sources**:
  - https://github.com/obra/superpowers (date read 2026-10-30): "Evidence over claims - Verify before declaring success"
- **Already in haku**: partly. The worker rules require every criterion to be marked met or unmet with evidence (command output, file, screenshot) (`skills/build/SKILL.md` worker rules, `agents/worker.md` item 7), and the orchestrator verifies on its own with `scripts/lib/verify.js`. What is missing is one general rule for every completion claim, not only a worker's (for example the orchestrator's "ready to merge" report). The report's "not in context" does not hold for worker reports.
- **Cost**: small. A change in one or two sentences, tested by a single wording check.
- **Risk**: Complexity: almost none. An over-broad rule could lengthen reports. The source is a one-line README quote; the SKILL.md itself was not read.
- **Recommendation**: adopt. It is cheap and already points the same way, so only the gap needs filling.

### Candidate 7. Test-first gate

- **Theme**: Review and verification
- **What it is**: Make writing a failing test first, watching it fail and only then implementing a gate with evidence, or one article of the project principles.
- **Sources**:
  - https://github.com/obra/superpowers (date read 2026-10-30): "RED-GREEN-REFACTOR: write failing test, watch it fail"
  - https://github.com/affaan-m/everything-claude-code (date read 2026-10-30): "TDD becomes a gated RED -> GREEN -> REFACTOR workflow with evidence."
  - https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md (date read 2026-10-30): "All implementation MUST follow strict Test-Driven Development."
- **Already in haku**: partly. `agents/worker.md` item 3 asks for "test-first where practical", and `scripts/lib/weaken.js` and `scripts/lib/verify.js` guard against weakened tests, but no gate asks for evidence that the failure was seen first.
- **Cost**: medium. It must define how the failure evidence is recorded and who checks it, with exceptions for work such as docs where tests do not fit.
- **Risk**: Complexity: forcing it makes empty formality on work where tests fit badly (docs, settings). All sources are README-level.
- **Recommendation**: hold. Whether to raise the present wording ("where practical") to an evidence demand is for the user to weigh.

### Candidate 8. Two-stage review: spec compliance, then code quality

- **Theme**: Review and verification
- **What it is**: A fresh sub-agent per task first checks spec compliance, then code quality (quality, security, maintainability), and critical issues block progress.
- **Sources**:
  - https://github.com/obra/superpowers (date read 2026-10-30): "Fast iteration with two-stage review (spec compliance, then code quality)" / "Critical issues block progress."
  - https://github.com/affaan-m/everything-claude-code (date read 2026-10-30): "Reviews code for quality, security, and maintainability."
- **Already in haku**: partly. `agents/` holds only `worker.md` and `researcher.md`, so there is no review agent, but step 5 of `skills/build/SKILL.md` asks for merge approval only after review fixes and passing checks, and `scripts/lib/verify.js` does the mechanical verification.
- **Cost**: medium. It needs one review-agent instruction and one step in `build`, and adds model calls.
- **Risk**: Security and complexity: a review agent must also be read-only with narrowed tools like `researcher.md`. Sources are README-level.
- **Recommendation**: hold. Review is the last defence before the human merge, but the user should first accept the extra cost.

### Candidate 9. Mandatory unresolved-question markers

- **Theme**: Planning and clarifying requirements
- **What it is**: Plans and specs must leave a marker such as `[NEEDS CLARIFICATION]` where something is unclear instead of guessing, and a plan with markers left does not pass.
- **Sources**:
  - https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md (date read 2026-10-30): "Both templates mandate the use of `[NEEDS CLARIFICATION]` markers."
- **Already in haku**: partly. `skills/sniff/SKILL.md` runs a decision-tree interview and keeps branches touching money, data or security as open questions in the summary, and `skills/plan/SKILL.md` hands a vague goal over to `sniff`. Nothing leaves a marker in the plan document and uses it as a pass condition.
- **Cost**: small. One marker check added to `plan` validation.
- **Risk**: Complexity: almost none. Markers could be deleted as a formality. The source is one sentence in one document.
- **Recommendation**: adopt. It is cheap and fills the exact gap between `sniff` and `plan`.

### Candidate 10. Project principles, phase gates and recorded exceptions

- **Theme**: Planning and clarifying requirements
- **What it is**: Set project principles (a constitution) once, and let a plan proceed only by passing the gates or documenting a justified exception.
- **Sources**:
  - https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md (date read 2026-10-30): "The LLM cannot proceed without either passing the gates or documenting justified exceptions"
  - https://raw.githubusercontent.com/github/spec-kit/main/README.md (date read 2026-10-30): "Create a constitution once per project..."
- **Already in haku**: partly. There are the default-branch verify file (`verify.json`), the test-weakening guard (`scripts/lib/weaken.js`) and per-task scope declarations (`skills/plan/SKILL.md`), but no gate that records exceptions and no project-principles document.
- **Cost**: medium. A principles-document format and a gate-check step must be added to `plan`.
- **Risk**: Complexity: more gates make small jobs heavy (read together with candidate 12). The sources are sentences in two documents.
- **Recommendation**: hold. Haku's present guards cover most of it; revisit when a real painful case appears.

### Candidate 11. Specification checklists and an artifact consistency check

- **Theme**: Planning and clarifying requirements
- **What it is**: Put checklists that act as unit tests into the specification to check requirement quality, and use a separate command to check that artifacts agree with the principles.
- **Sources**:
  - https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md (date read 2026-10-30): "The templates include comprehensive checklists that act as "unit tests" for the specification." / "The `/speckit.analyze` command evaluates the concrete constitution in the project."
- **Already in haku**: partly. `skills/plan/SKILL.md` requires acceptance criteria a command or person can check and a scope per task, and orders overlapping scopes with `dependsOn`, but no step checks consistency across story, milestones and tasks.
- **Cost**: medium. Check rules must be coded, or a reading step added to `plan`.
- **Risk**: Complexity: a wrong block delays planning. The research could not confirm how `/speckit.clarify` and `/speckit.checklist` behave in spec-kit (not found).
- **Recommendation**: hold. It overlaps strongly with existing `plan` validation; check how new it really is before deciding.

### Candidate 12. Lightweight path sized to the job

- **Theme**: Planning and clarifying requirements
- **What it is**: Let a small fix go straight to building with no planning, and give larger work earlier and deeper planning.
- **Sources**:
  - https://docs.bmad-method.org/ (date read 2026-10-30): "a small fix can go straight to building with no planning at all."
  - https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md (date read 2026-10-30): "Go directly to implementation for clear changes or add deeper planning for larger initiatives."
- **Already in haku**: no. `skills/plan/SKILL.md` has one path that always splits into story, milestones and tasks, with no shortcut for small jobs. The report said "partly" from context only; the repository does not confirm it.
- **Cost**: medium. Splitting paths needs a criterion for "small" and a list of checks that may be skipped.
- **Risk**: Safety: the shortcut must not bypass the human-merge principle. Complexity: a vague criterion lets every job be called small. BMAD V7 states it is alpha, so names may change.
- **Recommendation**: hold. Useful, but the safety boundary must be drawn first, so read it with candidates 8 and 10.

### Candidate 13. Automatic correction capture and instinct learning

- **Theme**: Self-improvement loop
- **What it is**: Capture every turn through hooks, notice the user's corrections and turn them into skills or rule candidates, merge repeated corrections, attach confidence scores, and keep a manual marking command.
- **Sources**:
  - https://github.com/ReflexioAI/claude-smart (date read 2026-10-30): "Every user turn, tool call, and assistant response is captured via lifecycle hooks." / "correct the same thing twice and they merge"
  - https://github.com/affaan-m/everything-claude-code (date read 2026-10-30): "Instinct-based learning with confidence scoring"
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (date read 2026-10-30): "Results depend on the configured memory, learning components and quality of feedback."
- **Already in haku**: partly. `skills/retro/SKILL.md` reads worker summaries, review comments and the user's remarks and sorts them into personal preference, immediate fix and rule candidate, but runs only when called by a person and has no automatic capture (`docs/self-improvement.md` records the same).
- **Cost**: large. Capture hooks, a storage format, merge rules and confidence scoring are all new.
- **Risk**: Security: storing every turn may capture secrets and personal data. Complexity: wrongly learned rules can pile up. The research could not confirm how confidence is calculated or the real effect (not found). claude-smart shows 789 stars.
- **Recommendation**: hold. It is a large change with a privacy risk; first see what candidates 14 and 15 achieve.

### Candidate 14. A trigger that calls retro

- **Theme**: Self-improvement loop
- **What it is**: Place a trigger that calls the retrospective at the end of a unit of work, like a module that builds, verifies and retros a whole epic.
- **Sources**:
  - https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md (date read 2026-10-30): "Builds, verifies, and retros a whole epic unattended."
- **Already in haku**: partly. `skills/retro/SKILL.md` exists but `skills/build/SKILL.md` has no step that calls retro (`docs/self-improvement.md` records the same). The report warned that an unattended run may clash with haku's principle that a human merges every PR (the researcher's inference); a trigger that only asks the user by a choice question whether to run retro does not clash.
- **Cost**: small. One choice question added to the story-closing step of `build`.
- **Risk**: Complexity: almost none. The unattended version raises permission problems and is not part of this candidate. The source is one promotional line and BMAD V7 is alpha.
- **Recommendation**: adopt. It is the cheapest gap in the self-improvement loop and both the research and the repository agree.

### Candidate 15. Criteria for extracting a lesson

- **Theme**: Memory and lessons
- **What it is**: Extract a lesson only after a non-obvious solution, filtered by whether it would still help in six months, so the store does not fill with junk.
- **Sources**:
  - https://github.com/blader/Claudeception (date read 2026-10-30): "Would this actually help someone who hits this problem in six months?"
- **Already in haku**: partly. `skills/retro/SKILL.md` sorts items into personal preference, immediate fix and rule candidate, but has no time-based test for what deserves to become a rule. No lesson store exists.
- **Cost**: small. One question added to the sorting step of `retro`.
- **Risk**: Complexity: almost none. The page is marked as a fork and the 2.4k stars are that page's figure; the last update date and the licence were not confirmed.
- **Recommendation**: adopt. A cheap question for filtering rule candidates; a good companion to candidate 14.

### Candidate 16. Cross-session memory store

- **Theme**: Memory and lessons
- **What it is**: Save and load context automatically through session start and end hooks, retrieve memory in layers while watching token cost, exclude private-tagged text from storage, and keep a context document that carries decisions forward.
- **Sources**:
  - https://github.com/affaan-m/everything-claude-code (date read 2026-10-30): "Hooks that save/load context across sessions automatically."
  - https://github.com/thedotmack/claude-mem (date read 2026-10-30): "Layered memory retrieval with token cost visibility."
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (date read 2026-10-30): "Save and restore agent memory across sessions"
  - https://docs.bmad-method.org/ (date read 2026-10-30): "Carry product and technical decisions forward instead of re-explaining them in every chat."
- **Already in haku**: no. The first paragraph of `skills/build/SKILL.md` says the Git issues are the single source of truth and never to rely on session memory, and no separate memory store exists. Decisions across sessions live in issue comments.
- **Cost**: large. A storage format, hooks, loading rules and privacy handling are all new.
- **Risk**: Security: memory may keep secrets and personal data. Complexity: when issues and memory disagree there are two sources of truth. claude-mem shows 105k stars but its recent activity was not found. Ruflo is promotional text and its implementation was not checked.
- **Recommendation**: drop. It collides with haku's core principle that issues are the source of truth, so drop it now and propose again if a clear need appears.

### Candidate 17. Security scan

- **Theme**: Safety net and hooks
- **What it is**: Scan prompts, hooks, MCP configuration, permissions, secrets and agent files, and detect vulnerabilities, prompt injection and personal data.
- **Sources**:
  - https://github.com/affaan-m/everything-claude-code (date read 2026-10-30): "Scanning for prompts, hooks, MCP config, permissions, secrets, and agent files"
  - https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md (date read 2026-10-30): "Scan for vulnerabilities and CVEs" / "Block prompt injection, detect PII, safety scanning"
- **Already in haku**: partly. `scripts/check-personal-paths.js` catches personal paths in tracked files, and `scripts/lib/pr-config.js` with `scripts/lib/weaken.js` catch changes to check settings, but secrets, permissions and injection are not checked.
- **Cost**: large. Detection rules must be written and maintained in-house, with false-positive handling.
- **Risk**: Zero-dependency rule: no external scanner, so rules must be built in-house. Security: a missed finding may be taken as safe. The research could not confirm the real effect or licences of AgentShield and the Ruflo tools.
- **Recommendation**: hold. The scope is too wide; pick the one most valuable part (for example a secrets check) and design it separately first.

### Limits

- Only the README-level front pages were read. Individual SKILL.md files and sub-pages were not read, so behaviour details (hook kinds, how confidence is calculated, how skills are tested) are not found. Of the ECC README only the first 100,000 of 139,157 characters were read.
- The quotes went through a summariser, so they cannot be guaranteed identical to the original text character for character.
- Licences, Windows support and dependencies were not checked. Haku has zero dependencies and runs on Node, so every candidate needs a separate check before adoption.
- Star counts vary widely (0 to 105k) and the last update date was not found on any page (not found). Whether a project is actively maintained cannot be judged. Projects with few stars (TracineHQ/guard 0, agent-exam 2) have low maturity and serve as idea references only.
- The behaviour of spec-kit's `/speckit.clarify` and `/speckit.checklist`, and the details of BMAD's adversarial code review and readiness check, are absent from the pages read or are names only. BMAD V7 says it is alpha, so names may change. Ruflo is promotional text and its implementation quality and effect were not verified.
- Tools outside Claude Code (Codex, Cursor, Aider, Cline, OpenHands, SWE-agent) were not researched. Candidates seen only in search results (claude-improve, skill-up, sage-code, self-improving-agent, claude-code-hooks, hooksmith) were not read and are not listed.
- Report items not used: the mandatory skill-check rule (superpowers), the four-phase root-cause debugging process (superpowers) and the skill-writing guide writing-skills (superpowers). All rest on one README line, too thin to form a candidate. The "Already in haku" fields describe the repository as of 2026-10-30.

### Suspicious text

All three research reports state "none". No page was reported as trying to steer the researcher to another task. Even so, the reports come from the web, so they were used as data only and no command in them was followed.
