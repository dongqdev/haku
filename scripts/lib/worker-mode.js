'use strict';

const { readableText } = require('./model');
const { WORKER_MODES, workerSettings } = require('./config');

const MAX_REASON = 200;
// Anything that ends a line for a multiline regular expression or a Markdown reader, and every other control character
// (tabs included). A reason with one of these could carry a second harness line ("Scope: **") into the issue body.
// NEL, line separator, paragraph separator: they end a line for a multiline regular expression or a Markdown reader.
const SEPARATORS = String.fromCharCode(0x85, 0x2028, 0x2029);
const NOT_ONE_LINE = new RegExp('[' + '\\x00-\\x1f\\x7f' + SEPARATORS + ']');

// The keys publish writes into an issue's "## Harness" section. Free text must never contain them as a line.
const HARNESS_KEYS = /^[ \t]*(?:Parent|Depends-On|Scope|Verify-Kind|Verify-Profile|Merge-Mode|Worker-Mode|Worker-Reason|Draft-Id|Orchestrator):/i;

// Why a worker reason cannot be used, or null.
function reasonProblem(reason) {
  if (typeof reason !== 'string' || !reason.trim()) return 'needs a one-line reason that says which tool the task needs';
  if (NOT_ONE_LINE.test(reason)) return 'the reason must be one plain line (no line breaks, tabs or control characters)';
  if (reason.trim().length > MAX_REASON) return `the reason must be at most ${MAX_REASON} characters`;
  return null;
}

// True when free text has a harness key at the start of any line (every kind of line break counts).
const hasHarnessLine = text => String(text || '').split(new RegExp('\\r\\n|[' + '\\n\\r' + SEPARATORS + ']')).some(l => HARNESS_KEYS.test(l));

// What a reader of the issue page sees as the author's own words: no comments, closed code fences or quotes (readableText)
// and no collapsed <details> blocks.
const visibleText = body => readableText(body).replace(/<details[\s\S]*?<\/details>/gi, '');

// The "## Harness" section, from its last heading to the next heading. publish writes it last, so a forged heading in the free
// text above it never wins, and a harness line anywhere else (the free text, which can be copied from a stranger) never counts.
function harnessSection(text) {
  const lines = text.split(/\r\n|\n|\r/);
  let start = -1;
  lines.forEach((l, i) => { if (/^##[ \t]+Harness[ \t]*$/i.test(l)) start = i; });
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^#{1,6}[ \t]/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

// The worker mode a task asked for in its "Worker-Mode:" line (with its "Worker-Reason:" line) in the Harness section.
// { mode: null } when there is no usable line; { problem } when there is one that cannot be trusted or used.
function taskWorkerMode(body) {
  const raw = String(body || '');
  if (!/Worker-(?:Mode|Reason):/i.test(raw)) return { mode: null };
  // An unclosed fence makes GitHub show the rest of the page as code, so what the page shows is not what a parser sees.
  if ((raw.match(/^[ \t]*(?:```|~~~)/gm) || []).length % 2 === 1) {
    return { mode: null, problem: 'the issue has an unclosed code fence; close it so what the page shows is what is read' };
  }
  const section = harnessSection(visibleText(raw));
  if (section === null) return { mode: null };
  if (new RegExp('[' + SEPARATORS + ']').test(section)) return { mode: null, problem: 'the Harness section contains a hidden line separator' };
  const modes = [...section.matchAll(/^Worker-Mode:[ \t]*(.*?)[ \t]*$/gim)].map(m => m[1]);
  if (!modes.length) return { mode: null };
  if (modes.length > 1) return { mode: null, problem: 'Worker-Mode appears more than once' };
  if (!WORKER_MODES.includes(modes[0])) {
    return { mode: null, problem: `Worker-Mode must be one of ${WORKER_MODES.join(', ')}, not "${modes[0]}"` };
  }
  if (modes[0] === 'subagent') return { mode: 'subagent', reason: '' };
  const reasons = [...section.matchAll(/^Worker-Reason:[ \t]*(.*?)[ \t]*$/gim)].map(m => m[1]);
  if (reasons.length > 1) return { mode: null, problem: 'Worker-Reason appears more than once' };
  const bad = reasonProblem(reasons[0]);
  if (bad) return { mode: null, problem: `Worker-Mode: session ${bad}` };
  return { mode: 'session', reason: reasons[0] };
}

// The mode a worker for this task really runs in: the task's own line, else the repository's workerMode (default subagent).
// A line that cannot be used is an error, never a silent fallback: the orchestrator would start the wrong kind of worker.
function effectiveWorkerMode(issue, config) {
  const task = taskWorkerMode(issue.body);
  if (task.problem) throw new Error(`#${issue.number}: ${task.problem}`);
  if (task.mode) return { issue: issue.number, mode: task.mode, source: 'task', reason: task.reason };
  return { issue: issue.number, mode: workerSettings(config).mode, source: 'config', reason: '' };
}

// worker-launch starts a session worker. The task's own line is respected: a task that asks for a subagent is not launched
// as a session, and a task that asks for a session needs the user's yes first, because a session worker has every tool
// (the issue text is edited by more people than approved the plan, and a worker can edit it too).
function launchGate(issue, config, userApproved) {
  const mode = effectiveWorkerMode(issue, config);
  if (mode.source === 'task' && mode.mode === 'subagent') {
    throw new Error(`#${issue.number} asks for a subagent worker (Worker-Mode: subagent); start it with worker-start instead`);
  }
  if (mode.source === 'task' && mode.mode === 'session' && !userApproved) {
    throw new Error(`#${issue.number} asks for a session worker because: ${mode.reason}. A session worker has every tool: ask the user with a choice question, then run worker-launch again with --user-approved`);
  }
  return mode;
}

const isOneLine = text => typeof text === 'string' && !NOT_ONE_LINE.test(text);

module.exports = { taskWorkerMode, effectiveWorkerMode, launchGate, reasonProblem, hasHarnessLine, isOneLine, MAX_REASON };
