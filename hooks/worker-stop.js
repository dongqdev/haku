#!/usr/bin/env node
'use strict';

// SubagentStop hook: a haku worker that ends without a pull request or a summary is sent back once. It blocks at
// most one time per stop (stop_hook_active is checked first, so a second stop always passes), only for the haku
// worker agent, and on any doubt (broken input, no text to judge) it lets the worker finish. It always fails open.
// The docs do not promise that SubagentStop input carries stop_hook_active, so the hook also keeps its own marker file
// (one per agent) and never blocks the same agent twice, whether or not that field is present.
// Exit 2 with the reason on stderr is how a SubagentStop hook asks the agent to keep working. Input is never passed
// to a shell.

const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const hookCommon = require(path.join(__dirname, '..', 'scripts', 'lib', 'hook-common.js'));

const REASON = 'Your report has no pull request address and no summary. Open the pull request (or state in the report why you cannot) and end with a short summary of what changed and how you checked it.';

// "worker" or "haku:worker" (plugin agents may carry the plugin name as a prefix); nothing else counts as a worker.
const isWorker = type => typeof type === 'string' && /^(?:haku:)?worker$/.test(type.trim());

// A report that names a pull request / merge request, gives its address, says it is blocked or asks something, or
// holds a summary heading is fine. Only a report with none of these is sent back.
const HAS_RESULT = /\/pull\/\d+|\/-\/merge_requests\/\d+|\bpull request\b|\bPR\b|풀 ?리퀘스트|요약|summary|blocked|막혔|차단|질문|\?/i;

function decide(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.stop_hook_active === true) return null;
  if (!isWorker(input.agent_type)) return null;
  const msg = input.last_assistant_message;
  if (typeof msg !== 'string') return null;
  if (HAS_RESULT.test(msg)) return null;
  return REASON;
}

// Marker for "this agent was already sent back once". Returns true when it was created now (first block), false when it
// already existed or cannot be told (then the worker passes). No key in the input means no block.
function claimBlock(input, dir) {
  const id = input.agent_id || input.agent_transcript_path || input.session_id;
  if (typeof id !== 'string' || !id) return false;
  try {
    const name = 'haku-worker-stop-' + crypto.createHash('sha256').update(id).digest('hex').slice(0, 32);
    fs.closeSync(fs.openSync(path.join(dir || os.tmpdir(), name), 'wx'));
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  const { text, tooBig } = await hookCommon.readLimited(process.stdin);
  if (tooBig) return 0;
  const input = JSON.parse(text);
  const reason = decide(input);
  if (!reason) return 0;
  if (!claimBlock(input, process.env.HAKU_WORKER_STOP_DIR)) return 0;
  process.stderr.write(reason + '\n');
  return 2;
}

if (require.main === module) main().then(code => process.exit(code), () => process.exit(0));
module.exports = { decide, isWorker, claimBlock };
