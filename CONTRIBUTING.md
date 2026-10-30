# 기여하기 / Contributing

## 한국어

관심 가져 주셔서 고맙습니다. 한글이나 영어 모두 괜찮습니다.

**먼저 이슈로 알려 주세요.** 버그 제보와 기능 제안은 이슈 양식이 있습니다. 큰 변경은 PR을 만들기 전에 이슈에서 방향을 먼저 맞추면 헛수고를 줄일 수 있습니다. 보안 문제는 이슈가 아니라 [SECURITY.md](SECURITY.md)를 보세요.

**PR을 보내실 때**
- 변경은 작게 하나씩. 한 PR은 한 가지 일만 합니다.
- 테스트를 돌려 주세요: `node --test tests/*.test.js` (Node 18 이상, 설치할 패키지 없음). 고친 동작에는 그것을 확인하는 테스트를 같이 넣어 주세요.
- `skills/`, `agents/`, `scripts/`, `.claude-plugin/`을 바꾸면 `.claude-plugin/plugin.json`과 `marketplace.json`의 **버전을 둘 다 올려야** 합니다. CI가 확인합니다. README, 테스트, `.github/`만 바꾸면 올리지 않습니다.
- 텍스트 파일은 LF 줄바꿈입니다(`.gitattributes`). 내 컴퓨터의 사용자 이름이 들어간 경로를 파일에 넣지 마세요(CI가 확인합니다).
- PR 본문은 한글이나 영어로 써 주세요. 이 저장소의 작업용 PR은 한글 구역(요약, 이유, 변경 내용, 테스트, 위험과 영향)으로 쓰지만, 기여자에게는 강제하지 않습니다.

**병합은 관리자가 직접 합니다.** 이 저장소는 에이전트가 병합하지 않는 방식(PR마다 사람이 승인)으로 운영합니다. 처음 PR을 보내시면 CI가 도는 데 관리자의 승인이 필요합니다. 답변이 며칠 걸릴 수 있습니다.

## English

Thank you for your interest. Korean or English is fine.

**Open an issue first.** There are templates for bug reports and feature ideas. For a bigger change, agree on the direction in an issue before you write the pull request. For a security problem, see [SECURITY.md](SECURITY.md) instead of opening an issue.

**When you send a pull request**
- Keep it small: one pull request does one thing.
- Run the tests: `node --test tests/*.test.js` (Node 18 or newer, nothing to install). Add a test for the behavior you fix.
- If you change `skills/`, `agents/`, `scripts/` or `.claude-plugin/`, **raise the version in both** `.claude-plugin/plugin.json` and `marketplace.json`; CI checks it. Changes to the README, tests or `.github/` only need no bump.
- Text files use LF line endings (`.gitattributes`). Do not put a path with your own user name in a file (CI checks this).
- Write the pull request body in Korean or English. This repository's own task PRs use Korean sections (요약, 이유, 변경 내용, 테스트, 위험과 영향); that is not required of contributors.

**A maintainer merges every pull request by hand.** This repository does not let an agent merge (each PR needs a person's approval). If it is your first pull request, CI waits for a maintainer's approval before it runs. An answer can take a few days.
