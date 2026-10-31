---
schema_version: "1.1"
name: sniff-concrete-edit
description: A clear, concrete small code edit should NOT trigger the sniff skill.
tags: [sniff, should-not-trigger]
runs: 3
---
src/utils.js 의 formatDate 함수에서 월이 0부터 시작하는 버그를 고쳐 줘. getMonth() 결과에 1을 더하면 돼.
