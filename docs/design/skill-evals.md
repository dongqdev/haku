# 스킬 평가(채점기) 설계 / Design: skill evaluations

## 한국어

**상태**: 설계 초안입니다. 구현이 아닙니다. 사용자가 이 문서를 승인한 뒤에 구현을 새 계획으로 세웁니다. 출처는 `docs/ideas-from-others.md`의 후보 4(결정적 채점기와 시행 횟수)와 후보 5(발동 시험, 제거 비교, 대화 기록 채점)입니다. Claude Code의 평가 기능은 2026-10-30에 공식 문서에서 읽은 내용입니다. 조사자가 요약기를 거쳐 전달했으므로 인용은 원문 확인이 필요하고, 읽지 못한 부분(기준선 비교와 채점기 절, 비용 문서)은 "미확인"으로 적었습니다. 직접 실행해 본 것은 하나도 없습니다.

### 1. 전제와 현재 상태

- 스킬은 7개입니다(`build`, `plan`, `retro`, `setup`, `sniff`, `status`, `triage`). 스킬 본문은 모델이 읽는 글이고, 모델이 그대로 따르는지는 지금 재지 않습니다.
- `tests/`는 `node --test tests/*.test.js`로 도는 `node:test` 시험입니다. 스킬과 관련된 시험은 스킬 문장에 특정 문구가 있는지를 문자열로 확인하고(예: `decisions-rule`, `banner`, `sniff-rounds`, `retro-trigger`), 나머지는 `scripts/`의 순수 함수를 확인합니다(`verify`, `weaken`, `worker`, `pr-body` 등). `claude`를 실행하는 시험은 없습니다. `docs/self-improvement.md`도 같은 빈틈을 적었습니다.
- CI(`.github/workflows/test.yml`)는 ubuntu, windows, macos에서 위 시험을 돌리고, 줄바꿈, 개인 경로, 버전을 검사합니다. 모델 키가 없고, 비밀값을 저장소에 두지 않습니다. 이 제약은 바뀌지 않습니다.
- 의존성 0개 규칙이 있습니다. 외부 평가 도구를 의존성으로 넣을 수 없습니다.
- 이 설계가 쓰는 Claude Code 사실(2026-10-30 문서를 읽은 내용, 요약기를 거침):
  - `claude plugin eval`은 Claude Code v2.1.269 이상에서 있습니다. 문제 해결 절에 "early access"와 "currently unavailable"(서버 쪽에서 꺼짐) 메시지가 있습니다. 즉 모든 계정에서 켜져 있다고 볼 수 없습니다(**미확인**: 관리자의 계정에서 켜져 있는지).
  - 평가 모음은 플러그인 안의 `evals/<사례>/prompt.md`(머리말에 이름, 시행 횟수 등, 본문이 프롬프트)와 `graders/<이름>.md`(파일 하나에 채점기 하나)입니다. 채점기가 하나도 없는 사례는 불러오기에 실패합니다. 알 수 없는 키는 오류입니다.
  - 채점기 종류: 결정적인 `regex`, `tool_used`, `tool_order`, `file_exists`와, 모델이 채점하는 `llm`(심사 3표 중 2표 이상), `baseline`(기준 기록과 비교).
  - 점수: 사례를 기본 3번 돌리고, 한 번의 점수는 통과한 채점기의 비율, 사례 점수는 평균, `--threshold`(기본 1.0) 이상이면 통과입니다. 기본으로 플러그인이 있을 때와 없을 때를 모두 돌려 차이(Δ)를 보여 주지만, 차이는 종료 코드를 바꾸지 않습니다. 종료 코드: 0 통과, 1 문턱 미달·불러오기 오류·API 오류, 2 일부만 실행(비용 상한이나 인증 거부).
  - 모든 실행과 모든 심사가 계정에서 진짜 모델 호출입니다. 모델 호출 없이 도는 방식은 문서에서 찾지 못했습니다. CI에서 쓰려면 Claude Code 설치와 환경의 인증 정보가 필요합니다(조사자의 추론: haku CI는 키가 없으므로 못 돕니다).
  - `claude plugin validate`는 파일과 스키마를 정적으로 검사합니다. 모델 호출이 없고 `--strict`와 `--json`이 있습니다(조사자의 추론: CI에서 가능. 우리 CI 러너에서 실제로 돌려 보지 않았으므로 **미확인**).
  - `/skill-doctor`(v2.1.252 이상)는 스킬마다 문맥 비용과 사용 빈도를 보여 주고 한 번도 안 쓰인 스킬을 표시합니다. 발동이 맞는지는 재지 않습니다(조사자의 추론).
  - 공식 안내: 스킬이 켜진 것을 보는 것과 의도대로 해냈는지는 별개이므로 따로 재라고 합니다.

### 2. 평가의 종류 비교

비용은 돈과 시간, 신뢰도는 "통과가 정말 좋은 상태를 뜻하는가"입니다. 숫자는 재 보지 않았으므로 크기만 적습니다.

| 종류 | 비용 | 신뢰도 | 비결정성 | CI에서 |
|---|---|---|---|---|
| A. 문구·스크립트 결정적 검사(지금 있는 것) | 거의 0. 몇 초 | 높음, 단 "문구가 있다"만 뜻함. 모델이 따르는지는 모름 | 없음 | 가능. 이미 돕니다 |
| B. 스킬 발동 시험(맞는 스킬이 켜지는가) | 사례마다 모델 호출 시행 횟수만큼. 짧은 프롬프트라 작은 편 | 중간. 설명문(`description`)이 그 말투로 켜지는지는 잘 보임. 켜진 뒤의 품질은 모름 | 있음. 같은 프롬프트도 켜지고 안 켜지고 함. 여러 번 돌려 비율로 봄 | 불가(모델 키). 로컬만 |
| C. 결정적 채점기(명령을 실행해 점수를 받는 방식: `regex`, `tool_used`, `file_exists`, 스크립트 JSON 점수) | 사례마다 모델 호출 여러 번(에이전트 실행). 판정 자체는 공짜 | 중간에서 높음. 판정은 기계적이라 같은 결과에 같은 점수. 단 무엇을 채점기로 쓸지가 어렵고 우회될 수 있음 | 에이전트 실행 쪽이 비결정적. 채점은 아님 | 불가(모델 키). 로컬만. 채점기 파일의 형식 검사는 가능 |
| D. 모델이 대화 기록을 채점(`llm`, `baseline`) | 가장 큼. 실행에 더해 채점마다 심사 호출 3번 | 가장 낮음. 정성 기준을 잴 수 있는 유일한 길이지만 심사가 틀리거나 흔들림 | 큼. 실행과 심사 양쪽 | 불가. 로컬만, 그리고 가장 나중 |
| E. 정적 검증(`claude plugin validate`) | 거의 0. 모델 호출 없음 | 높음, 단 "파일이 규격에 맞다"만 뜻함 | 없음 | 가능성 있음(미확인: 러너에서 설치와 실행) |

읽는 법:

- A와 E는 "스킬이 깨지지 않았다"는 최소한만 보증합니다. B부터는 모델을 부르므로 키가 있는 곳에서만 돕니다.
- C와 D의 차이는 판정 방식입니다. 가능한 한 C로 풀고, 어떻게 해도 기계가 못 재는 것만 D로 남기는 순서가 비용과 흔들림을 줄입니다.
- 후보 5의 "스킬을 뺀 채 다시 돌려 비교"는 공식 도구의 기본 동작(있을 때와 없을 때)입니다. 직접 만들면 비용이 두 배가 되는 부분입니다.

### 3. 공식 `claude plugin eval`과 직접 만들기

| | 공식 형식을 채택(파일만 둠) | 직접 실행기를 만듦 | 하지 않음 |
|---|---|---|---|
| 하는 일 | `evals/<사례>/prompt.md`와 `graders/*.md`를 공식 형식으로 씀. 실행은 관리자가 `claude plugin eval`로 로컬에서 | 사례 파일을 읽어 `claude -p` 등으로 모델을 부르고 채점하는 Node 스크립트를 `scripts/`에 만듦(`claude -p`의 정확한 동작은 **미확인**) | 지금 상태 유지 |
| 의존성 0개 규칙 | 지킴. 우리는 파일만 쓰고 공식 도구는 의존성이 아닌 "관리자가 쓰는 외부 프로그램" | 지킴 | 지킴 |
| 만들 양 | 작음. 사례 파일과 형식 검사 시험 | 큼. 시행 반복, 채점, 비용 상한, 격리, 보고서까지 | 없음 |
| 모델 키 | 필요(로컬만). CI에는 못 둠 | 똑같이 필요. 직접 만들어도 CI에서는 못 돎 | 불필요 |
| 격리·안전 | 공식 도구가 맡음(문서상: 개인·프로젝트 설정을 불러오지 않고, 도구를 쓰려면 허용 필요, 명령을 쓰면 운영체제 샌드박스). 우리 환경에서 실제 동작은 **미확인** | 직접 책임. 모델이 쓰는 명령을 안전하게 가두는 일이 가장 어렵고 위험 | |
| 위험 | 도구가 early access이고 서버 쪽에서 꺼질 수 있음. 형식이 바뀔 수 있음. 관리자 계정에서 못 돌 수도 있음 | 만들고 유지하는 부담. 비용 폭주 | 스킬 동작 회귀를 계속 못 봄 |

솔직한 비교: 직접 만들어도 모델 키가 필요한 점은 변하지 않으므로 CI 문제는 풀리지 않습니다. 직접 만드는 쪽이 얻는 것은 "공식 도구가 없거나 꺼져 있어도 돈다"는 독립성뿐이고, 치르는 값은 격리와 비용 통제를 직접 만드는 일입니다. 그래서 **권장은 공식 형식으로 파일만 쓰는 것**입니다. 파일은 도구가 없어도 읽을 수 있는 글이고, 나중에 직접 실행기를 만들기로 해도 같은 파일을 읽으면 됩니다.

구현 전에 반드시 확인할 것(0단계):

1. 관리자의 Claude Code 버전이 v2.1.269 이상이고 `claude plugin eval`이 이 계정에서 켜져 있는가(early access나 unavailable 메시지가 뜨는가).
2. 한 사례를 1번 돌릴 때 실제 비용은 얼마인가(문서는 대략 사례 수 x 시행 수 x 2의 에이전트 실행에 심사 호출이라고 했으나 금액은 읽지 못했습니다. 비용 문서는 미확인).
3. 계정이 구독 로그인이면 결과가 비공개 산출물로 게시될 수 있다고 하므로(`--no-publish`로 막음) 저장소 내용이 게시되는지.
4. 우리 7개 스킬 중 하나로 사례 하나를 만들어 실제로 통과와 실패가 모두 나오는지.
5. 사례 파일 형식이 우리 설치(`.claude-plugin/plugin.json`에 `skills`만 있음)에서 그대로 불러와지는지. 매니페스트의 `experimental.evals` 키로 폴더를 바꿀 수 있다는 말이 있었으나 **미확인**입니다.
6. `evals/` 폴더가 플러그인과 함께 사용자의 설치본에 복사되는 것이 괜찮은가(크기, 사용자가 보는 파일).

### 4. CI와 로컬의 분리

원칙: CI에는 모델 키가 없고 비밀값은 저장소에 두지 않습니다. 따라서 모델을 부르는 평가(B, C의 실행, D)는 전부 관리자의 컴퓨터에서만 돕니다. CI에 두는 것은 모델 없이 되는 것뿐입니다.

| | CI(모든 PR, 세 운영체제 또는 Linux 한 곳) | 관리자의 로컬 전용 |
|---|---|---|
| 돌리는 것 | A(지금 시험 전부), 평가 사례 파일의 형식 검사(채점기가 하나 이상인지, 필수 키, 이름 중복 없음), E(`claude plugin validate`, 러너에서 되는 것으로 확인된 뒤에만) | `claude plugin eval`로 B, C, D 실행 |
| 필요한 것 | Node 22만 | Claude Code v2.1.269 이상, 계정 인증, 운영체제 샌드박스(Linux는 bubblewrap, socat) |
| 비밀값 | 없음 | 관리자 환경에만. 저장소에 쓰지 않음. 결과 파일에도 비밀이 없는지 확인 |
| 실패하면 | PR이 빨간불 | PR을 막지 않음(6절). 사람이 읽고 판단 |
| 비용 | 0 | 관리자의 구독 사용량이나 API 요금. 비용 상한(`--max-cost-usd`)을 항상 지정 |

- 사례 파일의 형식 검사는 "공식 스키마 전체를 다시 구현"하지 않습니다. 필수로 필요한 몇 가지(채점기 하나 이상, 시행 횟수 범위, 알 수 없는 키 없음)만 확인하는 시험 하나입니다. 스키마 전체의 정확한 검사는 공식 도구 몫입니다.
- 나중에 CI에 키를 두는 길(저장소 비밀값)은 이 설계에서 권하지 않습니다. 외부 기여자의 PR이 비밀값에 닿는 위험과 비용 폭주 위험이 있고, "키 없음" 제약이 지금 보호막입니다. 결정 4에서 다룹니다.

### 5. 사례의 위치·형식과 통과 기준

**위치**: 플러그인 루트의 `evals/<사례>/`(공식 형식을 따름). 사례 이름은 `<스킬>-<상황>`(예: `triage-duplicates`)으로 짓습니다. 이 폴더는 `scripts/`나 `tests/`가 아니라 플러그인 쪽에 둡니다. 공식 도구가 플러그인 안에서 찾기 때문입니다(미확인: 폴더 이름 외 허용 위치).

**형식**: `prompt.md`의 머리말에 이름, 설명, 태그, 시행 횟수, 최대 턴, 제한 시간을, 본문에 프롬프트를 씁니다. `graders/<이름>.md`에 채점기 하나씩(`type`과 그 종류의 키, 가중치). 사례 하나에 채점기를 결정적인 것부터 둡니다.

**사례의 종류와 시작 목록**(작게 시작):

- 발동 시험: "이 말을 하면 이 스킬이 켜져야 한다"와 "이 말에는 켜지면 안 된다"를 쌍으로. 채점기는 `tool_used`(Skill 도구, 스킬 이름 일치). 문서의 예에 따르면 플러그인 이름이 앞에 붙은 이름도 통과합니다. 켜지면 안 되는 쪽은 `max: 0` 식으로 씁니다(키 이름은 **미확인**).
- 행동 시험: 임시 저장소를 준비하고(공식 형식의 준비 스크립트 칸은 `case.yaml` 쪽에 있다고 읽었으나 **미확인**) 스킬이 의도한 파일·명령을 만드는지 `file_exists`, `regex`, `tool_order`로 확인.
- 모델 채점(`llm`)은 결정적인 채점기로 못 재는 것(예: 질문이 쉬운 말로 쓰였는가)에만, 처음에는 쓰지 않습니다.

**통과 기준**(잠정. 재 보기 전의 값이라 근거가 약합니다):

| 용도 | 시행 횟수 | 문턱 | 이유 |
|---|---|---|---|
| 빠른 점검(스킬 문구를 고친 PR 전) | 사례당 3번(공식 기본값) | 0.8 | 비용을 낮게 두고 큰 퇴보만 잡음. 참고로 skillgrade는 빠른 점검 5번, 회귀 감지 30번을 씀(출처는 README 수준) |
| 회귀 감지(배포 전 한 번) | 사례당 10번 정도 | 0.8 | 3번은 흔들림에 약함. 비용을 보고 횟수 조정 |
| 켜지면 안 되는 사례 | 위와 같음 | 1.0에 가깝게 | 오발동은 눈에 띄게 나쁨 |

- 문턱은 공식 기본값이 1.0이라 모든 시행의 모든 채점기가 통과해야 합니다. 비결정적인 모델에는 너무 엄격해 헛 실패가 잦을 가능성이 큽니다. 그래서 0.8로 시작하자는 것은 추측입니다. 먼저 현재 스킬에서 점수 분포를 재 보고(0단계 4번) 정합니다.
- 통과는 "좋음"의 증명이 아니라 "지난번보다 나빠지지 않음"의 신호로 씁니다. 기준선(수정 전 점수)을 기록해 두고 비교합니다.
- 채점기가 시험을 쉽게 만드는 방향으로 고쳐지는 것(채점기 약화)은 `weaken.js`가 시험 약화를 보는 것과 같은 문제입니다. 채점기 파일을 고치는 PR은 눈에 띄게 표시합니다(구현 때 정함).

### 6. 스킬을 바꾼 PR에서의 쓰임

- 평가는 병합을 막는 관문이 아닙니다. 이유: CI가 못 돌려서 "필수 검사"로 둘 수 없고, 비결정적이라 한 번의 빨간불이 곧 퇴보를 뜻하지 않으며, 비용이 듭니다.
- 스킬 파일(`skills/**`, `agents/**`)을 바꾼 PR이라면 PR 본문의 "테스트" 구역에 평가 결과를 한 줄로 적습니다. 적는 내용: 실행한 명령, 시행 횟수, 문턱, 점수(수정 전 기준선과 함께), 또는 "실행하지 못함과 이유". 실행하지 않은 것을 통과로 적지 않습니다(완료 선언에 증거를 요구하는 haku의 규칙과 같음).
- 병합 승인 화면에 결과를 보일지는 사용자의 결정입니다(결정 6). 권장은 "스킬 파일을 바꾼 PR에서만 한 줄 표시: 실행함(점수)/실행 안 함". 막지 않고 알립니다. 승인 화면의 구현 세부는 이 문서가 다루지 않습니다.
- 평가를 안 돌린 PR이 대부분일 것이므로 "안 돌림"이 정상 상태임을 화면에 분명히 해야 합니다. 그렇지 않으면 표시가 있는 PR만 믿게 됩니다.

### 7. 평가가 재는 것과 재지 못하는 것

재는 것:

- A: 스킬 글에 규칙 문구가 있는가. 스크립트가 같은 입력에 같은 출력을 내는가.
- B: 정해 둔 프롬프트 몇 개에서 스킬이 켜지는 비율.
- C: 정해 둔 상황에서 모델이 만든 결과(파일, 도구 호출 순서, 출력 모양)가 기계적 기준을 만족하는 비율.
- D: 정성 기준에 대해 다른 모델이 내린 의견.

재지 못하는 것:

- 모델의 일반 품질이나 실제 사용자의 만족. 사례 몇 개는 실제 사용을 대표하지 않습니다.
- 켜진 것과 잘한 것의 차이. 공식 문서도 켜짐을 보는 것이 의도대로 해냈다는 뜻은 아니라고 합니다. B가 통과해도 C가 필요합니다.
- 채점기 자체의 옳음. 채점기가 틀리거나 너무 느슨하면 통과가 무의미합니다. D의 심사는 틀리거나 편향될 수 있습니다.
- 모델 버전이 바뀐 영향과 스킬을 바꾼 영향을 가르는 것. 같은 코드도 모델이 바뀌면 점수가 달라집니다. 기준선은 모델 이름과 날짜와 함께 기록해야 합니다.
- 오래 걸리는 실제 이야기 하나(계획부터 병합까지)의 흐름. 사례는 짧은 한 장면입니다. 제한 시간과 최대 턴도 제약입니다.
- `/skill-doctor`는 비용과 사용 빈도만 보여 줍니다. 발동의 정확도가 아니므로 B의 대체가 아니라 "한 번도 안 켜지는 스킬이 있는가"를 보는 보조 도구입니다.
- 통과는 "지금 사례에서 퇴보가 없다"일 뿐 "스킬이 좋다"가 아닙니다.

### 8. 위험

1. **비용 폭주**: 사례 x 시행 x 2에 심사 호출이 곱해집니다. 대응: 상한(`--max-cost-usd`) 필수, 처음엔 `llm` 없이 결정적 채점기만, 사례 수를 작게.
2. **헛 실패와 헛 통과**: 비결정성. 대응: 여러 번, 문턱을 1.0보다 낮게, 기준선 비교, 점수의 흔들림 폭을 기록.
3. **거짓 안심**: 평가가 있다는 이유로 스킬이 검증됐다고 믿는 것. 대응: 7절을 문서와 PR 표시에 남김, 병합 관문으로 쓰지 않음.
4. **채점기 약화**: 시험을 쉽게 고쳐 통과시키는 것. 대응: 채점기 파일 변경을 눈에 띄게 표시하고 기준선과 함께 본다.
5. **도구가 사라지거나 바뀜**: early access, 서버 쪽에서 꺼짐. 대응: 파일은 글로 남으니 손실이 작음. 형식 변경은 형식 검사 시험이 알려 줌. 의존하지 않음.
6. **비밀값 유출**: 평가 실행이 환경의 키를 쓰고 결과 파일에 대화가 담김. 대응: 결과 파일을 저장소에 넣지 않음, `--no-publish`, 개인 경로 검사(`scripts/lib/personal-paths.js`)를 결과 인용 전에.
7. **모델이 실행한 명령의 피해**: 평가 중 모델이 Bash를 쓰면 실제 효과가 있음. 대응: 공식 도구의 샌드박스에 맡기고, 허용 도구를 사례마다 최소로, 임시 저장소에서만 실행.
8. **형식 검사가 스키마를 흉내 냄**: 어긋나면 헛 실패. 대응: 최소 몇 개 키만 확인.
9. **`evals/`가 사용자 설치본에 섞임**: 대응: 0단계 6번에서 확인.
10. **관리자 한 사람에게 의존**: 로컬 전용이라 관리자가 안 돌리면 평가가 없음. 대응: PR 표시의 "실행 안 함"을 정상으로 두고 강요하지 않음.

### 9. 단계별 도입 순서

각 단계는 별도 이슈와 PR이며, 앞 단계의 결과를 보고 다음으로 갑니다.

1. **0단계**: 이 문서를 사용자가 승인하고, 3절의 확인 6가지를 관리자가 한다(특히 계정에서 켜져 있는지와 1회 비용).
2. **1단계**: 가장 작은 사례 하나(스킬 하나의 발동 시험 쌍)를 공식 형식으로 쓰고, 관리자가 로컬에서 돌려 점수 분포(흔들림)를 기록한다. 파일 형식 검사 시험을 CI에 추가한다.
3. **2단계**: 7개 스킬의 발동 시험 쌍으로 늘리고 문턱과 시행 횟수를 1단계 측정값으로 정한다.
4. **3단계**: 행동 시험(결정적 채점기)을 스킬 한두 개에 추가한다.
5. **4단계**: PR 본문과 병합 승인 화면의 평가 표시(결정 6의 선택)를 만든다.
6. **5단계**: `claude plugin validate`를 CI에 넣는다(러너에서 되는 것이 확인된 경우).
7. **6단계**: 모델 채점(`llm`)을 정말 필요한 곳에만 넣을지, 직접 실행기를 만들지를 다시 결정한다. 그전에는 하지 않는다.

### 10. 사용자가 고를 결정 목록

각 항목은 선택지 질문으로 그대로 쓸 수 있게 적었습니다. 권장안이 첫 번째입니다.

#### 결정 1. 공식 형식을 쓸까 직접 만들까

- 질문: 스킬 평가를 어떤 방식으로 준비할까요?
- 선택지: (a) 공식 `claude plugin eval` 형식으로 파일만 씀, 실행은 관리자 로컬 (Recommended), (b) 직접 실행기를 만듦, (c) 하지 않음
- 달라지는 것: (a)는 만들 양이 작고 의존성이 없지만 공식 도구가 관리자 계정에서 돌아야 합니다. (b)는 도구와 무관하게 돌지만 격리와 비용 통제를 직접 만들어야 하고 CI 문제는 똑같이 남습니다. (c)는 스킬 동작 회귀를 계속 못 봅니다.
- 권장: (a). 어느 쪽이든 CI에서 못 도는 점은 같고, 파일은 나중에 실행기를 만들어도 그대로 쓸 수 있습니다.

#### 결정 2. 먼저 확인할 것을 확인할까

- 질문: 구현 전에 3절의 확인 6가지(계정에서 켜져 있는지, 1회 비용 등)를 관리자가 먼저 해 볼까요?
- 선택지: (a) 0단계에서 먼저 확인 (Recommended), (b) 확인 없이 파일부터 씀
- 달라지는 것: (a)는 도구가 이 계정에서 안 돌 때 헛수고를 막습니다. (b)는 시작이 빠르지만 돌려 보지 못한 사례 파일이 쌓일 수 있습니다.
- 권장: (a). 이 설계의 핵심 전제(도구를 쓸 수 있다)가 아직 확인되지 않았습니다.

#### 결정 3. CI에 둘 것

- 질문: CI에는 무엇을 둘까요?
- 선택지: (a) 지금 시험과 사례 파일의 형식 검사만, 모델 호출 평가는 로컬 전용 (Recommended), (b) 여기에 `claude plugin validate`도 더함(러너에서 되는 것이 확인된 뒤), (c) 모델 평가까지 CI에 둠
- 달라지는 것: (a)는 지금 제약을 그대로 지킵니다. (b)는 정적 검사가 하나 늘지만 확인이 먼저 필요합니다. (c)는 CI에 키를 둬야 해서 비밀값 규칙을 깨고 비용과 외부 PR 위험이 생깁니다.
- 권장: (a). (b)는 확인 뒤에 5단계에서 따로 결정합니다. (c)는 권하지 않습니다.

#### 결정 4. 통과 기준

- 질문: 시행 횟수와 문턱을 어떻게 정할까요?
- 선택지: (a) 잠정으로 사례당 3번·문턱 0.8로 시작하고 1단계 측정 뒤 확정 (Recommended), (b) 공식 기본값 그대로(3번·1.0), (c) 처음부터 회귀 감지용 많은 횟수(30번 안팎)
- 달라지는 것: (a)는 비용이 낮고 측정 뒤 고칠 수 있으나 처음 값은 근거가 약합니다. (b)는 설정이 필요 없지만 흔들림 때문에 헛 실패가 잦을 수 있습니다. (c)는 신뢰도가 높지만 비용이 큽니다.
- 권장: (a). 값을 재 보기 전에 정하는 것은 추측이므로 확정을 미룹니다.

#### 결정 5. 사례를 어디에 둘까

- 질문: 평가 사례 파일을 어디에 둘까요?
- 선택지: (a) 플러그인 루트 `evals/<사례>/`, 공식 형식 (Recommended), (b) `tests/` 아래에 둠, (c) 별도 저장소
- 달라지는 것: (a)는 공식 도구가 그대로 찾지만 사용자의 설치본에 같이 복사될 수 있습니다. (b)는 설치본에 안 섞이나 공식 도구가 못 찾을 수 있습니다(미확인). (c)는 분리되지만 스킬과 같이 고치기 어렵습니다.
- 권장: (a). 설치본에 섞이는 문제는 0단계 6번에서 확인하고, 문제가 되면 (b)로 옮깁니다.

#### 결정 6. PR 병합 승인 화면에 결과를 보일까

- 질문: 스킬을 바꾼 PR의 병합 승인 화면에 평가 결과를 보일까요?
- 선택지: (a) 스킬 파일을 바꾼 PR에서만 한 줄로 알림, 병합은 막지 않음 (Recommended), (b) 모든 PR에 표시, (c) 표시하지 않고 PR 본문에만 적음, (d) 통과를 병합 조건으로 함
- 달라지는 것: (a)는 정보가 필요한 때만 보입니다. (b)는 "안 돌림"이 늘 보여 소음이 됩니다. (c)는 화면이 단순하지만 놓치기 쉽습니다. (d)는 CI가 못 돌려 사람 한 명의 로컬 실행에 병합이 묶입니다.
- 권장: (a). 막지 않고 알리며, "실행 안 함"을 정상으로 표시합니다.

#### 결정 7. 모델 채점을 쓸까

- 질문: 모델이 대화 기록을 채점하는 방식(`llm`, `baseline`)을 쓸까요?
- 선택지: (a) 처음에는 쓰지 않고 결정적 채점기만, 정말 필요한 사례가 생기면 그때 (Recommended), (b) 처음부터 일부 사례에 씀, (c) 쓰지 않기로 확정
- 달라지는 것: (a)는 비용과 흔들림이 작습니다. (b)는 정성 기준을 잴 수 있으나 심사 비용과 비결정성이 큽니다. (c)는 쉬운 말인지 같은 기준을 영영 못 잽니다.
- 권장: (a). 후보 5의 위험(심사의 비결정성)과 맞습니다.

#### 결정 8. 이 설계를 승인하고 구현 계획을 세울까

- 질문: 이 문서를 승인하고 9절의 순서로 구현 계획을 세울까요?
- 선택지: (a) 승인, 0단계 확인부터 계획 (Recommended), (b) 수정 후 다시 검토, (c) 보류
- 달라지는 것: (a)는 새 계획과 이슈가 만들어집니다. (b)(c)는 코드 변경이 없습니다.
- 권장: (a). 단 결정 1~7을 먼저 고른 뒤.

## English

**Status**: a design draft, not an implementation. After the user approves this document, the implementation is planned as a new plan. The sources are candidate 4 (deterministic graders and trial counts) and candidate 5 (trigger tests, removal comparison, transcript grading) in `docs/ideas-from-others.md`. What is said about Claude Code's evaluation feature is what the official docs said when read on 2026-10-30. The researcher passed it through a summarizer, so quotes need checking against the original; the parts not read (the baseline and grader sections, the cost page) are marked "unverified". Nothing here was run by hand.

### 1. Premises and current state

- There are 7 skills (`build`, `plan`, `retro`, `setup`, `sniff`, `status`, `triage`). A skill body is text the model reads; whether the model follows it is not measured today.
- `tests/` holds `node:test` tests run by `node --test tests/*.test.js`. The skill-related ones check by string whether a given wording is in the skill text (for example `decisions-rule`, `banner`, `sniff-rounds`, `retro-trigger`); the others check pure functions in `scripts/` (`verify`, `weaken`, `worker`, `pr-body` and so on). No test runs `claude`. `docs/self-improvement.md` records the same gap.
- CI (`.github/workflows/test.yml`) runs those tests on ubuntu, windows and macos and checks line endings, personal paths and the version. It has no model key, and no secret is kept in the repository. This constraint does not change.
- There is a zero-dependency rule. An external evaluation tool cannot be added as a dependency.
- Claude Code facts used here (what the docs of 2026-10-30 said, through a summarizer):
  - `claude plugin eval` exists from Claude Code v2.1.269. The troubleshooting section lists "early access" and "currently unavailable" (switched off server-side) messages. So it cannot be assumed to be on for every account (**unverified**: whether it is on for the maintainer's account).
  - A suite is `evals/<case>/prompt.md` inside the plugin (front matter with name, run count and so on; the body is the prompt) plus `graders/<name>.md` (one grader per file). A case with no grader fails to load. An unknown key is an error.
  - Grader kinds: deterministic `regex`, `tool_used`, `tool_order`, `file_exists`, and model-graded `llm` (at least 2 of 3 judge votes) and `baseline` (compare with a reference record).
  - Scoring: a case runs 3 times by default; one run's score is the fraction of graders passed, the case score is the mean, and it passes at or above `--threshold` (default 1.0). By default it runs with and without the plugin and shows the difference (delta), but the delta does not change the exit code. Exit codes: 0 pass, 1 below threshold, load error or API error, 2 partial run (cost ceiling or credential rejected).
  - Every run and every judge call is a real model call on the account. A mode that runs without a model call was not found in the docs. Using it in CI needs Claude Code installed and credentials in the environment (the researcher's inference: haku's CI has no key and cannot run it).
  - `claude plugin validate` checks files and schema statically. It makes no model call and has `--strict` and `--json` (the researcher's inference: usable in CI; it was not run on our runners, so **unverified**).
  - `/skill-doctor` (v2.1.252 or later) shows each skill's context cost and usage frequency and flags skills never used. It does not measure whether triggering is correct (the researcher's inference).
  - Official advice: seeing a skill fire is different from it doing what was intended, so measure them separately.

### 2. Kinds of evaluation compared

Cost means money and time; reliability means "does a pass really mean a good state". No numbers were measured, so only the size is given.

| Kind | Cost | Reliability | Non-determinism | In CI |
|---|---|---|---|---|
| A. Deterministic wording and script checks (what exists today) | almost zero; seconds | high, but only means "the wording is there"; says nothing about whether the model follows it | none | yes; already runs |
| B. Skill trigger tests (does the right skill fire) | model calls per case times the run count; small, as prompts are short | medium; shows well whether the `description` fires on that phrasing; says nothing about quality after it fires | yes; the same prompt fires sometimes and not others; run several times and read a rate | no (model key); local only |
| C. Deterministic graders (run a command or check and score: `regex`, `tool_used`, `file_exists`, a script's JSON score) | several model calls per case (agent runs); the judging itself is free | medium to high; judging is mechanical so the same result gets the same score; but choosing what to grade is hard and graders can be gamed | the agent run is non-deterministic, the grading is not | no (model key); local only; a format check of the grader files is possible |
| D. Model-graded transcript (`llm`, `baseline`) | the largest; the run plus 3 judge calls per grader | the lowest; the only way to measure qualitative criteria, but the judge can be wrong or wobble | large; both run and judge | no; local only, and last in order |
| E. Static validation (`claude plugin validate`) | almost zero; no model call | high, but only means "the files fit the format" | none | possible (unverified: installing and running it on a runner) |

How to read it:

- A and E only guarantee the minimum, "the skill is not broken". From B on, a model is called, so it runs only where a key exists.
- C and D differ in how they judge. Solve what you can with C and leave to D only what no machine can measure; that order cuts cost and wobble.
- Candidate 5's "rerun with the skill removed and compare" is the official tool's default (with and without the plugin). Building it ourselves would double the cost of that part.

### 3. Official `claude plugin eval` versus building our own

| | Adopt the official format (write files only) | Build our own runner | Do nothing |
|---|---|---|---|
| What happens | Write `evals/<case>/prompt.md` and `graders/*.md` in the official format. The maintainer runs `claude plugin eval` locally | A Node script in `scripts/` reads the case files, calls the model through `claude -p` or similar, and grades (exact behavior of `claude -p` is **unverified**) | Keep the current state |
| Zero-dependency rule | Kept. We write only files; the official tool is an external program the maintainer uses, not a dependency | Kept | Kept |
| Amount to build | Small: case files and a format-check test | Large: repeated runs, grading, cost ceiling, isolation, report | None |
| Model key | Needed (local only). Cannot be put in CI | Needed just the same. Even built by us, it cannot run in CI | Not needed |
| Isolation and safety | Left to the official tool (per the docs: personal and project settings are not loaded, tools need explicit allowance, commands run in an OS sandbox). Real behavior in our setup is **unverified** | Our own job. Confining the commands the model runs safely is the hardest and riskiest part | |
| Risks | The tool is early access and may be switched off server-side. The format may change. It may not run on the maintainer's account | Build and upkeep burden. Runaway cost | Regressions in skill behavior stay invisible |

An honest comparison: building our own does not change the fact that a model key is needed, so the CI problem is not solved. What building gains is independence ("it runs even if the official tool is missing or off"), and the price is building isolation and cost control ourselves. So **the recommendation is to write files in the official format only**. The files are readable text even without the tool, and if we later decide to build a runner, it can read the same files.

What must be checked before implementation (stage 0):

1. Is the maintainer's Claude Code at v2.1.269 or later, and is `claude plugin eval` on for this account (does an early-access or unavailable message appear)?
2. What does one run of one case really cost? (The docs describe roughly cases x runs x 2 agent runs plus judge calls, but no amount was read. The cost page is unread.)
3. If the account is a subscription login, the result may be published as a private artifact (`--no-publish` prevents it). Does repository content get published?
4. Write one case for one of our 7 skills and see that both pass and fail actually occur.
5. Does the case file format load as is in our install (`.claude-plugin/plugin.json` lists only `skills`)? A manifest key `experimental.evals` was said to change the folder, but that is **unverified**.
6. Is it acceptable for an `evals/` folder to be copied into the users' installed plugin copy (size, files users see)?

### 4. Split between CI and local

Principle: CI has no model key and no secret is kept in the repository. So every evaluation that calls a model (B, the running of C, D) runs only on the maintainer's computer. CI holds only what works without a model.

| | CI (every PR, three operating systems or Linux only) | Maintainer's local only |
|---|---|---|
| Runs | A (all current tests), a format check of the case files (at least one grader, required keys, no duplicate names), E (`claude plugin validate`, only after it is confirmed to work on a runner) | B, C and D through `claude plugin eval` |
| Needs | Node 22 only | Claude Code v2.1.269 or later, account credentials, an OS sandbox (bubblewrap and socat on Linux) |
| Secrets | none | only in the maintainer's environment. Never written to the repository. Check result files for secrets |
| On failure | the PR goes red | does not block the PR (section 6). A person reads and judges |
| Cost | 0 | the maintainer's subscription usage or API bill. Always set a cost ceiling (`--max-cost-usd`) |

- The format check of case files does not reimplement the whole official schema. It is one test that checks the few things that must hold (at least one grader, run count in range, no unknown keys). Exact full-schema checking is the official tool's job.
- Putting a key into CI later (a repository secret) is not recommended here. Outside contributors' PRs could reach the secret, cost could run away, and "no key" is the protection today. Decision 3 covers it.

### 5. Case location, format and pass criteria

**Location**: `evals/<case>/` at the plugin root (following the official format). Name cases `<skill>-<situation>` (for example `triage-duplicates`). The folder sits on the plugin side, not in `scripts/` or `tests/`, because the official tool looks inside the plugin (unverified: allowed locations other than that folder name).

**Format**: in `prompt.md`, the front matter holds name, description, tags, run count, max turns and time limit, and the body is the prompt. `graders/<name>.md` holds one grader each (`type`, the keys of that type, a weight). In each case put the deterministic graders first.

**Kinds of cases and a starting list** (start small):

- Trigger tests: pairs of "this phrase should fire this skill" and "this phrase must not". The grader is `tool_used` (the Skill tool, skill name matched). Per the docs example, a name prefixed with the plugin name also passes. For must-not-fire, write a maximum of 0 (the key name is **unverified**).
- Behavior tests: prepare a temporary repository (the official format has a scaffold-script field on the `case.yaml` side, but that is **unverified**) and check with `file_exists`, `regex` and `tool_order` that the skill produces the intended files and commands.
- Model grading (`llm`) only for what deterministic graders cannot measure (for example, whether a question was written in plain words); not used at first.

**Pass criteria** (provisional; values set before measuring, so weakly grounded):

| Use | Run count | Threshold | Reason |
|---|---|---|---|
| Quick check (before a PR that edits skill wording) | 3 runs per case (the official default) | 0.8 | Keeps cost low and catches only large regressions. For reference, skillgrade uses 5 for a quick check and 30 for regression detection (README-level source) |
| Regression detection (once before a release) | about 10 per case | 0.8 | 3 is weak against wobble. Adjust the count by cost |
| Must-not-fire cases | same as above | close to 1.0 | A false trigger is visibly bad |

- The official default threshold is 1.0, so every grader in every run must pass. For a non-deterministic model that is probably too strict and gives frequent false failures. Starting at 0.8 is a guess. First measure the score spread on the current skills (stage 0, item 4) and then decide.
- Use a pass as a signal that "it did not get worse than before", not as proof of "good". Record a baseline (the score before the edit) and compare.
- Editing graders to make the test easier (grader weakening) is the same problem as `weaken.js` watching for weakened tests. A PR that edits grader files is marked visibly (decided at implementation).

### 6. Use in pull requests that change a skill

- Evaluation is not a gate on merging. Reasons: CI cannot run it so it cannot be a required check, it is non-deterministic so one red result does not mean a regression, and it costs money.
- For a PR that changes skill files (`skills/**`, `agents/**`), write the result in one line in the "Test" part of the PR body: the command run, the run count, the threshold, the score (with the baseline before the edit), or "not run, and why". A run that did not happen is never written as a pass (same as haku's rule that completion claims need evidence).
- Whether to show the result on the merge approval screen is the user's decision (decision 6). The recommendation is "one line, only on PRs that change skill files: run (score) or not run". It informs and does not block. This document does not cover how the approval screen is built.
- Most PRs will not have run the evaluation, so the screen must make clear that "not run" is the normal state. Otherwise only the PRs with a mark get trusted.

### 7. What evaluation measures and does not measure

It measures:

- A: whether the skill text holds a rule's wording; whether a script gives the same output for the same input.
- B: the rate at which a skill fires on a few chosen prompts.
- C: the rate at which results the model produced in chosen situations (files, tool-call order, output shape) meet a mechanical criterion.
- D: another model's opinion against a qualitative criterion.

It does not measure:

- The model's general quality or real user satisfaction. A few cases do not represent real use.
- The gap between firing and doing well. The official docs themselves say seeing a trigger does not mean it did what was intended. A passing B still needs C.
- Whether the grader itself is right. If a grader is wrong or too loose, a pass means nothing. The judge in D can be wrong or biased.
- Separating the effect of a model version change from the effect of a skill change. The same text can score differently when the model changes. Record a baseline with the model name and date.
- The flow of one long real story (from plan to merge). A case is a short scene. The time limit and max turns are limits too.
- `/skill-doctor` shows only cost and usage frequency. It is not trigger accuracy, so it is no replacement for B; it is an aid for seeing whether a skill never fires.
- A pass means "no regression on today's cases", not "the skill is good".

### 8. Risks

1. **Runaway cost**: cases x runs x 2, times the judge calls. Response: a ceiling (`--max-cost-usd`) is mandatory, deterministic graders only at first, few cases.
2. **False failures and false passes**: non-determinism. Response: several runs, a threshold below 1.0, baseline comparison, record the spread of scores.
3. **False comfort**: believing a skill is verified because an evaluation exists. Response: keep section 7 in the docs and in the PR mark, and do not use it as a merge gate.
4. **Grader weakening**: making the test easier to pass. Response: mark grader-file changes visibly and read them with the baseline.
5. **The tool disappears or changes**: early access, switched off server-side. Response: the files remain as text so the loss is small; a format change is caught by the format-check test; nothing depends on it.
6. **Secret leakage**: the run uses the key in the environment and the result file holds the conversation. Response: result files stay out of the repository, `--no-publish`, run the personal-path check (`scripts/lib/personal-paths.js`) before quoting results.
7. **Harm from commands the model runs**: if the model uses Bash during evaluation it has real effects. Response: leave it to the official tool's sandbox, allow the minimum tools per case, run only in temporary repositories.
8. **The format check imitating the schema**: when they drift, false failures. Response: check only a few keys.
9. **`evals/` mixed into users' installed copies**: Response: check in stage 0, item 6.
10. **Dependence on one maintainer**: being local only, no evaluation exists if the maintainer does not run it. Response: treat "not run" in the PR mark as normal and do not force it.

### 9. Staged rollout order

Each stage is its own issue and PR, and the next starts after the result of the previous one is seen.

1. **Stage 0**: the user approves this document, and the maintainer does the 6 checks of section 3 (above all whether it is on for the account, and the cost of one run).
2. **Stage 1**: write the smallest case (a trigger pair for one skill) in the official format, run it locally, and record the score spread. Add the case-file format check to CI.
3. **Stage 2**: extend to trigger pairs for all 7 skills, and set the threshold and run count from the stage 1 measurements.
4. **Stage 3**: add behavior tests (deterministic graders) for one or two skills.
5. **Stage 4**: build the evaluation mark in the PR body and on the merge approval screen (as chosen in decision 6).
6. **Stage 5**: add `claude plugin validate` to CI (if confirmed to work on a runner).
7. **Stage 6**: decide again whether to use model grading (`llm`) where truly needed, and whether to build our own runner. Not before.

### 10. Decision list for the user

Each item is written so it can be used as a choice question as it is. The recommendation is the first option.

#### Decision 1. Use the official format or build our own

- Question: how should skill evaluation be prepared?
- Options: (a) write files in the official `claude plugin eval` format only, run by the maintainer locally (Recommended), (b) build our own runner, (c) do not do it
- What changes: (a) is small and dependency-free, but the official tool must run on the maintainer's account. (b) runs regardless of the tool, but isolation and cost control must be built by us and the CI problem stays the same. (c) leaves skill-behavior regressions invisible.
- Recommendation: (a). CI cannot run either way, and the files stay usable if a runner is built later.

#### Decision 2. Check the open items first

- Question: should the maintainer first try the 6 checks of section 3 (whether it is on for the account, cost of one run and so on) before implementation?
- Options: (a) check first, in stage 0 (Recommended), (b) write files without checking
- What changes: (a) prevents wasted work if the tool does not run on this account. (b) starts sooner but case files that were never run may pile up.
- Recommendation: (a). The central premise of this design (the tool can be used) is not yet confirmed.

#### Decision 3. What goes in CI

- Question: what should CI hold?
- Options: (a) the current tests and a format check of the case files only; model-calling evaluation stays local (Recommended), (b) also add `claude plugin validate` (after it is confirmed on a runner), (c) put model evaluation in CI too
- What changes: (a) keeps today's constraint. (b) adds one static check but needs confirmation first. (c) needs a key in CI, which breaks the secret rule and adds cost and outside-PR risk.
- Recommendation: (a). Decide (b) separately in stage 5 after confirming. (c) is not recommended.

#### Decision 4. Pass criteria

- Question: how should the run count and threshold be set?
- Options: (a) start provisionally with 3 runs per case and threshold 0.8, fix them after the stage 1 measurement (Recommended), (b) the official defaults as they are (3 runs, 1.0), (c) a large count for regression detection from the start (around 30)
- What changes: (a) is cheap and can be corrected after measuring, but the first values are weakly grounded. (b) needs no setting but may give frequent false failures from wobble. (c) is more reliable but costly.
- Recommendation: (a). Setting values before measuring is a guess, so fixing them is postponed.

#### Decision 5. Where to keep the cases

- Question: where should the evaluation case files live?
- Options: (a) `evals/<case>/` at the plugin root, official format (Recommended), (b) under `tests/`, (c) a separate repository
- What changes: (a) is found by the official tool as is, but may be copied into users' installs. (b) stays out of installs, but the official tool may not find it (unverified). (c) is separate, but hard to edit together with the skills.
- Recommendation: (a). Check the install-mixing issue in stage 0, item 6, and move to (b) if it is a problem.

#### Decision 6. Show the result on the merge approval screen

- Question: should the merge approval screen of a PR that changes a skill show the evaluation result?
- Options: (a) one line, only on PRs that change skill files, merge not blocked (Recommended), (b) show on every PR, (c) do not show, write it only in the PR body, (d) make a pass a merge condition
- What changes: (a) shows the information only when needed. (b) makes "not run" always visible, which is noise. (c) keeps the screen simple but is easy to miss. (d) cannot run in CI, so merging is tied to one person's local run.
- Recommendation: (a). Inform without blocking, and show "not run" as normal.

#### Decision 7. Use model grading

- Question: should the method where a model grades the transcript (`llm`, `baseline`) be used?
- Options: (a) not at first; deterministic graders only; add it when a case really needs it (Recommended), (b) use it for some cases from the start, (c) decide never to use it
- What changes: (a) keeps cost and wobble small. (b) can measure qualitative criteria, but judge cost and non-determinism are large. (c) means criteria such as plain wording are never measured.
- Recommendation: (a). It matches candidate 5's risk (the judge's non-determinism).

#### Decision 8. Approve this design and plan the implementation

- Question: approve this document and plan the implementation in the order of section 9?
- Options: (a) approve, plan starting with the stage 0 checks (Recommended), (b) revise and review again, (c) hold
- What changes: (a) creates a new plan and issues. (b) and (c) change no code.
- Recommendation: (a), after decisions 1 to 7 are chosen.
