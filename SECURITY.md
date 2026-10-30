# 보안 정책 / Security policy

## 한국어

haku의 보안 문제를 발견하셨다면 **공개 이슈로 올리지 마세요.** 다른 사람이 악용하기 전에 고칠 시간이 필요합니다.

- 이 저장소의 **Security 탭 → "Report a vulnerability"**(비공개 취약점 보고)로 알려 주세요.
- 적어 주실 것: 어떤 버전인지, 어떻게 재현하는지, 무엇이 위험한지. 비밀값과 개인 경로는 지워 주세요.
- 지원 범위: 가장 최근 버전만 고칩니다.
- 이 저장소는 개인이 운영합니다. 답변이 며칠 걸릴 수 있습니다. 고치면 보고하신 분께 먼저 알리고, 고친 버전이 나온 뒤에 공개합니다.

보안 문제로 보는 것은 예를 들어 이런 것입니다. 워커나 스킬이 이슈·PR의 글 때문에 의도하지 않은 명령을 실행하는 것, 검증 명령이 기본 브랜치가 아닌 곳에서 읽히는 것, 비밀값이나 개인 경로가 새는 것.

## English

If you found a security problem in haku, **please do not open a public issue.** We need time to fix it before anyone can abuse it.

- Use this repository's **Security tab → "Report a vulnerability"** (private vulnerability reporting).
- Please include the version, how to reproduce it and what the risk is. Remove secrets and personal paths.
- Supported: only the latest version is fixed.
- This repository is run by one person, so an answer can take a few days. We tell the reporter first and disclose after a fixed version is out.

Examples of what counts: a worker or skill running an unintended command because of text in an issue or pull request, verify commands being read from somewhere other than the default branch, secrets or personal paths leaking.
