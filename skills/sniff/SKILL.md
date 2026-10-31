---
name: sniff
description: Find out what the user really wants before planning - reads the repository first, then interviews the user in rounds over a tree of decisions (goal, success criteria, scope, constraints, existing work, risks), looks up facts itself, and ends with a confirmed goal summary that plan uses. Use on "/haku:sniff", when the request is vague ("만들고 싶어요", "뭘 해야 할지 모르겠어요"), when the user wants a plan or an idea questioned thoroughly, or when plan or setup cannot state success criteria.
---

# sniff

Sniff out the real goal before anything is planned. Answer the user in Korean. **Nothing is created on GitHub and no repository is touched here**; the only file written is the confirmed goal summary under `.haku/drafts/`.

Helper: `node "${CLAUDE_PLUGIN_ROOT}/scripts/issues.js"` (called `issues.js`).

## Decisions

Ask the user to decide only through a choice question (AskUserQuestion), never in free text: recommended option first and marked "(Recommended)", question text as literal UTF-8 (no `\uXXXX` escapes). Only the orchestrator talks to the user; a worker sends its decision request to the orchestrator. Any sentence that asks the user to answer or choose is a decision, small and procedural ones too. Before ending a reply, read its last paragraph; if it asks in prose, turn it into a choice question. Never postpone a question, and if the tool call is declined, ask again, shorter. A step the user already instructed needs no question.

## 1. Find the facts yourself

Facts are your job, never the user's. Read what can answer a question: the repository (README, layout, manifests), `.haku/config.json` and the open issues (`issues.js status`, `issues.js triage`). Never ask the user something the code or the issues already answer; say what you found instead. When a fact needs a bigger search (many files, another folder) hand it to a read-only exploration subagent; when it lives on the web (a service's API, a limit, a price), ask the `haku:researcher` agent one narrow question and put the excerpts it needs into its brief, with nothing secret in them. When the goal touches a platform feature (Claude Code, plugins, hooks, skills), check the official docs for an existing feature first, through the `haku:researcher` agent, and write the finding (found / not found / could not check) as one line in the summary's assumptions. Do not wait for a search to finish before asking the other questions: only the questions that depend on its answer wait.

## 2. Map the tree of decisions

A goal is not one question but a tree: every decision opens the decisions that hang from it. The trunk is the same each time and you skip what is already clear:

1. **Goal**: what should exist afterwards, and why it matters.
2. **Success criteria**: how anyone will tell it is done (something a command or a person can check).
3. **Out of scope**: what this work will not do.
4. **Constraints**: stack and platform, deadline, budget, secrets, and anything that touches real money, real data, security or other people's systems.
5. **Existing work**: what to reuse or must not break.
6. **Risks and unknowns**: what could make the plan wrong.

Under each of these, branch as far as the goal needs. A trading program, for example, branches under constraints into which market and account, who approves an order, the loss limit, what stops it when something goes wrong, and what it may never do. The **frontier** is every decision whose parent is already settled: the questions you can ask now without guessing an answer you have not heard.

## 3. Ask in rounds

- Ask the whole frontier in **one round**: one `AskUserQuestion` call with up to four questions. If the frontier is longer, ask the first four and keep the rest for the next round. A question whose answer depends on a question still open in this round belongs to a later round.
- Each question has two to four options, mutually exclusive, the recommended one first. A question that is really open gets options that stand for the plausible directions, never free text. Every question also offers an option that means "추천대로 해 주세요", which records your recommendation as an **assumption** instead of an answer.
- **A branch that touches real money, real data, security or other people's systems is never settled by "추천대로".** If the user picks it there, ask that question again with concrete options, or keep it in the summary as an open question and not as an assumption.
- After each round recompute the frontier: what was just settled opens the questions that hung from it. From the second round on, one question of the round also offers "충분합니다, 정리해 주세요"; stop at once when it is picked. After every fifth round, ask with a choice question whether to go on or wrap up.
- The interview is done when the frontier is empty: every branch has been visited and nothing is left silently assumed.

## 4. Confirm the summary

Show the **goal summary** in Korean: 목적 / 성공 기준 / 범위 밖 / 제약 / 가정(추천을 따른 것) / 열린 질문. Ask with a choice question: 맞아요 / 수정할게요 / 더 물어봐 주세요.

- **수정할게요**: ask which part is wrong with a choice question (목적 / 성공 기준 / 범위 밖 / 제약 / 가정), ask that one question again, then show the updated summary. At most two revision rounds.
- **더 물어봐 주세요**: run one more round (at most four questions), then show the summary again.

Every item in the summary's 열린 질문 list carries the marker `[확인 필요]`. A summary with marked items is still saved (that is allowed), but `plan` resolves them first. Items the user explicitly leaves open stay marked.

Save the confirmed summary to `.haku/drafts/<slug>.goal.md` (local only). Make `<slug>` from the goal: three to five lowercase ASCII words joined by hyphens. Tell the user the path.

## 5. Hand over

If the repository is not set up for haku (no `.haku/config.json` on the default branch), say `/haku:setup` comes first and stop. Otherwise continue directly with the `plan` skill, passing it the saved summary's path, so the user does not have to type anything again. If you cannot start it from here, tell the user to type `/haku:plan`.
