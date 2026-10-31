# 스킬 평가 사례 / Skill eval cases

## 한국어

`evals/`에는 공식 `claude plugin eval` 형식의 발동 시험 사례가 있습니다. 지금은 `sniff` 하나뿐이고 사례는 둘입니다. 설계는 `docs/design/skill-evals.md`에 있습니다.

| 사례 | 기대 | 채점기 |
|---|---|---|
| `sniff-vague-request` | 막연한 "뭔가 만들고 싶다" 요청에 `sniff`가 켜져야 함 | `tool_used` Skill, `min: 1` |
| `sniff-concrete-edit` | 구체적이고 작은 코드 수정에는 `sniff`가 켜지면 안 됨 | `tool_used` Skill, `max: 0` |

### 로컬 실행 (CI에 넣지 않음)

```
claude plugin eval . --no-publish --threshold 0.8 --max-cost-usd <상한>
```

- **경고**: 모든 실행이 계정에서 진짜 모델 호출입니다(구독 사용량이나 API 요금). 사례 수 x 시행 수 x 2(플러그인 있을 때와 없을 때)만큼 에이전트가 돕니다. 반드시 `--max-cost-usd`를 지정하세요.
- **CI에 넣지 않습니다.** CI에는 모델 키가 없고 키를 저장소에 두지 않습니다. CI는 `tests/evals-format.test.js`로 형식만 검사합니다(모델 호출 없음).
- 이 PR에서는 평가를 한 번도 실행하지 않았습니다(인증 정보 없음). 아래 명령과 형식은 모두 **미확인**입니다.
- 정적 검사로 `claude plugin validate`가 있다고 하나 이 역시 실행해 보지 않았습니다(미확인).
- `evals/`는 플러그인의 다른 파일과 함께 사용자의 설치본에 복사됩니다. 그래서 작게 유지합니다.

### 미확인 목록

- 채점기 파일의 배치. 머리말에 `type`, `tool`, `input_match`, `min`/`max`를 두고 본문은 비웠습니다. 보고서가 확인하지 못했으며, 로컬에서 `claude plugin eval`을 돌려 보기 전까지 미확인입니다.
- 사례 머리말의 `tags`, `runs` 값 형식(목록, 숫자)과 `input_match`의 따옴표 처리.
- `min`/`max`가 `tool_used`에서 호출 횟수 범위를 뜻한다는 점(보고서는 키 이름만 적었습니다).
- 이 계정에서 `claude plugin eval`이 켜져 있는지(early access, unavailable 메시지), 최소 버전 v2.1.269.
- 쓰지 않은 선택 키(`model`, `max_turns`, `timeout_seconds`, `allowed_tools` 등)는 일부러 적지 않았습니다. 형식 시험의 허용 키 목록은 보고서에서 가져왔고 공식 스키마 전체가 아닙니다.

### 측정 결과 기록 틀

| 날짜 | Claude Code 버전 | 모델 | 사례 | 시행 수 | 점수 | 통과(문턱) | 비용(USD) | 메모 |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## English

`evals/` holds trigger-test cases in the official `claude plugin eval` format. Right now it covers one skill, `sniff`, with two cases. The design is in `docs/design/skill-evals.md`.

| Case | Expectation | Grader |
|---|---|---|
| `sniff-vague-request` | A vague "I want to build something" request should trigger `sniff` | `tool_used` Skill, `min: 1` |
| `sniff-concrete-edit` | A clear, small, concrete code edit must NOT trigger `sniff` | `tool_used` Skill, `max: 0` |

### Running locally (not in CI)

```
claude plugin eval . --no-publish --threshold 0.8 --max-cost-usd <limit>
```

- **Warning**: every run is a real model call on your account (plan usage or API bill). Roughly cases x runs x 2 (with and without the plugin) agent runs. Always set `--max-cost-usd`.
- **Not put into CI.** CI has no model key and keys are not stored in the repository. CI only checks the file format with `tests/evals-format.test.js` (no model call).
- No eval was run in this PR (no credentials). The command and the file format below are all **unverified**.
- `claude plugin validate` is said to be a static check; it was not run either (unverified).
- `evals/` is copied into the user's installed copy of the plugin together with everything else, so keep it small.

### Unverified

- The grader file layout. Front matter holds `type`, `tool`, `input_match`, `min`/`max`, and the body is empty. The research report did not confirm it; it stays unverified until `claude plugin eval` is run locally.
- Value formats in case front matter (`tags` as a list, `runs` as a number) and the quoting of `input_match`.
- That `min`/`max` on `tool_used` mean a call-count range (the report only lists the key names).
- Whether `claude plugin eval` is enabled on this account (early access / unavailable messages); minimum version v2.1.269.
- Optional keys not written on purpose: `model`, `max_turns`, `timeout_seconds`, `allowed_tools`, etc. The format test's allowlist comes from the report and is not the full official schema.

### Template for recording measured results

| Date | Claude Code version | Model | Case | Runs | Score | Pass (threshold) | Cost (USD) | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
