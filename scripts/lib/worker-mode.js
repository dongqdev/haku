'use strict';

const { readableText } = require('./model');
const { WORKER_MODES, workerSettings } = require('./config');

const MAX_REASON = 200;

// The worker mode a task asked for in its "Worker-Mode:" line and the reason from "Worker-Reason:".
// Text in code fences, quotes and comments never counts (readableText), so an example in an issue cannot switch a mode.
// { mode: null } when the task has no line; { problem } when the line cannot be used.
function taskWorkerMode(body) {
  const text = readableText(body || '');
  const line = text.match(/^Worker-Mode:[ \t]*(.*?)[ \t]*$/im);
  if (!line) return { mode: null };
  if (!WORKER_MODES.includes(line[1])) {
    return { mode: null, problem: `Worker-Mode must be one of ${WORKER_MODES.join(', ')}, not "${line[1]}"` };
  }
  const reason = (text.match(/^Worker-Reason:[ \t]*(.*?)[ \t]*$/im) || [])[1] || '';
  if (line[1] === 'session' && !reason) {
    return { mode: null, problem: 'Worker-Mode: session needs a Worker-Reason: line that says which tool the task needs' };
  }
  return { mode: line[1], reason };
}

// The mode a worker for this task really runs in: the task's own line, else the repository's workerMode (default subagent).
// A line that cannot be used is an error, never a silent fallback: the orchestrator would start the wrong kind of worker.
function effectiveWorkerMode(issue, config) {
  const task = taskWorkerMode(issue.body);
  if (task.problem) throw new Error(`#${issue.number}: ${task.problem}`);
  if (task.mode) return { issue: issue.number, mode: task.mode, source: 'task', reason: task.reason };
  return { issue: issue.number, mode: workerSettings(config).mode, source: 'config', reason: '' };
}

module.exports = { taskWorkerMode, effectiveWorkerMode, MAX_REASON };
