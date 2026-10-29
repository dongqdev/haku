---
name: sniff
description: Find out what the user really wants before planning - reads the repository first, then asks one choice question at a time about the goal, success criteria, scope, constraints and risks, and ends with a confirmed goal summary that plan uses. Use on "/haku:sniff", when the request is vague ("만들고 싶어요", "뭘 해야 할지 모르겠어요"), or when plan cannot state success criteria.
---

# sniff

Sniff out the real goal before anything is planned. Answer the user in Korean. **Nothing is created, written or registered here**: no issues, no files outside `.haku/drafts/`, no repositories.

Helper: `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js"` (called `issues.js`).

## Decisions

Ask the user to decide only through a choice question (AskUserQuestion), never as a free-text question. Put the recommended option first and mark it "(Recommended)". Notices and reports are plain text. Write the question text as literal UTF-8; never use `\uXXXX` escapes, which can garble Korean. Only the orchestrator talks to the user; a worker that needs a decision sends it to the orchestrator.

## 1. Read before asking

Read what can answer a question: the repository (README, layout, manifests), `.haku/config.json`, and the open issues (`issues.js status`, `issues.js triage`). Never ask the user something the code or the issues already answer; say what you found instead.

## 2. Ask, one question at a time

One choice question per turn, two to four options, the recommended one first. Every question also offers an option that means "추천대로 해 주세요", which records your recommendation as an **assumption** instead of an answer. Go in this order and skip what is already clear:

1. **Goal**: what should exist afterwards, and why it matters.
2. **Success criteria**: how anyone will tell it is done (something a command or a person can check).
3. **Out of scope**: what this work will not do.
4. **Constraints**: stack and platform, deadline, budget, secrets, and anything that touches real money, real data or other people's systems.
5. **Existing work**: what to reuse or must not break.
6. **Risks and unknowns**: what could make the plan wrong.

Ask at most eight questions. From the fourth on, include an option "충분합니다, 정리해 주세요". Stop as soon as the user picks it.

## 3. Confirm the summary

Show the **goal summary** in Korean: 목적 / 성공 기준 / 범위 밖 / 제약 / 가정(추천을 따른 것) / 열린 질문. Ask with a choice question: 맞아요 / 수정할게요 / 더 물어봐 주세요. Save the confirmed summary to `.haku/drafts/<slug>.goal.md` (local only).

## 4. Hand over

Tell the user the next step is `/haku:plan`, which reads the saved summary. If the repository is not set up for haku (no `.haku/config.json` on the default branch), say `/haku:setup` comes first.
